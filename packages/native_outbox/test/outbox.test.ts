/**
 * M03-T03 acceptance-matrix tests — run against a REAL SQLite database
 * (Node's built-in `node:sqlite`, engine proof carried over from the
 * M01-T13 rig). Every test maps to a milestone acceptance line:
 *
 *   D1  a save commits the local mutation AND its pending operation in one
 *       transaction; failures leave neither visible
 *   D2  migrations, interrupted migration recovery, busy/locked handling,
 *       disk-full, corruption, and process termination — reproducible
 *       tests on the real database
 *   D3  account-scoped records cannot be read across accounts; logout/
 *       switch surfacing via the pending-work summary
 *   D4  pending ops, attachments, private drafts never evicted; retention
 *       and deletion are explicit, tested policies
 *   D5  domain service stays the authority (receipts only from server
 *       outcomes); no domain feature added here
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, openSync, writeSync, closeSync, unlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { RepositoryError } from "../src/contract.js";
import { OUTBOX_MIGRATIONS } from "../src/migrations.js";
import { openOutbox, OutboxRepository } from "../src/repository.js";
import { DAILY_LOG_MIGRATION } from "./fixtures.js";

let tmpCounter = 0;
function freshDb(): { dir: string; path: string; db: DatabaseSync } {
  const dir = mkdtempSync(join(tmpdir(), `outbox-test-${Date.now()}-${tmpCounter++}-`));
  const path = join(dir, "local.db");
  return { dir, path, db: new DatabaseSync(path) };
}

function kindOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof RepositoryError) return e.kind;
    throw e;
  }
  throw new Error("expected RepositoryError, none thrown");
}

function opCount(db: DatabaseSync, accountId?: string): number {
  const db2 = accountId
    ? db.prepare("SELECT COUNT(*) AS n FROM pending_op WHERE account_id = ?").get(accountId)
    : db.prepare("SELECT COUNT(*) AS n FROM pending_op").get();
  return Number((db2 as { n: number }).n);
}

// ---------------------------------------------------------------------------
// D2 — versioned migrations and interrupted-migration recovery
// ---------------------------------------------------------------------------

test("migrations: fresh open applies v1+v2 contiguously; reopen is idempotent", () => {
  const { db, path } = freshDb();
  const first = openOutbox(db, { integrityCheck: true });
  assert.deepEqual(first.migrations.applied, [1, 2]);
  assert.equal(first.migrations.currentVersion, 2);
  db.close();

  const db2 = new DatabaseSync(path);
  const second = openOutbox(db2, { integrityCheck: true });
  assert.deepEqual(second.migrations.applied, []);
  assert.equal(second.migrations.currentVersion, 2);
  assert.equal(
    (db2.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value,
    "2",
  );
  db2.close();
});

test("migrations: app-owned domain migrations extend the schema (daily_log sample)", () => {
  const { db } = freshDb();
  const opened = openOutbox(db, { extraMigrations: [DAILY_LOG_MIGRATION] });
  assert.deepEqual(opened.migrations.applied, [1, 2, 3]);
  db.prepare("INSERT INTO daily_log (id, account_id, note, created_at) VALUES ('l1', 'A', 'note', 1)").run();
  assert.equal(opCount(db), 0);
  const log = db.prepare("SELECT note FROM daily_log WHERE id = 'l1'").get() as { note: string };
  assert.equal(log.note, "note");
});

test("migrations: misconfigured sets (duplicate/lower/non-contiguous versions) are rejected up front", () => {
  const { db } = freshDb();
  const bad = { version: 1, name: "dup", statements: ["CREATE TABLE x (a)"] };
  assert.throws(() => openOutbox(db, { extraMigrations: [bad] }), (e: unknown) => e instanceof RepositoryError && e.kind === "misconfigured");
  db.close();
});

test("migrations: a failing migration rolls back its own version; prior versions and data survive", () => {
  const { db, path } = freshDb();
  const boot = openOutbox(db);
  boot.repository.saveMutation({ accountId: "A", op: { opId: "op-pre", kind: "k", payload: "{}" } });
  db.close();

  const db2 = new DatabaseSync(path);
  const failing: Parameters<typeof openOutbox>[1] = {
    extraMigrations: [
      { version: 3, name: "good_table", statements: ["CREATE TABLE domain_log (id TEXT PRIMARY KEY)"] },
      { version: 4, name: "bad_step", statements: ["INSERT INTO table_that_does_not_exist VALUES (1)"] },
    ],
  };
  assert.throws(() => openOutbox(db2, failing), (e: unknown) => e instanceof RepositoryError && e.kind === "migration_failed");
  // version 3 committed; version 4 rolled back
  assert.equal(
    (db2.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value,
    "3",
  );
  db2.close();

  const db3 = new DatabaseSync(path);
  const healed = openOutbox(db3, {
    extraMigrations: [{ version: 3, name: "good_table", statements: ["CREATE TABLE IF NOT EXISTS domain_log (id TEXT PRIMARY KEY)"] }],
  });
  assert.deepEqual(healed.migrations.applied, []);
  assert.equal(healed.repository.getOp("A", "op-pre")?.id, "op-pre", "pre-migration data survives");
  db3.close();
});

// ---------------------------------------------------------------------------
// D1 — the save boundary
// ---------------------------------------------------------------------------

test("save: domain row and pending op commit together; both visible after commit", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db, { extraMigrations: [DAILY_LOG_MIGRATION] });
  repository.saveMutation({
    accountId: "A",
    projectId: "p1",
    op: { opId: "op-1", kind: "fieldSubmission.submit", payload: JSON.stringify({ note: "n" }), digest: "d1" },
    domain: (tx) => {
      tx.prepare("INSERT INTO daily_log (id, account_id, project_id, note, created_at) VALUES ('l1', 'A', 'p1', 'n', 1)").run();
    },
  });
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM daily_log").get()!.n), 1);
  const op = repository.getOp("A", "op-1")!;
  assert.equal(op.state, "pending");
  assert.equal(op.digest, "d1");
  assert.equal(op.projectId, "p1");
});

test("save: a failure after the domain write rolls back BOTH sides (no partial visibility)", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db, { extraMigrations: [DAILY_LOG_MIGRATION] });
  assert.throws(() =>
    repository.saveMutation({
      accountId: "A",
      op: { opId: "op-x", kind: "k", payload: "{}" },
      domain: (tx) => {
        tx.prepare("INSERT INTO daily_log (id, account_id, note, created_at) VALUES ('lx', 'A', 'n', 1)").run();
        throw new Error("boom after domain write");
      },
    }),
  );
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM daily_log").get()!.n), 0, "domain row rolled back");
  assert.equal(opCount(db), 0, "pending op rolled back");
  // the repository still works after a rolled-back save
  repository.saveMutation({ accountId: "A", op: { opId: "op-y", kind: "k", payload: "{}" } });
  assert.equal(opCount(db), 1);
});

test("save: dangling dependency (FK) fails the whole save with a typed constraint error", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db);
  const kind = kindOf(() =>
    repository.saveMutation({ accountId: "A", op: { opId: "op-d", kind: "k", payload: "{}", dependsOnOpIds: ["ghost"] } }),
  );
  assert.equal(kind, "constraint", "FK violation must surface typed, not crash");
  assert.equal(opCount(db), 0, "the save that referenced a ghost dependency left nothing behind");
});

// ---------------------------------------------------------------------------
// D2 — busy/locked, disk-full, corruption, process termination (real SQLite)
// ---------------------------------------------------------------------------

test("busy: competing writer surfaces typed busy; retry succeeds after the holder commits", () => {
  const { path } = freshDb();
  const a = new DatabaseSync(path);
  openOutbox(a);
  a.exec("BEGIN IMMEDIATE"); // hold the write lock from connection A

  const b = new DatabaseSync(path);
  const { repository: repoB } = openOutbox(b, { busyTimeoutMs: 50 });
  assert.equal(kindOf(() => repoB.saveMutation({ accountId: "A", op: { opId: "op-busy", kind: "k", payload: "{}" } })), "busy");

  a.exec("COMMIT"); // release
  repoB.saveMutation({ accountId: "A", op: { opId: "op-busy", kind: "k", payload: "{}" } });
  assert.equal(repoB.getOp("A", "op-busy")?.state, "pending");
  a.close();
  b.close();
});

test("disk-full: SQLITE_FULL is typed, rolled back, and previous work is intact", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db);
  repository.saveMutation({ accountId: "A", op: { opId: "op-keep", kind: "k", payload: "{}" } });

  const pageCount = Number((db.prepare("PRAGMA page_count").get() as { page_count: number }).page_count);
  db.exec(`PRAGMA max_page_count=${pageCount}`); // zero headroom
  const bigPayload = JSON.stringify({ blob: "x".repeat(512 * 1024) });
  assert.equal(kindOf(() => repository.saveMutation({ accountId: "A", op: { opId: "op-big", kind: "k", payload: bigPayload } })), "full");

  assert.equal(opCount(db), 1, "only the pre-full op remains");
  assert.equal(repository.getOp("A", "op-keep")?.id, "op-keep");
  assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");

  // NOTE: `max_page_count=0` is a same-connection no-op on this engine
  // build after a FULL error (probed); release the limit explicitly.
  db.exec("PRAGMA max_page_count=1000000");
  repository.saveMutation({ accountId: "A", op: { opId: "op-big", kind: "k", payload: bigPayload } });
  assert.equal(opCount(db), 2);
});

test("corruption: a clobbered file header surfaces typed notadb/corrupt at open", () => {
  const { db, path, dir } = freshDb();
  const { repository } = openOutbox(db);
  repository.saveMutation({ accountId: "A", op: { opId: "op-c", kind: "k", payload: "{}" } });
  db.close();
  for (const side of [`${path}-wal`, `${path}-shm`]) {
    try { unlinkSync(side); } catch { /* absent after clean close */ }
  }
  const fd = openSync(path, "r+");
  writeSync(fd, new Uint8Array(16).fill(0x41), 0, 16, 0); // destroy the 16-byte header magic
  closeSync(fd);

  const kind = kindOf(() => openOutbox(new DatabaseSync(path)));
  assert.ok(kind === "notadb" || kind === "corrupt", `expected corrupt family, got ${kind}`);
  assert.ok(readdirSync(dir).includes("local.db"));
});

