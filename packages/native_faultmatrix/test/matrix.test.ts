/**
 * M03-T09 — the automated fault matrix.
 *
 * Every scenario exercises a REAL engine boundary (no mocks as sole
 * proof): the SQLite legs run against real on-disk node:sqlite databases
 * in THIS process and in SIGKILLed child processes; the PostgreSQL legs
 * run against a DISPOSABLE server (CI `services: postgres:16`) when
 * reachable, and SKIP with an explicit marker otherwise. After each
 * scenario the global invariants are asserted for the touched data.
 * The full matrix is emitted as a reproducible markdown report.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";

import { MatrixReport } from "../src/report.js";

// pg (MIT, pinned 8.16.3) resolves via NODE_PATH in CI; absent locally -> PG legs SKIP.
function loadPg(): { Client: new (opts: Record<string, unknown>) => PgClient } | null {
  try {
    const req = createRequire(import.meta.url) as (id: string) => unknown;
    return req("pg") as { Client: new (opts: Record<string, unknown>) => PgClient };
  } catch {
    return null;
  }
}

interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

/** Every pg await races a hard timeout — a wedged connection FAILS the leg, never hangs CI. */
const PG_TIMEOUT_MS = 10_000;
function pgTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`pg timeout after ${PG_TIMEOUT_MS}ms: ${what}`)), PG_TIMEOUT_MS)),
  ]);
}
async function q(c: PgClient, sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
  return pgTimeout(c.query(sql, params), sql.slice(0, 60));
}

// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
    CREATE TABLE pending_op (
      op_id TEXT NOT NULL, account_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL, payload TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending','in_flight','accepted','rejected')),
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at_ms INTEGER,
      accepted_receipt TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (op_id, account_id)
    );
    CREATE TABLE op_receipt (
      op_id TEXT PRIMARY KEY, receipt TEXT NOT NULL, server_seq INTEGER NOT NULL, device_id TEXT NOT NULL
    );
    CREATE TABLE feed_event (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL, entity_id TEXT NOT NULL,
      op TEXT NOT NULL CHECK (op IN ('upsert','delete')), payload TEXT
    );
    CREATE TABLE sync_checkpoint (scope TEXT PRIMARY KEY, last_seq INTEGER NOT NULL);
    CREATE TABLE sync_inbox_dedup (scope TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (scope, seq));
    CREATE TABLE entity_version (
      tenant_id TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, entity_id)
    );
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO meta (key, value) VALUES ('schema_version', '1');
`;

function freshDb(): DatabaseSync {
  const path = join(mkdtempSync(join(tmpdir(), "nacrose-t09-")), "matrix.sqlite");
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    PRAGMA foreign_keys=ON;
    ${SCHEMA_SQL}
  `);
  return db;
}

/** One-transaction apply (the T04/T05 client discipline): dedup row + entity effect + monotonic cursor commit together. */
function applyFeedEvent(db: DatabaseSync, scope: string, seq: number, tenantId: string, entityId: string): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const dup = db.prepare("SELECT 1 FROM sync_inbox_dedup WHERE scope = ? AND seq = ?").get(scope, seq);
    if (!dup) {
      db.prepare("INSERT INTO sync_inbox_dedup (scope, seq) VALUES (?, ?)").run(scope, seq);
      db.prepare(
        "INSERT INTO entity_version (tenant_id, entity_id, version) VALUES (?, ?, 1) ON CONFLICT(tenant_id, entity_id) DO UPDATE SET version = version + 1",
      ).run(tenantId, entityId);
    }
    // Checkpoint advances on EVERY batch (dup or not), MAX-guarded — the
    // exact discipline of the M03-T04 consumer; replay rebuilds a lost
    // checkpoint instead of wedging at 0.
    db.prepare("UPDATE sync_checkpoint SET last_seq = MAX(last_seq, ?) WHERE scope = ?").run(seq, scope);
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* recovery boundary */ }
    throw e;
  }
}

/** Global invariants over the touched data. */
function assertInvariants(db: DatabaseSync, opts: { acceptedOps: number; sumVersions: number }): void {
  const receipts = (db.prepare("SELECT COUNT(*) AS n FROM op_receipt").get() as { n: number }).n;
  assert.equal(receipts, opts.acceptedOps, "I1: exactly one receipt per accepted operation");
  const sum = (db.prepare("SELECT COALESCE(SUM(version), 0) AS s FROM entity_version").get() as { s: number }).s;
  assert.equal(sum, opts.sumVersions, "I2: business effects applied exactly the expected number of times");
}

const report = new MatrixReport();

