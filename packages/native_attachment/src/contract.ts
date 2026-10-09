/**
 * Attachment staging and resume contract (M03-T06).
 *
 * Goal (M03 register): transfer attachment bytes independently from domain
 * acceptance while keeping registration and file durability consistent —
 * the client stages bytes, computes and verifies a digest, durably
 * finalizes storage, and ONLY THEN registers the attachment with the
 * server. Interrupted file/database transitions recover through the
 * reconciliation journal; orphaned or partial objects are never exposed as
 * complete attachments.
 *
 * Sources of truth:
 *   - platform plan v3 §5.3: attachments stage independently of domain
 *     acceptance; resume must work after app launch, foregrounding, and
 *     manual sync — OS background transfer is an OPPORTUNITY, never the
 *     only recovery path.
 *   - M03-T03 outbox: `attachment_stage` there is the durable pending-work
 *     STATE (PendingWorkSummary input); this package is the transfer
 *     PROTOCOL above it. The mount composes them (register success is when
 *     the app layer marks the outbox row registered). No cross-package
 *     import — zero-dep isolation preserved.
 *   - M03-T07 envelope: the registration receipt and digest recorded here
 *     are the attachment identity the sync envelope carries.
 *
 * Hard rules:
 *   - ORDERING is structural: `register` refuses anything not `finalized`;
 *     `finalize` re-verifies the digest against the FINAL object bytes.
 *     Bytes reach the server only after durable local finalization.
 *   - The reconciliation journal is append-only and SANITIZED: event
 *     details carry ids, digests, offsets, byte counts and receipt ids —
 *     never payload bytes, file contents, or credentials (pinned by test).
 *   - Every failure is a TYPED RECOVERABLE STATE that preserves pending
 *     data: bytes, journal row and events stay intact; the attachment is
 *     never silently dropped, and failed/staging/staged rows are never
 *     listed as complete attachments.
 *   - Server upload offsets are authoritative at resume (queryUpload);
 *     client journal offsets are hints only — a lost acknowledgement can
 *     never duplicate business bytes server-side.
 *   - Every row is account-scoped; reads without an account scope cannot
 *     exist on the API.
 */

// ---------------------------------------------------------------------------
// Value and record types
// ---------------------------------------------------------------------------

/** Lifecycle of an attachment transfer. Transitions are validated and CHECK-constrained. */
export type AttachmentTransferState = "staging" | "staged" | "finalized" | "registered" | "failed";

/** Legal edges of the transfer state machine (mirrors the M03-T03 outbox vocabulary). */
export const TRANSFER_TRANSITIONS: Record<AttachmentTransferState, AttachmentTransferState[]> = {
  staging: ["staged", "failed"],
  staged: ["finalized", "failed"],
  finalized: ["registered", "failed"],
  registered: [],
  failed: [],
};

/** Which protocol step a failed attachment must resume from (deterministic recovery input). */
export type TransferStep = "stage" | "finalize" | "register";

export type TransferFailureKind =
  | "retryable"          // network / transient server error — bounded backoff, auto-eligible when due
  | "rejection"          // server policy rejected the registration — manual retry after fix
  | "revoked"            // access revoked — retry after re-authentication
  | "storage"            // local object store refused the write (quota / disk full)
  | "digest_mismatch"    // local or server digest verification failed — full re-stage from source
  | "source_missing"     // source file gone at re-stage time — recoverable when user re-provides it
  | "internal";          // unexpected — still recoverable via retry()

export interface AttachmentStageInput {
  /** Durable attachment identity (client-generated uuid at the app layer). */
  id: string;
  /** Optional project scope for the eventual registration. */
  projectId?: string | null;
  /**
   * Device path the bytes came from — the durable recovery identity for
   * re-staging after interruption. Kept as an opaque string; reading goes
   * through the injected SourceReaderPort.
   */
  sourcePath: string;
  /** Full payload bytes for this attempt. */
  bytes: Uint8Array;
}