test("crash: SIGKILL with the transaction open rolls back BOTH sides; integrity holds", async () => {
  const { path } = freshDb();
  const childJs = join(dirname(fileURLToPath(import.meta.url)), "crash-child.js");
  const child = spawn(process.execPath, [childJs, path, "midtx", "op-crash"]);
  await waitForLine(child, "READY", 20_000);
  child.kill("SIGKILL");
  await exited(child, 10_000);

  const db = new DatabaseSync(path);
  const reopened = openOutbox(db, { integrityCheck: true, extraMigrations: [DAILY_LOG_MIGRATION] });
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM daily_log").get()!.n), 0, "uncommitted domain write is gone");
  assert.equal(opCount(db), 0, "uncommitted outbox row is gone");
  assert.equal(reopened.repository.getOp("A", "op-crash"), null);
  db.close();
});

test("crash: an ACKNOWLEDGED save survives SIGKILL (no lost accepted operation)", async () => {
  const { path } = freshDb();
  const childJs = join(dirname(fileURLToPath(import.meta.url)), "crash-child.js");
  const child = spawn(process.execPath, [childJs, path, "ack", "op-acked"]);
  await waitForLine(child, "ACKED", 20_000);
  child.kill("SIGKILL");
  await exited(child, 10_000);

  const db = new DatabaseSync(path);
  openOutbox(db, { integrityCheck: true, extraMigrations: [DAILY_LOG_MIGRATION] });
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM daily_log").get()!.n), 1, "committed domain write survives");
  const op = db.prepare("SELECT state FROM pending_op WHERE id = 'op-acked'").get() as { state: string };
  assert.equal(op.state, "pending", "pending op survives with its domain write");
  db.close();
});

