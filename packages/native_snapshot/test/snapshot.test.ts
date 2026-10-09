/**
 * M03-T05 acceptance-matrix tests — run against a REAL SQLite database
 * (Node's built-in `node:sqlite`). Every test maps to a milestone
 * acceptance line:
 *
 *   S1  snapshot data + watermark represent one consistent state; ordering
 *       and maximum response bytes are bounded and deterministic
 *   S2  applying a snapshot batch and persisting its cursor occur in one
 *       local transaction; interruption cannot advance the cursor ahead of
 *       applied data
 *   S3  deletes and scope changes are represented with tombstones; stale
 *       rows cannot reappear after replay
 *   S4  expired/invalid cursors trigger a safe rebootstrap that preserves
 *       and reconciles pending local work instead of discarding it
 *   S5  pagination boundaries, duplicate pages, interrupted apply, expired
 *       cursors (matrix coverage) + structural pins, migrations, and the
 *       feed-watermark handoff
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  RepositoryError,
  SNAPSHOT_APPLIER_METHODS,
  SNAPSHOT_SERVICE_METHODS,
  type SnapshotPage,
  type SnapshotSource,
  type WatermarkPort,
} from "../src/contract.js";
import { openSnapshotService, SnapshotService } from "../src/server.js";
import { openSnapshotApplier, SnapshotApplier } from "../src/client.js";
import { PILOT_APPLIERS, PILOT_DOMAIN_MIGRATION, makeProbe, makeSource, type SourceRow } from "./fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let tmpCounter = 0;
function freshDb(): { db: DatabaseSync; path: string } {
  const dir = mkdtempSync(join(tmpdir(), `snapshot-test-${Date.now()}-${tmpCounter++}-`));
  const path = join(dir, "db.sqlite");
  return { db: new DatabaseSync(path), path };
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

interface Store {
  rows: Map<string, SourceRow>;
  tombstones: Map<string, string[]>;
}

function freshStore(): Store {
  return { rows: new Map(), tombstones: new Map() };
}

function seed(store: Store, domain: string, tenantId: string, n: number, notePrefix = "note"): void {
  for (let i = 0; i < n; i++) {
    const id = `${tenantId}:dr-${String(i).padStart(3, "0")}`;
    store.rows.set(id, { entityId: id, payload: JSON.stringify({ tenantId, projectId: null, siteNote: `${notePrefix}-${i}` }) });
  }
  store.tombstones.set(`${domain}:${tenantId}`, []);
}

function stubWatermark(seq: number): WatermarkPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    currentSeq(tenantId: string): number {
      calls.push(tenantId);
      return seq;
    },
  };
}

/** Open a server over `db` with one daily-report source bound to `store`. */
function openServer(db: DatabaseSync, store: Store) {
  const svc = openSnapshotService(db, { extraMigrations: [PILOT_DOMAIN_MIGRATION] }).service;
  const sources: SnapshotSource[] = [makeSource("daily-report", store.rows, store.tombstones)];
  const watermark = stubWatermark(42);
  return { svc, sources, watermark };
}

function openClient(db: DatabaseSync, opts: Parameters<typeof openSnapshotApplier>[1] = {}) {
  return openSnapshotApplier(db, { extraMigrations: [PILOT_DOMAIN_MIGRATION], appliers: PILOT_APPLIERS, ...opts });
}

function drain(svc: SnapshotService, snapshotId: string, maxBytes: number): SnapshotPage[] {
  const pages: SnapshotPage[] = [];
  let after = -1;
  for (;;) {
    const p = svc.readPage(snapshotId, after, { maxBytes });
    pages.push(p);
    if (!p.hasMore) break;
    after = p.nextAfterOrd;
  }
  return pages;
}

/** Convenience: page budget that fits `n` small fixture rows per page. */
const budget = (n: number): number => 128 + 300 * n;

function driverOf(applier: SnapshotApplier): DatabaseSync {
  return (applier as unknown as { driver: DatabaseSync }).driver;
}

function rowCount(db: DatabaseSync, table = "daily_report"): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
}

// ---------------------------------------------------------------------------
// S1 — one consistent state, bounded and deterministic
// ---------------------------------------------------------------------------

