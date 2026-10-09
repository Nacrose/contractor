/**
 * Attachment transfer manager (M03-T06) — the staging/finalization/registration
 * protocol above the durable reconciliation journal.
 *
 * Protocol ordering (structural, test-pinned):
 *   1. stageBytes  — journal row (staging) → durable temp object write →
 *      digest computed AND verified by re-reading the stored bytes →
 *      journal row (staged, digest+bytes recorded), all transitions in
 *      their own transactions.
 *   2. finalize    — atomic rename temp→final in the object store → digest
 *      re-verified against the FINAL object bytes → journal row (finalized).
 *      Crash between rename and row update is recovered by reconcile.
 *   3. register    — chunked upload resuming from the SERVER's authoritative
 *      offset (queryUpload), server verifies the digest at completion, the
 *      returned receipt is recorded with the registered row in ONE
 *      transaction. Lost acknowledgement after server completion is
 *      recovered idempotently (same receipt returned).
 *
 * Every failure is a typed recoverable state that preserves pending data;
 * `resume`/`resumeAll`/`retry` reconcile journal claims against object-store
 * and server reality — the journal explains history, reality decides.
 *
 * Recovery moves are NOT protocol-machine edges: TRANSFER_TRANSITIONS
 * governs forward protocol steps; resuming a failed row deterministically
 * resets it to the pre-failure step state recorded in `failure_step`
 * (stage→staging, finalize→staged, register→finalized), and a
 * digest_mismatch ALWAYS re-stages from source — the full clean re-transfer
 * is the only honest recovery when integrity is in question.
 */

import {
  AttachmentEvent,
  AttachmentRecord,
  AttachmentStageInput,
  AttachmentRegistrarPort,
  DigestPort,
  ObjectStore,
  RegistrarError,
  ResumeSummary,
  SourceReaderPort,
  TRANSFER_TRANSITIONS,
  TransferError,
  TransferFailureKind,
  TransferStep,
  isTransferError,
  transferError,
} from "./contract.js";
import { ATTACHMENT_PRAGMAS, SqlDriver, withImmediateTransaction } from "./driver.js";
import { migrate, MigrateOptions } from "./migrations.js";

export interface OpenAttachmentManagerOptions extends MigrateOptions {
  driver: SqlDriver;
  objects: ObjectStore;
  digest: DigestPort;
  sourceReader: SourceReaderPort;
  registrar: AttachmentRegistrarPort;
  /** Injectable clock (tests); default Date.now. */
  now?: () => number;
  /** Bounded auto-retry budget per attachment before manual retry is required. */
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** Upload chunk size in bytes (default 64 KiB). */
  chunkBytes?: number;
}

export interface OpenedAttachmentManager {
  manager: AttachmentTransferManager;
  migrations: ReturnType<typeof migrate>;
}

const TEMP_SUFFIX = ".part";
const OBJECT_PREFIX = "attachments/";

export function tempKeyFor(attachmentId: string): string {
  return `${OBJECT_PREFIX}${attachmentId}${TEMP_SUFFIX}`;
}
export function finalKeyFor(attachmentId: string): string {
  return `${OBJECT_PREFIX}${attachmentId}`;
}

export class AttachmentTransferManager {
  private readonly driver: SqlDriver;
  private readonly objects: ObjectStore;
  private readonly digest: DigestPort;
  private readonly sourceReader: SourceReaderPort;
  private readonly registrar: AttachmentRegistrarPort;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly chunkBytes: number;

  constructor(options: OpenAttachmentManagerOptions) {
    if (!options.digest || options.digest.algorithm !== "sha-256") {
      throw transferError("misconfigured", "A real SHA-256 DigestPort is required (fail-closed; no fallback digest).");
    }
    for (const [name, port] of [["objects", options.objects], ["sourceReader", options.sourceReader], ["registrar", options.registrar], ["driver", options.driver]] as const) {
      if (!port) throw transferError("misconfigured", `Missing required port: ${name}.`);
    }
    this.driver = options.driver;
    this.objects = options.objects;
    this.digest = options.digest;
    this.sourceReader = options.sourceReader;
    this.registrar = options.registrar;
    this.now = options.now ?? Date.now;
    this.maxRetries = options.maxRetries ?? 5;
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.backoffCapMs = options.backoffCapMs ?? 60_000;
    this.chunkBytes = options.chunkBytes ?? 65_536;
  }

