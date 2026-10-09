/**
 * Client side of snapshot bootstrap (M03-T05): one-transaction apply,
 * durable cursor persistence, duplicate-page immunity, and the
 * rebootstrap reconciliation that preserves pending local work.
 *
 *   - `applyPage` covers entity applies (via the domain's applier port),
 *     the page dedup row, and the checkpoint advance inside ONE
 *     BEGIN IMMEDIATE transaction — a crash mid-page rolls back completely
 *     and the cursor never advances ahead of applied data (pinned by a
 *     SIGKILL test).
 *   - Checkpoint advancement is monotonic (MAX guard): a replayed old page
 *     can never move the cursor backwards (feed precedent).
 *   - Duplicate pages are skipped by `snapshot_page_dedup`; even a forced
 *     replay is safe because appliers are upsert/delete idempotent.
 *   - `completeBootstrap` gates on the server's manifest objectCount, then
 *     runs the manifest-closure reconcile in the SAME transaction: rows
 *     absent from the manifest are dropped as stale EXCEPT ids the
 *     `PendingWorkProbe` reports as protected — pending local work is
 *     preserved and reported (ReconcileResult.preserved), never discarded.
 *   - `abortBootstrap` is the typed recovery action after `resync_required`
 *     (expired/invalid cursor): forget the applying checkpoint; pending
 *     work lives in the M03-T03 outbox and is untouched by anything here.
 */

import {
  RepositoryError,
  repositoryError,
  SNAPSHOT_APPLIER_METHODS,
  type ApplyPageResult,
  type BootstrapProgress,
  type CompleteBootstrapInput,
  type PendingWorkProbe,
  type ReconcileResult,
  type SnapshotEntityApplier,
  type SnapshotPage,
} from "./contract.js";
import { SNAPSHOT_PRAGMAS, mapSqliteError, withImmediateTransaction, type SqlDriver } from "./driver.js";
import { migrate, type MigrateOptions } from "./migrations.js";

export interface OpenApplierOptions extends MigrateOptions {
  /** Entity appliers by domain. A page containing an unregistered domain fails closed (whole page rolls back). */
  appliers?: Record<string, SnapshotEntityApplier>;
  /** Pending-work probe wired to the M03-T03 outbox at the mount (required for reconciling completion). */
  pendingWork?: PendingWorkProbe;
  busyTimeoutMs?: number;
}

export interface OpenedSnapshotApplier {
  applier: SnapshotApplier;
  currentVersion: number;
}

export function openSnapshotApplier(driver: SqlDriver, options: OpenApplierOptions = {}): OpenedSnapshotApplier {
  try {
    driver.exec(SNAPSHOT_PRAGMAS.journalMode);
    driver.exec(SNAPSHOT_PRAGMAS.synchronous);
    driver.exec(SNAPSHOT_PRAGMAS.foreignKeys);
    driver.exec(`PRAGMA busy_timeout=${Math.max(0, Math.floor(options.busyTimeoutMs ?? 2_000))}`);
  } catch (e) {
    throw e instanceof RepositoryError ? e : mapSqliteError(e);
  }
  const { currentVersion } = migrate(driver, { extraMigrations: options.extraMigrations });
  return {
    applier: new SnapshotApplier(driver, options.appliers ?? {}, options.pendingWork ?? null),
    currentVersion,
  };
}

export class SnapshotApplier {
  constructor(
    private readonly driver: SqlDriver,
    private readonly appliers: Record<string, SnapshotEntityApplier>,
    private readonly pendingWork: PendingWorkProbe | null,
  ) {}