test("s1: openSnapshot materializes rows, tombstones and watermark in one consistent state", () => {
  const { db } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  store.tombstones.set("daily-report:t1", ["t1:dr-deleted"]);
  const { svc, sources, watermark } = openServer(db, store);

  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  assert.equal(watermark.calls.length, 1, "watermark port called exactly once per open");
  assert.equal(info.watermark, 42);
  assert.equal(info.objectCount, 4);
  assert.equal(info.tombstoneCount, 1);

  const pages = drain(svc, info.snapshotId, budget(10));
  assert.equal(pages.length, 1);
  const ops = pages[0].rows.map((r) => `${r.domain}/${r.entityId}/${r.op}`);
  assert.deepEqual(ops, [
    "daily-report/t1:dr-000/upsert",
    "daily-report/t1:dr-001/upsert",
    "daily-report/t1:dr-002/upsert",
    "daily-report/t1:dr-deleted/delete",
  ]);
});

test("s1: concurrent writes during bootstrap never change page contents (materialized consistency)", () => {
  const { db } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  const { svc, sources, watermark } = openServer(db, store);

  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  // Writes AFTER open: new row, mutated row, extra tombstone.
  store.rows.set("t1:dr-late", { entityId: "t1:dr-late", payload: JSON.stringify({ tenantId: "t1", projectId: null, siteNote: "late" }) });
  store.rows.set("t1:dr-000", { entityId: "t1:dr-000", payload: JSON.stringify({ tenantId: "t1", projectId: null, siteNote: "MUTATED" }) });
  store.tombstones.set("daily-report:t1", ["t1:dr-late-tombstone"]);

  const pages = drain(svc, info.snapshotId, budget(100));
  const all = pages.flatMap((p) => p.rows);
  assert.equal(all.length, 3, "late writes are not in the snapshot");
  const first = all.find((r) => r.entityId === "t1:dr-000");
  assert.equal(first && JSON.parse(first.payload!).siteNote, "note-0", "mutation after open is not visible");
  assert.equal(info.watermark, 42, "watermark unchanged by post-open publishes");
});

test("s1: pagination is deterministic — identical boundaries and payloads across repeated reads", () => {
  const { db } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 7);
  const { svc, sources, watermark } = openServer(db, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });

  const run1 = drain(svc, info.snapshotId, budget(2));
  const run2 = drain(svc, info.snapshotId, budget(2));
  assert.equal(run1.length, run2.length);
  for (let i = 0; i < run1.length; i++) {
    assert.equal(run1[i].firstOrd, run2[i].firstOrd, `page ${i} boundary stable`);
    assert.deepEqual(run1[i].rows, run2[i].rows, `page ${i} rows identical`);
  }
  assert.equal(run1.flatMap((p) => p.rows).length, 7);
});

test("s1: byte cap bounds pages; a single oversized row is delivered alone (no starvation)", () => {
  const { db } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  store.rows.set("t1:dr-huge", { entityId: "t1:dr-huge", payload: JSON.stringify({ tenantId: "t1", blob: "x".repeat(1000) }) });
  const { svc, sources, watermark } = openServer(db, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });

  const pages = drain(svc, info.snapshotId, 300);
  const huge = pages.find((p) => p.rows.some((r) => r.entityId === "t1:dr-huge"));
  assert.ok(huge, "oversized row delivered");
  assert.equal(huge!.rows.length, 1, "oversized row alone on its page");
  for (const p of pages) assert.ok(p.rows.length <= 4, "no page exceeds a bounded row count under a 300B cap");
  assert.equal(pages.flatMap((p) => p.rows).length, 4);
});

test("s1: maxObjects cap refuses unbounded materialization; nothing persists (one transaction)", () => {
  const { db } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 5);
  const { svc, sources, watermark } = openServer(db, store);

  assert.equal(kindOf(() => svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark, maxObjects: 3 })), "misconfigured");
  assert.equal(rowCount(db, "snapshot_manifest"), 0, "no manifest row on failure");
  assert.equal(rowCount(db, "snapshot_object"), 0, "no objects on failure");
});

