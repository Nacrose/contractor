/**
 * Outbox repository (M03-T03): the durable local half of the sync engine.
 *
 * A save commits the domain write AND its pending operation in ONE
 * SQLite transaction; a failure leaves neither visible. Pending
 * operations, private drafts, and staged attachments are durable data —
 * there is no eviction path on this class (pinned by test). Acceptance
 * receipts are recorded only from server outcomes: the domain service
 * stays the authority.
 */

import {
  ATTACHMENT_TRANSITIONS,
  PendingOpInput,
  PendingOpRecord,
  PendingOpState,
  PendingWorkSummary,
  PrivateDraftInput,
  PrivateDraftRecord,
  RepositoryError,
  repositoryError,
  type AttachmentInput,
  type AttachmentStageState,
} from "./contract.js";
import { SqlDriver, TxGuard, mapSqliteError, withImmediateTransaction, OUTBOX_PRAGMAS } from "./driver.js";
import { migrate, type MigrateOptions, type MigrateResult } from "./migrations.js";

export interface OpenOutboxOptions extends MigrateOptions {
  /** PRAGMA busy_timeout in ms (SQLite's own bounded wait before a busy error). */
  busyTimeoutMs?: number;
  /** Run PRAGMA integrity_check at open (recommended for every app start). */
  integrityCheck?: boolean;
}

export interface OpenedOutbox {
  repository: OutboxRepository;
  migrations: MigrateResult;
}

/**
 * Open a repository over a SQLite driver: enforces the durability pragmas
 * (WAL + synchronous=FULL + foreign keys), optionally verifies integrity,
 * and applies pending migrations. Every failure is typed (corruption and
 * not-a-database surface as `corrupt`/`notadb`, not as generic crashes).
 */
export function openOutbox(driver: SqlDriver, options: OpenOutboxOptions = {}): OpenedOutbox {
  try {
    driver.exec(OUTBOX_PRAGMAS.journalMode);
    driver.exec(OUTBOX_PRAGMAS.synchronous);
    driver.exec(OUTBOX_PRAGMAS.foreignKeys);
    driver.exec(`PRAGMA busy_timeout=${Math.max(0, Math.floor(options.busyTimeoutMs ?? 2_000))}`);
    if (options.integrityCheck) {
      const row = driver.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
      if (!row || row.integrity_check !== "ok") {
        throw repositoryError("corrupt", "integrity_check failed at open.", {
          result: row?.integrity_check ?? "(no row)",
        });
      }
    }
  } catch (e) {
    if (e instanceof RepositoryError) throw e;
    throw mapSqliteError(e);
  }
  const migrations = migrate(driver, { extraMigrations: options.extraMigrations });
  return { repository: new OutboxRepository(driver), migrations };
}

const OP_COLS = `id, account_id, project_id, kind, payload, state, attempts, next_attempt_at,
                 created_at, updated_at, last_error, accepted_receipt, digest`;

function rowToOp(row: Record<string, unknown>): PendingOpRecord {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    projectId: row.project_id === null || row.project_id === undefined ? null : String(row.project_id),
    kind: String(row.kind),
    payload: String(row.payload),
    state: String(row.state) as PendingOpState,
    attempts: Number(row.attempts),
    nextAttemptAtMs: row.next_attempt_at === null || row.next_attempt_at === undefined ? null : Number(row.next_attempt_at),
    createdAtMs: Number(row.created_at),
    updatedAtMs: Number(row.updated_at),
    lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
    acceptedReceipt: row.accepted_receipt === null || row.accepted_receipt === undefined ? null : String(row.accepted_receipt),
    digest: row.digest === null || row.digest === undefined ? null : String(row.digest),
  };
}

export interface SaveMutationInput {
  accountId: string;
  projectId?: string | null;
  op: PendingOpInput;
  /**
   * Domain-table writes that belong to this save. They run inside the SAME
   * transaction as the outbox insert, against tables the app owns via its
   * extra migrations. The callback MUST remain pure SQL — business rules
   * stay in the domain service; this is a durability, not authority, layer.
   */
  domain?: (tx: SqlDriver) => void;
}