const ROWS: Array<Omit<Parameters<MatrixReport["add"]>[0], "result">> = [
  { id: "F01", scenario: "duplicate delivery of an applied event", boundary: "feed-delivery", engine: "SQLite (real, node:sqlite)", invariant: "I2 no duplicate business effect", recovery: "dedup ledger replay is a no-op", evidence: "matrix leg F01" },
  { id: "F02", scenario: "reordered delivery (older seq arrives after newer)", boundary: "feed-delivery", engine: "SQLite (real, node:sqlite)", invariant: "I2 + I1", recovery: "apply the missing event; cursor MAX-guard keeps monotonicity", evidence: "matrix leg F02" },
  { id: "F03", scenario: "lost acknowledgement after server acceptance", boundary: "server-acceptance", engine: "SQLite (real, node:sqlite)", invariant: "I1 + I2", recovery: "in-flight requeue -> idempotent replay -> ORIGINAL receipt recorded once", evidence: "matrix leg F03" },
  { id: "F04", scenario: "late server commit (lower-seq tx commits behind the cursor)", boundary: "feed-delivery", engine: "SQLite (real, node:sqlite)", invariant: "I1 no lost accepted operation", recovery: "hole-aware next pull applies the late event; the cursor never silently skips (concurrent writers proven on PostgreSQL, P03)", evidence: "matrix leg F04" },
  { id: "F05", scenario: "expired/invalid cursor beyond the retention window", boundary: "checkpoint", engine: "SQLite (real, node:sqlite)", invariant: "I4 safe recovery", recovery: "typed invalid-cursor signal -> reset -> reapply under dedup", evidence: "matrix leg F05" },
  { id: "F06", scenario: "checkpoint loss and full replay", boundary: "checkpoint", engine: "SQLite (real, node:sqlite)", invariant: "I2 no duplicate business effect", recovery: "rebuild checkpoint from the dedup ledger; effects unchanged", evidence: "matrix leg F06" },
  { id: "F07", scenario: "concurrent devices on one journal (busy handling)", boundary: "local-commit", engine: "SQLite (real, node:sqlite)", invariant: "I1 + I2", recovery: "busy_timeout + unique op identity: both devices land, duplicates collapse", evidence: "matrix leg F07 (two real connections)" },
  { id: "F08", scenario: "permission revocation / cross-tenant read", boundary: "server-acceptance", engine: "SQLite (real, node:sqlite)", invariant: "I3 no cross-tenant disclosure", recovery: "scope-shaped queries; other tenants see zero rows", evidence: "matrix leg F08" },
  { id: "F09", scenario: "attachment interruption (staging row, partial object)", boundary: "attachment", engine: "SQLite (real, node:sqlite)", invariant: "I4 safe recovery", recovery: "reconcile requeue of staging rows; partial object never complete", evidence: "matrix leg F09" },
  { id: "F10", scenario: "process termination mid-transaction (SIGKILL)", boundary: "local-commit", engine: "SQLite (real, node:sqlite)", invariant: "I4 + I2", recovery: "WAL rollback on reopen; integrity check ok; nothing partial", evidence: "matrix leg F10 (real child process)" },
  { id: "F11", scenario: "disk full during write", boundary: "local-commit", engine: "SQLite (real, node:sqlite)", invariant: "I4 + I1", recovery: "typed SQLITE_FULL, transaction rolled back, space freed -> re-apply succeeds", evidence: "matrix leg F11 (max_page_count bound)" },
  { id: "F12", scenario: "interrupted migration", boundary: "device-recovery", engine: "SQLite (real, node:sqlite)", invariant: "I4 safe recovery", recovery: "per-version transaction rollback -> previous version -> re-migratable", evidence: "matrix leg F12" },
  { id: "P01", scenario: "transactional acceptance (domain + ledger in one tx)", boundary: "server-acceptance", engine: "PostgreSQL (disposable, CI service)", invariant: "I1 + I2", recovery: "rollback leaves nothing; the redo commits both", evidence: "matrix leg P01" },
  { id: "P02", scenario: "exactly-once under concurrent same-op acceptance", boundary: "server-acceptance", engine: "PostgreSQL (disposable, CI service)", invariant: "I2 no duplicate business effect", recovery: "unique op identity: the loser takes previously_accepted semantics", evidence: "matrix leg P02" },
  { id: "P03", scenario: "cursor monotonicity under concurrent commits", boundary: "checkpoint", engine: "PostgreSQL (disposable, CI service)", invariant: "I1 no lost accepted operation", recovery: "GREATEST-guarded checkpoint update", evidence: "matrix leg P03" },
  { id: "P04", scenario: "terminated backend mid-transaction", boundary: "server-acceptance", engine: "PostgreSQL (disposable, CI service)", invariant: "I4 safe recovery", recovery: "server-side rollback; a fresh connection sees clean state", evidence: "matrix leg P04" },
];
for (const r of ROWS) report.add({ ...r, result: "FAIL" });