test("s1: a source failing mid-materialization rolls back the whole open (no partial snapshot)", () => {
  const { db } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  const { svc, sources, watermark } = openServer(db, store);
  const exploding: SnapshotSource = {
    domain: "field-submission",
    readRows: () => {
      throw new Error("storage read failed");
    },
    readTombstones: () => [],
  };

  assert.throws(() => svc.openSnapshot({ tenantId: "t1", projectId: null, sources: [...sources, exploding], watermark }));
  assert.equal(rowCount(db, "snapshot_manifest"), 0, "rolled back: neither manifest nor partial objects persist");
});

// ---------------------------------------------------------------------------
// S2 — one-transaction apply; interruption cannot advance the cursor
// ---------------------------------------------------------------------------

test("s2: applyPage commits entity rows and the cursor together; progress is durable", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });

  const { applier } = openClient(clientDb);
  const pages = drain(svc, info.snapshotId, 200); // ~139B/row → 1 row per page
  assert.ok(pages.length >= 3, "fixture paginates");
  let confirmed = -1;
  for (const p of pages) confirmed = applier.applyPage(p, "A", "t1:all").confirmedAfterOrd;

  const prog = applier.readProgress("A", "t1", "t1:all");
  assert.equal(prog.state, "applying");
  assert.equal(prog.rowsApplied, 3);
  assert.equal(prog.pagesApplied, pages.length);
  assert.equal(prog.watermark, 42);
  assert.equal(prog.lastAfterOrd, 3);
  assert.equal(confirmed, 3);
  assert.equal(rowCount(clientDb), 3, "local rows visible after commit");
});

test("s2: SIGKILL mid-apply rolls back rows, page dedup and cursor (real process kill)", async () => {
  const { db: serverDb, path: serverPath } = freshDb();
  const { db: clientDb, path: clientPath } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  const page = svc.readPage(info.snapshotId, -1, { maxBytes: budget(10) });
  assert.equal(page.rows.length, 3);
  serverDb.close();
  clientDb.close();

  const child = spawn(process.execPath, [join(HERE, "crash-child.js"), clientPath, "midapply", JSON.stringify(page)]);
  let ready = false;
  child.stdout.on("data", (c: unknown) => {
    if (String(c).includes("READY")) ready = true;
  });
  const deadline = Date.now() + 10_000;
  while (!ready && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  assert.ok(ready, "child signaled READY (apply transaction open)");
  child.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 150));

  // Reopen: NOTHING from the page survived — no rows, no dedup, no cursor.
  const { applier } = openClient(new DatabaseSync(clientPath));
  const prog = applier.readProgress("A", "t1", "t1:all");
  assert.equal(prog.state, "none", "checkpoint row never committed");
  assert.equal(prog.rowsApplied, 0);
  assert.equal(prog.lastAfterOrd, -1);
  assert.equal(rowCount(driverOf(applier)), 0, "no entity row survived the kill");
  // And the page can be re-applied cleanly afterwards (recovery = re-delivery).
  const r = applier.applyPage(page, "A", "t1:all");
  assert.equal(r.applied, 3);
  assert.equal(rowCount(driverOf(applier)), 3);
});

test("s2: SIGKILL after ack — applied page survives; duplicate delivery is a dedup no-op (lost ack)", async () => {
  const { db: serverDb, path: serverPath } = freshDb();
  const { db: clientDb, path: clientPath } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 2);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  const page = svc.readPage(info.snapshotId, -1, { maxBytes: budget(10) });
  serverDb.close();
  clientDb.close();

  const child = spawn(process.execPath, [join(HERE, "crash-child.js"), clientPath, "postapply", JSON.stringify(page)]);
  let acked = false;
  child.stdout.on("data", (c: unknown) => {
    if (String(c).includes("APPLIED")) acked = true;
  });
  const deadline = Date.now() + 10_000;
  while (!acked && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  assert.ok(acked, "child acked after COMMIT returned");
  child.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 150));

  const { applier } = openClient(new DatabaseSync(clientPath));
  const prog = applier.readProgress("A", "t1", "t1:all");
  assert.equal(prog.state, "applying", "applied page durable");
  assert.equal(prog.rowsApplied, 2, "no lost accepted operation");
  assert.equal(prog.lastAfterOrd, page.nextAfterOrd);

  // Lost-ack replay: the SAME page again is a dedup no-op, cursor monotonic.
  const replay = applier.applyPage(page, "A", "t1:all");
  assert.equal(replay.skippedPages, 1);
  assert.equal(replay.applied, 0);
  assert.equal(replay.confirmedAfterOrd, page.nextAfterOrd, "cursor never moves backwards");
  assert.equal(rowCount(driverOf(applier)), 2, "exactly one copy of each row");
});