  // -- row / event helpers -------------------------------------------------

  private row(accountId: string, id: string): AttachmentRecord | null {
    const r = this.driver
      .prepare("SELECT * FROM attachment WHERE id = ? AND account_id = ?")
      .get(id, accountId) as Record<string, unknown> | undefined;
    return r ? this.toRecord(r) : null;
  }

  private toRecord(r: Record<string, unknown>): AttachmentRecord {
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      projectId: (r.project_id as string | null) ?? null,
      sourcePath: String(r.source_path),
      objectKey: (r.object_key as string | null) ?? null,
      digest: (r.digest as string | null) ?? null,
      bytes: r.bytes === null || r.bytes === undefined ? null : Number(r.bytes),
      state: String(r.state) as AttachmentRecord["state"],
      failureKind: (r.failure_kind as TransferFailureKind | null) ?? null,
      failureStep: (r.failure_step as TransferStep | null) ?? null,
      failureDetail: (r.failure_detail as string | null) ?? null,
      attempts: Number(r.attempts),
      nextAttemptAtMs: r.next_attempt_at_ms === null || r.next_attempt_at_ms === undefined ? null : Number(r.next_attempt_at_ms),
      receipt: (r.receipt as string | null) ?? null,
      createdAtMs: Number(r.created_at),
      updatedAtMs: Number(r.updated_at),
    };
  }

  private event(accountId: string, attachmentId: string, kind: AttachmentEvent["kind"], detail: Record<string, unknown> | null): void {
    this.driver
      .prepare("INSERT INTO attachment_event (attachment_id, account_id, kind, detail, at_ms) VALUES (?, ?, ?, ?, ?)")
      .run(attachmentId, accountId, kind, detail ? JSON.stringify(detail) : null, this.now());
  }

  /**
   * Move the row into a typed failed state that PRESERVES all pending data
   * (bytes, journal, source identity) and records the deterministic resume
   * step. Retryable failures additionally schedule bounded backoff.
   */
  private failRow(
    accountId: string,
    id: string,
    step: TransferStep,
    kind: TransferFailureKind,
    detail: string,
  ): AttachmentRecord {
    const current = this.row(accountId, id);
    if (!current) throw transferError("not_found", `Attachment '${id}' not found for this account.`);
    const attempts = step === "register" && kind === "retryable" ? current.attempts + 1 : current.attempts;
    const due =
      kind === "retryable" && attempts < this.maxRetries
        ? this.now() + Math.min(this.backoffBaseMs * 2 ** attempts, this.backoffCapMs)
        : null;
    withImmediateTransaction(this.driver, () => {
      this.driver
        .prepare(
          `UPDATE attachment SET state='failed', failure_kind=?, failure_step=?, failure_detail=?,
             attempts=?, next_attempt_at_ms=?, updated_at=? WHERE id=? AND account_id=?`,
        )
        .run(kind, step, detail, attempts, due, this.now(), id, accountId);
      this.event(accountId, id, "failed", { step, kind, detail, attempts });
    });
    return this.row(accountId, id)!;
  }

  private assertTransition(from: AttachmentRecord["state"], to: AttachmentRecord["state"], accountId: string, id: string): void {
    if (!TRANSFER_TRANSITIONS[from].includes(to)) {
      throw transferError("illegal_transition", `Attachment cannot move ${from} -> ${to}.`, {
        attachmentId: id,
        accountId,
      });
    }
  }

  private setState(accountId: string, id: string, to: AttachmentRecord["state"], extra: Record<string, unknown> = {}): void {
    const sets = ["state = ?", "updated_at = ?"];
    const params: unknown[] = [to, this.now()];
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    params.push(id, accountId);
    this.driver
      .prepare(`UPDATE attachment SET ${sets.join(", ")} WHERE id = ? AND account_id = ?`)
      .run(...params);
  }

  // -- public protocol surface (pinned: exactly these 10 methods) ----------

  /**
   * Stage the payload: durable journal row first (so an interrupted stage is
   * visible and recoverable), then the temp object write, then digest
   * compute + VERIFY by re-reading the stored bytes, then the staged row.
   * Re-staging an existing id (any state) restarts the transfer from the
   * top — the deterministic recovery for digest_mismatch / source restored.
   */
  stageBytes(accountId: string, input: AttachmentStageInput): AttachmentRecord {
    if (!input.id || typeof input.id !== "string") throw transferError("misconfigured", "attachment.id must be a non-empty string.");
    if (!(input.bytes instanceof Uint8Array)) throw transferError("misconfigured", "attachment.bytes must be a Uint8Array.");
    if (!input.sourcePath) throw transferError("misconfigured", "attachment.sourcePath is required for recovery.");

    const existing = this.row(accountId, input.id);
    if (existing?.state === "registered") {
      throw transferError("illegal_transition", "Attachment already registered; re-staging is not allowed.", {
        attachmentId: input.id,
      });
    }

    const t = this.now();
    withImmediateTransaction(this.driver, () => {
      if (existing) {
        this.setState(accountId, input.id, "staging", {
          source_path: input.sourcePath,
          project_id: input.projectId ?? existing.projectId,
          object_key: null,
          digest: null,
          bytes: null,
          failure_kind: null,
          failure_step: null,
          failure_detail: null,
          next_attempt_at_ms: null,
        });
      } else {
        this.driver
          .prepare(
            `INSERT INTO attachment (id, account_id, project_id, source_path, state, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'staging', ?, ?)`,
          )
          .run(input.id, accountId, input.projectId ?? null, input.sourcePath, t, t);
      }
      this.event(accountId, input.id, "stage_started", { bytes: input.bytes.byteLength, attempt: (existing?.attempts ?? 0) + 1 });
    });

    try {
      // Durable temp write (the ObjectStore impl owns fsync+rename semantics).
      this.objects.putBytes(tempKeyFor(input.id), input.bytes);
      // Digest computed over the entry bytes, then VERIFIED against a fresh
      // read of what actually landed in the store — write-integrity proof.
      const claimed = this.digest.digest(input.bytes);
      const stored = this.objects.getBytes(tempKeyFor(input.id));
      const observed = this.digest.digest(stored);
      if (claimed !== observed) {
        return this.failRow(accountId, input.id, "stage", "digest_mismatch", "stored bytes do not match the computed digest");
      }
      withImmediateTransaction(this.driver, () => {
        this.assertTransition("staging", "staged", accountId, input.id);
        this.setState(accountId, input.id, "staged", {
          object_key: finalKeyFor(input.id),
          digest: claimed,
          bytes: input.bytes.byteLength,
        });
        this.event(accountId, input.id, "staged_verified", { digest: claimed, bytes: input.bytes.byteLength });
      });
      return this.row(accountId, input.id)!;
    } catch (e) {
      if (isTransferError(e, ["full"])) {
        return this.failRow(accountId, input.id, "stage", "storage", e.message);
      }
      if (e instanceof TransferError) throw e;
      return this.failRow(accountId, input.id, "stage", "internal", String((e as Error)?.message ?? e));
    }
  }

  /**
   * Durable local finalization: atomic temp→final rename in the object
   * store, digest RE-verified against the final bytes, then the finalized
   * row. Bytes are server-eligible only after this returns.
   */
  finalize(accountId: string, attachmentId: string): AttachmentRecord {
    const rec = this.row(accountId, attachmentId);
    if (!rec) throw transferError("not_found", `Attachment '${attachmentId}' not found for this account.`);
    if (rec.state !== "staged") {
      this.assertTransition(rec.state, "finalized", accountId, attachmentId);
    }
    const tmp = tempKeyFor(attachmentId);
    const fin = finalKeyFor(attachmentId);
    try {
      this.objects.renameBytes(tmp, fin);
      const stored = this.objects.getBytes(fin);
      const observed = this.digest.digest(stored);
      if (!rec.digest || observed !== rec.digest) {
        return this.failRow(accountId, attachmentId, "finalize", "digest_mismatch", "final object bytes do not match the staged digest");
      }
      withImmediateTransaction(this.driver, () => {
        this.setState(accountId, attachmentId, "finalized", {
          failure_kind: null,
          failure_step: null,
          failure_detail: null,
        });
        this.event(accountId, attachmentId, "finalized", { digest: observed, bytes: Number(rec.bytes) });
      });
      return this.row(accountId, attachmentId)!;
    } catch (e) {
      if (isTransferError(e, ["full"])) {
        return this.failRow(accountId, attachmentId, "finalize", "storage", e.message);
      }
      if (e instanceof TransferError) throw e;
      return this.failRow(accountId, attachmentId, "finalize", "internal", String((e as Error)?.message ?? e));
    }
  }

  /**
   * Server registration — ONLY valid from `finalized`. Uploads resume from
   * the server's authoritative offset; the server verifies the digest; the
   * receipt lands in the same transaction as the registered row.
   */
  register(accountId: string, attachmentId: string): AttachmentRecord {
    const rec = this.row(accountId, attachmentId);
    if (!rec) throw transferError("not_found", `Attachment '${attachmentId}' not found for this account.`);
    this.assertTransition(rec.state, "registered", accountId, attachmentId);
    if (!rec.digest || rec.bytes === null || !rec.objectKey) {
      return this.failRow(accountId, attachmentId, "register", "internal", "finalized row missing digest/bytes/objectKey");
    }

    try {
      const opened = this.registrar.openUpload({
        attachmentId,
        accountId,
        projectId: rec.projectId,
        digest: rec.digest,
        bytes: rec.bytes,
      });
      withImmediateTransaction(this.driver, () => {
        this.event(accountId, attachmentId, "upload_opened", { uploadId: opened.uploadId });
      });

      // Resume loop: the SERVER's receivedBytes is authoritative; journal
      // chunk_ack events are hints only. A lost acknowledgement re-asks.
      let offset = this.registrar.queryUpload(opened.uploadId).receivedBytes;
      const bytes = this.objects.getBytes(rec.objectKey);
      while (offset < rec.bytes) {
        const chunk = bytes.subarray(offset, Math.min(offset + this.chunkBytes, rec.bytes));
        const ack = this.registrar.putChunk(opened.uploadId, offset, chunk);
        offset = ack.receivedBytes;
        withImmediateTransaction(this.driver, () => {
          this.event(accountId, attachmentId, "chunk_ack", { offset, chunkBytes: chunk.byteLength });
        });
      }

      const completed = this.registrar.completeUpload(opened.uploadId, rec.digest, rec.bytes);
      withImmediateTransaction(this.driver, () => {
        this.setState(accountId, attachmentId, "registered", {
          receipt: completed.receipt,
          failure_kind: null,
          failure_step: null,
          failure_detail: null,
          next_attempt_at_ms: null,
        });
        this.event(accountId, attachmentId, "registered", { receipt: completed.receipt, bytes: rec.bytes });
      });
      return this.row(accountId, attachmentId)!;
    } catch (e) {
      const kind: TransferFailureKind =
        e instanceof RegistrarError
          ? e.kind === "storage"
            ? "storage"
            : e.kind
          : isTransferError(e, ["full"])
            ? "storage"
            : "retryable";
      return this.failRow(accountId, attachmentId, "register", kind, String((e as Error)?.message ?? e));
    }
  }

  /**
   * Reconcile ONE attachment with reality and DRIVE the protocol to its
   * next deterministic stop (registered, or a typed failure). This is the
   * recovery path for every interruption point: staging rows re-stage from
   * source, staged rows finalize, finalized rows register — in ONE pass.
   * Failed rows follow their recorded failure_step (retryable rows only
   * when the backoff fell due; digest_mismatch always re-stages).
   */
  resume(accountId: string, attachmentId: string, options: { force?: boolean } = {}): AttachmentRecord {
    let rec = this.row(accountId, attachmentId);
    if (!rec) throw transferError("not_found", `Attachment '${attachmentId}' not found for this account.`);

    if (rec.state === "registered") return rec;
    if (rec.state === "failed") {
      if (!options.force) {
        if (rec.failureKind !== "retryable" || rec.nextAttemptAtMs === null || this.now() < rec.nextAttemptAtMs) {
          return rec; // not due — pending data preserved, nothing silently dropped
        }
      }
      // Deterministic recovery move: reset to the pre-failure step state
      // (digest_mismatch always goes back to a full re-stage from source).
      const mismatch = rec.failureKind === "digest_mismatch";
      const fStep = rec.failureStep;
      const fKind = rec.failureKind;
      const preState: AttachmentRecord["state"] =
        mismatch || fStep === "stage" ? "staging"
        : fStep === "finalize" ? "staged"
        : fStep === "register" ? "finalized"
        : "staging";
      withImmediateTransaction(this.driver, () => {
        this.setState(accountId, attachmentId, preState, {
          failure_kind: null,
          failure_step: null,
          failure_detail: null,
        });
        this.event(accountId, attachmentId, "recovered", { step: fStep, kind: fKind, forced: options.force === true, to: preState });
      });
    }

    // Drive-to-completion loop: at most stage -> finalize -> register.
    for (let hop = 0; hop < 8; hop++) {
      rec = this.row(accountId, attachmentId)!;
      if (rec.state === "registered" || rec.state === "failed") return rec;
      const step: TransferStep =
        rec.state === "staging" ? "stage"
        : rec.state === "staged" ? "finalize"
        : "register";

      if (step === "stage") {
        // Re-read the SOURCE (autonomous recovery input); a vanished source
        // is a typed recoverable failure, never silent data loss.
        let bytes: Uint8Array;
        try {
          bytes = this.sourceReader.readBytes(rec.sourcePath);
        } catch (e) {
          return this.failRow(accountId, attachmentId, "stage", "source_missing", String((e as Error)?.message ?? e));
        }
        this.stageBytes(accountId, { id: attachmentId, projectId: rec.projectId, sourcePath: rec.sourcePath, bytes });
        continue;
      }
      if (step === "finalize") {
        // Crash re-entry: the rename may already have happened.
        const fin = finalKeyFor(attachmentId);
        const tmp = tempKeyFor(attachmentId);
        if (this.objects.statBytes(fin) === null) {
          const stagedBytes = this.objects.getBytes(tmp);
          this.objects.putBytes(tmp, stagedBytes); // normalize re-entry
        }
        this.finalize(accountId, attachmentId);
        continue;
      }
      // register — refuse to upload from a final object that vanished.
      if (this.objects.statBytes(finalKeyFor(attachmentId)) === null) {
        return this.failRow(accountId, attachmentId, "register", "internal", "final object missing at register resume");
      }
      this.register(accountId, attachmentId);
    }
    return this.row(accountId, attachmentId)!;
  }

  /**
   * Reconcile every non-registered attachment of the account (resume
   * trigger for app launch, foregrounding, and manual sync). Never throws
   * wholesale; per-attachment failures are recorded and surfaced.
   */
  resumeAll(accountId: string): ResumeSummary {
    const rows = this.driver
      .prepare("SELECT id, state, failure_kind, next_attempt_at_ms FROM attachment WHERE account_id = ? AND state != 'registered' ORDER BY created_at, id")
      .all(accountId) as Array<{ id: string; state: string; failure_kind: string | null; next_attempt_at_ms: number | null }>;
    const summary: ResumeSummary = { completed: [], stillPending: [], failed: [] };
    for (const r of rows) {
      // Backoff-bounded retries are skipped until due — surfaced as still
      // pending (data preserved), never silently dropped.
      if (r.state === "failed" && r.failure_kind === "retryable" && r.next_attempt_at_ms !== null && this.now() < r.next_attempt_at_ms) {
        summary.stillPending.push(r.id);
        continue;
      }
      try {
        const after = this.resume(accountId, r.id);
        if (after.state === "registered") summary.completed.push(r.id);
        else if (after.state === "failed") summary.failed.push({ id: r.id, kind: after.failureKind ?? "internal", detail: after.failureDetail ?? "" });
        else summary.stillPending.push(r.id);
      } catch (e) {
        summary.failed.push({ id: r.id, kind: "internal", detail: String((e as Error)?.message ?? e) });
      }
    }
    return summary;
  }

  /** Manual/deterministic retry: ignores backoff and re-drives the recorded step. */
  retry(accountId: string, attachmentId: string): AttachmentRecord {
    return this.resume(accountId, attachmentId, { force: true });
  }

  /**
   * Orphan sweep (GLOBAL — the object store has no account dimension, so
   * the referenced set spans every account's rows; account-scoped sweeping
   * would wrongly collect other accounts' objects). Temp/final objects
   * with no journal row are removed; orphans were never exposed as
   * complete attachments — this reclaims their bytes.
   */
  sweepOrphans(): { removed: string[] } {
    const rows = this.driver
      .prepare("SELECT id, object_key FROM attachment")
      .all() as Array<{ id: string; object_key: string | null }>;
    const referenced = new Set<string>();
    for (const r of rows) {
      referenced.add(tempKeyFor(r.id));
      if (r.object_key) referenced.add(r.object_key);
    }
    const keys = this.objects.listKeys(OBJECT_PREFIX);
    const removed: string[] = [];
    for (const key of keys) {
      if (!referenced.has(key)) {
        this.objects.removeBytes(key);
        removed.push(key);
      }
    }
    return { removed };
  }

  /**
   * Listing: complete attachments are EXACTLY the registered rows. Partial,
   * staged, finalized, and failed transfers are visible through
   * `list`/`get` for recovery surfaces but never presented as complete.
   */
  list(accountId: string, options: { completeOnly?: boolean } = {}): AttachmentRecord[] {
    const rows = options.completeOnly
      ? (this.driver.prepare("SELECT * FROM attachment WHERE account_id = ? AND state = 'registered' ORDER BY created_at, id").all(accountId) as Record<string, unknown>[])
      : (this.driver.prepare("SELECT * FROM attachment WHERE account_id = ? ORDER BY created_at, id").all(accountId) as Record<string, unknown>[]);
    return rows.map((r) => this.toRecord(r));
  }

  get(accountId: string, attachmentId: string): AttachmentRecord {
    const rec = this.row(accountId, attachmentId);
    if (!rec) throw transferError("not_found", `Attachment '${attachmentId}' not found for this account.`);
    return rec;
  }

  /** Sanitized reconciliation journal for one attachment (debug/recovery UI). */
  listEvents(accountId: string, attachmentId: string): AttachmentEvent[] {
    const rows = this.driver
      .prepare("SELECT * FROM attachment_event WHERE account_id = ? AND attachment_id = ? ORDER BY ord")
      .all(accountId, attachmentId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      ord: Number(r.ord),
      attachmentId: String(r.attachment_id),
      accountId: String(r.account_id),
      kind: String(r.kind) as AttachmentEvent["kind"],
      detail: (r.detail as string | null) ?? null,
      atMs: Number(r.at_ms),
    }));
  }
}

/** Open a manager over a REAL driver (node:sqlite in evidence; native binding at the mount). */
export function openAttachmentManager(options: OpenAttachmentManagerOptions): OpenedAttachmentManager {
  const driver = options.driver;
  for (const pragma of Object.values(ATTACHMENT_PRAGMAS)) driver.exec(pragma);
  const migrations = migrate(driver, { extraMigrations: options.extraMigrations });
  return { manager: new AttachmentTransferManager(options), migrations };
}