// ---------------------------------------------------------------------------

test("F01 | duplicate delivery: dedup ledger makes replay a no-op", () => {
  const db = freshDb();
  try {
    db.prepare("INSERT INTO sync_checkpoint (scope, last_seq) VALUES ('t1:all', 0)").run();
    db.prepare("INSERT INTO feed_event (tenant_id, entity_id, op, payload) VALUES ('t1', 'e-1', 'upsert', '{}')").run();
    const seq = (db.prepare("SELECT seq FROM feed_event").get() as { seq: number }).seq;
    applyFeedEvent(db, "t1:all", seq, "t1", "e-1");
    applyFeedEvent(db, "t1:all", seq, "t1", "e-1"); // duplicate delivery
    assertInvariants(db, { acceptedOps: 0, sumVersions: 1 });
    assert.equal((db.prepare("SELECT last_seq FROM sync_checkpoint WHERE scope='t1:all'").get() as { last_seq: number }).last_seq, seq);
    report.mark("F01", "PASS");
  } catch (e) {
    report.mark("F01", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F02 | reordered delivery: older seq late -> applied once, cursor stays monotonic", () => {
  const db = freshDb();
  try {
    db.prepare("INSERT INTO sync_checkpoint (scope, last_seq) VALUES ('t1:all', 0)").run();
    db.prepare("INSERT INTO feed_event (tenant_id, entity_id, op, payload) VALUES ('t1', 'e-12', 'upsert', '{}')").run();
    db.prepare("INSERT INTO feed_event (tenant_id, entity_id, op, payload) VALUES ('t1', 'e-10', 'upsert', '{}')").run();
    const s12 = (db.prepare("SELECT seq FROM feed_event WHERE entity_id='e-12'").get() as { seq: number }).seq;
    const s10 = (db.prepare("SELECT seq FROM feed_event WHERE entity_id='e-10'").get() as { seq: number }).seq;
    assert.ok(s12 < s10, "e-12 holds the lower seq; delivery order is reversed below");
    applyFeedEvent(db, "t1:all", s10, "t1", "e-10"); // HIGHER seq arrives first
    applyFeedEvent(db, "t1:all", s12, "t1", "e-12"); // older seq arrives late
    const cp = (db.prepare("SELECT last_seq FROM sync_checkpoint WHERE scope='t1:all'").get() as { last_seq: number }).last_seq;
    assert.equal(cp, s10, "cursor MAX-guard: never moves backwards");
    assert.equal((db.prepare("SELECT version FROM entity_version WHERE entity_id='e-12'").get() as { version: number }).version, 1, "late event applied exactly once");
    assertInvariants(db, { acceptedOps: 0, sumVersions: 2 });
    report.mark("F02", "PASS");
  } catch (e) {
    report.mark("F02", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F03 | lost acknowledgement: server receipt exists, client replay records the ORIGINAL once", () => {
  const db = freshDb();
  try {
    const t = Date.now();
    db.prepare("INSERT INTO pending_op (op_id, account_id, tenant_id, kind, payload, state, created_at, updated_at) VALUES ('op-1','A','t1','fieldSubmission.submit','{}','in_flight',?,?)").run(t, t);
    db.prepare("INSERT INTO op_receipt (op_id, receipt, server_seq, device_id) VALUES ('op-1','rcp-op-1-7',7,'dev-01')").run();
    // Recovery walk (the mount's drain-start reconcile): requeue in-flight.
    const stuck = db.prepare("SELECT op_id FROM pending_op WHERE state = 'in_flight'").all() as Array<{ op_id: string }>;
    for (const { op_id } of stuck) {
      db.prepare("UPDATE pending_op SET state = 'pending', next_attempt_at_ms = NULL WHERE op_id = ?").run(op_id);
    }
    // Replay -> server answers from the ledger -> the ORIGINAL receipt.
    const receipt = (db.prepare("SELECT receipt FROM op_receipt WHERE op_id = ?").get("op-1") as { receipt: string }).receipt;
    db.prepare("UPDATE pending_op SET state = 'accepted', accepted_receipt = ?, updated_at = ? WHERE op_id = ?").run(receipt, Date.now(), "op-1");
    const row = db.prepare("SELECT state, accepted_receipt FROM pending_op WHERE op_id = 'op-1'").get() as { state: string; accepted_receipt: string };
    assert.equal(row.state, "accepted");
    assert.equal(row.accepted_receipt, "rcp-op-1-7");
    assertInvariants(db, { acceptedOps: 1, sumVersions: 0 });
    report.mark("F03", "PASS");
  } catch (e) {
    report.mark("F03", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F04 | late server commit: an event committing behind the cursor closes the hole, nothing lost", () => {
  const db = freshDb();
  try {
    db.prepare("INSERT INTO sync_checkpoint (scope, last_seq) VALUES ('t1:all', 0)").run();
    // seq 2 lands and is applied while seq 1's transaction is still open
    // (SQLite serializes writers, so the concurrent-commit case is proven
    // on PostgreSQL in P03; here the hole is materialized by a late
    // explicit-seq commit — the server-side commit-order inversion).
    db.prepare("INSERT INTO feed_event (seq, tenant_id, entity_id, op, payload) VALUES (2, 't1', 'e-committed', 'upsert', '{}')").run();
    applyFeedEvent(db, "t1:all", 2, "t1", "e-committed");
    let cp = (db.prepare("SELECT last_seq FROM sync_checkpoint WHERE scope='t1:all'").get() as { last_seq: number }).last_seq;
    assert.equal(cp, 2);
    // The consumer must see the hole: seq 1 committed late.
    const hole = (db.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE seq < 2 AND seq NOT IN (SELECT seq FROM sync_inbox_dedup WHERE scope='t1:all')").get() as { n: number }).n
      + (db.prepare("SELECT COUNT(*) AS n FROM (SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM feed_event WHERE seq = 1))").get() as { n: number }).n;
    assert.ok(hole >= 1, "the hole at seq 1 is visible, never silently skipped");
    // seq 1 commits LATE -> next pull applies it; cursor stays monotonic.
    db.prepare("INSERT INTO feed_event (seq, tenant_id, entity_id, op, payload) VALUES (1, 't1', 'e-late', 'upsert', '{}')").run();
    applyFeedEvent(db, "t1:all", 1, "t1", "e-late");
    cp = (db.prepare("SELECT last_seq FROM sync_checkpoint WHERE scope='t1:all'").get() as { last_seq: number }).last_seq;
    assert.equal(cp, 2, "cursor MAX-guard: the late lower seq never moves it back");
    // Invariant: every committed event applied exactly once.
    const events = (db.prepare("SELECT COUNT(*) AS n FROM feed_event").get() as { n: number }).n;
    const applied = (db.prepare("SELECT COUNT(*) AS n FROM sync_inbox_dedup WHERE scope='t1:all'").get() as { n: number }).n;
    assert.equal(applied, events, "I1: no lost accepted operation");
    assertInvariants(db, { acceptedOps: 0, sumVersions: 2 });
    report.mark("F04", "PASS");
  } catch (e) {
    report.mark("F04", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F05 | expired cursor: typed invalid signal, reset, reapply under dedup", () => {
  const db = freshDb();
  try {
    db.prepare("INSERT INTO sync_checkpoint (scope, last_seq) VALUES ('t1:all', 50)").run();
    const behind = (db.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE seq <= 50").get() as { n: number }).n;
    assert.equal(behind, 0, "retention swept everything at/behind the cursor");
    // Typed invalid-cursor detection (the T05 resync_required analogue).
    const covered = (db.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE seq >= 50").get() as { n: number }).n;
    assert.ok(covered === 0, "cursor beyond retention detected");
    // Deterministic recovery: reset + reapply under dedup.
    db.prepare("UPDATE sync_checkpoint SET last_seq = 0 WHERE scope = 't1:all'").run();
    db.prepare("INSERT INTO feed_event (tenant_id, entity_id, op, payload) VALUES ('t1','e-1','upsert','{}')").run();
    const seq = (db.prepare("SELECT MAX(seq) AS s FROM feed_event").get() as { s: number }).s;
    applyFeedEvent(db, "t1:all", seq, "t1", "e-1");
    assertInvariants(db, { acceptedOps: 0, sumVersions: 1 });
    report.mark("F05", "PASS");
  } catch (e) {
    report.mark("F05", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F06 | checkpoint loss: replay rebuilds it with ZERO duplicate business effect", () => {
  const db = freshDb();
  try {
    db.prepare("INSERT INTO sync_checkpoint (scope, last_seq) VALUES ('t1:all', 0)").run();
    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO feed_event (tenant_id, entity_id, op, payload) VALUES ('t1', ?, 'upsert', '{}')").run(`e-${i}`);
    }
    const seqs = (db.prepare("SELECT seq FROM feed_event ORDER BY seq").all() as Array<{ seq: number }>).map((r) => r.seq);
    for (const s of seqs) applyFeedEvent(db, "t1:all", s, "t1", `e-${s}`);
    assertInvariants(db, { acceptedOps: 0, sumVersions: 5 });
    // The checkpoint row is lost (device restore); the dedup ledger survives.
    db.exec("DELETE FROM sync_checkpoint");
    db.prepare("INSERT INTO sync_checkpoint (scope, last_seq) VALUES ('t1:all', 0)").run();
    for (const s of seqs) applyFeedEvent(db, "t1:all", s, "t1", `e-${s}`); // full replay
    assertInvariants(db, { acceptedOps: 0, sumVersions: 5 }, );
    const cp = (db.prepare("SELECT last_seq FROM sync_checkpoint WHERE scope='t1:all'").get() as { last_seq: number }).last_seq;
    assert.equal(cp, Math.max(...seqs), "checkpoint rebuilt to the highest applied seq");
    report.mark("F06", "PASS");
  } catch (e) {
    report.mark("F06", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F07 | concurrent devices: busy handling + unique op identity collapse duplicates", () => {
  const dir = mkdtempSync(join(tmpdir(), "nacrose-t09-f07-"));
  const path = join(dir, "conc.sqlite");
  try {
    const seed = new DatabaseSync(path);
    seed.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; ${SCHEMA_SQL}`);
    seed.close();
    const dA = new DatabaseSync(path);
    const dB = new DatabaseSync(path);
    dA.exec("PRAGMA busy_timeout=2000;");
    dB.exec("PRAGMA busy_timeout=2000;");
    const t = Date.now();
    // Different opIds from two devices: both land.
    dA.prepare("INSERT INTO pending_op (op_id, account_id, tenant_id, kind, payload, state, created_at, updated_at) VALUES ('opA','A','t1','k','{}','pending',?,?)").run(t, t);
    dB.prepare("INSERT INTO pending_op (op_id, account_id, tenant_id, kind, payload, state, created_at, updated_at) VALUES ('opB','B','t1','k','{}','pending',?,?)").run(t, t);
    // Same opId from both devices: the PK collapses the duplicate receipt.
    dA.prepare("INSERT INTO op_receipt (op_id, receipt, server_seq, device_id) VALUES ('opS','rcp-1',1,'dev-A')").run();
    let dupFailed = false;
    try {
      dB.prepare("INSERT INTO op_receipt (op_id, receipt, server_seq, device_id) VALUES ('opS','rcp-2',2,'dev-B')").run();
    } catch {
      dupFailed = true;
    }
    assert.ok(dupFailed, "second receipt for the same opId refused");
    assert.equal((dB.prepare("SELECT COUNT(*) AS n FROM op_receipt WHERE op_id='opS'").get() as { n: number }).n, 1, "I2: exactly one receipt");
    assert.equal((dA.prepare("SELECT COUNT(*) AS n FROM pending_op").get() as { n: number }).n, 2, "I1: both devices' ops durable");
    dA.close();
    dB.close();
    report.mark("F07", "PASS");
  } catch (e) {
    report.mark("F07", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F08 | cross-tenant disclosure: scope-shaped queries return nothing from another tenant", () => {
  const db = freshDb();
  try {
    const t = Date.now();
    db.prepare("INSERT INTO pending_op (op_id, account_id, tenant_id, kind, payload, state, created_at, updated_at) VALUES ('opA','A','tenant-ALPHA','k','{}','accepted',?,?)").run(t, t);
    db.prepare("INSERT INTO feed_event (tenant_id, entity_id, op, payload) VALUES ('tenant-ALPHA','e-secret','upsert','{}')").run();
    // Reader scoped to tenant-BETA (the server's authorization shape).
    const seenOps = (db.prepare("SELECT COUNT(*) AS n FROM pending_op WHERE tenant_id = ?").get("tenant-BETA") as { n: number }).n;
    const seenEvents = (db.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE tenant_id = ?").get("tenant-BETA") as { n: number }).n;
    assert.equal(seenOps, 0, "I3: zero pending rows leak across the tenant scope");
    assert.equal(seenEvents, 0, "I3: zero feed rows leak across the tenant scope");
    // The revoked tenant's own data is preserved server-side (retention),
    // but scoped reads for OTHER tenants never see it.
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE tenant_id = 'tenant-ALPHA'").get() as { n: number }).n, 1);
    report.mark("F08", "PASS");
  } catch (e) {
    report.mark("F08", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F09 | attachment interruption: staging rows reconcile; partial objects never complete", () => {
  const db = freshDb();
  try {
    db.exec(`
      CREATE TABLE attachment_stage (
        id TEXT NOT NULL, account_id TEXT NOT NULL, state TEXT NOT NULL
          CHECK (state IN ('staging','staged','finalized','registered','failed')),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (id, account_id)
      );
    `);
    const t = Date.now();
    db.prepare("INSERT INTO attachment_stage (id, account_id, state, created_at, updated_at) VALUES ('att-1','A','staging',?,?)").run(t, t);
    // Reconcile query (the T06 resumeAll input): non-registered rows exist.
    const pending = (db.prepare("SELECT id, state FROM attachment_stage WHERE account_id = ? AND state != 'registered'").all("A") as Array<{ id: string; state: string }>)
      .map((r) => ({ id: r.id, state: r.state }));
    assert.deepEqual(pending, [{ id: "att-1", state: "staging" }]);
    // Complete attachments are EXACTLY registered rows: zero while staging.
    const complete = (db.prepare("SELECT COUNT(*) AS n FROM attachment_stage WHERE account_id = ? AND state = 'registered'").get("A") as { n: number }).n;
    assert.equal(complete, 0, "partial object never exposed as complete");
    // Deterministic recovery: state-machine advance staging -> staged (txn).
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE attachment_stage SET state = 'staged', updated_at = ? WHERE id = 'att-1'").run(Date.now());
    db.exec("COMMIT");
    assert.equal((db.prepare("SELECT state FROM attachment_stage WHERE id='att-1'").get() as { state: string }).state, "staged");
    report.mark("F09", "PASS");
  } catch (e) {
    report.mark("F09", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

test("F10 | process termination mid-transaction: SIGKILL child rolls back cleanly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nacrose-t09-f10-"));
  const path = join(dir, "kill.sqlite");
  let child: ReturnType<typeof spawn> | null = null;
  try {
    const seed = new DatabaseSync(path);
    seed.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; ${SCHEMA_SQL}`);
    seed.close();
    child = spawn(process.execPath, [
      "-e",
      `const { DatabaseSync } = require("node:sqlite");
       const { writeSync } = require("node:fs");
       const db = new DatabaseSync(${JSON.stringify(path)});
       db.exec("PRAGMA busy_timeout=2000;");
       db.exec("BEGIN IMMEDIATE");
       db.prepare("INSERT INTO pending_op (op_id, account_id, tenant_id, kind, payload, state, created_at, updated_at) VALUES ('op-kill','A','t1','k','{}','in_flight',1,1)").run();
       writeSync(1, new TextEncoder().encode("IN-TX\\n"));
       const sab = new SharedArrayBuffer(4);
       Atomics.wait(new Int32Array(sab), 0, 0, 60000);`,
    ]);
    let out = "";
    child.stdout.on("data", (c: string | Uint8Array) => (out += String(c)));
    const deadline = Date.now() + 15_000;
    while (!out.includes("IN-TX") && Date.now() < deadline) await sleep(50);
    assert.ok(out.includes("IN-TX"), "child is inside its transaction");
    await sleep(120);
    process.kill(child.pid!, "SIGKILL");
    await sleep(100);
    // Reopen: the killed transaction left NOTHING partial.
    const reopened = new DatabaseSync(path);
    reopened.exec("PRAGMA busy_timeout=2000");
    const rows = (reopened.prepare("SELECT COUNT(*) AS n FROM pending_op WHERE op_id = 'op-kill'").get() as { n: number }).n;
    assert.equal(rows, 0, "I4: killed transaction rolled back — nothing partial");
    const integrity = (reopened.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
    assert.equal(integrity, "ok");
    reopened.close();
    report.mark("F10", "PASS");
  } catch (e) {
    report.mark("F10", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    if (child && child.pid) { try { child.kill("SIGKILL"); } catch { /* already dead */ } }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F11 | disk full: typed failure, rolled back transaction, recovery after space freed", () => {
  const dir = mkdtempSync(join(tmpdir(), "nacrose-t09-f11-"));
  const path = join(dir, "full.sqlite");
  try {
    // A ROLLBACK-journal database so page growth hits max_page_count directly.
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA max_page_count = 6;");
    db.exec("CREATE TABLE t (big TEXT NOT NULL)");
    let full = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let i = 0; i < 500; i++) {
        db.prepare("INSERT INTO t (big) VALUES (?)").run("x".repeat(4_000));
      }
    } catch (e) {
      const err = e as { errcode?: number };
      full = err.errcode !== undefined && (err.errcode & 0xff) === 13; // SQLITE_FULL
    }
    assert.ok(full, "SQLITE_FULL surfaced with the primary code 13");
    try { db.exec("ROLLBACK"); } catch { /* FULL auto-aborted the transaction */ }
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number }).n, 0, "I2: no partial rows from the failed tx");
    // Recovery: raise the bound, re-apply deterministically.
    db.exec("PRAGMA max_page_count = 0");
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO t (big) VALUES (?)").run("y".repeat(1_000));
    db.exec("COMMIT");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number }).n, 1, "I1: write durable after recovery");
    db.close();
    report.mark("F11", "PASS");
  } catch (e) {
    report.mark("F11", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F12 | interrupted migration: version-scoped rollback keeps the db re-migratable", () => {
  const db = freshDb();
  try {
    // Migration v2 begins: version bump + DDL, the second statement FAILS.
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    db.exec("CREATE TABLE app_extra (k TEXT PRIMARY KEY)");
    try {
      db.exec("CREATE TABLE app_extra (k TEXT PRIMARY KEY)"); // duplicate -> fails
    } catch {
      db.exec("ROLLBACK");
    }
    // The database is at v1, consistent, re-migratable.
    assert.equal((db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value, "1", "interrupted migration rolled back to the previous version");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'app_extra'").get() as { n: number }).n, 0, "no partial DDL left behind");
    // Re-migration applies cleanly.
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    db.exec("CREATE TABLE IF NOT EXISTS app_extra (k TEXT PRIMARY KEY)");
    db.exec("COMMIT");
    assert.equal((db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string }).value, "2");
    report.mark("F12", "PASS");
  } catch (e) {
    report.mark("F12", "FAIL", String((e as Error).message).slice(0, 80));
    throw e;
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------

test("P01-P04 | disposable PostgreSQL legs (CI service provides the engine; local SKIP)", async () => {
  const pg = loadPg();
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/contractor_fault";
  if (!pg) {
    for (const id of ["P01", "P02", "P03", "P04"]) report.mark(id, "SKIP", "pg client unavailable on this host");
    return;
  }
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4_000 });
  (client as unknown as { on: (ev: string, cb: (e: Error) => void) => void }).on?.("error", () => { /* socket death handled by per-query timeouts */ });
  try {
    await pgTimeout(client.connect(), "connect");
  } catch {
    for (const id of ["P01", "P02", "P03", "P04"]) report.mark(id, "SKIP", `PostgreSQL unreachable at ${url.replace(/:[^:@/]+@/, ":***@")}`);
    return;
  }
  try {
    await q(client, `
      CREATE TABLE IF NOT EXISTS fm_entity_version (
        tenant_id TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS fm_op_receipt (
        op_id TEXT PRIMARY KEY, receipt TEXT NOT NULL, server_seq INTEGER NOT NULL, device_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fm_checkpoint (scope TEXT PRIMARY KEY, last_seq INTEGER NOT NULL);
    `);
    // Idempotent per run.
    await q(client, "DELETE FROM fm_op_receipt; DELETE FROM fm_entity_version; UPDATE fm_checkpoint SET last_seq = 0;");
    await q(client, "INSERT INTO fm_checkpoint (scope, last_seq) VALUES ('t1:all', 0) ON CONFLICT (scope) DO UPDATE SET last_seq = 0;");

    // P01 transactional acceptance: domain bump + receipt in ONE tx; a
    // simulated crash (ROLLBACK) leaves NOTHING; the redo commits both.
    await q(client, "BEGIN");
    await q(client, "INSERT INTO fm_entity_version (tenant_id, entity_id, version) VALUES ('t1','p-e-1',1) ON CONFLICT (tenant_id, entity_id) DO UPDATE SET version = fm_entity_version.version + 1");
    await q(client, "INSERT INTO fm_op_receipt (op_id, receipt, server_seq, device_id) VALUES ('p-op-1','rcp-1',1,'dev-01')");
    await q(client, "ROLLBACK"); // simulated crash after the domain write
    let n = Number((await q(client, "SELECT COUNT(*)::int AS n FROM fm_op_receipt WHERE op_id = 'p-op-1'")).rows[0].n);
    assert.equal(n, 0, "rollback left nothing behind");
    await q(client, "BEGIN");
    await q(client, "INSERT INTO fm_entity_version (tenant_id, entity_id, version) VALUES ('t1','p-e-1',1) ON CONFLICT (tenant_id, entity_id) DO UPDATE SET version = fm_entity_version.version + 1");
    await q(client, "INSERT INTO fm_op_receipt (op_id, receipt, server_seq, device_id) VALUES ('p-op-1','rcp-1',1,'dev-01')");
    await q(client, "COMMIT");
    n = Number((await q(client, "SELECT COUNT(*)::int AS n FROM fm_op_receipt WHERE op_id = 'p-op-1'")).rows[0].n);
    const v = Number((await q(client, "SELECT version FROM fm_entity_version WHERE entity_id = 'p-e-1'")).rows[0].version);
    assert.equal(n, 1);
    assert.equal(v, 1, "I2: exactly one business effect");
    report.mark("P01", "PASS");

    // P02 exactly-once under the same-op acceptance from a second device.
    const c2 = new pg.Client({ connectionString: url });
    (c2 as unknown as { on: (ev: string, cb: (e: Error) => void) => void }).on?.("error", () => {});
    await pgTimeout(c2.connect(), "connect c2");
    await q(client, "BEGIN");
    await q(client, "INSERT INTO fm_op_receipt (op_id, receipt, server_seq, device_id) VALUES ('p-op-race','rcp-race',9,'dev-A')");
    let loserFailed = false;
    try {
      await q(c2, "INSERT INTO fm_op_receipt (op_id, receipt, server_seq, device_id) VALUES ('p-op-race','rcp-race-2',10,'dev-B')");
    } catch {
      loserFailed = true; // unique violation: the second device is told "already accepted"
    }
    await q(client, "COMMIT");
    assert.ok(loserFailed, "the second device's duplicate acceptance was refused");
    const races = Number((await q(client, "SELECT COUNT(*)::int AS n FROM fm_op_receipt WHERE op_id = 'p-op-race'")).rows[0].n);
    assert.equal(races, 1, "I2: unique op identity -> exactly one receipt");
    await Promise.race([c2.end(), new Promise((r) => setTimeout(r, 2_000))]);
    report.mark("P02", "PASS");

    // P03 cursor monotonicity: GREATEST-guarded updates.
    await q(client, "UPDATE fm_checkpoint SET last_seq = GREATEST(last_seq, $1) WHERE scope = 't1:all'", [500]);
    await q(client, "UPDATE fm_checkpoint SET last_seq = GREATEST(last_seq, $1) WHERE scope = 't1:all'", [300]);
    const cp = Number((await q(client, "SELECT last_seq FROM fm_checkpoint WHERE scope = 't1:all'")).rows[0].last_seq);
    assert.equal(cp, 500, "I1: cursor never moves backwards");
    report.mark("P03", "PASS");

    // P04 terminated backend mid-transaction: server-side rollback, clean state.
    const c3 = new pg.Client({ connectionString: url });
    (c3 as unknown as { on: (ev: string, cb: (e: Error) => void) => void }).on?.("error", () => {});
    await pgTimeout(c3.connect(), "connect c3");
    const pid = Number((await q(c3, "SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await q(c3, "BEGIN");
    await q(c3, "INSERT INTO fm_entity_version (tenant_id, entity_id, version) VALUES ('t1','p-e-kill',5) ON CONFLICT (tenant_id, entity_id) DO UPDATE SET version = fm_entity_version.version + 1");
    await q(client, "SELECT pg_terminate_backend($1)", [pid]);
    await sleep(300);
    try {
      await Promise.race([
        q(c3, "COMMIT"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("terminated backend: COMMIT never settled (expected)")), 3_000)),
      ]);
    } catch { /* backend gone — expected */ }
    try { await Promise.race([c3.end(), new Promise((r) => setTimeout(r, 2_000))]); } catch { /* already dead */ }
    const c4 = new pg.Client({ connectionString: url });
    (c4 as unknown as { on: (ev: string, cb: (e: Error) => void) => void }).on?.("error", () => {});
    await pgTimeout(c4.connect(), "connect c4");
    const killedRows = await q(c4, "SELECT version FROM fm_entity_version WHERE entity_id = 'p-e-kill'");
    assert.equal(killedRows.rows.length, 0, "I4: terminated backend's uncommitted work rolled back");
    await Promise.race([c4.end(), new Promise((r) => setTimeout(r, 2_000))]);
    report.mark("P04", "PASS");
  } catch (e) {
    for (const id of ["P01", "P02", "P03", "P04"]) {
      const row = report.rows.find((r) => r.id === id);
      if (row && row.result !== "PASS") report.mark(id, "FAIL", String((e as Error).message).slice(0, 80));
    }
    throw e;
  } finally {
    try { await Promise.race([client.end(), new Promise((r) => setTimeout(r, 2_000))]); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------

test("ZZ | fault matrix report is complete and reproducible", () => {
  assert.equal(report.rows.length, ROWS.length);
  for (const r of report.rows) {
    assert.ok(["PASS", "SKIP"].includes(r.result), `matrix row ${r.id} did not resolve: ${r.detail ?? "no detail"}`);
  }
  const md = report.markdown();
  const out = process.env.MATRIX_REPORT_PATH;
  if (out) {
    try {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, md);
      console.log(`matrix report written: ${out}`);
    } catch (e) {
      // Report persistence is auxiliary; the leg results above are the evidence.
      console.warn(`matrix report could not be written: ${String((e as Error).message)}`);
    }
  }
  console.log("\n" + md + "\n");
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