test("s2: unregistered domain fails closed — nothing applied, cursor unchanged", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 2);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  const page = svc.readPage(info.snapshotId, -1);

  const { applier } = openClient(clientDb, { appliers: {} });
  assert.equal(kindOf(() => applier.applyPage(page, "A", "t1:all")), "misconfigured");
  assert.equal(applier.readProgress("A", "t1", "t1:all").state, "none", "fail-closed: page rolled back entirely");
});

// ---------------------------------------------------------------------------
// S3 — tombstones; stale rows cannot reappear
// ---------------------------------------------------------------------------

test("s3: tombstone pages delete local state; replay does not resurrect stale rows", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  store.tombstones.set("daily-report:t1", ["t1:dr-001"]); // scope change: dr-001 removed
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });

  const { applier } = openClient(clientDb);
  const driver = driverOf(applier);
  // Pre-existing local row that the tombstone must clear.
  PILOT_APPLIERS["daily-report"].upsert(driver, "daily-report", "t1:dr-001", JSON.stringify({ tenantId: "t1", projectId: null, siteNote: "stale" }));
  assert.equal(rowCount(driver), 1, "precondition: one stale local row");

  const pages = drain(svc, info.snapshotId, budget(10));
  for (const p of pages) applier.applyPage(p, "A", "t1:all");
  assert.equal(rowCount(driver), 2, "tombstoned row removed");
  // Replay the whole snapshot: dedup skips everything; tombstoned id stays gone.
  for (const p of pages) applier.applyPage(p, "A", "t1:all");
  assert.equal(rowCount(driver), 2, "stale row did not reappear after replay");
});

test("s3: tombstone delete of an entity with pending work is skipped and surfaced (never silent)", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  store.tombstones.set("daily-report:t1", ["t1:dr-001"]);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });

  const { applier } = openClient(clientDb, { pendingWork: makeProbe({ "daily-report": ["t1:dr-001"] }) });
  let sawProtected: string[] = [];
  for (const p of drain(svc, info.snapshotId, budget(10))) {
    const r = applier.applyPage(p, "A", "t1:all");
    if (r.protectedDeletes.length) sawProtected = r.protectedDeletes;
  }
  assert.deepEqual(sawProtected, ["t1:dr-001"], "skip surfaced in the result");
  const row = driverOf(applier).prepare(`SELECT site_note FROM daily_report WHERE id = 't1:dr-001'`).get() as
    | { site_note: string }
    | undefined;
  assert.ok(row, "protected row survives tombstone");
});

test("s3: completion reconcile drops stale rows absent from the manifest (manifest closure)", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 2);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });

  const { applier } = openClient(clientDb, { pendingWork: makeProbe({}) });
  const driver = driverOf(applier);
  PILOT_APPLIERS["daily-report"].upsert(driver, "daily-report", "t1:dr-stale", JSON.stringify({ tenantId: "t1", projectId: null, siteNote: "old" }));
  for (const p of drain(svc, info.snapshotId, budget(10))) applier.applyPage(p, "A", "t1:all");

  const res = applier.completeBootstrap({ accountId: "A", tenantId: "t1", scopeKey: "t1:all", objectCount: info.objectCount });
  assert.deepEqual(res.dropped, ["t1:dr-stale"]);
  assert.deepEqual(res.preserved, []);
  const ids = (driver.prepare(`SELECT id FROM daily_report ORDER BY id`).all() as Array<Record<string, unknown>>).map((r) => String(r.id));
  assert.deepEqual(ids, ["t1:dr-000", "t1:dr-001"]);
  assert.equal(applier.readProgress("A", "t1", "t1:all").state, "complete");
});

// ---------------------------------------------------------------------------
// S4 — expired/invalid cursors → safe rebootstrap preserving pending work
// ---------------------------------------------------------------------------

