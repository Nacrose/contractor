/**
 * Evidence fixtures for the attachment transfer tests (M03-T06).
 *
 * Durability proof requirements (register line): REAL local storage, REAL
 * SQLite, and a DISPOSABLE server/object fixture — mocks may not be the
 * sole evidence. Hence:
 *   - FsObjectStore: REAL on-disk byte store (write temp + fsync + atomic
 *     rename; same-filesystem moves; recursive prefix listing).
 *   - Sha256Digest: REAL SHA-256 via node:crypto.
 *   - FsSourceReader: reads source bytes back from the real filesystem.
 *   - DisposableRegistrar: the server/object fixture — chunk bytes land in
 *     a REAL directory-backed object store and upload state lives in REAL
 *     SQLite, so the fixture state survives across the crash-child process
 *     boundary (a pure in-memory mock could not prove lost-ack recovery).
 *     Test knobs inject every typed failure (retryable / rejection /
 *     revoked / storage / digest_mismatch) WITHOUT touching package code.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AttachmentRegistrarPort,
  DigestPort,
  ObjectStore,
  RegistrarError,
  SourceReaderPort,
} from "../src/contract.js";

// ---------------------------------------------------------------------------

export class Sha256Digest implements DigestPort {
  readonly algorithm = "sha-256" as const;
  digest(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  }
}

/** REAL on-disk object store: durable write = temp file + fsync + rename. */
export class FsObjectStore implements ObjectStore {
  constructor(readonly rootDir: string) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  private resolve(key: string): string {
    const p = path.join(this.rootDir, key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return p;
  }

  putBytes(key: string, bytes: Uint8Array): void {
    const target = this.resolve(key);
    const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, bytes, 0, bytes.byteLength);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, target); // atomic on the same filesystem
  }

  getBytes(key: string): Uint8Array {
    return fs.readFileSync(this.resolve(key));
  }

  statBytes(key: string): number | null {
    const p = path.join(this.rootDir, key);
    if (!fs.existsSync(p)) return null;
    return fs.statSync(p).size;
  }

  removeBytes(key: string): void {
    const p = path.join(this.rootDir, key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  renameBytes(fromKey: string, toKey: string): void {
    const from = path.join(this.rootDir, fromKey);
    const to = path.join(this.rootDir, toKey);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (!fs.existsSync(from)) {
      if (fs.existsSync(to)) return; // crash re-entry: source already moved
      throw new Error(`renameBytes: source '${fromKey}' missing and destination '${toKey}' absent`);
    }
    fs.renameSync(from, to);
  }

  listKeys(prefix: string): string[] {
    const out: string[] = [];
    const walk = (dir: string, rel: string): void => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const relEntry = rel ? `${rel}/${entry}` : entry;
        if (fs.statSync(full).isFile()) {
          if (relEntry.startsWith(prefix)) out.push(relEntry);
        } else {
          walk(full, relEntry);
        }
      }
    };
    walk(this.rootDir, "");
    return out;
  }
}

export class FsSourceReader implements SourceReaderPort {
  readBytes(p: string): Uint8Array {
    if (!fs.existsSync(p)) throw new Error(`source missing: ${p}`);
    return fs.readFileSync(p);
  }
}

// ---------------------------------------------------------------------------

interface UploadState {
  uploadId: string;
  attachmentId: string;
  accountId: string;
  projectId: string | null;
  digest: string;
  bytes: number;
  receivedBytes: number;
  receipt: string | null;
}

/**
 * Disposable server/object fixture. State = real SQLite + real directory,
 * so it survives across parent/child processes (lost-ack evidence).
 *
 * Failure knobs (all test-settable):
 *   failNextPutChunk  — throw once with the given RegistrarErrorKind
 *   rejectUploads     — every open/put/complete throws 'rejection'
 *   revoked           — every open/put/complete throws 'revoked'
 *   corruptStoredBytes— flip a byte inside the stored chunk data so the
 *                       server-side digest check fails at completion
 *   quotaFull         — putChunk/complete throws 'storage'
 */
export class DisposableRegistrar implements AttachmentRegistrarPort {
  private readonly db: DatabaseSync;
  readonly store: FsObjectStore;
  failNextPutChunk: RegistrarError["kind"] | null = null;
  rejectUploads = false;
  revoked = false;
  quotaFull = false;
  private corrupted = false;
  /** Per-upload total bytes ever received (no-resend assertion input). */
  private totalReceived = new Map<string, number>();

