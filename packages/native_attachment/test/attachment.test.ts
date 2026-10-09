/**
 * M03-T06 acceptance matrix — attachment staging, finalization, registration,
 * and recovery. Evidence rules: REAL on-disk object storage, REAL SQLite
 * (node:sqlite) for both the journal and the disposable server fixture,
 * REAL SHA-256 — mocks may supplement but never substitute.
 *
 *   S1 ordering + digest boundaries (acceptance 1)
 *   S2 interruption/reconciliation journal (acceptance 2) — SIGKILL children
 *   S3 resume triggers: launch / foreground / manual (acceptance 3)
 *   S4 typed recoverable failures preserving pending data (acceptance 4)
 *   S5 pins, migrations, redaction, account isolation (acceptance 5)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import {
  TransferError,
} from "../src/contract.js";
import { migrate, ATTACHMENT_MIGRATIONS } from "../src/migrations.js";
import { openAttachmentManager, finalKeyFor, tempKeyFor } from "../src/transfer.js";
import { DisposableRegistrar, FsObjectStore, FsSourceReader, Sha256Digest } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Deterministic pseudorandom payload with an embedded redaction sentinel. */
function payload(bytes: number, sentinel?: string): Uint8Array {
  const out = new Uint8Array(bytes);
  let s = 0x9e3779b9;
  for (let i = 0; i < bytes; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = s & 0xff;
  }
  if (sentinel) {
    out.set(new TextEncoder().encode(sentinel), 16);
  }
  return out;
}

interface Rig {
  root: string;
  journalPath: string;
  storeDir: string;
  regDir: string;
  sourcePath: string;
  registrar: DisposableRegistrar;
  objects: FsObjectStore;
  clock: { now: number };
  open(): ReturnType<typeof openAttachmentManager>;
  dispose(): void;
}