test("s4: swept and unknown snapshots surface typed resync_required (expired cursor)", () => {
  const { db } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 2);
  const { svc, sources, watermark } = openServer(db, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  assert.equal(kindOf(() => svc.readPage("snap-does-not-exist", -1)), "resync_required", "unknown snapshot id");

  svc.sweepSnapshots({ olderThanMs: 0, nowMs: Date.now() + 1 });
  assert.equal(kindOf(() => svc.readPage(info.snapshotId, -1)), "resync_required", "swept snapshot");
  // The manifest row is retained as a swept tombstone so cursors get the
  // typed rebootstrap signal; its objects are gone.
  assert.equal(svc.manifestInfo(info.snapshotId).objectCount, 2);
  assert.equal(rowCount(db, "snapshot_object"), 0, "swept objects deleted");
});

test("s4: mid-bootstrap sweep surfaces resync_required; abort + fresh bootstrap recovers", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 4);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  const p1 = svc.readPage(info.snapshotId, -1, { maxBytes: budget(2) });

  const { applier } = openClient(clientDb);
  applier.applyPage(p1, "A", "t1:all");
  assert.equal(applier.readProgress("A", "t1", "t1:all").state, "applying");

  // Server retention sweeps while the device is mid-bootstrap.
  svc.sweepSnapshots({ olderThanMs: 0, nowMs: Date.now() + 1 });
  assert.equal(kindOf(() => svc.readPage(info.snapshotId, p1.nextAfterOrd)), "resync_required");

  // Client recovery: abort the dead bootstrap, rebootstrap from a fresh snapshot.
  applier.abortBootstrap("A", "t1", "t1:all");
  assert.equal(applier.readProgress("A", "t1", "t1:all").state, "none");
  const info2 = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark: stubWatermark(43) });
  for (const p of drain(svc, info2.snapshotId, budget(2))) applier.applyPage(p, "A", "t1:all");
  const res = applier.completeBootstrap({ accountId: "A", tenantId: "t1", scopeKey: "t1:all", objectCount: info2.objectCount });
  const prog = applier.readProgress("A", "t1", "t1:all");
  assert.equal(prog.state, "complete");
  assert.equal(prog.watermark, 43);
  assert.deepEqual(res.dropped, [], "rebootstrap of the same scope converges cleanly");
});

test("s4: rebootstrap preserves pending local work and reconciles the rest (outbox-shaped probe)", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 4); // dr-000..dr-003
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  const first = openClient(clientDb, { pendingWork: makeProbe({ "daily-report": [] }) });
  for (const p of drain(svc, info.snapshotId, budget(10))) first.applier.applyPage(p, "A", "t1:all");
  first.applier.completeBootstrap({ accountId: "A", tenantId: "t1", scopeKey: "t1:all", objectCount: info.objectCount });

  // Server state moves on: dr-001 deleted (scope ledger), dr-004 created.
  // Retention sweeps the old snapshot; the client cursor is now expired.
  store.rows.delete("t1:dr-001");
  store.rows.set("t1:dr-004", { entityId: "t1:dr-004", payload: JSON.stringify({ tenantId: "t1", projectId: null, siteNote: "new" }) });
  store.tombstones.set("daily-report:t1", ["t1:dr-001"]);
  svc.sweepSnapshots({ olderThanMs: 0, nowMs: Date.now() + 1 });
  assert.equal(kindOf(() => svc.readPage(info.snapshotId, -1)), "resync_required", "cursor expired");

  // Client meanwhile has LOCAL pending work on dr-001 (offline edit awaiting
  // dispatch — the M03-T03 outbox holds the op; the probe reports it protected).
  const probe = makeProbe({ "daily-report": ["t1:dr-001"] });
  const { applier } = openClient(clientDb, { pendingWork: probe });
  const driver = driverOf(applier);
  assert.ok(driver.prepare(`SELECT id FROM daily_report WHERE id = 't1:dr-001'`).get(), "precondition: pending-work row exists locally");

  // Safe rebootstrap: abort, fresh snapshot, reapply, reconcile.
  applier.abortBootstrap("A", "t1", "t1:all");
  const info2 = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark: stubWatermark(77) });
  for (const p of drain(svc, info2.snapshotId, budget(10))) applier.applyPage(p, "A", "t1:all");
  const res = applier.completeBootstrap({ accountId: "A", tenantId: "t1", scopeKey: "t1:all", objectCount: info2.objectCount });

  assert.deepEqual(res.preserved, ["t1:dr-001"], "pending work preserved, never discarded");
  assert.deepEqual(res.dropped, [], "no unrelated local rows to drop");
  assert.equal(rowCount(driver), 5, "4 snapshot rows + the preserved pending row");
  const prog = applier.readProgress("A", "t1", "t1:all");
  assert.equal(prog.state, "complete");
  assert.equal(prog.watermark, 77, "client continues from the fresh watermark");
  assert.ok(probe.seen.length > 0, "probe consulted (mount wiring exercised)");
});

