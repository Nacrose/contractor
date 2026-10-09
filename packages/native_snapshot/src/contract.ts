/**
 * Snapshot bootstrap, cursor persistence and tombstones (M03-T05).
 *
 * Goal (M03 register, protocol R9): initialize a device to a consistent
 * server state and continue from the feed without losing pending local
 * work — the bootstrap half of the M03 sync engine, consumed by the
 * M03-T03 outbox (pending-work preservation) and the M03-T04 feed
 * (continue-from-watermark).
 *
 * Sources of truth:
 *   - platform plan v3 §5.3: consistent-state snapshot + watermark; batch +
 *     cursor applied in one local transaction; bounded bytes + deterministic
 *     ordering; expired cursor → safe rebootstrap preserving pending local
 *     work.
 *   - M03-T03 (`@contractor/native-outbox`): pending operations are durable
 *     data; rebootstrap reconciliation must preserve, never discard, them.
 *   - M03-T04 (`@contractor/native-sync-feed`): the feed is the change
 *     mechanism; the snapshot watermark is the feed cursor the client
 *     continues from. Checkpoint/replay discipline mirrors ADR-0011.
 *
 * Hard rules (pinned by tests):
 *   - The service NEVER writes domain tables and the package ships NO domain
 *     schema. Domain rows and scope tombstones arrive through an injected
 *     `SnapshotSource` port (audited, mounted by the app); entity applies go
 *     through an injected `SnapshotEntityApplier` port. The service/applier
 *     class surfaces have no domain-writer methods (pinned structurally).
 *   - Consistency: `openSnapshot` materializes rows + tombstones and reads
 *     the watermark INSIDE one BEGIN IMMEDIATE transaction. Pages served
 *     afterwards are immutable — concurrent writes during bootstrap never
 *     change what the pages contain.
 *   - Bounded and deterministic: pagination has a byte cap (single oversized
 *     row delivered alone — feed precedent) and a stable total order
 *     (domain, then entity id, then op class) fixed at open time.
 *   - One-transaction apply: a snapshot batch's entity applies, page dedup
 *     row, and cursor advance commit together or not at all; interruption
 *     can never advance the cursor ahead of applied data.
 *   - Tombstones: deletes and scope changes are materialized as explicit
 *     `delete` rows so stale local rows cannot silently survive replay; the
 *     completion reconcile additionally drops rows absent from the manifest
 *     (manifest-closure) EXCEPT ids the pending-work probe reports as
 *     protected — pending local work is preserved and reported, never
 *     discarded.
 *   - Expired/invalid cursors surface as typed `resync_required` (the
 *     feed's 410-Gone analogue); rebootstrap is a NEW full snapshot plus
 *     reconcile — never a silent range skip.
 */

// ---------------------------------------------------------------------------
// Typed errors (same taxonomy as the other M03 packages)
// ---------------------------------------------------------------------------

export type RepositoryErrorKind =
  | "busy"
  | "locked"
  | "full"
  | "corrupt"
  | "notadb"
  | "constraint"
  | "not_found"
  | "misconfigured"
  | "migration_failed"
  | "internal"
  /** Caller cursor references an unknown/swept snapshot; a rebootstrap is required. */
  | "resync_required"
  /** Caller is not entitled to the requested snapshot scope. */
  | "unauthorized";

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

export type SnapshotError = RepositoryError;

// ---------------------------------------------------------------------------
// Server side: sources, watermark, manifest, pages
// ---------------------------------------------------------------------------

/**
 * The audited per-domain row source the server mount injects. The package
 * itself owns no domain schema: `readRows`/`readTombstones` are called inside
 * the open transaction so rows, tombstones and the watermark materialize
 * from ONE consistent state. Deterministic ordering is enforced here (rows
 * sorted by entity id) so the source implementation cannot destabilize it.
 */
export interface SnapshotSource {
  domain: string;
  /** Current rows in scope; payload is the JSON string exactly as clients should store it. */
  readRows(tenantId: string, projectId: string | null): Array<{ entityId: string; payload: string }>;
  /**
   * Entity ids removed from this scope (deleted, or moved out of the
   * caller's project scope). Materialized as `delete` tombstone rows so a
   * rebootstrap over an existing device clears stale rows explicitly.
   */
  readTombstones(tenantId: string, projectId: string | null): string[];
}

/**
 * Watermark port: the feed cursor this snapshot is anchored to. The mount
 * supplies the same mechanism it serves pulls with (in the repo evidence the
 * feed and snapshot share one SQLite database, so a port reading the feed
 * head inside the open transaction is exactly consistent; a mount that
 * splits databases MUST supply a transactionally consistent watermark —
 * recorded obligation in the evidence report).
 */
export interface WatermarkPort {
  currentSeq(tenantId: string): number;
}