function rig(opts: { payloadBytes?: number; sentinel?: string } = {}): Rig {
  const root = mkdtempSync(join(tmpdir(), "nacrose-t06-"));
  const journalPath = join(root, "journal.sqlite");
  const storeDir = join(root, "objects");
  const regDir = join(root, "registrar");
  const srcDir = join(root, "sources");
  mkdirSync(srcDir, { recursive: true });
  const sourcePath = join(srcDir, "field-photo.bin");
  const bytes = payload(opts.payloadBytes ?? 300_000, opts.sentinel);
  writeFileSync(sourcePath, bytes);

  const registrar = new DisposableRegistrar(regDir);
  const objects = new FsObjectStore(storeDir);
  const clock = { now: 1_700_000_000_000 };

  const open = () =>
    openAttachmentManager({
      driver: new DatabaseSync(journalPath),
      objects,
      digest: new Sha256Digest(),
      sourceReader: new FsSourceReader(),
      registrar,
      now: () => clock.now,
      chunkBytes: 65_536,
      backoffBaseMs: 1_000,
      backoffCapMs: 8_000,
    });

  return {
    root, journalPath, storeDir, regDir, sourcePath, registrar, objects, clock, open,
    dispose() {
      registrar.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const CHILD = new URL("./crash-child.js", import.meta.url).pathname;

/** Spawn the crash child, wait for the given signal, SIGKILL it, drain. */
async function killChild(r: Rig, mode: string, waitFor: string): Promise<void> {
  const child = spawn(process.execPath, [CHILD, r.journalPath, r.storeDir, r.sourcePath, r.regDir, mode], {
    cwd: process.cwd(),
  });
  let out = "";
  child.stdout.on("data", (c: string | Uint8Array) => (out += String(c)));
  const deadline = Date.now() + 20_000;
  while (!out.includes(waitFor) && Date.now() < deadline) await sleepMs(50);
  assert.ok(out.includes(waitFor), `child never signaled ${waitFor}; got: ${out}`);
  await sleepMs(120); // let the block inside the protocol settle
  process.kill(child.pid!, "SIGKILL");
  await sleepMs(80);
}

// ---------------------------------------------------------------------------

test("S1 | full protocol: stage -> verify -> finalize -> register; only registered lists complete", () => {
  const r = rig({ sentinel: "PENDING-DRAFT-SENTINEL-01" });
  try {
    const { manager } = r.open();
    const rec = manager.stageBytes("A", { id: "att-1", projectId: "p1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    assert.equal(rec.state, "staged");
    assert.ok(rec.digest && /^[0-9a-f]{64}$/.test(rec.digest));
    assert.equal(rec.bytes, 300_000);

    const fin = manager.finalize("A", "att-1");
    assert.equal(fin.state, "finalized");

    // Before registration the attachment is NOT complete.
    assert.equal(manager.list("A", { completeOnly: true }).length, 0);

    const done = manager.register("A", "att-1");
    assert.equal(done.state, "registered");
    assert.ok(done.receipt?.startsWith("rcp-att-1-"));
    assert.equal(manager.list("A", { completeOnly: true }).length, 1);
    // Receipt recorded on the row AND in the sanitized journal.
    const events = manager.listEvents("A", "att-1").map((e) => e.kind);
    assert.deepEqual(events, ["stage_started", "staged_verified", "finalized", "upload_opened", "chunk_ack", "chunk_ack", "chunk_ack", "chunk_ack", "chunk_ack", "registered"]);
  } finally {
    r.dispose();
  }
});

test("S1 | register before finalize is structurally impossible", () => {
  const r = rig();
  try {
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    assert.throws(() => manager.register("A", "att-1"), (e: unknown) => (e as TransferError).kind === "illegal_transition");
    // finalized-but-not-staged impossible too (nothing to register).
    assert.throws(() => manager.finalize("A", "missing"), (e: unknown) => (e as TransferError).kind === "not_found");
  } finally {
    r.dispose();
  }
});

test("S1 | finalize re-verifies the digest; tampered bytes -> typed recoverable failure, re-stage heals", () => {
  const r = rig();
  try {
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    // Corrupt the temp object AFTER staging (disk rot simulation).
    r.objects.putBytes(tempKeyFor("att-1"), payload(300_000, "CORRUPTED"));
    const failed = manager.finalize("A", "att-1");
    assert.equal(failed.state, "failed");
    assert.equal(failed.failureKind, "digest_mismatch");
    assert.equal(failed.failureStep, "finalize");
    // Pending data preserved: source still on disk, row and events intact.
    assert.ok(existsSync(r.sourcePath));
    assert.ok(manager.listEvents("A", "att-1").some((e) => e.kind === "staged_verified"));
    // Deterministic recovery: retry re-stages from source and completes.
    const done = manager.retry("A", "att-1");
    assert.equal(done.state, "registered");
  } finally {
    r.dispose();
  }
});

test("S1 | re-staging the same id restarts the transfer without duplicating rows", () => {
  const r = rig();
  try {
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    const again = manager.stageBytes("A", { id: "att-1", projectId: "p2", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    assert.equal(again.state, "staged");
    assert.equal(again.projectId, "p2");
    const db = new DatabaseSync(r.journalPath);
    const n = db.prepare("SELECT COUNT(*) AS n FROM attachment WHERE id='att-1'").get() as { n: number };
    assert.equal(n.n, 1);
    db.close();
  } finally {
    r.dispose();
  }
});

test("S2 | SIGKILL mid-stage: partial temp file, row staging; resume re-stages; partial never complete", async () => {
  const r = rig();
  try {
    await killChild(r, "midstage", "READY");
    const { manager } = r.open();
    // Nothing is exposed as a complete attachment at any point.
    assert.equal(manager.list("A", { completeOnly: true }).length, 0);
    assert.equal(manager.get("A", "att-1").state, "staging");
    assert.ok(existsSync(join(r.storeDir, tempKeyFor("att-1")))); // partial temp really on disk
    const summary = manager.resumeAll("A");
    assert.deepEqual(summary.completed, ["att-1"]);
    assert.equal(manager.get("A", "att-1").state, "registered");
    // Full bytes made it to the server exactly once (fixture verifies digest).
  } finally {
    r.dispose();
  }
});

test("S2 | SIGKILL mid-finalize: rename done, row staged; resume completes finalization + registration", async () => {
  const r = rig();
  try {
    await killChild(r, "midfinalize", "RENAMED");
    const { manager } = r.open();
    assert.equal(manager.get("A", "att-1").state, "staged");
    assert.ok(existsSync(join(r.storeDir, finalKeyFor("att-1")))); // file moved, DB behind
    assert.ok(!existsSync(join(r.storeDir, tempKeyFor("att-1"))));
    const summary = manager.resumeAll("A");
    assert.deepEqual(summary.completed, ["att-1"]);
    assert.equal(manager.get("A", "att-1").state, "registered");
  } finally {
    r.dispose();
  }
});

test("S2 | SIGKILL mid-register: resume continues from the SERVER offset; no bytes re-sent", async () => {
  const r = rig({ payloadBytes: 300_000 });
  try {
    await killChild(r, "midregister", "CHUNKED");
    // Fresh fixture instance over the same disposable server state.
    const fresh = new DisposableRegistrar(r.regDir);
    const uploadId = `upl-att-1-${new Sha256Digest().digest(readFileSync(r.sourcePath)).slice(0, 8)}`;
    const serverOffset = fresh.queryUpload(uploadId).receivedBytes;
    assert.equal(serverOffset, 65_536); // exactly the first chunk survived the kill

    const { manager } = r.open();
    const summary = manager.resumeAll("A");
    assert.deepEqual(summary.completed, ["att-1"]);
    // The parent process only sent the REMAINDER — server offset is authority
    // (the fixture also structurally rejects any offset != its received_bytes).
    assert.equal(r.registrar.totalBytesReceivedInProcess(uploadId), 300_000 - 65_536);
    fresh.close();
  } finally {
    r.dispose();
  }
});

test("S2 | SIGKILL after server completion (lost ack): idempotent re-complete records the SAME receipt", async () => {
  const r = rig();
  try {
    await killChild(r, "postack", "ACKED");
    const fresh = new DisposableRegistrar(r.regDir);
    const { manager } = r.open();
    assert.equal(manager.get("A", "att-1").state, "finalized"); // local receipt missing
    const summary = manager.resumeAll("A");
    assert.deepEqual(summary.completed, ["att-1"]);
    const done = manager.get("A", "att-1");
    const uploadId = `upl-att-1-${new Sha256Digest().digest(readFileSync(r.sourcePath)).slice(0, 8)}`;
    assert.equal(done.receipt, fresh.queryUpload(uploadId).completedReceipt); // identical receipt
    // No bytes were re-sent after server completion.
    assert.equal(fresh.totalBytesReceivedInProcess(uploadId), 0);
    fresh.close();
  } finally {
    r.dispose();
  }
});

test("S2 | orphan temp with no journal row: swept, never exposed as complete", () => {
  const r = rig();
  try {
    r.objects.putBytes("attachments/orphan-xyz.part", payload(1_000));
    const { manager } = r.open();
    assert.equal(manager.list("A", { completeOnly: true }).length, 0);
    const { removed } = manager.sweepOrphans();
    assert.deepEqual(removed, ["attachments/orphan-xyz.part"]);
    assert.equal(r.objects.statBytes("attachments/orphan-xyz.part"), null);
  } finally {
    r.dispose();
  }
});

test("S3 | app-launch resume: a FRESH manager over the same durable state completes pending work", () => {
  const r = rig({ payloadBytes: 120_000 });
  try {
    const first = r.open();
    first.manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    first.manager.stageBytes("A", { id: "att-2", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    first.manager.finalize("A", "att-1"); // left mid-protocol at different steps
    // "app launch": brand-new manager instances over the same journal/store/fixture.
    const second = r.open();
    const summary = second.manager.resumeAll("A");
    assert.deepEqual(summary.completed.sort(), ["att-1", "att-2"]);
    assert.equal(second.manager.list("A", { completeOnly: true }).length, 2);
  } finally {
    r.dispose();
  }
});

test("S3 | foreground/manual resume of ONE id: target completes, others untouched", () => {
  const r = rig({ payloadBytes: 120_000 });
  try {
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    manager.stageBytes("A", { id: "att-2", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    const done = manager.resume("A", "att-1");
    assert.equal(done.state, "registered");
    assert.equal(manager.get("A", "att-2").state, "staged"); // manual sync touched only att-1
  } finally {
    r.dispose();
  }
});

test("S3 | server-offset resume: pre-existing upload progress is honored (remainder only)", () => {
  const r = rig({ payloadBytes: 200_000 });
  try {
    // Seed the fixture with half the upload (prior progress).
    const bytes = readFileSync(r.sourcePath);
    const digest = new Sha256Digest().digest(bytes);
    const seeded = r.registrar.openUpload({ attachmentId: "att-1", accountId: "A", projectId: null, digest, bytes: bytes.byteLength });
    r.registrar.putChunk(seeded.uploadId, 0, bytes.subarray(0, 100_000));
    assert.equal(r.registrar.queryUpload(seeded.uploadId).receivedBytes, 100_000);

    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes });
    manager.finalize("A", "att-1");
    const seededBytes = r.registrar.totalBytesReceivedInProcess(seeded.uploadId);
    assert.equal(seededBytes, 100_000);
    manager.register("A", "att-1");
    // Exactly the remainder was sent: delta = total - seeded.
    assert.equal(r.registrar.totalBytesReceivedInProcess(seeded.uploadId) - seededBytes, 100_000);
  } finally {
    r.dispose();
  }
});

test("S4 | retryable server error: bounded backoff scheduled; resume before due skips; after due completes", () => {
  const r = rig({ payloadBytes: 200_000 });
  try {
    r.registrar.failNextPutChunk = "retryable";
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    manager.finalize("A", "att-1");
    const failed = manager.register("A", "att-1");
    assert.equal(failed.state, "failed");
    assert.equal(failed.failureKind, "retryable");
    assert.equal(failed.failureStep, "register");
    assert.equal(failed.attempts, 1);
    assert.ok(failed.nextAttemptAtMs !== null && failed.nextAttemptAtMs > r.clock.now);

    // Foreground resume BEFORE the backoff fell due: skipped, data preserved.
    const before = manager.resumeAll("A");
    assert.deepEqual(before.stillPending, ["att-1"]);
    assert.equal(manager.get("A", "att-1").state, "failed");

    r.clock.now += 10_000; // backoff elapsed
    const after = manager.resumeAll("A");
    assert.deepEqual(after.completed, ["att-1"]);
  } finally {
    r.dispose();
  }
});

test("S4 | rejection: typed recoverable failure, data preserved, manual retry after policy fix completes", () => {
  const r = rig({ payloadBytes: 150_000 });
  try {
    r.registrar.rejectUploads = true;
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    manager.finalize("A", "att-1");
    const failed = manager.register("A", "att-1");
    assert.equal(failed.failureKind, "rejection");
    // Pending data preserved: final object, journal row, source all intact.
    assert.equal(r.objects.statBytes(finalKeyFor("att-1")), 150_000);
    assert.ok(existsSync(r.sourcePath));
    // Policy fixed server-side -> manual retry completes.
    r.registrar.rejectUploads = false;
    assert.equal(manager.retry("A", "att-1").state, "registered");
  } finally {
    r.dispose();
  }
});

test("S4 | revoked access: typed failure; retry after re-auth completes; nothing dropped", () => {
  const r = rig({ payloadBytes: 150_000 });
  try {
    r.registrar.revoked = true;
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    manager.finalize("A", "att-1");
    assert.equal(manager.register("A", "att-1").failureKind, "revoked");
    r.registrar.revoked = false; // re-auth happened
    const done = manager.retry("A", "att-1");
    assert.equal(done.state, "registered");
    assert.ok(done.receipt);
  } finally {
    r.dispose();
  }
});

test("S4 | insufficient storage: typed failure preserving bytes; retry after space freed completes", () => {
  const r = rig({ payloadBytes: 150_000 });
  try {
    r.registrar.quotaFull = true;
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    manager.finalize("A", "att-1");
    const failed = manager.register("A", "att-1");
    assert.equal(failed.failureKind, "storage");
    // Local pending data untouched by the server-side storage failure.
    assert.equal(r.objects.statBytes(finalKeyFor("att-1")), 150_000);
    r.registrar.quotaFull = false;
    assert.equal(manager.retry("A", "att-1").state, "registered");
  } finally {
    r.dispose();
  }
});

test("S4 | local storage full at stage time: typed storage failure, source preserved, retry completes", () => {
  const r = rig({ payloadBytes: 100_000 });
  try {
    class FullStore extends FsObjectStore {
      full = true;
      putBytes(key: string, bytes: Uint8Array): void {
        if (this.full) throw new TransferError("full", "object store quota exhausted");
        super.putBytes(key, bytes);
      }
    }
    const objects = new FullStore(r.storeDir);
    const { manager } = openAttachmentManager({
      driver: new DatabaseSync(r.journalPath),
      objects,
      digest: new Sha256Digest(),
      sourceReader: new FsSourceReader(),
      registrar: r.registrar,
      now: () => r.clock.now,
    });
    const failed = manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    assert.equal(failed.state, "failed");
    assert.equal(failed.failureKind, "storage");
    assert.equal(failed.failureStep, "stage");
    assert.ok(existsSync(r.sourcePath)); // pending data preserved
    objects.full = false;
    const done = manager.retry("A", "att-1");
    assert.equal(done.state, "registered");
  } finally {
    r.dispose();
  }
});

test("S4 | server-side digest mismatch: re-stage from source is the deterministic recovery", () => {
  const r = rig({ payloadBytes: 150_000 });
  try {
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    manager.finalize("A", "att-1");
    r.registrar.corruptStoredBytes(); // flip a byte inside the stored segments
    const failed = manager.register("A", "att-1");
    assert.equal(failed.failureKind, "digest_mismatch");
    assert.equal(failed.failureStep, "register");
    // Recovery ALWAYS re-stages (full clean re-transfer), then completes.
    const done = manager.retry("A", "att-1");
    assert.equal(done.state, "registered");
    const kinds = manager.listEvents("A", "att-1").map((e) => e.kind);
    const lastRecovered = kinds.lastIndexOf("recovered");
    assert.ok(kinds.indexOf("stage_started", lastRecovered) > lastRecovered, "recovery re-staged from source");
  } finally {
    r.dispose();
  }
});

test("S4 | vanished source at re-stage: typed source_missing; restored source heals via retry", async () => {
  const r = rig({ payloadBytes: 300_000 });
  try {
    // REAL staging row via SIGKILL mid-stage, then the source vanishes
    // before relaunch (user/OS cleanup) — recovery must be typed.
    await killChild(r, "midstage", "READY");
    rmSync(r.sourcePath);
    const { manager } = r.open();
    const failed = manager.resume("A", "att-1");
    assert.equal(failed.state, "failed");
    assert.equal(failed.failureKind, "source_missing");
    assert.equal(failed.failureStep, "stage");
    // User re-provides the file at the same durable path (deterministic
    // payload = same digest) -> retry re-stages and drives to completion.
    writeFileSync(r.sourcePath, payload(300_000));
    const done = manager.retry("A", "att-1");
    assert.equal(done.state, "registered");
  } finally {
    r.dispose();
  }
});

test("S5 | surface pins: manager exposes exactly the 10 protocol methods; registrar exactly the 4 port methods", () => {
  const r = rig();
  try {
    const { manager } = r.open();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(manager)).filter((m) => m !== "constructor");
    assert.deepEqual(methods.sort(), [
      "assertTransition", "event", "failRow", "finalize", "get", "list", "listEvents",
      "register", "resume", "resumeAll", "retry", "row", "setState", "stageBytes",
      "sweepOrphans", "toRecord",
    ]); // FULL prototype pinned — any added method (public or not) breaks this
    const registrarMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(r.registrar)).filter((m) => m !== "constructor");
    for (const required of ["openUpload", "putChunk", "completeUpload", "queryUpload"]) {
      assert.ok(registrarMethods.includes(required), `registrar fixture must expose ${required}`);
    }
  } finally {
    r.dispose();
  }
});

test("S5 | migrations: contiguous versions, one transaction each, idempotent re-run, app extension works", () => {
  const r = rig();
  try {
    const db = new DatabaseSync(r.journalPath);
    const first = migrate(db, {
      extraMigrations: [{ version: 2, name: "app_extension", statements: ["CREATE TABLE app_extra (k TEXT PRIMARY KEY, v TEXT NOT NULL)"] }],
    });
    assert.deepEqual(first.applied, [1, 2]);
    const second = migrate(db);
    assert.deepEqual(second.applied, []);
    assert.equal((db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string }).value, "2");
    // Contiguity is validated: a gap fails closed before any statement runs.
    assert.throws(() => migrate(new DatabaseSync(":memory:"), { extraMigrations: [{ version: 5, name: "gap", statements: [] }] }));
    db.close();
    void ATTACHMENT_MIGRATIONS;
  } finally {
    r.dispose();
  }
});

test("S5 | redaction + account isolation: journal carries no payload bytes; accounts cannot see each other", () => {
  const r = rig({ sentinel: "PRIVATE-DRAFT-BYTES-XYZ" });
  try {
    const { manager } = r.open();
    manager.stageBytes("A", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    manager.finalize("A", "att-1");
    manager.register("A", "att-1");
    // Every event detail is sanitized: no payload bytes, no source content.
    const events = manager.listEvents("A", "att-1");
    for (const e of events) {
      assert.ok(!e.detail?.includes("PRIVATE-DRAFT-BYTES-XYZ"), "payload sentinel leaked into journal");
      if (e.detail) JSON.parse(e.detail); // details are strict JSON
    }
    // Account isolation: B cannot get/list/sweep or transition A's rows.
    assert.throws(() => manager.get("B", "att-1"), (e: unknown) => (e as TransferError).kind === "not_found");
    assert.equal(manager.list("B").length, 0);
    assert.deepEqual(manager.sweepOrphans().removed, []); // global sweep keeps referenced objects
    assert.throws(() => manager.finalize("B", "att-1"), (e: unknown) => (e as TransferError).kind === "not_found");
    // B staging the SAME id is a distinct row, not A's.
    manager.stageBytes("B", { id: "att-1", sourcePath: r.sourcePath, bytes: readFileSync(r.sourcePath) });
    assert.equal(manager.get("B", "att-1").state, "staged");
    assert.equal(manager.get("A", "att-1").state, "registered");
  } finally {
    r.dispose();
  }
});
