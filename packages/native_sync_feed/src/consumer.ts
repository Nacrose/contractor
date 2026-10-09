/**
 * Client side of the change feed: durable checkpoints, idempotent replay,
 * and command receipts (M03-T04).
 *
 * Implements ADR-0011 §2 contract 4 on real SQLite:
 *   - `applyBatch` applies entity mutations, dedup bookkeeping, and the
 *     checkpoint advancement inside ONE transaction — a crash mid-batch
 *     rolls back completely, the server re-delivers, and dedup makes the
 *     replay a no-op ("100% idempotent").
 *   - Checkpoint advancement is monotonic (MAX guard): a replayed OLD page
 *     can never move the confirmed cursor backwards.
 *   - Command receipts (plan v3 §6 M03): financially effective commands
 *     retain durable receipts beyond the 30-day default WITH compaction —
 *     compaction drops payload detail but keeps the replay guard, so
 *     expiry can never enable replayed business effects. Receipts are
 *     recorded ONLY from server outcomes; no local auto-accept exists.
 */

import {
  feedError,
  type ApplyResult,
  type CommandReceiptInput,
  type EntityApplier,
  type FeedEventEnvelope,
  type PullPage,
  type ReceiptSweepOptions,
  type ReceiptSweepResult,
  FEED_CONSUMER_METHODS,
} from "./contract.js";
import { withImmediateTransaction, type SqlDriver } from "./driver.js";
import { migrate, type MigrateOptions } from "./migrations.js";

export interface OpenConsumerOptions extends MigrateOptions {
  /** Entity appliers by domain. A page containing an unregistered domain fails closed (whole batch rolls back). */
  appliers?: Record<string, EntityApplier>;
  /** Busy timeout in ms for BEGIN IMMEDIATE contention (default 2000). */
  busyTimeoutMs?: number;
}

export interface OpenedConsumer {
  consumer: FeedConsumer;
  currentVersion: number;
}

export function openFeedConsumer(driver: SqlDriver, options: OpenConsumerOptions = {}): OpenedConsumer {
  driver.exec("PRAGMA journal_mode=WAL");
  driver.exec("PRAGMA synchronous=FULL");
  driver.exec("PRAGMA foreign_keys=ON");
  driver.exec(`PRAGMA busy_timeout=${options.busyTimeoutMs ?? 2_000}`);
  const { currentVersion } = migrate(driver, { extraMigrations: options.extraMigrations });
  return { consumer: new FeedConsumer(driver, options.appliers ?? {}), currentVersion };
}

export class FeedConsumer {
  constructor(
    private readonly driver: SqlDriver,
    private readonly appliers: Record<string, EntityApplier>,
  ) {}

  /**
   * Apply one pulled page durably and idempotently.
   *
   * One BEGIN IMMEDIATE transaction covers: dedup insert-or-skip per event,
   * entity apply per NEW event (via the domain's applier port), and the
   * checkpoint advance to `page.nextCursor` (monotonic). Any failure rolls
   * back ALL of it; the page can then be re-delivered and re-applied.
   */
  applyBatch(page: PullPage, accountId: string): ApplyResult {
    if (page.nextCursor < 0 || !Number.isFinite(page.nextCursor)) {
      throw feedError("misconfigured", `Invalid page cursor ${page.nextCursor}.`);
    }
    return withImmediateTransaction(this.driver, () => {
      let applied = 0;
      let skipped = 0;
      for (const event of page.events) {
        const applier = this.appliers[event.domain];
        if (!applier) {
          throw feedError(
            "misconfigured",
            `No entity applier registered for domain '${event.domain}'; refusing partial application (fail-closed).`,
          );
        }
        const ins = this.driver
          .prepare(
            `INSERT OR IGNORE INTO sync_inbox_dedup (account_id, event_id, seq, applied_at) VALUES (?, ?, ?, ?)`,
          )
          .run(accountId, event.eventId, event.seq, Date.now());
        if (Number(ins.changes) === 0) {
          skipped += 1;
          continue;
        }
        applier(this.driver, event);
        applied += 1;
      }
      // Monotonic checkpoint: a replayed old page must not move the cursor back.
      this.driver
        .prepare(
          `INSERT INTO sync_checkpoint (account_id, tenant_id, confirmed_seq, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(account_id, tenant_id) DO UPDATE
             SET confirmed_seq = MAX(confirmed_seq, excluded.confirmed_seq), updated_at = excluded.updated_at`,
        )
        .run(accountId, page.tenantId, page.nextCursor, Date.now());
      const confirmedSeq = this.readCheckpoint(accountId, page.tenantId);
      return { applied, skipped, confirmedSeq };
    });
  }

