/**
 * Authorized commit-safe change feed contract (M03-T04).
 *
 * Implements the M00 owner-ratified Server-Mediated Hybrid Change-Feed
 * (ADR-0011 / docs/reports/M00/spike-decision.md) for ONE explicitly named
 * pilot domain: the daily report / field submission domain (the substrate of
 * the M04 first vertical workflow "daily log + photo").
 *
 * Two sides, one package, mirroring ADR-0011 §2:
 *   - `TenantChangeFeed` (server side): a tenant-partitioned change log with
 *     strict commit-order cursor semantics. Events become visible to pull
 *     ONLY when their containing transaction commits, and cursor positions
 *     are allocated at commit time inside a serialized write transaction —
 *     the SQLite analogue of ADR-0011's commit-LSN ordering. Redaction is
 *     applied pre-persistence (fail-closed: no policy, no publish).
 *   - `FeedConsumer` (client side): durable checkpoints
 *     (`sync_checkpoint` ~ ADR-0011 `_sync_checkpoint`) and idempotent
 *     deduplication (`sync_inbox_dedup` ~ `_sync_inbox_dedup`); entity
 *     applies and checkpoint advancement happen in ONE transaction.
 *     Command receipts give financially effective commands durable replay
 *     protection beyond the 30-day default, with compaction — never
 *     expiry-driven replay risk (plan v3 §6 M03).
 *
 * Hard rules (pinned by tests):
 *   - The feed NEVER writes domain tables. Domain writes are callables
 *     supplied by the (audited) writer; entity applies are an injected
 *     `EntityApplier` port. The feed surface has no domain-writer methods.
 *   - Publishing without a registered redaction policy for (domain,
 *     schemaVersion) fails CLOSED: the whole transaction — domain write
 *     included — rolls back. Nothing leaks by default.
 *   - Pull reads are tenant-partitioned and permission-filtered; a
 *     filtered-out event never advances the cursor (re-granted access can
 *     still receive it; worst case is re-scan, never a skip).
 *   - Retention sweeps move a watermark; a cursor below the floor gets
 *     `resync_required` (the ADR-0011 "410 Gone" analogue) — never a
 *     silently skipped range.
 *   - Receipts are recorded ONLY from server outcomes (mirrors the
 *     native_outbox authority rule). Financial receipts are never expiry-
 *     deleted; compaction drops payload detail but keeps the replay guard.
 */

import type { SqlDriver } from "./driver.js";

// ---------------------------------------------------------------------------
// Typed feed errors (extends the shared repository taxonomy of native_outbox
// with `resync_required` — the ADR-0011 "410 Gone" analogue — and
// `unauthorized`; driver.ts imports this type from here, one direction only)
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
  /** Caller cursor is below the retention floor; a snapshot rebootstrap is required. */
  | "resync_required"
  /** Caller is not entitled to the requested feed partition. */
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

export type FeedError = RepositoryError;

export function feedError(kind: RepositoryErrorKind, message: string, detail?: Record<string, string>): RepositoryError {
  return repositoryError(kind, message, detail);
}

// ---------------------------------------------------------------------------
// Redaction policy (ADR-0011 §2 contract 3: schema-driven, pre-fanout)
// ---------------------------------------------------------------------------

/**
 * Schema-driven redaction for one (domain, schemaVersion). Applied at
 * publish time — BEFORE persistence into the tenant change log — so the
 * stored feed row itself is already sanitized (ADR-0011: "pre-fanout
 * sanitization in the daemon").
 */
export interface RedactionPolicy {
  domain: string;
  schemaVersion: number;
  /** Top-level payload keys removed entirely (e.g. PAN numbers, bank details). */
  strip: string[];
  /** Top-level payload keys kept but value-replaced (e.g. phone numbers). */
  mask: string[];
}

export interface FeedEventInput {
  tenantId: string;
  /** Project scope of the change; null for tenant-wide records. */
  projectId: string | null;
  /** Pilot domains registered in the app layer, e.g. `daily-report`, `field-submission`. */
  domain: string;
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  /** Structured JSON payload (will be redacted per policy before persistence). */
  payload: Record<string, unknown>;
  schemaVersion: number;
}

export interface FeedEventEnvelope {
  /** Deterministic event identity: `<domain>/<entity>/<entityId>@<seq>`. Stable across replays. */
  eventId: string;
  /** Monotonic commit-order position; allocated inside the publishing transaction. */
  seq: number;
  tenantId: string;
  projectId: string | null;
  domain: string;
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  /** Redacted JSON string — the envelope travels to clients exactly as stored. */
  payload: string;
  schemaVersion: number;
  /** Audited writer identity, e.g. `router:fieldSubmission.submitFieldReport`. */
  writer: string;
}