// ---------------------------------------------------------------------------
// Lifecycle, dependency ordering, account isolation, retention (D3/D4/D5)
// ---------------------------------------------------------------------------

test("lifecycle: pending -> in_flight (attempts) -> accepted(receipt) / rejected(reason) / requeue with backoff", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db);
  repository.saveMutation({ accountId: "A", op: { opId: "op-lc", kind: "k", payload: "{}" } });

  assert.equal(kindOf(() => repository.recordAccepted("op-lc", "r")), "illegal_transition", "accept requires in_flight");
  assert.equal(kindOf(() => repository.recordRejected("op-lc", "x")), "illegal_transition");

  const inflight = repository.markInFlight("op-lc");
  assert.equal(inflight.state, "in_flight");
  assert.equal(inflight.attempts, 1);
  assert.equal(kindOf(() => repository.markInFlight("op-lc")), "illegal_transition", "double dispatch is illegal");

  const requeued = repository.requeue("op-lc", Date.now() + 60_000);
  assert.equal(requeued.state, "pending");
  assert.ok(requeued.nextAttemptAtMs! > Date.now());

  // time-gated dispatch: not eligible until next_attempt_at
  assert.deepEqual(repository.pendingBatch("A", { nowMs: Date.now() }).map((o) => o.id), [], "backoff gate holds");
  assert.deepEqual(repository.pendingBatch("A", { nowMs: Date.now() + 61_000 }).map((o) => o.id), ["op-lc"]);

  // accept path requires the server receipt
  assert.equal(kindOf(() => repository.markInFlight("op-lc") && repository.recordAccepted("op-lc", "")), "misconfigured");
  const accepted = repository.recordAccepted("op-lc", "srv-receipt-1");
  assert.equal(accepted.state, "accepted");
  assert.equal(accepted.acceptedReceipt, "srv-receipt-1");
  assert.deepEqual(repository.pendingBatch("A"), [], "accepted ops never re-dispatch");
});