  /** Durable confirmed cursor for one account+tenant partition (0 = nothing applied yet). */
  readCheckpoint(accountId: string, tenantId: string): number {
    const row = this.driver
      .prepare(`SELECT confirmed_seq FROM sync_checkpoint WHERE account_id = ? AND tenant_id = ?`)
      .get(accountId, tenantId);
    return row ? Number((row as { confirmed_seq: number }).confirmed_seq) : 0;
  }

  /**
   * Explicit recovery action (operator/test): forget the confirmed cursor so
   * the consumer re-pulls from 0. Dedup rows are intentionally KEPT — this is
   * the checkpoint-loss scenario; idempotent replay must prevent double
   * effects (pinned by test). T05 owns the full rebootstrap protocol.
   */
  resetCheckpoint(accountId: string, tenantId: string): void {
    withImmediateTransaction(this.driver, () => {
      this.driver
        .prepare(`DELETE FROM sync_checkpoint WHERE account_id = ? AND tenant_id = ?`)
        .run(accountId, tenantId);
    });
  }

  /**
   * Record a receipt for a dispatched command FROM A SERVER OUTCOME (the
   * durable receipt). Local code must never fabricate one — the caller
   * contract is the M03-T07 orchestrator writing what the server answered.
   */
  recordCommandReceipt(accountId: string, receipt: CommandReceiptInput): void {
    if (!receipt.opId) throw feedError("misconfigured", "Receipt requires a durable operation id.");
    withImmediateTransaction(this.driver, () => {
      this.driver
        .prepare(
          `INSERT INTO command_receipt
             (account_id, op_id, domain, financially_effective, outcome, outcome_digest, payload_digest, created_at, compacted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT(account_id, op_id) DO UPDATE
             SET outcome = excluded.outcome,
                 outcome_digest = excluded.outcome_digest,
                 payload_digest = excluded.payload_digest,
                 created_at = excluded.created_at,
                 compacted = 0`,
        )
        .run(
          accountId,
          receipt.opId,
          receipt.domain,
          receipt.financiallyEffective ? 1 : 0,
          receipt.outcome,
          receipt.outcomeDigest,
          receipt.payloadDigest ?? null,
          receipt.issuedAtMs ?? Date.now(),
        );
    });
  }

  /**
   * Replay gate for financially effective (and other receipted) commands.
   *   - no receipt -> not effective, proceed;
   *   - accepted receipt, full row -> effective iff payload digest matches;
   *   - accepted receipt, compacted -> effective by opId presence alone
   *     (fail-closed: compaction trades digest precision for storage, never
   *     opens a replay path).
   */
  hasEffectiveReceipt(accountId: string, opId: string, payloadDigest: string | null): boolean {
    const row = this.driver
      .prepare(`SELECT outcome, payload_digest, compacted FROM command_receipt WHERE account_id = ? AND op_id = ?`)
      .get(accountId, opId) as { outcome: string; payload_digest: string | null; compacted: number } | undefined;
    if (!row) return false;
    if (!row.outcome.startsWith("accepted")) return false;
    if (row.compacted === 1) return true;
    if (row.payload_digest === null) return true; // defensive: full row without digest still blocks
    return payloadDigest !== null && row.payload_digest === payloadDigest;
  }

  /**
   * Receipt retention (plan v3 §6 M03): non-financial receipts expire after
   * the configurable default (30 days); financial receipts are NEVER
   * expiry-deleted — they are compacted in place (payload digest dropped,
   * replay guard kept). Expiry cannot enable replayed business effects.
   */
  sweepReceipts(options: ReceiptSweepOptions): ReceiptSweepResult {
    return withImmediateTransaction(this.driver, () => {
      const cutoff = options.nowMs - options.defaultRetentionDays * 86_400_000;
      const swept = this.driver
        .prepare(`DELETE FROM command_receipt WHERE financially_effective = 0 AND created_at < ?`)
        .run(cutoff);
      const compactCutoff = options.nowMs - options.compactFinancialAfterDays * 86_400_000;
      const compacted = this.driver
        .prepare(
          `UPDATE command_receipt SET payload_digest = NULL, compacted = 1
           WHERE financially_effective = 1 AND compacted = 0 AND created_at < ?`,
        )
        .run(compactCutoff);
      return { sweptNonFinancial: Number(swept.changes), compactedFinancial: Number(compacted.changes) };
    });
  }

  /** Structural pin: the consumer surface has exactly these methods (no domain writers). */
  static get surface(): readonly string[] {
    return FEED_CONSUMER_METHODS;
  }
}

// Re-export for consumers of the package that need the envelope type at the boundary.
export type { FeedEventEnvelope };