test("s4: incomplete bootstrap cannot complete (completeness gate on manifest objectCount)", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });
  const { applier } = openClient(clientDb);
  const p1 = svc.readPage(info.snapshotId, -1, { maxBytes: 200 }); // 1 row per page
  assert.equal(p1.rows.length, 1);
  applier.applyPage(p1, "A", "t1:all");
  assert.equal(
    kindOf(() => applier.completeBootstrap({ accountId: "A", tenantId: "t1", scopeKey: "t1:all", objectCount: info.objectCount })),
    "misconfigured",
  );
  assert.equal(applier.readProgress("A", "t1", "t1:all").state, "applying", "still applying — cursor cannot jump ahead");
});

// ---------------------------------------------------------------------------
// S5 — structural pins, migrations, and the feed-watermark handoff
// ---------------------------------------------------------------------------

test("s5: service and applier surfaces are pinned (no domain writers on either side)", () => {
  const { db } = freshDb();
  const { svc } = openServer(db, freshStore());
  const actualService = Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).filter((m) => m !== "constructor").sort();
  assert.deepEqual(actualService, [...SNAPSHOT_SERVICE_METHODS].sort());
  const { applier } = openClient(db);
  const actualApplier = Object.getOwnPropertyNames(Object.getPrototypeOf(applier)).filter((m) => m !== "constructor").sort();
  assert.deepEqual(actualApplier, [...SNAPSHOT_APPLIER_METHODS].sort());
});

test("s5: migrations contiguous and idempotent on reopen (v1 server, v2 client, v3 domain)", () => {
  const { db, path } = freshDb();
  const first = openSnapshotService(db, { extraMigrations: [PILOT_DOMAIN_MIGRATION] });
  assert.equal(first.currentVersion, 3);
  db.close();
  const db2 = new DatabaseSync(path);
  const second = openSnapshotService(db2, { extraMigrations: [PILOT_DOMAIN_MIGRATION] });
  assert.equal(second.currentVersion, 3);
  db2.close();
});

test("s5: bootstrap completes at the feed watermark; the consumer continues from it (handoff contract)", () => {
  const { db: serverDb } = freshDb();
  const { db: clientDb } = freshDb();
  const store = freshStore();
  seed(store, "daily-report", "t1", 3);
  const { svc, sources, watermark } = openServer(serverDb, store);
  const info = svc.openSnapshot({ tenantId: "t1", projectId: null, sources, watermark });

  const { applier } = openClient(clientDb);
  for (const p of drain(svc, info.snapshotId, budget(2))) applier.applyPage(p, "A", "t1:all");
  const res = applier.completeBootstrap({ accountId: "A", tenantId: "t1", scopeKey: "t1:all", objectCount: info.objectCount });
  assert.deepEqual(res.dropped, []);
  const prog = applier.readProgress("A", "t1", "t1:all");
  assert.equal(prog.state, "complete");
  assert.equal(prog.watermark, 42, "the M03-T04 consumer resumes pulls afterSeq=this watermark");

  // Post-bootstrap feed delivery belongs to the M03-T04 FeedConsumer, not the
  // snapshot applier: a completed bootstrap structurally refuses new pages
  // (the two checkpoints never mix).
  const late: SnapshotPage = {
    snapshotId: info.snapshotId,
    tenantId: "t1",
    projectId: null,
    watermark: 45,
    firstOrd: 1000,
    rows: [{ ord: 1000, domain: "daily-report", entityId: "t1:dr-003", op: "upsert", payload: "{}" }],
    nextAfterOrd: 1001,
    hasMore: false,
    approxBytes: 128,
  };
  assert.equal(kindOf(() => applier.applyPage(late, "A", "t1:all")), "misconfigured");
});