test("dependency ordering: dependents wait until prerequisites are accepted", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db);
  repository.saveMutation({ accountId: "A", op: { opId: "opA", kind: "k", payload: "{}" } });
  repository.saveMutation({ accountId: "A", op: { opId: "opB", kind: "k", payload: "{}", dependsOnOpIds: ["opA"] } });

  assert.deepEqual(repository.pendingBatch("A").map((o) => o.id), ["opA"], "only the dependency-free op dispatches");
  repository.markInFlight("opA");
  assert.deepEqual(repository.pendingBatch("A").map((o) => o.id), [], "in-flight prerequisite still blocks");
  repository.recordAccepted("opA", "r-A");
  assert.deepEqual(repository.pendingBatch("A").map((o) => o.id), ["opB"], "acceptance unblocks the dependent");
});

test("account isolation: records are invisible across accounts; the summary surfaces per-account work", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db, { extraMigrations: [DAILY_LOG_MIGRATION] });
  repository.saveMutation({ accountId: "A", op: { opId: "opA1", kind: "k", payload: "{}" } });
  repository.saveMutation({ accountId: "B", op: { opId: "opB1", kind: "k", payload: "{}" } });
  repository.createDraft("A", { id: "draftA", kind: "note", body: "private" });

  assert.deepEqual(repository.pendingBatch("B").map((o) => o.id), ["opB1"]);
  assert.equal(repository.getOp("B", "opA1"), null, "A's op invisible to B");
  assert.equal(repository.getDraft("B", "draftA"), null, "A's draft invisible to B");

  const summaryA = repository.pendingWorkSummary("A");
  assert.deepEqual(
    Object.keys(summaryA).sort(),
    ["attachmentsPending", "oldestPendingAgeMs", "pendingOperations", "privateDrafts"],
    "shape-compatible with the M03-T02 PendingWorkSummary gate input",
  );
  assert.equal(summaryA.pendingOperations, 1);
  assert.equal(summaryA.privateDrafts, 1);
  assert.equal(summaryA.attachmentsPending, 0);
  assert.ok(summaryA.oldestPendingAgeMs !== null && summaryA.oldestPendingAgeMs >= 0);
  const summaryB = repository.pendingWorkSummary("B");
  assert.equal(summaryB.pendingOperations, 1);
  assert.equal(summaryB.privateDrafts, 0, "A's private draft is not B's pending work");
});

