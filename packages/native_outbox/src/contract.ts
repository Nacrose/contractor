/**
 * SQLite transaction and outbox repository contract (M03-T03).
 *
 * Goal (M03 register, protocol R9): make local mutations and pending sync
 * operations durable TOGETHER, with account isolation and private-draft
 * handling — the local durability half of the M03 sync engine, consumed by
 * the M03-T02 pending-work gate and the M03-T07 orchestrator.
 *
 * Sources of truth:
 *   - platform plan v3 §5.2 local durability: local saves commit the domain
 *     write and its pending operation together; pending operations,
 *     attachments and private drafts are durable data, never cache data;
 *     logout/account switch must surface unsynchronized work.
 *   - M01-T13 SQLite durability rig (engine-level proof of WAL+FULL
 *     durability, kill-during-transaction rollback, busy handling,
 *     max_page_count disk-full): this task builds the REPOSITORY contract
 *     on those proven engine semantics.
 *   - M03-T02: `PendingWorkSummary` shape and the pending-work gate.
 *
 * Hard rules:
 *   - The repository is a DURABILITY boundary, not an authority: acceptance
 *     receipts are recorded ONLY from server outcomes; nothing is ever
 *     auto-accepted locally. Domain services stay authoritative (v3 §4).
 *   - Pending operations, attachments, and private drafts are NEVER evicted
 *     as cache data. The only deletions are the explicit, tested retention
 *     methods (deleteAcceptedBefore / purgeAccount) and explicit per-row
 *     deletes; there is no LRU/trim/evict path on this class (pinned by
 *     test on the prototype surface).
 *   - Every row is account-scoped; reads without an account scope cannot
 *     exist on the API. Account isolation is enforced by the query shape.
 *   - Versioned schema: migrations run one transaction per version; an
 *     interrupted migration rolls back to the previous version, leaving the
 *     database consistent and re-migratable.
 */

// ---------------------------------------------------------------------------
// Value and record types
// ---------------------------------------------------------------------------

export type SqlValue = string | number | bigint | null;

/** Lifecycle of a pending sync operation. Transitions are validated and CHECK-constrained. */
export type PendingOpState = "pending" | "in_flight" | "accepted" | "rejected";

export interface PendingOpInput {
  /** Durable operation identity (client-generated uuid at the app layer). */
  opId: string;
  /** Server operation id this op targets, e.g. `fieldSubmission.submit` (M03-T01 envelope semantics). */
  kind: string;
  /** Full operation payload (JSON string) — everything the orchestrator needs to re-send it. */
  payload: string;
  /** Payload digest carried in the M03-T07 sync envelope. */
  digest?: string;
  /** Operation ids that must be accepted before this op may dispatch. */
  dependsOnOpIds?: string[];
  /** Earliest dispatch time (epoch ms) for bounded retry backoff; null = immediately eligible. */
  nextAttemptAtMs?: number | null;
}

export interface PendingOpRecord {
  id: string;
  accountId: string;
  projectId: string | null;
  kind: string;
  payload: string;
  state: PendingOpState;
  attempts: number;
  nextAttemptAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  lastError: string | null;
  /** Server-issued acceptance receipt; present ONLY for accepted ops (the durable receipt). */
  acceptedReceipt: string | null;
  digest: string | null;
}

export interface PrivateDraftInput {
  id: string;
  kind: string;
  /** Draft body — private/local-only until the user explicitly chooses the shared workflow. */
  body: string;
  projectId?: string | null;
}

export interface PrivateDraftRecord {
  id: string;
  accountId: string;
  projectId: string | null;
  kind: string;
  body: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AttachmentStageState = "staging" | "staged" | "finalized" | "registered" | "failed";

/** Legal edges of the attachment staging machine (M03-T06 consumes this). */
export const ATTACHMENT_TRANSITIONS: Record<AttachmentStageState, AttachmentStageState[]> = {
  staging: ["staged", "failed"],
  staged: ["finalized", "failed"],
  finalized: ["registered", "failed"],
  registered: [],
  failed: [],
};

export interface AttachmentInput {
  id: string;
  localPath: string;
  digest: string;
  bytes: number;
  projectId?: string | null;
}

/** Shape-compatible with `@contractor/native-identity` PendingWorkSummary (M03-T02 gate input). */
export interface PendingWorkSummary {
  pendingOperations: number;
  oldestPendingAgeMs: number | null;
  privateDrafts: number;
  attachmentsPending: number;
}

// ---------------------------------------------------------------------------
// Typed repository errors
// ---------------------------------------------------------------------------

export type RepositoryErrorKind =
  | "busy"
  | "locked"
  | "full"
  | "corrupt"
  | "notadb"
  | "constraint"
  | "illegal_transition"
  | "not_found"
  | "misconfigured"
  | "migration_failed"
  | "internal";

export class RepositoryError extends Error {
  readonly kind: RepositoryErrorKind;
  readonly detail?: Record<string, string>;

  constructor(kind: RepositoryErrorKind, message: string, detail?: Record<string, string>) {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

export function repositoryError(kind: RepositoryErrorKind, message: string, detail?: Record<string, string>): RepositoryError {
  return new RepositoryError(kind, message, detail);
}
