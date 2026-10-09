/**
 * Evidence fixtures for the orchestration tests (M03-T07).
 *
 * The pending-operation source and the server op-id ledger are REAL SQLite
 * (node:sqlite) — the orchestrator is a policy layer over durable state,
 * so its evidence must run against durable state, not maps. The transport
 * stub calls the REAL ServerSyncService (authority + ledger + domain
 * ports) in-process; `lossy` knobs simulate network death AFTER the server
 * accepted (the lost-ack scenario end-to-end). RandomPort is a
 * deterministic xorshift stub so FULL-jitter backoff is reproducible.
 */

import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  AuthEventSink,
  DigestPort,
  DomainApplyPort,
  ExecutionEnvironmentPort,
  PendingOpRecord,
  PendingOperationSource,
  RandomPort,
  ScopeClaims,
  ServerAuthorityPort,
  ServerOpLedgerPort,
  SyncEnvelope,
  SyncOutcome,
  SyncTransportPort,
} from "../src/contract.js";
import { ServerSyncService } from "../src/server.js";

export class Sha256Digest implements DigestPort {
  readonly algorithm = "sha-256" as const;
  digest(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }
}

/** Deterministic xorshift32 PRNG in [0,1). */
export class SeqRandom implements RandomPort {
  private s = 0x12345678;
  next(): number {
    this.s ^= this.s << 13;
    this.s >>>= 0;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    this.s >>>= 0;
    return this.s / 0x100000000;
  }
}

// ---------------------------------------------------------------------------

interface EnqueueInput {
  opId: string;
  kind: string;
  payload: string;
  projectId?: string | null;
  tenantId?: string;
  role?: string;
  dependsOnOpIds?: string[];
}

/** REAL-SQLite pending-operation source mirroring the M03-T03 outbox shape. */
export class SqlPendingSource implements PendingOperationSource {
  readonly db: DatabaseSync;
  private order = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS pending_op (
        op_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        project_id TEXT,
        tenant_id TEXT,
        role TEXT,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        digest TEXT,
        depends_on TEXT NOT NULL DEFAULT '[]',
        state TEXT NOT NULL DEFAULT 'pending'
          CHECK (state IN ('pending','in_flight','accepted','rejected','blocked','conflict')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at_ms INTEGER,
        last_error TEXT,
        accepted_receipt TEXT,
        server_seq INTEGER,
        ord INTEGER NOT NULL,
        PRIMARY KEY (op_id, account_id)
      );
    `);
  }

  private toRecord(r: Record<string, unknown>): PendingOpRecord {
    return {
      opId: String(r.op_id),
      accountId: String(r.account_id),
      projectId: (r.project_id as string | null) ?? null,
      kind: String(r.kind),
      payload: String(r.payload),
      digest: (r.digest as string | null) ?? null,
      dependsOnOpIds: JSON.parse(String(r.depends_on)) as string[],
      state: String(r.state) as PendingOpRecord["state"],
      attempts: Number(r.attempts),
      nextAttemptAtMs: r.next_attempt_at_ms === null || r.next_attempt_at_ms === undefined ? null : Number(r.next_attempt_at_ms),
      lastError: (r.last_error as string | null) ?? null,
      acceptedReceipt: (r.accepted_receipt as string | null) ?? null,
      serverSeq: r.server_seq === null || r.server_seq === undefined ? null : Number(r.server_seq),
      tenantId: (r.tenant_id as string | null) ?? undefined,
      role: (r.role as string | null) ?? undefined,
    };
  }

  enqueue(accountId: string, input: EnqueueInput): PendingOpRecord {
    this.db
      .prepare(
        `INSERT INTO pending_op (op_id, account_id, project_id, tenant_id, role, kind, payload, depends_on, state, ord)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(input.opId, accountId, input.projectId ?? null, input.tenantId ?? null, input.role ?? null, input.kind, input.payload, JSON.stringify(input.dependsOnOpIds ?? []), ++this.order);
    return this.getOp(accountId, input.opId)!;
  }