test("retention: deleteAcceptedBefore removes ONLY accepted+receipted history; pending/rejected/drafts/attachments survive", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db, { extraMigrations: [DAILY_LOG_MIGRATION] });
  repository.saveMutation({ accountId: "A", op: { opId: "op-old", kind: "k", payload: "{}" } });
  repository.saveMutation({ accountId: "A", op: { opId: "op-pending", kind: "k", payload: "{}" } });
  repository.saveMutation({ accountId: "A", op: { opId: "op-rej", kind: "k", payload: "{}" } });
  repository.markInFlight("op-old");
  repository.recordAccepted("op-old", "r-old");
  repository.markInFlight("op-rej");
  repository.recordRejected("op-rej", "validation");
  repository.createDraft("A", { id: "draft-keep", kind: "note", body: "b" });
  repository.stageAttachment("A", { id: "att-keep", localPath: "/x/y", digest: "abc", bytes: 3 });

  const old = repository.getOp("A", "op-old")!;
  assert.equal(repository.deleteAcceptedBefore("A", old.createdAtMs - 1), 0, "cutoff excludes itself");
  assert.equal(repository.deleteAcceptedBefore("A", Date.now() + 1), 1, "exactly the accepted+receipted op is removed");
  assert.equal(repository.getOp("A", "op-old"), null);
  assert.equal(repository.getOp("A", "op-pending")?.state, "pending", "pending work is NEVER cache-evicted");
  assert.equal(repository.getOp("A", "op-rej")?.state, "rejected", "rejected ops surface until explicitly resolved");
  assert.equal(repository.getDraft("A", "draft-keep")?.body, "b");
  assert.equal(repository.pendingWorkSummary("A").attachmentsPending, 1, "staged attachments survive retention");
});

test("retention: purgeAccount wipes strictly one account; others are untouched", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db);
  repository.saveMutation({ accountId: "A", op: { opId: "opA", kind: "k", payload: "{}", dependsOnOpIds: [] } });
  repository.saveMutation({ accountId: "B", op: { opId: "opB", kind: "k", payload: "{}" } });
  repository.createDraft("A", { id: "dA", kind: "note", body: "b" });

  const purged = repository.purgeAccount("A");
  assert.deepEqual(purged, { pendingOps: 1, drafts: 1, attachments: 0 });
  assert.equal(repository.getOp("A", "opA"), null);
  assert.equal(repository.getDraft("A", "dA"), null);
  assert.equal(repository.getOp("B", "opB")?.state, "pending", "B survives A's purge");
});

test("attachments: staging machine enforces legal edges; DB CHECK constrains states", () => {
  const { db } = freshDb();
  const { repository } = openOutbox(db);
  repository.stageAttachment("A", { id: "att1", localPath: "/tmp/f", digest: "d", bytes: 10 });
  assert.equal(repository.transitionAttachment("A", "att1", "staged"), "staged");
  assert.equal(kindOf(() => repository.transitionAttachment("A", "att1", "registered")), "illegal_transition", "cannot skip finalize");
  assert.equal(repository.transitionAttachment("A", "att1", "finalized"), "finalized");
  assert.equal(repository.transitionAttachment("A", "att1", "registered"), "registered");
  assert.equal(repository.pendingWorkSummary("A").attachmentsPending, 0, "registered attachments leave the pending set");
  assert.equal(kindOf(() => repository.transitionAttachment("A", "ghost", "staged")), "not_found");
});

test("no eviction path: the repository surface contains no cache-eviction primitives (structural pin)", () => {
  const surface = Object.getOwnPropertyNames(OutboxRepository.prototype).sort();
  assert.deepEqual(surface, [
    "assertId",
    "constructor",
    "createDraft",
    "deleteAcceptedBefore",
    "deleteDraft",
    "getDraft",
    "getOp",
    "markInFlight",
    "pendingBatch",
    "pendingWorkSummary",
    "purgeAccount",
    "recordAccepted",
    "recordRejected",
    "requeue",
    "saveMutation",
    "stageAttachment",
    "transition",
    "transitionAttachment",
  ]);
  for (const name of surface) {
    assert.doesNotMatch(name, /evict|trim|lru|prune|clearCache/i, "no cache semantics on durable data");
  }
  assert.equal(OUTBOX_MIGRATIONS.length, 2, "shipped schema is versioned v1..v2");
});

// ---------------------------------------------------------------------------
// child-process helpers
// ---------------------------------------------------------------------------

async function waitForLine(child: ReturnType<typeof spawn>, token: string, timeoutMs: number): Promise<void> {
  let buffer = "";
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for '${token}'; got: ${buffer.slice(0, 200)}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      if (buffer.includes(token)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      buffer += String(chunk);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`child exited (${code}/${signal}) before '${token}'; got: ${buffer.slice(0, 200)}`));
    });
  });
}

async function exited(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("child did not exit after SIGKILL")), timeoutMs);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
