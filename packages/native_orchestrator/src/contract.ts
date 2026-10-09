/**
 * Sync orchestration contract (M03-T07).
 *
 * Goal (M03 register): coordinate ordered pending operations, retries,
 * dependencies, network/power conditions, and response handling across
 * native and browser clients — the POLICY layer above the M03-T03 outbox
 * (persistence), M03-T02 identity (device/session identity), M03-T04 feed
 * (server-seq continuation), M03-T05 bootstrap (initial cursor) and
 * M03-T06 attachments (bytes independent of domain acceptance).
 *
 * Sources of truth:
 *   - platform plan v3 §5.3: each command envelope carries protocol
 *     version, operation/device identity, scope claims, payload digest and
 *     dependency identity; the server REVALIDATES claims authoritatively
 *     (client claims are never trusted). Outcomes distinguish accepted,
 *     previously accepted, conflict, rejected, revoked, authentication
 *     required, dependency blocked, and retryable. Retries are bounded
 *     with jitter and preserve idempotency; dependent operations never
 *     overtake prerequisites; push notifications act only as hints;
 *     foreground sync works without OS background scheduling.
 *   - M03-T01 adapter: transport envelope discipline (namespaced
 *     operation ids, explicit protocol version) — the sync envelope is the
 *     SYNC-layer contract and composes with it at the mount.
 *
 * Hard rules:
 *   - The orchestrator is a POLICY layer, not an authority: acceptance
 *     receipts are recorded ONLY from server outcomes; nothing is ever
 *     auto-accepted locally, and no outcome path ever deletes pending work.
 *   - Dependency ordering: an op dispatches only when every
 *     `dependsOnOpIds` entry is accepted; prerequisites are never overtaken
 *     (skipped dependents stay pending, tested).
 *   - Retries: bounded (maxAttempts) with FULL jitter backoff from an
 *     injected deterministic RandomPort — never unbounded, never dropped.
 *   - Lost acknowledgements recover by replay: the server's op-id ledger
 *     answers duplicate delivery with `previously_accepted` (idempotent).
 *   - Push notifications and background triggers are HINTS: they may start
 *     a drain attempt; they can never fabricate outcomes, bypass backoff
 *     accounting, or bypass execution-environment constraints.
 *   - Outcome details are SANITIZED: ids, kinds, counts — never payloads.
 */

// ---------------------------------------------------------------------------
// Versioned sync envelope (v3 §5.3)
// ---------------------------------------------------------------------------

/** Sync-layer protocol version. Bumped only via a [PLAN-AMEND] decision. */
export const SYNC_PROTOCOL_VERSION = 1;

export interface ScopeClaims {
  tenantId: string;
  projectId: string | null;
  /** Role claim as held by the client — REVALIDATED by the server authority. */
  role: string;
}

export interface SyncEnvelope {
  syncProtocolVersion: number;
  /** Durable operation identity — the idempotency key (outbox opId). */
  opId: string;
  /** Device identity (M03-T02 device registration). */
  deviceId: string;
  accountId: string;
  /** Namespaced operation kind, e.g. `fieldSubmission.submit` (T01 discipline). */
  kind: string;
  /** Client-held scope claims — revalidated server-side, never trusted. */
  scopeClaims: ScopeClaims;
  /** sha-256 hex of `payload` — verified by the server before any domain apply. */
  payloadDigest: string;
  /** Full operation payload (JSON string) — exactly what the outbox stored. */
  payload: string;
  /** Dependency identity: opIds that must be accepted before this op. */
  dependsOnOpIds: string[];
  /** Client attempt counter (1-based at first dispatch). */
  attempt: number;
  sentAtMs: number;
}

// ---------------------------------------------------------------------------
// Typed outcomes — exactly the eight v3 §5.3 states
// ---------------------------------------------------------------------------

export type SyncOutcomeKind =
  | "accepted"
  | "previously_accepted"
  | "conflict"
  | "rejected"
  | "revoked"
  | "authentication_required"
  | "dependency_blocked"
  | "retryable";

export interface SyncOutcome {
  kind: SyncOutcomeKind;
  opId: string;
  /** Server receipt; present ONLY for accepted/previously_accepted. */
  receipt: string | null;
  /** Commit-order feed cursor (M03-T04 continuation); present on acceptances. */
  serverSeq: number | null;
  /** SANITIZED detail (no payloads). */
  detail: string | null;
  /** Server-suggested retry delay for retryable outcomes. */
  retryAfterMs: number | null;
}