  constructor(rootDir: string) {
    fs.mkdirSync(rootDir, { recursive: true });
    this.db = new DatabaseSync(path.join(rootDir, "registrar.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS uploads (
        upload_id TEXT PRIMARY KEY,
        attachment_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        project_id TEXT,
        digest TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        received_bytes INTEGER NOT NULL DEFAULT 0,
        receipt TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_attachment ON uploads (attachment_id, digest);
    `);
    this.store = new FsObjectStore(path.join(rootDir, "objects"));
  }

  private auth(kind: "open" | "put" | "complete"): void {
    if (this.revoked) throw new RegistrarError("revoked", "access token revoked (fixture)");
    if (this.rejectUploads) throw new RegistrarError("rejection", "registration rejected by policy (fixture)");
    if (kind === "put" && this.failNextPutChunk) {
      const k = this.failNextPutChunk;
      this.failNextPutChunk = null; // once — then the server behaves again
      throw new RegistrarError(k, `injected ${k} during putChunk (fixture)`);
    }
    if (this.quotaFull && (kind === "put" || kind === "complete")) {
      throw new RegistrarError("storage", "object store quota exhausted (fixture)");
    }
  }

  openUpload(input: {
    attachmentId: string;
    accountId: string;
    projectId: string | null;
    digest: string;
    bytes: number;
  }): { uploadId: string } {
    this.auth("open");
    const existing = this.db
      .prepare("SELECT upload_id FROM uploads WHERE attachment_id = ? AND digest = ?")
      .get(input.attachmentId, input.digest) as { upload_id: string } | undefined;
    if (existing) return { uploadId: existing.upload_id }; // idempotent re-open
    const uploadId = `upl-${input.attachmentId}-${input.digest.slice(0, 8)}`;
    this.db
      .prepare("INSERT INTO uploads (upload_id, attachment_id, account_id, project_id, digest, bytes) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uploadId, input.attachmentId, input.accountId, input.projectId, input.digest, input.bytes);
    return { uploadId };
  }

  putChunk(uploadId: string, offset: number, chunk: Uint8Array): { receivedBytes: number } {
    this.auth("put");
    const row = this.db.prepare("SELECT * FROM uploads WHERE upload_id = ?").get(uploadId) as
      | { received_bytes: number; bytes: number }
      | undefined;
    if (!row) throw new RegistrarError("rejection", "unknown upload id (fixture)");
    if (offset !== row.received_bytes) {
      throw new RegistrarError("rejection", `offset mismatch: server at ${row.received_bytes}, client sent ${offset}`);
    }
    // Store the chunk as a real file segment; concatenate at completion.
    const seg = path.join("segments", uploadId, String(offset));
    this.store.putBytes(seg, chunk);
    const received = row.received_bytes + chunk.byteLength;
    this.db.prepare("UPDATE uploads SET received_bytes = ? WHERE upload_id = ?").run(received, uploadId);
    this.totalReceived.set(uploadId, (this.totalReceived.get(uploadId) ?? 0) + chunk.byteLength);
    return { receivedBytes: received };
  }

  completeUpload(uploadId: string, digest: string, bytes: number): { receipt: string } {
    this.auth("complete");
    const row = this.db.prepare("SELECT * FROM uploads WHERE upload_id = ?").get(uploadId) as
      | { attachment_id: string; digest: string; bytes: number; receipt: string | null; received_bytes: number }
      | undefined;
    if (!row) throw new RegistrarError("rejection", "unknown upload id (fixture)");
    if (row.receipt) return { receipt: row.receipt }; // idempotent lost-ack recovery
    if (row.received_bytes !== row.bytes) {
      throw new RegistrarError("rejection", `incomplete upload: ${row.received_bytes}/${row.bytes}`);
    }
    // Server-side digest verification over the REAL concatenated bytes.
    const full = this.concatSegments(uploadId, row.bytes);
    const serverHash = createHash("sha256").update(full).digest("hex");
    if (serverHash !== row.digest) {
      throw new RegistrarError("digest_mismatch", "server-side digest verification failed (fixture)");
    }
    const receipt = `rcp-${row.attachment_id}-${serverHash.slice(0, 12)}`;
    this.db.prepare("UPDATE uploads SET receipt = ? WHERE upload_id = ?").run(receipt, uploadId);
    return { receipt };
  }

  queryUpload(uploadId: string): { receivedBytes: number; completedReceipt: string | null } {
    const row = this.db.prepare("SELECT received_bytes, receipt FROM uploads WHERE upload_id = ?").get(uploadId) as
      | { received_bytes: number; receipt: string | null }
      | undefined;
    if (!row) return { receivedBytes: 0, completedReceipt: null };
    return { receivedBytes: row.received_bytes, completedReceipt: row.receipt };
  }

  private concatSegments(uploadId: string, bytes: number): Uint8Array {
    const dir = path.join(this.store.rootDir, "segments", uploadId);
    const out = new Uint8Array(bytes);
    let at = 0;
    for (const f of fs.readdirSync(dir).map(Number).sort((a, b) => a - b)) {
      const seg = fs.readFileSync(path.join(dir, String(f)));
      let data = seg;
      if (this.corrupted && at === 0) {
        data = new Uint8Array(seg);
        data[0] = data[0] ^ 0xff; // flip one bit — server digest check must fail
        this.corrupted = false;
      }
      out.set(data, at);
      at += seg.byteLength;
    }
    return out;
  }

  // -- test knobs ----------------------------------------------------------

  /** Bytes THIS process pushed (per upload) — no-resend assertion input. */
  totalBytesReceivedInProcess(uploadId: string): number {
    return this.totalReceived.get(uploadId) ?? 0;
  }

  corruptStoredBytes(): void {
    this.corrupted = true;
  }

  close(): void {
    this.db.close();
  }
}