  listDue(accountId: string, nowMs: number): PendingOpRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM pending_op WHERE account_id = ? AND state = 'pending'
           AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?) ORDER BY ord`,
      )
      .all(accountId, nowMs) as Array<Record<string, unknown>>;
    return rows.map((r) => this.toRecord(r));
  }

  listInFlight(accountId: string): PendingOpRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM pending_op WHERE account_id = ? AND state = 'in_flight' ORDER BY ord")
      .all(accountId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.toRecord(r));
  }

  getOp(accountId: string, opId: string): PendingOpRecord | null {
    const r = this.db.prepare("SELECT * FROM pending_op WHERE op_id = ? AND account_id = ?").get(opId, accountId) as
      | Record<string, unknown>
      | undefined;
    return r ? this.toRecord(r) : null;
  }

  markInFlight(opId: string): PendingOpRecord {
    this.db
      .prepare("UPDATE pending_op SET state = 'in_flight', attempts = attempts + 1 WHERE op_id = ?")
      .run(opId);
    const r = this.db.prepare("SELECT * FROM pending_op WHERE op_id = ?").get(opId) as Record<string, unknown>;
    return this.toRecord(r);
  }

  recordAccepted(opId: string, receipt: string, serverSeq: number | null): PendingOpRecord {
    this.db
      .prepare("UPDATE pending_op SET state = 'accepted', accepted_receipt = ?, server_seq = ?, last_error = NULL WHERE op_id = ?")
      .run(receipt, serverSeq, opId);
    const r = this.db.prepare("SELECT * FROM pending_op WHERE op_id = ?").get(opId) as Record<string, unknown>;
    return this.toRecord(r);
  }

  recordRejected(opId: string, reason: string): PendingOpRecord {
    this.db
      .prepare("UPDATE pending_op SET state = 'rejected', last_error = ? WHERE op_id = ?")
      .run(reason, opId);
    const r = this.db.prepare("SELECT * FROM pending_op WHERE op_id = ?").get(opId) as Record<string, unknown>;
    return this.toRecord(r);
  }

  requeue(opId: string, nextAttemptAtMs: number | null): PendingOpRecord {
    this.db
      .prepare("UPDATE pending_op SET state = 'pending', next_attempt_at_ms = ? WHERE op_id = ?")
      .run(nextAttemptAtMs, opId);
    const r = this.db.prepare("SELECT * FROM pending_op WHERE op_id = ?").get(opId) as Record<string, unknown>;
    return this.toRecord(r);
  }

  markBlocked(opId: string, reason: string): void {
    this.db.prepare("UPDATE pending_op SET state = 'blocked', last_error = ? WHERE op_id = ?").run(reason, opId);
  }

  markConflict(opId: string, reason: string): void {
    this.db.prepare("UPDATE pending_op SET state = 'conflict', last_error = ? WHERE op_id = ?").run(reason, opId);
  }

  close(): void {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------

/** REAL-SQLite server op-id ledger (idempotency boundary). */
export class SqlOpLedger implements ServerOpLedgerPort {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS op_ledger (
        op_id TEXT PRIMARY KEY,
        receipt TEXT NOT NULL,
        server_seq INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL
      );
    `);
  }
  lookup(opId: string): { receipt: string; serverSeq: number } | null {
    const r = this.db.prepare("SELECT receipt, server_seq FROM op_ledger WHERE op_id = ?").get(opId) as
      | { receipt: string; server_seq: number }
      | undefined;
    return r ? { receipt: r.receipt, serverSeq: Number(r.server_seq) } : null;
  }
  record(opId: string, receipt: string, serverSeq: number): void {
    this.db
      .prepare("INSERT INTO op_ledger (op_id, receipt, server_seq, recorded_at) VALUES (?, ?, ?, ?)")
      .run(opId, receipt, serverSeq, Date.now());
  }
  close(): void {
    this.db.close();
  }
}

/** Authority stub with knobs — claims are revalidated against THIS, not the envelope. */
export class StubAuthority implements ServerAuthorityPort {
  revoked = false;
  authRequired = false;
  /** Valid (accountId -> tenantId) pairs; a mismatched tenant claim fails. */
  validTenants = new Set<string>(["t1"]);
  revalidate(input: { accountId: string; deviceId: string; claims: ScopeClaims }): { ok: true } | { ok: false; kind: "revoked" | "authentication_required"; detail: string } {
    if (this.revoked) return { ok: false, kind: "revoked", detail: "session family revoked (stub)" };
    if (this.authRequired) return { ok: false, kind: "authentication_required", detail: "access token expired (stub)" };
    if (!this.validTenants.has(input.claims.tenantId)) {
      return { ok: false, kind: "revoked", detail: `tenant '${input.claims.tenantId}' not authorized for this session (stub)` };
    }
    return { ok: true };
  }
}

/** Domain apply stub for the daily-report pilot: base-version conflict detection. */
export class VersionedDomainApply implements DomainApplyPort {
  private currentVersion = new Map<string, number>();
  private seq = 100;
  apply(envelope: SyncEnvelope): { accepted: true; serverSeq: number } | { accepted: false; conflict: string } {
    const body = JSON.parse(envelope.payload) as { entityId: string; baseVersion: number };
    const cur = this.currentVersion.get(body.entityId) ?? 0;
    if (body.baseVersion !== cur) {
      return { accepted: false, conflict: `baseVersion ${body.baseVersion} != server ${cur} for ${body.entityId}` };
    }
    this.currentVersion.set(body.entityId, cur + 1);
    return { accepted: true, serverSeq: ++this.seq };
  }
  versionOf(entityId: string): number {
    return this.currentVersion.get(entityId) ?? 0;
  }
}

/**
 * Transport over the REAL server service; knobs simulate network failure
 * modes: `dropNextRequest` (request never arrives) and `loseNextResponse`
 * (server accepted, response lost — the lost-ack scenario end-to-end).
 */
export class RealServerTransport implements SyncTransportPort {
  dropNextRequest = false;
  loseNextResponse = false;
  sent: SyncEnvelope[] = [];
  constructor(private readonly server: ServerSyncService) {}
  send(envelope: SyncEnvelope): SyncOutcome {
    if (this.dropNextRequest) {
      this.dropNextRequest = false;
      throw new Error("network unreachable (stub)");
    }
    const outcome = this.server.apply(envelope);
    this.sent.push(envelope);
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new Error("connection dropped before response (stub)");
    }
    return outcome;
  }
}

/** Network-failure transport for retry tests (always throws). */
export class DeadNetworkTransport implements SyncTransportPort {
  sent = 0;
  send(): SyncOutcome {
    this.sent += 1;
    throw new Error("network unreachable (stub)");
  }
}

/** Recording auth-event sink (M03-T02 composition evidence). */
export class RecordingAuthSink implements AuthEventSink {
  readonly events: Array<{ kind: "revoked" | "authentication_required"; opId: string | null }> = [];
  onAuthEvent(kind: "revoked" | "authentication_required", opId: string | null): void {
    this.events.push({ kind, opId });
  }
}

/** Execution-environment stub for background gating. */
export class EnvGate implements ExecutionEnvironmentPort {
  ok = true;
  reason = "background sync deferred: metered network + battery saver (stub)";
  suitableForBackgroundSync(): { ok: true } | { ok: false; reason: string } {
    return this.ok ? { ok: true } : { ok: false, reason: this.reason };
  }
}