export function outcome(
  kind: SyncOutcomeKind,
  opId: string,
  extra: Partial<Omit<SyncOutcome, "kind" | "opId">> = {},
): SyncOutcome {
  return {
    kind,
    opId,
    receipt: extra.receipt ?? null,
    serverSeq: extra.serverSeq ?? null,
    detail: extra.detail ?? null,
    retryAfterMs: extra.retryAfterMs ?? null,
  };
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type OrchestrationErrorKind = "misconfigured" | "not_found" | "invalid_envelope" | "internal";

export class OrchestrationError extends Error {
  readonly kind: OrchestrationErrorKind;
  readonly detail: Record<string, string>;
  constructor(kind: OrchestrationErrorKind, message: string, detail: Record<string, string> = {}) {
    super(`[${kind}] ${message}`);
    this.name = "OrchestrationError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function orchestrationError(kind: OrchestrationErrorKind, message: string, detail?: Record<string, string>): OrchestrationError {
  return new OrchestrationError(kind, message, detail);
}

// ---------------------------------------------------------------------------
// Ports (structural — the mount binds platform implementations)
// ---------------------------------------------------------------------------

/** sha-256 digest port (fail-closed; same discipline as M03-T06). */
export interface DigestPort {
  readonly algorithm: "sha-256";
  digest(input: string): string; // lowercase hex
}

/**
 * Pending-operation persistence — the shape the M03-T03 OutboxRepository
 * already provides (the mount adapts it 1:1; tests back it with REAL
 * SQLite). The orchestrator never writes storage of its own.
 */
export interface PendingOpRecord {
  opId: string;
  accountId: string;
  projectId: string | null;
  kind: string;
  payload: string;
  digest: string | null;
  dependsOnOpIds: string[];
  /** The orchestrator's op lifecycle view (mount maps onto outbox + its app extension). */
  state: "pending" | "in_flight" | "accepted" | "rejected" | "blocked" | "conflict";
  /** Number of dispatches so far; markInFlight increments it. */
  attempts: number;
  nextAttemptAtMs: number | null;
  lastError: string | null;
  acceptedReceipt: string | null;
  /** Commit-order feed cursor recorded with the acceptance (M03-T04 continuation). */
  serverSeq: number | null;
  /** Scope claims the mount stores with the op (revalidated server-side). */
  tenantId?: string;
  role?: string;
}

export interface PendingOperationSource {
  /** Due pending ops (next_attempt_at_ms <= nowMs), oldest first. */
  listDue(accountId: string, nowMs: number): PendingOpRecord[];
  /** In-flight ops (lost-ack recovery input). */
  listInFlight(accountId: string): PendingOpRecord[];
  getOp(accountId: string, opId: string): PendingOpRecord | null;
  markInFlight(opId: string): PendingOpRecord;
  recordAccepted(opId: string, receipt: string, serverSeq: number | null): PendingOpRecord;
  recordRejected(opId: string, reason: string): PendingOpRecord;
  /** Requeue with backoff (or null for immediately eligible). */
  requeue(opId: string, nextAttemptAtMs: number | null): PendingOpRecord;
  /** Mark dependency-blocked (terminal for this op; data preserved). */
  markBlocked(opId: string, reason: string): void;
  /** Conflict surface — op stays pending-with-conflict for app resolution. */
  markConflict(opId: string, reason: string): void;
}

/**
 * Transport to the sync service. Network failures THROW (mapped to
 * retryable by the orchestrator); typed server responses come back as
 * outcomes. One envelope in, one outcome out.
 */
export interface SyncTransportPort {
  send(envelope: SyncEnvelope): SyncOutcome;
}

/**
 * Server-side authority: REVALIDATES the client's scope claims. Claims are
 * never trusted — a stale/revoked session yields revoked or
 * authentication_required here regardless of what the envelope says.
 */
export interface ServerAuthorityPort {
  revalidate(input: { accountId: string; deviceId: string; claims: ScopeClaims }):
    | { ok: true }
    | { ok: false; kind: "revoked" | "authentication_required"; detail: string };
}

/**
 * Server-side domain apply for the pilot domain (M03-T04 change-feed
 * discipline). Implementations detect conflicts (e.g. base-version
 * mismatch) and return the commit-order serverSeq the feed continues from.
 */
export interface DomainApplyPort {
  apply(envelope: SyncEnvelope): { accepted: true; serverSeq: number } | { accepted: false; conflict: string };
}

/** Server-side op-id ledger (idempotency). Tests back it with REAL SQLite. */
export interface ServerOpLedgerPort {
  /** Receipt + seq already recorded for this opId, or null. */
  lookup(opId: string): { receipt: string; serverSeq: number } | null;
  record(opId: string, receipt: string, serverSeq: number): void;
}

/**
 * Execution environment for background attempts (network metered/unmetered,
 * power/battery state). Foreground drains do NOT consult it (foreground
 * sync works without OS background scheduling); background drains refuse
 * to run while constraints are unmet — pending work is untouched.
 */
export interface ExecutionEnvironmentPort {
  suitableForBackgroundSync(): { ok: true } | { ok: false; reason: string };
}

/** Deterministic randomness for FULL jitter backoff (tests inject a stub). */
export interface RandomPort {
  /** Uniform float in [0, 1). */
  next(): number;
}

/** Auth lifecycle signal sink (M03-T02 composition: revoked → wipe credentials, KEEP pending work). */
export interface AuthEventSink {
  onAuthEvent(kind: "revoked" | "authentication_required", opId: string | null): void;
}

// ---------------------------------------------------------------------------
// Orchestration policy constants (recorded, tested)
// ---------------------------------------------------------------------------

export const ORCHESTRATION_POLICY = {
  /** Bounded retries per op before manual intervention is required. */
  maxAttempts: 8,
  /** FULL jitter: delay = random() * min(cap, base * 2^attempt). */
  backoffBaseMs: 1_000,
  backoffCapMs: 5 * 60_000,
} as const;
