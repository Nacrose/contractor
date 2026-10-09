/**
 * Evidence fixtures for the observability tests (M03-T08).
 *
 * The device health read model is backed by REAL SQLite (pending-op mirror
 * + per-scope checkpoint mirror — WAL + synchronous=FULL, the M03-T03/T04
 * shapes). The staged scenario drives a scripted sync boundary (the mount
 * composition point): each outcome updates the REAL pending-op rows and
 * records a REAL observation in the metrics registry, so device surface
 * and server telemetry can be asserted to agree at every transition.
 */

import { DatabaseSync } from "node:sqlite";
import {
  ScopeCursor,
  SyncHealthSource,
  SyncMetricOutcome,
  SyncObservation,
} from "../src/contract.js";
import { SyncMetrics } from "../src/metrics.js";

/** REAL-SQLite health source (outbox + checkpoint read-model mirrors). */
export class SqliteHealthSource implements SyncHealthSource {
  readonly db: DatabaseSync;
  readonly accountId: string;

  constructor(path: string, accountId: string) {
    this.db = new DatabaseSync(path);
    this.accountId = accountId;
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS pending_op (
        op_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        state TEXT NOT NULL
          CHECK (state IN ('pending','in_flight','accepted','rejected','blocked','conflict')),
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (op_id, account_id)
      );
      CREATE TABLE IF NOT EXISTS scope_checkpoint (
        account_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        last_accepted_seq INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, scope)
      );
    `);
  }

  pendingOps(): Array<{ opId: string; kind: string; createdAtMs: number; state: "pending" | "in_flight" | "blocked" | "conflict" | "rejected"; lastError: string | null; updatedAtMs: number }> {
    const rows = this.db
      .prepare("SELECT * FROM pending_op WHERE account_id = ? AND state != 'accepted' ORDER BY created_at")
      .all(this.accountId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      opId: String(r.op_id),
      kind: String(r.kind),
      createdAtMs: Number(r.created_at),
      state: String(r.state) as never,
      lastError: (r.last_error as string | null) ?? null,
      updatedAtMs: Number(r.updated_at),
    }));
  }

  acceptedCursors(): ScopeCursor[] {
    const rows = this.db
      .prepare("SELECT scope, last_accepted_seq, updated_at FROM scope_checkpoint WHERE account_id = ? ORDER BY scope")
      .all(this.accountId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      scope: String(r.scope),
      lastAcceptedSeq: Number(r.last_accepted_seq),
      checkpointAgeMs: 0, // filled by tests via seed options; kept simple here
    }));
  }

  // -- seeding helpers (the mount's writes; tests use them directly) -------

  seedOp(opId: string, kind: string, state: string, createdAtMs: number, updatedAtMs: number, lastError: string | null = null): void {
    this.db
      .prepare(
        `INSERT INTO pending_op (op_id, account_id, kind, state, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(op_id, account_id) DO UPDATE SET state = excluded.state, last_error = excluded.last_error, updated_at = excluded.updated_at`,
      )
      .run(opId, this.accountId, kind, state, lastError, createdAtMs, updatedAtMs);
  }

  seedCursor(scope: string, seq: number, atMs: number): void {
    this.db
      .prepare(
        `INSERT INTO scope_checkpoint (account_id, scope, last_accepted_seq, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, scope) DO UPDATE SET last_accepted_seq = excluded.last_accepted_seq, updated_at = excluded.updated_at`,
      )
      .run(this.accountId, scope, seq, atMs);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Scripted sync boundary — the mount composition point for the staged
 * scenario. Each `step` applies the outcome to the REAL pending-op rows
 * (exactly the M03-T07 record methods' effect) and records the REAL
 * observation in the metrics registry. `pendingSentinel` rides IN the
 * (never-exported) payload — redaction assertions prove it cannot leak.
 */
export class ScriptedSyncBoundary {
  readonly metrics = new SyncMetrics();
  readonly transcript: Array<{ stage: string; outcome: SyncMetricOutcome; opId: string }> = [];

  constructor(
    private readonly source: SqliteHealthSource,
    private readonly clock: { now: number },
  ) {}

  step(stage: string, opId: string, kind: string, outcome: Exclude<SyncMetricOutcome, "requests">, opts: { feedLagMs?: number; checkpointAgeMs?: number; tenantId?: string; projectId?: string | null; reason?: string; serverSeq?: number } = {}): void {
    const t = this.clock.now;
    switch (outcome) {
      case "retryable":
        this.source.seedOp(opId, kind, "pending", t - 1_000, t, "retryable: backpressure");
        break;
      case "accepted":
        this.source.seedOp(opId, kind, "accepted", t - 1_000, t, null);
        if (opts.serverSeq !== undefined) this.source.seedCursor("t1:all", opts.serverSeq, t);
        break;
      case "replayed":
        this.source.seedOp(opId, kind, "accepted", t - 1_000, t, null);
        break;
      case "conflicted":
        this.source.seedOp(opId, kind, "conflict", t - 1_000, t, opts.reason ?? "conflict");
        break;
      case "rejected":
        this.source.seedOp(opId, kind, "rejected", t - 1_000, t, opts.reason ?? "rejected");
        break;
      case "revoked":
      case "auth_required":
      case "dependency_blocked":
        this.source.seedOp(opId, kind, "pending", t - 1_000, t, outcome);
        break;
    }
    const obs: SyncObservation = {
      tenantId: opts.tenantId ?? "t1",
      projectId: opts.projectId ?? null,
      kind,
      outcome,
      feedLagMs: opts.feedLagMs ?? null,
      checkpointAgeMs: opts.checkpointAgeMs ?? null,
    };
    this.metrics.record(obs);
    this.transcript.push({ stage, outcome, opId });
  }
}