export class OutboxRepository {
  private readonly tx = new TxGuard();

  constructor(private readonly driver: SqlDriver) {}

  // ------------------------------------------------------------------
  // The save boundary
  // ------------------------------------------------------------------

  /**
   * Commit the local mutation (domain writes) and its pending operation in
   * ONE transaction. Any failure — domain callback throw, constraint,
   * disk-full, busy — rolls back BOTH sides; the caller gets a typed error
   * and neither row exists.
   */
  saveMutation(input: SaveMutationInput): { opId: string } {
    this.assertId(input.accountId, "accountId");
    this.assertId(input.op.opId, "op.opId");
    if (!input.op.kind || typeof input.op.kind !== "string") {
      throw repositoryError("misconfigured", "op.kind is required (server operation id).");
    }
    if (typeof input.op.payload !== "string") {
      throw repositoryError("misconfigured", "op.payload must be a JSON string.");
    }
    this.tx.enter();
    try {
      withImmediateTransaction(this.driver, () => {
        input.domain?.(this.driver);
        const now = Date.now();
        this.driver
          .prepare(
            `INSERT INTO pending_op (id, account_id, project_id, kind, payload, state, attempts,
                                     next_attempt_at, created_at, updated_at, digest)
             VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
          )
          .run(
            input.op.opId,
            input.accountId,
            input.projectId ?? null,
            input.op.kind,
            input.op.payload,
            input.op.nextAttemptAtMs ?? null,
            now,
            now,
            input.op.digest ?? null,
          );
        for (const dep of input.op.dependsOnOpIds ?? []) {
          this.assertId(dep, "dependsOnOpIds entry");
          this.driver
            .prepare(`INSERT INTO op_dependency (pending_op_id, depends_on_op_id) VALUES (?, ?)`)
            .run(input.op.opId, dep);
        }
      });
      return { opId: input.op.opId };
    } catch (e) {
      throw e instanceof RepositoryError ? e : mapSqliteError(e);
    } finally {
      this.tx.exit();
    }
  }

  // ------------------------------------------------------------------
  // Lifecycle transitions — recorded only from server outcomes
  // ------------------------------------------------------------------

  /** pending -> in_flight (dispatch attempt; attempts counter increments). */
  markInFlight(opId: string): PendingOpRecord {
    return this.transition(opId, "pending", "in_flight", (op) => ({
      ...op,
      attempts: op.attempts + 1,
    }));
  }

  /** in_flight -> accepted. `receipt` is the server-issued durable receipt (required). */
  recordAccepted(opId: string, receipt: string): PendingOpRecord {
    if (!receipt || typeof receipt !== "string") {
      throw repositoryError("misconfigured", "recordAccepted requires the server acceptance receipt.");
    }
    return this.transition(opId, "in_flight", "accepted", (op) => ({ ...op, acceptedReceipt: receipt, lastError: null }));
  }

  /** in_flight -> rejected with the server rejection reason (typed surface, T07 consumes). */
  recordRejected(opId: string, reason: string): PendingOpRecord {
    if (!reason || typeof reason !== "string") {
      throw repositoryError("misconfigured", "recordRejected requires the server rejection reason.");
    }
    return this.transition(opId, "in_flight", "rejected", (op) => ({ ...op, lastError: reason }));
  }

  /** in_flight -> pending with bounded backoff (`nextAttemptAtMs` gates re-dispatch). */
  requeue(opId: string, nextAttemptAtMs: number | null): PendingOpRecord {
    return this.transition(opId, "in_flight", "pending", (op) => ({ ...op, nextAttemptAtMs }));
  }

  getOp(accountId: string, opId: string): PendingOpRecord | null {
    const row = this.driver.prepare(`SELECT ${OP_COLS} FROM pending_op WHERE id = ? AND account_id = ?`).get(opId, accountId);
    return row ? rowToOp(row) : null;
  }

  /**
   * Dispatch-eligible batch: pending, time-eligible, dependencies satisfied
   * (no dependency still pending/in_flight). Ordered by creation.
   */
  pendingBatch(accountId: string, options: { nowMs?: number; limit?: number } = {}): PendingOpRecord[] {
    const now = options.nowMs ?? Date.now();
    const limit = Math.max(1, Math.floor(options.limit ?? 50));
    const rows = this.driver
      .prepare(
        `SELECT ${OP_COLS} FROM pending_op p
         WHERE p.account_id = ? AND p.state = 'pending'
           AND (p.next_attempt_at IS NULL OR p.next_attempt_at <= ?)
           AND NOT EXISTS (
             SELECT 1 FROM op_dependency d JOIN pending_op q ON q.id = d.depends_on_op_id
             WHERE d.pending_op_id = p.id AND q.state IN ('pending','in_flight')
           )
         ORDER BY p.created_at ASC, p.id ASC LIMIT ?`,
      )
      .all(accountId, now, limit);
    return rows.map(rowToOp);
  }

  // ------------------------------------------------------------------
  // Pending-work gate feed (M03-T02 shape)
  // ------------------------------------------------------------------

  pendingWorkSummary(accountId: string, nowMs: number = Date.now()): PendingWorkSummary {
    const op = this.driver
      .prepare(
        `SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM pending_op
         WHERE account_id = ? AND state IN ('pending','in_flight')`,
      )
      .get(accountId) as { n: number | bigint; oldest: number | null };
    const drafts = this.driver.prepare(`SELECT COUNT(*) AS n FROM private_draft WHERE account_id = ?`).get(accountId) as {
      n: number | bigint;
    };
    const atts = this.driver
      .prepare(`SELECT COUNT(*) AS n FROM attachment_stage WHERE account_id = ? AND state != 'registered'`)
      .get(accountId) as { n: number | bigint };
    const oldest = op.oldest === null || op.oldest === undefined ? null : Number(op.oldest);
    return {
      pendingOperations: Number(op.n),
      oldestPendingAgeMs: oldest === null ? null : Math.max(0, nowMs - oldest),
      privateDrafts: Number(drafts.n),
      attachmentsPending: Number(atts.n),
    };
  }

  // ------------------------------------------------------------------
  // Private drafts (local-only until explicitly shared)
  // ------------------------------------------------------------------

  createDraft(accountId: string, draft: PrivateDraftInput): PrivateDraftRecord {
    this.assertId(accountId, "accountId");
    this.assertId(draft.id, "draft.id");
    const now = Date.now();
    this.driver
      .prepare(
        `INSERT INTO private_draft (id, account_id, project_id, kind, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(draft.id, accountId, draft.projectId ?? null, draft.kind, draft.body, now, now);
    return this.getDraft(accountId, draft.id)!;
  }

  getDraft(accountId: string, draftId: string): PrivateDraftRecord | null {
    const row = this.driver
      .prepare(`SELECT id, account_id, project_id, kind, body, created_at, updated_at FROM private_draft WHERE id = ? AND account_id = ?`)
      .get(draftId, accountId);
    if (!row) return null;
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      projectId: row.project_id === null || row.project_id === undefined ? null : String(row.project_id),
      kind: String(row.kind),
      body: String(row.body),
      createdAtMs: Number(row.created_at),
      updatedAtMs: Number(row.updated_at),
    };
  }

  /** Explicit, per-row delete. There is no other draft-removal path. */
  deleteDraft(accountId: string, draftId: string): void {
    this.driver.prepare(`DELETE FROM private_draft WHERE id = ? AND account_id = ?`).run(draftId, accountId);
  }

  // ------------------------------------------------------------------
  // Attachment staging (M03-T06 protocol lives above; this is durable state)
  // ------------------------------------------------------------------

  stageAttachment(accountId: string, input: AttachmentInput): AttachmentStageState {
    this.assertId(accountId, "accountId");
    this.assertId(input.id, "attachment.id");
    if (!Number.isFinite(input.bytes) || input.bytes < 0) {
      throw repositoryError("misconfigured", "attachment bytes must be a non-negative number.");
    }
    const now = Date.now();
    this.driver
      .prepare(
        `INSERT INTO attachment_stage (id, account_id, project_id, local_path, digest, bytes, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'staging', ?, ?)`,
      )
      .run(input.id, accountId, input.projectId ?? null, input.localPath, input.digest, input.bytes, now, now);
    return "staging";
  }

  transitionAttachment(accountId: string, attachmentId: string, to: AttachmentStageState): AttachmentStageState {
    const row = this.driver
      .prepare(`SELECT state FROM attachment_stage WHERE id = ? AND account_id = ?`)
      .get(attachmentId, accountId) as { state: string } | undefined;
    if (!row) throw repositoryError("not_found", `Attachment '${attachmentId}' not found for this account.`);
    const from = String(row.state) as AttachmentStageState;
    if (!ATTACHMENT_TRANSITIONS[from].includes(to)) {
      throw repositoryError("illegal_transition", `Attachment cannot move ${from} -> ${to}.`, {
        from,
        to,
        allowed: ATTACHMENT_TRANSITIONS[from].join(","),
      });
    }
    this.driver.prepare(`UPDATE attachment_stage SET state = ?, updated_at = ? WHERE id = ? AND account_id = ?`).run(to, Date.now(), attachmentId, accountId);
    return to;
  }

  // ------------------------------------------------------------------
  // Explicit retention — the ONLY deletion paths (tested)
  // ------------------------------------------------------------------

  /**
   * Retention of accepted history: removes ONLY operations that are
   * `accepted` WITH a durable receipt, older than the cutoff. Pending,
   * in-flight, rejected operations, drafts and attachments are untouched.
   */
  deleteAcceptedBefore(accountId: string, cutoffMs: number): number {
    const res = this.driver
      .prepare(
        `DELETE FROM pending_op WHERE account_id = ? AND state = 'accepted'
          AND accepted_receipt IS NOT NULL AND created_at <= ?`,
      )
      .run(accountId, cutoffMs);
    return Number(res.changes);
  }

  /**
   * Full account wipe (explicit user action at logout-with-discard or
   * account cleanup). Scoped strictly to the account; other accounts are
   * untouched. Dependencies cascade via foreign keys.
   */
  purgeAccount(accountId: string): { pendingOps: number; drafts: number; attachments: number } {
    this.assertId(accountId, "accountId");
    return withImmediateTransaction(this.driver, () => {
      const ops = this.driver.prepare(`DELETE FROM pending_op WHERE account_id = ?`).run(accountId);
      const drafts = this.driver.prepare(`DELETE FROM private_draft WHERE account_id = ?`).run(accountId);
      const atts = this.driver.prepare(`DELETE FROM attachment_stage WHERE account_id = ?`).run(accountId);
      return { pendingOps: Number(ops.changes), drafts: Number(drafts.changes), attachments: Number(atts.changes) };
    });
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  private transition(
    opId: string,
    from: PendingOpState,
    to: PendingOpState,
    mutate: (op: PendingOpRecord) => PendingOpRecord,
  ): PendingOpRecord {
    // Read-modify-write inside one immediate transaction; the CHECK
    // constraint on state is the last line of defense.
    return withImmediateTransaction(this.driver, () => {
      const row = this.driver.prepare(`SELECT ${OP_COLS} FROM pending_op WHERE id = ?`).get(opId);
      if (!row) throw repositoryError("not_found", `Pending operation '${opId}' does not exist.`);
      const op = rowToOp(row);
      if (op.state !== from) {
        throw repositoryError("illegal_transition", `Operation '${opId}' is '${op.state}', expected '${from}' for this transition.`, {
          from: op.state,
          to,
        });
      }
      const next = mutate(op);
      this.driver
        .prepare(
          `UPDATE pending_op SET state = ?, attempts = ?, next_attempt_at = ?, updated_at = ?,
                  last_error = ?, accepted_receipt = ? WHERE id = ?`,
        )
        .run(to, next.attempts, next.nextAttemptAtMs, Date.now(), next.lastError, next.acceptedReceipt, opId);
      return this.getOp(op.accountId, opId)!;
    });
  }

  private assertId(value: string, name: string): void {
    if (!value || typeof value !== "string" || value.trim().length === 0) {
      throw repositoryError("misconfigured", `${name} must be a non-empty string.`);
    }
  }
}