  /**
   * Apply one snapshot page durably and idempotently. One transaction:
   * dedup insert-or-skip per page, entity applies per NEW page, checkpoint
   * advance (monotonic). Any failure rolls back ALL of it.
   */
  applyPage(page: SnapshotPage, accountId: string, scopeKey: string): ApplyPageResult {
    if (!page.snapshotId || typeof page.snapshotId !== "string") {
      throw repositoryError("misconfigured", "Page is missing snapshotId.");
    }
    if (!accountId || !scopeKey) {
      throw repositoryError("misconfigured", "accountId and scopeKey are required.");
    }
    if (!Number.isFinite(page.watermark) || page.watermark < 0) {
      throw repositoryError("misconfigured", `Invalid page watermark ${page.watermark}.`);
    }
    return withImmediateTransaction(this.driver, () => {
      // Ensure the checkpoint row exists for this bootstrap (first delivery
      // creates it in 'applying' state with the snapshot watermark).
      const cpIns = this.driver
        .prepare(
          `INSERT INTO snapshot_checkpoint
             (account_id, tenant_id, scope_key, snapshot_id, watermark, pages_applied, rows_applied, last_after_ord, state, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, -1, 'applying', ?)
           ON CONFLICT(account_id, tenant_id, scope_key) DO NOTHING`,
        )
        .run(accountId, page.tenantId, scopeKey, page.snapshotId, page.watermark, Date.now());
      const freshCheckpoint = Number(cpIns.changes) === 1;

      const existing = this.driver
        .prepare(`SELECT snapshot_id, state FROM snapshot_checkpoint WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`)
        .get(accountId, page.tenantId, scopeKey) as { snapshot_id: string; state: string };
      if (existing.state === "complete") {
        throw repositoryError(
          "misconfigured",
          `Bootstrap for scope '${scopeKey}' is already complete; open a fresh snapshot to rebootstrap.`,
          { scopeKey },
        );
      }
      if (existing.snapshot_id !== page.snapshotId) {
        throw repositoryError(
          "resync_required",
          `Page belongs to snapshot '${page.snapshotId}' but the applying bootstrap is '${existing.snapshot_id}'; rebootstrap required.`,
          { applying: existing.snapshot_id, page: page.snapshotId },
        );
      }
      // Fresh checkpoint (first delivery): drop ledgers of earlier bootstraps
      // for this scope so completion reconcile reads exactly this snapshot.
      if (freshCheckpoint) {
        this.driver
          .prepare(`DELETE FROM snapshot_applied_entity WHERE account_id = ? AND scope_key = ? AND snapshot_id != ?`)
          .run(accountId, scopeKey, page.snapshotId);
      }

      // Page dedup: identity = (account, snapshot, firstOrd). Deterministic
      // page boundaries make this stable across duplicate deliveries.
      const ins = this.driver
        .prepare(`INSERT OR IGNORE INTO snapshot_page_dedup (account_id, snapshot_id, first_ord, applied_at) VALUES (?, ?, ?, ?)`)
        .run(accountId, page.snapshotId, page.firstOrd, Date.now());
      if (Number(ins.changes) === 0) {
        // Duplicate delivery — skip entity applies but keep monotonic cursor.
        const cur = this.driver
          .prepare(`SELECT last_after_ord FROM snapshot_checkpoint WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`)
          .get(accountId, page.tenantId, scopeKey) as { last_after_ord: number };
        return { applied: 0, skippedPages: 1, protectedDeletes: [], confirmedAfterOrd: Number(cur.last_after_ord) };
      }

      let applied = 0;
      const protectedDeletes: string[] = [];
      const protectedCache = new Map<string, Set<string>>();
      const protectedIds = (domain: string): Set<string> => {
        let s = protectedCache.get(domain);
        if (!s) {
          s = new Set(this.pendingWork ? this.pendingWork.protectedEntityIds(accountId, domain) : []);
          protectedCache.set(domain, s);
        }
        return s;
      };
      const ledger = this.driver.prepare(
        `INSERT OR IGNORE INTO snapshot_applied_entity (account_id, scope_key, snapshot_id, domain, entity_id, op, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of page.rows) {
        const ap = this.appliers[row.domain];
        if (!ap) {
          throw repositoryError(
            "misconfigured",
            `No entity applier registered for domain '${row.domain}'; refusing partial application (fail-closed).`,
          );
        }
        ledger.run(accountId, scopeKey, page.snapshotId, row.domain, row.entityId, row.op, Date.now());
        if (row.op === "delete") {
          if (protectedIds(row.domain).has(row.entityId)) {
            // Pending local work survives tombstones: skip the delete, keep
            // the row and its pending op, surface the skip (never silent).
            protectedDeletes.push(row.entityId);
            applied += 1;
            continue;
          }
          ap.delete(this.driver, row.domain, row.entityId);
        } else {
          if (row.payload === null) {
            throw repositoryError("misconfigured", `Upsert row '${row.entityId}' has no payload; refusing.`);
          }
          ap.upsert(this.driver, row.domain, row.entityId, row.payload);
        }
        applied += 1;
      }

      // Monotonic cursor advance: a replayed old page must not move it back.
      this.driver
        .prepare(
          `UPDATE snapshot_checkpoint SET
             pages_applied = pages_applied + 1,
             rows_applied = rows_applied + ?,
             last_after_ord = MAX(last_after_ord, ?),
             updated_at = ?
           WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`,
        )
        .run(applied, page.nextAfterOrd, Date.now(), accountId, page.tenantId, scopeKey);
      const cur = this.driver
        .prepare(`SELECT last_after_ord FROM snapshot_checkpoint WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`)
        .get(accountId, page.tenantId, scopeKey) as { last_after_ord: number };
      return { applied, skippedPages: 0, protectedDeletes, confirmedAfterOrd: Number(cur.last_after_ord) };
    });
  }

  /** Durable bootstrap progress for one account+tenant+scope. */
  readProgress(accountId: string, tenantId: string, scopeKey: string): BootstrapProgress {
    const row = this.driver
      .prepare(
        `SELECT state, snapshot_id, watermark, pages_applied, rows_applied, last_after_ord FROM snapshot_checkpoint
         WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`,
      )
      .get(accountId, tenantId, scopeKey) as Record<string, unknown> | undefined;
    if (!row) return { state: "none", snapshotId: null, watermark: null, pagesApplied: 0, rowsApplied: 0, lastAfterOrd: -1 };
    return {
      state: String(row.state) as "applying" | "complete",
      snapshotId: String(row.snapshot_id),
      watermark: Number(row.watermark),
      pagesApplied: Number(row.pages_applied),
      rowsApplied: Number(row.rows_applied),
      lastAfterOrd: Number(row.last_after_ord),
    };
  }

  /**
   * Complete the bootstrap: verify applied-row count against the server
   * manifest objectCount, run the manifest-closure reconcile, and flip the
   * checkpoint to 'complete' — all in ONE transaction. The closure is read
   * from the client-side applied-entity ledger (this snapshot's upserts),
   * NOT from server tables — the client owns its reconcile decision. Rows
   * absent from the ledger are dropped as stale EXCEPT ids the
   * pending-work probe reports as protected; protection wins over staleness
   * (pending local work is never discarded — it dispatches and resolves via
   * T07 outcomes).
   */
  completeBootstrap(input: CompleteBootstrapInput): ReconcileResult {
    if (!input.accountId || !input.tenantId || !input.scopeKey) {
      throw repositoryError("misconfigured", "accountId, tenantId and scopeKey are required.");
    }
    if (!Number.isFinite(input.objectCount) || input.objectCount < 0) {
      throw repositoryError("misconfigured", `Invalid objectCount ${input.objectCount}.`);
    }
    return withImmediateTransaction(this.driver, () => {
      const row = this.driver
        .prepare(
          `SELECT snapshot_id, watermark, rows_applied, state FROM snapshot_checkpoint
           WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`,
        )
        .get(input.accountId, input.tenantId, input.scopeKey) as Record<string, unknown> | undefined;
      if (!row) {
        throw repositoryError("not_found", `No bootstrap in progress for scope '${input.scopeKey}'.`, { scopeKey: input.scopeKey });
      }
      if (String(row.state) === "complete") {
        throw repositoryError("misconfigured", `Bootstrap for scope '${input.scopeKey}' is already complete.`, { scopeKey: input.scopeKey });
      }
      if (Number(row.rows_applied) !== input.objectCount) {
        throw repositoryError(
          "misconfigured",
          `Bootstrap incomplete: ${row.rows_applied} rows applied, manifest declares ${input.objectCount}; fetch remaining pages before completing.`,
          { applied: String(row.rows_applied), expected: String(input.objectCount) },
        );
      }

      const result: ReconcileResult = { dropped: [], preserved: [] };
      if (input.reconcile !== false) {
        const domains = input.domains ?? Object.keys(this.appliers);
        for (const domain of domains.sort()) {
          const ap = this.appliers[domain];
          if (!ap) {
            throw repositoryError("misconfigured", `No entity applier registered for domain '${domain}'; refusing reconcile (fail-closed).`);
          }
          const manifestIds = new Set(
            (
              this.driver
                .prepare(`SELECT entity_id FROM snapshot_applied_entity WHERE account_id = ? AND scope_key = ? AND snapshot_id = ? AND domain = ? AND op = 'upsert'`)
                .all(input.accountId, input.scopeKey, String(row.snapshot_id), domain) as Array<Record<string, unknown>>
            ).map((r) => String(r.entity_id)),
          );
          const protectedIds = new Set(this.pendingWork ? this.pendingWork.protectedEntityIds(input.accountId, domain) : []);
          for (const localId of ap.localIds(this.driver)) {
            if (manifestIds.has(localId) || protectedIds.has(localId)) {
              if (protectedIds.has(localId) && !manifestIds.has(localId)) {
                result.preserved.push(localId);
              }
              continue;
            }
            ap.delete(this.driver, domain, localId);
            result.dropped.push(localId);
          }
        }
        result.dropped.sort();
        result.preserved.sort();
      }

      this.driver
        .prepare(
          `UPDATE snapshot_checkpoint SET state = 'complete', updated_at = ?
           WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`,
        )
        .run(Date.now(), input.accountId, input.tenantId, input.scopeKey);
      return result;
    });
  }

  /**
   * Typed recovery action after `resync_required` (expired/invalid cursor),
   * and the explicit reset that starts a rebootstrap over a completed
   * bootstrap: forgets the scope's checkpoint (applying OR complete), its
   * page-dedup rows and its applied-entity ledger for the previous snapshot.
   * Local domain rows are untouched — the fresh bootstrap rebuilds them and
   * the completion reconcile preserves pending work. Pending ops live in the
   * outbox (M03-T03), never here.
   */
  abortBootstrap(accountId: string, tenantId: string, scopeKey: string): void {
    withImmediateTransaction(this.driver, () => {
      const row = this.driver
        .prepare(`SELECT snapshot_id FROM snapshot_checkpoint WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`)
        .get(accountId, tenantId, scopeKey) as { snapshot_id: string } | undefined;
      if (row) {
        this.driver
          .prepare(`DELETE FROM snapshot_page_dedup WHERE account_id = ? AND snapshot_id = ?`)
          .run(accountId, String(row.snapshot_id));
        this.driver
          .prepare(`DELETE FROM snapshot_applied_entity WHERE account_id = ? AND scope_key = ? AND snapshot_id = ?`)
          .run(accountId, scopeKey, String(row.snapshot_id));
        this.driver
          .prepare(`DELETE FROM snapshot_checkpoint WHERE account_id = ? AND tenant_id = ? AND scope_key = ?`)
          .run(accountId, tenantId, scopeKey);
      }
    });
  }

  /** Structural pin: the applier surface has exactly these methods (no domain writers). */
  static get surface(): readonly string[] {
    return SNAPSHOT_APPLIER_METHODS;
  }
}