export interface OpenSnapshotInput {
  tenantId: string;
  /** Project scope of the snapshot; null = tenant-wide. */
  projectId: string | null;
  sources: SnapshotSource[];
  watermark: WatermarkPort;
  /** Hard cap on materialized rows (bounded memory at open). Default 100000. */
  maxObjects?: number;
}

export interface SnapshotManifestInfo {
  snapshotId: string;
  tenantId: string;
  projectId: string | null;
  /** Feed cursor to continue from after the snapshot is applied. */
  watermark: number;
  objectCount: number;
  tombstoneCount: number;
  createdAtMs: number;
}

export interface SnapshotRow {
  ord: number;
  domain: string;
  entityId: string;
  op: "upsert" | "delete";
  /** JSON payload; null for tombstones. */
  payload: string | null;
}

export interface SnapshotPage {
  snapshotId: string;
  tenantId: string;
  projectId: string | null;
  watermark: number;
  /** ord of the first row on this page (pagination cursor; -1 for an empty snapshot). */
  firstOrd: number;
  rows: SnapshotRow[];
  /** ord to request next (`afterOrd`); equals last row's ord + 1. */
  nextAfterOrd: number;
  hasMore: boolean;
  approxBytes: number;
}

// ---------------------------------------------------------------------------
// Client side: applier port, apply results, reconcile
// ---------------------------------------------------------------------------

/**
 * Entity applier port, registered per domain at open. Receives the driver so
 * applies participate in the client's single transaction. The port is the
 * ONLY writer of domain tables on the client side; the applier class itself
 * has none. `localIds` backs the completion reconcile (mount reads its own
 * scope tables).
 */
export interface SnapshotEntityApplier {
  upsert(driver: import("./driver.js").SqlDriver, domain: string, entityId: string, payload: string): void;
  delete(driver: import("./driver.js").SqlDriver, domain: string, entityId: string): void;
  /** Entity ids currently stored locally for this domain (scope of the bootstrap). */
  localIds(driver: import("./driver.js").SqlDriver): string[];
}

/**
 * Pending-work probe port: entity ids the mount reports as carrying
 * unsynchronized local work (wired to the M03-T03 outbox at the mount; the
 * package never imports the outbox — zero-dep isolation). Protected ids are
 * preserved by the completion reconcile and reported, never discarded.
 */
export interface PendingWorkProbe {
  protectedEntityIds(accountId: string, domain: string): string[];
}

export interface ApplyPageResult {
  /** Rows newly applied on this delivery. */
  applied: number;
  /** Rows skipped because the page was already applied (duplicate delivery). */
  skippedPages: number;
  /**
   * Tombstone deletes SKIPPED because the target entity carries pending
   * local work (per the PendingWorkProbe). The delete is surfaced, never
   * silently applied: the pending op and the local row stay intact and the
   * conflict resolves at dispatch time (M03-T07 outcomes).
   */
  protectedDeletes: string[];
  /** ord cursor after this delivery (monotonic: never moves backwards). */
  confirmedAfterOrd: number;
}

export interface BootstrapProgress {
  state: "none" | "applying" | "complete";
  snapshotId: string | null;
  watermark: number | null;
  pagesApplied: number;
  rowsApplied: number;
  /** Monotonic ord cursor (last nextAfterOrd); -1 when nothing applied. */
  lastAfterOrd: number;
}

export interface ReconcileResult {
  /** Local rows absent from the manifest and unprotected — dropped as stale. */
  dropped: string[];
  /** Rows carrying pending local work — preserved for dispatch/conflict (M03-T03/T07). */
  preserved: string[];
}

export interface CompleteBootstrapInput {
  accountId: string;
  tenantId: string;
  /** Mount-defined scope key of this bootstrap, e.g. `t1:all` or `t1:p7`. */
  scopeKey: string;
  /** Manifest object count from the server open response — the completeness gate. */
  objectCount: number;
  /** Run the manifest-closure reconcile as part of completion (default true). */
  reconcile?: boolean;
  /** Domains to reconcile (defaults to every domain with a registered applier). */
  domains?: string[];
}

// ---------------------------------------------------------------------------
// Pinned port surface (no-domain-writers guarantee, mirrors T02/T04 pinning)
// ---------------------------------------------------------------------------

/** Exactly the methods `SnapshotService` exposes. Pinned by test. */
export const SNAPSHOT_SERVICE_METHODS = [
  "openSnapshot",
  "readPage",
  "manifestInfo",
  "sweepSnapshots",
] as const;

/** Exactly the methods `SnapshotApplier` exposes. Pinned by test. */
export const SNAPSHOT_APPLIER_METHODS = [
  "applyPage",
  "readProgress",
  "completeBootstrap",
  "abortBootstrap",
] as const;