export interface FeedPublishResult {
  envelopes: FeedEventEnvelope[];
}

// ---------------------------------------------------------------------------
// Pull: authorization scope, bounds, pages
// ---------------------------------------------------------------------------

/**
 * Caller scope for a pull. Tenant partitioning is structural (WHERE clause);
 * project-level permission is a port so the app mount supplies the SAME
 * authorization it uses for interactive reads (v3 §4: server stays
 * authority; the feed adds no permission logic of its own).
 */
export interface FeedReadScope {
  tenantId: string;
  /** Return true iff the caller may read this project's changes. Called per candidate event. */
  canReadProject(projectId: string | null): boolean;
}

export interface PullOptions {
  /** Exclusive cursor: deliver events with seq > afterSeq. */
  afterSeq: number;
  /** Max events per page (default 200). */
  maxEvents?: number;
  /** Max serialized page bytes (default 262144). A single oversized event is delivered alone (no starvation). */
  maxBytes?: number;
}

export interface PullPage {
  tenantId: string;
  events: FeedEventEnvelope[];
  /** Cursor to persist with the batch: seq of the last DELIVERED event. */
  nextCursor: number;
  hasMore: boolean;
  approxBytes: number;
}

// ---------------------------------------------------------------------------
// Consumer: applier port, checkpoints, apply results
// ---------------------------------------------------------------------------

/**
 * Entity apply port, registered per domain at open. Receives the driver so
 * the apply participates in the consumer's single transaction. The port is
 * the ONLY writer of domain tables; the consumer class itself has none.
 */
export type EntityApplier = (driver: import("./driver.js").SqlDriver, event: FeedEventEnvelope) => void;

export interface ApplyResult {
  /** Events newly applied (dedup insert reported a fresh row). */
  applied: number;
  /** Events skipped as already applied (duplicate delivery / replay). */
  skipped: number;
  /** Checkpoint after the batch (monotonic: never moves backwards). */
  confirmedSeq: number;
}

// ---------------------------------------------------------------------------
// Command receipts: durable replay protection with financial retention
// ---------------------------------------------------------------------------

/**
 * A durable record of a SERVER outcome for a dispatched command
 * (mirrors native_outbox acceptedReceipt authority: local code never
 * fabricates one). Financially effective commands (payroll, expenses,
 * ledger postings) are flagged so retention can never silently expire them.
 */
export interface CommandReceiptInput {
  opId: string;
  domain: string;
  financiallyEffective: boolean;
  /** Server outcome, e.g. `accepted` / `rejected:<reason>`. */
  outcome: string;
  /** Digest of the server outcome envelope (kept after compaction). */
  outcomeDigest: string;
  /** Digest of the command payload (dropped by compaction). */
  payloadDigest?: string;
  /** Epoch ms the receipt was issued (defaults to caller clock; testable). */
  issuedAtMs?: number;
}

export interface ReceiptSweepOptions {
  /** Default retention for NON-financial receipts (plan v3: 30 days). */
  defaultRetentionDays: number;
  /** Financial receipts older than this are COMPACTED (never deleted). */
  compactFinancialAfterDays: number;
  nowMs: number;
}

export interface ReceiptSweepResult {
  sweptNonFinancial: number;
  compactedFinancial: number;
}

// ---------------------------------------------------------------------------
// Digest helper (FNV-1a 32-bit hex; same vocabulary as native_identity)
// ---------------------------------------------------------------------------

export function fnv1a32hex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Pinned port surface (no-domain-writers guarantee, mirrors M03-T02 pinning)
// ---------------------------------------------------------------------------

/** Exactly the methods `TenantChangeFeed` exposes. Pinned by test. */
export const TENANT_CHANGE_FEED_METHODS = [
  "publishAtomically",
  "pull",
  "sweepRetention",
  "retentionFloor",
  "registerRedactionPolicy",
] as const;

/** Exactly the methods `FeedConsumer` exposes. Pinned by test. */
export const FEED_CONSUMER_METHODS = [
  "applyBatch",
  "readCheckpoint",
  "resetCheckpoint",
  "recordCommandReceipt",
  "hasEffectiveReceipt",
  "sweepReceipts",
] as const;
