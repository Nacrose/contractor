/**
 * Crash-recovery child process (M03-T06 tests).
 *
 * Spawned by attachment.test.ts with [journalDbPath, storeDir, sourcePath,
 * regDir, mode]. Each mode blocks INSIDE the protocol at a different
 * interruption point after making real progress (real disk writes, real
 * fixture state) — the parent SIGKILLs the child there, then proves the
 * fresh-instance recovery:
 *   - `midstage`: the object store writes only HALF the temp object, then
 *     signals READY and blocks — journal row 'staging', partial temp file
 *     on disk, no verified digest.
 *   - `midfinalize`: staging completes; renameBytes performs the REAL
 *     temp→final move, signals RENAMED and blocks BEFORE the finalized row
 *     is written — crash between file rename and database state.
 *   - `midregister`: staging+finalizing complete; the first chunk lands on
 *     the REAL fixture (its SQLite+dir survive the kill), signals CHUNKED
 *     and blocks mid-upload.
 *   - `postack`: the server completes and stores the receipt, signals
 *     ACKED and blocks BEFORE the manager records it — the lost-
 *     acknowledgement scenario; recovery must re-complete idempotently
 *     and record the SAME receipt.
 */

import { writeSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { AttachmentRegistrarPort } from "../src/contract.js";
import { openAttachmentManager } from "../src/transfer.js";
import { DisposableRegistrar, FsObjectStore, FsSourceReader, Sha256Digest } from "./fixtures.js";

const encoder = new TextEncoder();
function signal(line: string): void {
  writeSync(1, encoder.encode(`${line}\n`));
}

function sleepMs(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

const [, , journalDbPath, storeDir, sourcePath, regDir, mode] = process.argv;
if (!journalDbPath || !storeDir || !sourcePath || !regDir || !mode) {
  process.exit(2);
}

const digest = new Sha256Digest();
const reader = new FsSourceReader();

if (mode === "midstage") {
  class HalfStore extends FsObjectStore {
    putBytes(key: string, bytes: Uint8Array): void {
      super.putBytes(key, bytes.subarray(0, Math.floor(bytes.byteLength / 2))); // partial write only
      signal("READY");
      sleepMs(60_000); // parent SIGKILLs here — temp object partial, row 'staging'
    }
  }
  const { manager } = openAttachmentManager({
    driver: new DatabaseSync(journalDbPath),
    objects: new HalfStore(storeDir),
    digest,
    sourceReader: reader,
    registrar: new DisposableRegistrar(regDir),
  });
  try {
    manager.stageBytes("A", { id: "att-1", projectId: "p1", sourcePath, bytes: reader.readBytes(sourcePath) });
    signal("UNEXPECTED_COMPLETION");
  } catch {
    signal("STAGE_INTERRUPTED");
  }
  process.exit(0);
}

if (mode === "midfinalize") {
  class BlockingRename extends FsObjectStore {
    renameBytes(fromKey: string, toKey: string): void {
      super.renameBytes(fromKey, toKey); // the REAL move happens first
      signal("RENAMED");
      sleepMs(60_000); // parent SIGKILLs here — final object exists, row still 'staged'
    }
  }
  const { manager } = openAttachmentManager({
    driver: new DatabaseSync(journalDbPath),
    objects: new BlockingRename(storeDir),
    digest,
    sourceReader: reader,
    registrar: new DisposableRegistrar(regDir),
  });
  manager.stageBytes("A", { id: "att-1", projectId: "p1", sourcePath, bytes: reader.readBytes(sourcePath) });
  signal("STAGED");
  try {
    manager.finalize("A", "att-1");
    signal("UNEXPECTED_COMPLETION");
  } catch {
    signal("FINALIZE_INTERRUPTED");
  }
  process.exit(0);
}

if (mode === "midregister" || mode === "postack") {
  const base = new DisposableRegistrar(regDir);
  class BlockingRegistrar implements AttachmentRegistrarPort {
    constructor(private inner: DisposableRegistrar) {}
    openUpload(input: Parameters<AttachmentRegistrarPort["openUpload"]>[0]) {
      return this.inner.openUpload(input);
    }
    putChunk(uploadId: string, offset: number, chunk: Uint8Array) {
      const ack = this.inner.putChunk(uploadId, offset, chunk); // REAL server progress first
      if (mode === "midregister") {
        signal("CHUNKED");
        sleepMs(60_000); // parent SIGKILLs here — server has partial bytes
      }
      return ack;
    }
    completeUpload(uploadId: string, d: string, bytes: number) {
      const done = this.inner.completeUpload(uploadId, d, bytes); // receipt stored SERVER-side
      if (mode === "postack") {
        signal("ACKED");
        sleepMs(60_000); // parent SIGKILLs here — local receipt NOT yet recorded
      }
      return done;
    }
    queryUpload(uploadId: string) {
      return this.inner.queryUpload(uploadId);
    }
  }
  const { manager } = openAttachmentManager({
    driver: new DatabaseSync(journalDbPath),
    objects: new FsObjectStore(storeDir),
    digest,
    sourceReader: reader,
    registrar: new BlockingRegistrar(base),
  });
  manager.stageBytes("A", { id: "att-1", projectId: "p1", sourcePath, bytes: reader.readBytes(sourcePath) });
  manager.finalize("A", "att-1");
  signal("FINALIZED");
  try {
    manager.register("A", "att-1");
    signal("UNEXPECTED_COMPLETION");
  } catch {
    signal("REGISTER_INTERRUPTED");
  }
  process.exit(0);
}

process.exit(2);