export interface AttachmentRecord {
  id: string;
  accountId: string;
  projectId: string | null;
  sourcePath: string;
  /** Final object key once staged; null while staging. */
  objectKey: string | null;
  /** sha-256 hex of the full payload; null until verified at stage time. */
  digest: string | null;
  bytes: number | null;
  state: AttachmentTransferState;
  /** Present when state='failed'. */
  failureKind: TransferFailureKind | null;
  /** Present when state='failed' — the step to resume from. */
  failureStep: TransferStep | null;
  failureDetail: string | null;
  attempts: number;
  /** Earliest auto-resume time for bounded backoff; null = no auto attempt scheduled. */
  nextAttemptAtMs: number | null;
  /** Server registration receipt; present ONLY for registered attachments. */
  receipt: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

/** One append-only reconciliation journal entry. Details are sanitized (no payload bytes). */
export interface AttachmentEvent {
  ord: number;
  attachmentId: string;
  accountId: string;
  kind:
    | "stage_started" | "staged_verified" | "finalized" | "upload_opened"
    | "chunk_ack" | "registered" | "failed" | "recovered";
  detail: string | null;
  atMs: number;
}

export interface ResumeSummary {
  completed: string[];
  stillPending: string[];
  failed: Array<{ id: string; kind: TransferFailureKind; detail: string }>;
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type TransferErrorKind =
  | "not_found"
  | "illegal_transition"
  | "misconfigured"
  | "busy"
  | "locked"
  | "full"
  | "corrupt"
  | "notadb"
  | "constraint"
  | "internal";

export class TransferError extends Error {
  readonly kind: TransferErrorKind;
  readonly detail: Record<string, string>;
  constructor(kind: TransferErrorKind, message: string, detail: Record<string, string> = {}) {
    super(`[${kind}] ${message}`);
    this.name = "TransferError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function transferError(kind: TransferErrorKind, message: string, detail?: Record<string, string>): TransferError {
  return new TransferError(kind, message, detail);
}

/** True when the thrown value is a TransferError of one of the given kinds. */
export function isTransferError(e: unknown, kinds: TransferErrorKind[]): e is TransferError {
  return e instanceof TransferError && kinds.includes(e.kind);
}

// ---------------------------------------------------------------------------
// Ports (structural — the mount binds platform implementations)
// ---------------------------------------------------------------------------

/**
 * Digest computation. The server registration contract requires SHA-256;
 * the mount MUST inject a real SHA-256 implementation (fail-closed if
 * absent — the manager refuses to open without it).
 */
export interface DigestPort {
  readonly algorithm: "sha-256";
  digest(bytes: Uint8Array): string; // lowercase hex
}

/**
 * Durable byte storage for attachment objects (device filesystem on
 * native; OPFS/IndexedDB-backed store on browser). Implementations MUST
 * make putBytes durable-before-return (write + flush + rename semantics)
 * and renameBytes must be an atomic same-filesystem move that tolerates a
 * source already moved (crash-recovery re-entry). Quota/disk-full MUST
 * surface as TransferError kind 'full' so the manager can map it to the
 * typed recoverable 'storage' failure.
 */
export interface ObjectStore {
  putBytes(key: string, bytes: Uint8Array): void;
  getBytes(key: string): Uint8Array;
  /** Byte length of the object, or null when absent. */
  statBytes(key: string): number | null;
  removeBytes(key: string): void;
  /** Atomic move; if source is gone and destination exists this is a no-op (crash re-entry). */
  renameBytes(fromKey: string, toKey: string): void;
  /** All keys with the given prefix (orphan sweep input). */
  listKeys(prefix: string): string[];
}

/**
 * Read source bytes back from the device path recorded on the journal row
 * — the autonomy input for re-staging after app launch without user action.
 */
export interface SourceReaderPort {
  readBytes(path: string): Uint8Array; // throws when the source is gone
}

/**
 * Server registration boundary (the disposable server/object fixture in
 * tests; the real mount binds the attachment service). Chunked so an
 * interrupted transfer resumes from the SERVER's authoritative offset.
 * No domain-writer surface: uploads are keyed by attachment identity and
 * verified by digest; nothing here touches domain tables.
 */
export interface AttachmentRegistrarPort {
  /** Idempotent per (attachmentId, digest): re-opening returns the same upload id. */
  openUpload(input: {
    attachmentId: string;
    accountId: string;
    projectId: string | null;
    digest: string;
    bytes: number;
  }): { uploadId: string };
  /** Append bytes at an exact offset; the server rejects offset mismatches (typed error). */
  putChunk(uploadId: string, offset: number, chunk: Uint8Array): { receivedBytes: number };
  /**
   * Complete the upload; the server verifies sha-256(bytes) === digest and
   * returns the durable registration receipt. Idempotent: completing an
   * already-completed upload returns the SAME receipt (lost-ack recovery).
   */
  completeUpload(uploadId: string, digest: string, bytes: number): { receipt: string };
  /** Authoritative received-byte count for resume decisions. */
  queryUpload(uploadId: string): { receivedBytes: number; completedReceipt: string | null };
}

/** Typed server-side failures the registrar port may raise (mapped onto TransferFailureKind). */
export type RegistrarErrorKind = "retryable" | "rejection" | "revoked" | "digest_mismatch" | "storage";

export class RegistrarError extends Error {
  readonly kind: RegistrarErrorKind;
  constructor(kind: RegistrarErrorKind, message: string) {
    super(`[${kind}] ${message}`);
    this.name = "RegistrarError";
    this.kind = kind;
  }
}
