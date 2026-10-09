/**
 * Sync and crash observability contract (M03-T08).
 *
 * Goal (M03 register): make sync health observable NOW so M04 fault
 * evidence can be diagnosed — crash reporting for every runtime (Dart,
 * native, Rust), server sync metrics with tenant-safe aggregation, and a
 * device sync-health surface that never presents a false success state.
 *
 * Sources of truth:
 *   - platform plan v3 §5.3/§7: diagnostics are sanitized (no credentials,
 *     no private drafts, no sensitive payloads); server metrics expose sync
 *     requests, accepted/replayed/rejected/conflicted outcomes, feed lag,
 *     checkpoint age, attachment retry/error counts — aggregated
 *     tenant-safely; the device surface exposes pending-operation count,
 *     oldest pending age, last accepted cursor per scope, and rejection
 *     reasons WITHOUT presenting a false success state.
 *   - M03-T02: `scrubForReport`/`redactSecret` redaction vocabulary — this
 *     package re-declares the same pattern (zero-dep isolation); the mount
 *     binds the identity package's implementation where both are present.
 *   - M03-T07: outcome kinds are the metric labels; the staged
 *     rejection/retry evidence runs the REAL orchestrator + server service.
 *
 * Hard rules:
 *   - Sanitization is FAIL-SAFE: an unknown or malformed crash context is
 *     still reduced to the safe shape (drop-first, never pass-through).
 *   - Global metric snapshots NEVER carry tenant identifiers (tenant-safe
 *     aggregation); per-tenant numbers require an explicit, authorized
 *     tenant scope argument.
 *   - The device surface is derived from DURABLE state (outbox pending
 *     rows, accepted receipts, per-scope checkpoints) and is honest:
 *     pending work or a recent failure means NOT synced — no false success.
 *   - Metrics are derived, lossy counters — they never replace the
 *     durable records; nothing here writes domain data.
 */

// ---------------------------------------------------------------------------
// Sanitized crash reporting
// ---------------------------------------------------------------------------

export type CrashComponent = "dart" | "native" | "rust";

/** Raw crash context as captured by a platform handler (may contain anything). */
export interface RawCrashContext {
  component: CrashComponent;
  errorKind: string;
  message: string;
  /** Stack frames (already plain strings; contents are untrusted). */
  frames: string[];
  /** Arbitrary key/values attached by the panic handler (untrusted). */
  attributes: Record<string, unknown>;
  appVersion: string;
  schemaVersion: string;
  occurredAtMs: number;
}

export interface SanitizedCrashReport {
  component: CrashComponent;
  errorKind: string;
  /** Message reduced to its safe prefix — payload-like content stripped. */
  message: string;
  /** Frame COUNT only — frame text is never exported. */
  frameCount: number;
  /** Only allow-listed, scrubbed attributes survive. */
  attributes: Record<string, string>;
  appVersion: string;
  schemaVersion: string;
  occurredAtMs: number;
}

/** Keys that are SAFE to export from a crash context (values still scrubbed). */
export const CRASH_SAFE_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "component", "errorKind", "opId", "attachmentId", "accountId", "projectId",
  "tenantId", "scope", "cursorSeq", "serverSeq", "attempt", "state", "kind",
  "deviceModel", "osVersion", "battery", "network", "storageFreeBytes",
]);

/** Attribute values are reduced to short, non-secret summaries. */
export const CRASH_ATTRIBUTE_MAX_LEN = 64;

// ---------------------------------------------------------------------------
// Server sync metrics (tenant-safe aggregation)
// ---------------------------------------------------------------------------

export type SyncMetricOutcome =
  | "requests"
  | "accepted"
  | "replayed"
  | "rejected"
  | "conflicted"
  | "revoked"
  | "auth_required"
  | "dependency_blocked"
  | "retryable";

/** One tenant-scoped observation (recorded at the mount's sync boundary). */
export interface SyncObservation {
  tenantId: string;
  projectId: string | null;
  kind: string; // operation kind, e.g. fieldSubmission.submit
  outcome: SyncMetricOutcome;
  /** Feed lag for this request, when known (watermark minus applied seq). */
  feedLagMs?: number | null;
  /** Checkpoint age for the scope, when known. */
  checkpointAgeMs?: number | null;
}

export interface GlobalMetricsSnapshot {
  /** Counts by outcome — NO tenant identifiers anywhere in this shape. */
  outcomes: Record<SyncMetricOutcome, number>;
  requests: number;
  /** Attachment transfer counters (M03-T06 surface wiring). */
  attachmentRetries: number;
  attachmentErrors: number;
  /** Aggregates across all observations (tenant-safe min/max/avg). */
  feedLagMs: { avg: number | null; max: number | null };
  checkpointAgeMs: { avg: number | null; max: number | null };
  generatedAtMs: number;
}

export interface TenantMetricsSnapshot extends GlobalMetricsSnapshot {
  /** Authorized per-tenant breakdown (never part of the global shape). */
  tenantId: string;
  byKind: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Device sync-health surface
// ---------------------------------------------------------------------------

/** Per-scope last accepted cursor (M03-T04 checkpoint read model). */
export interface ScopeCursor {
  scope: string;
  lastAcceptedSeq: number;
  checkpointAgeMs: number;
}

export interface RejectionSurface {
  opId: string;
  kind: string;
  reason: string; // sanitized
  atMs: number;
}

/**
 * The honest device sync-health read model. `synced` is TRUE only when no
 * pending work exists, no recent rejection is unsurfaced, and every active
 * scope has a checkpoint — anything else is `synced: false` with reasons.
 */
export interface DeviceSyncHealth {
  accountId: string;
  synced: boolean;
  reasons: string[];
  pendingOperationCount: number;
  oldestPendingAgeMs: number | null;
  conflicts: number;
  blocked: number;
  lastAcceptedCursors: ScopeCursor[];
  rejections: RejectionSurface[];
  generatedAtMs: number;
}

/**
 * Durable read model the health surface derives from — the mount binds the
 * outbox/feed/attachment databases; tests back it with REAL SQLite.
 */
export interface SyncHealthSource {
  accountId: string;
  pendingOps(): Array<{ opId: string; kind: string; createdAtMs: number; state: "pending" | "in_flight" | "blocked" | "conflict" | "rejected"; lastError: string | null; updatedAtMs: number }>;
  acceptedCursors(): ScopeCursor[];
}

export interface HealthOptions {
  /** Clock for age computations. */
  nowMs: number;
  /** A rejection older than this no longer blocks `synced`. */
  rejectionFreshMs?: number;
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type ObservabilityErrorKind = "misconfigured" | "not_found" | "internal";

export class ObservabilityError extends Error {
  readonly kind: ObservabilityErrorKind;
  constructor(kind: ObservabilityErrorKind, message: string) {
    super(`[${kind}] ${message}`);
    this.name = "ObservabilityError";
    this.kind = kind;
  }
}

export function observabilityError(kind: ObservabilityErrorKind, message: string): ObservabilityError {
  return new ObservabilityError(kind, message);
}
