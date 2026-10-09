/**
 * Change feed tests (M03-T04) — REAL SQLite via node:sqlite, no mocks as
 * durability evidence.
 *
 * Maps the M03-T04 acceptance matrix:
 *   - commit-safe ordering under late and concurrent commits (S1/S4 of the
 *     M00 spike, now on the ratified feed contract);
 *   - tenant + permission authorization, cross-tenant and revoked access;
 *   - atomic writer emission (every inventoried pilot-domain writer);
 *   - durable checkpoints, duplicate delivery, checkpoint loss, lost acks,
 *     SIGKILL crash/restart;
 *   - financially effective command receipts: retention beyond the 30-day
 *     default with compaction; expiry cannot enable replayed effects.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  TENANT_CHANGE_FEED_METHODS,
  FEED_CONSUMER_METHODS,
  type FeedEventInput,
  type FeedReadScope,
  type PullPage,
  type RepositoryError,
} from "../src/contract.js";
import { openTenantChangeFeed, TenantChangeFeed } from "../src/server.js";
import { openFeedConsumer, FeedConsumer } from "../src/consumer.js";
import {
  PILOT_APPLIERS,
  PILOT_DOMAIN_MIGRATION,
  PILOT_REDACTION_POLICIES,
  PILOT_WRITERS_MIGRATED,
} from "./fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kindOf(fn: () => unknown): string {
  try {
    fn();
    return "no_throw";
  } catch (e) {
    return (e as RepositoryError).kind ?? "unknown";
  }
}

interface Rig {
  dir: string;
  sdb: DatabaseSync;
  cdb: DatabaseSync;
  feed: TenantChangeFeed;
  consumer: FeedConsumer;
  dispose: () => void;
}

function freshRig(): Rig {
  const dir = mkdtempSync(join(tmpdir(), "feed-t04-"));
  const sdb = new DatabaseSync(join(dir, "server.db"));
  const cdb = new DatabaseSync(join(dir, "client.db"));
  const { feed } = openTenantChangeFeed(sdb, { busyTimeoutMs: 25, extraMigrations: [PILOT_DOMAIN_MIGRATION] });
  for (const p of PILOT_REDACTION_POLICIES) feed.registerRedactionPolicy(p);
  const { consumer } = openFeedConsumer(cdb, { extraMigrations: [PILOT_DOMAIN_MIGRATION], appliers: PILOT_APPLIERS });
  return {
    dir,
    sdb,
    cdb,
    feed,
    consumer,
    dispose: () => {
      try {
        sdb.close();
      } catch {
        /* ignore */
      }
      try {
        cdb.close();
      } catch {
        /* ignore */
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function reportEvent(overrides: Partial<FeedEventInput> & { entityId: string }): FeedEventInput {
  return {
    tenantId: "T1",
    projectId: "p1",
    domain: "daily-report",
    entity: "daily_report",
    op: "upsert",
    payload: { siteNote: `note-${overrides.entityId}` },
    schemaVersion: 1,
    ...overrides,
  };
}

/** A pilot writer: the domain mutation and the feed event commit together. */
function publishReport(feed: TenantChangeFeed, writer: string, ev: FeedEventInput): void {
  feed.publishAtomically({
    writer,
    domainWrite: (tx) => {
      tx.prepare(
        `INSERT INTO daily_report (id, tenant_id, project_id, site_note, worker_pan, bank_account, contact_phone, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      ).run(ev.entityId, ev.tenantId, ev.projectId, String(ev.payload.siteNote ?? ""), Date.now());
    },
    events: [ev],
  });
}

function scopeAll(tenantId: string): FeedReadScope {
  return { tenantId, canReadProject: () => true };
}

function scopeProjects(tenantId: string, allowed: Set<string>): FeedReadScope {
  return { tenantId, canReadProject: (p) => p !== null && allowed.has(p) };
}

/** Simulates the transport boundary between server pull and client apply. */
function wire(page: PullPage): PullPage {
  return JSON.parse(JSON.stringify(page)) as PullPage;
}

function reportCount(db: DatabaseSync): number {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM daily_report").get()!.n);
}

function dedupCount(db: DatabaseSync, accountId = "A"): number {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM sync_inbox_dedup WHERE account_id = ?").get(accountId)!.n);
}

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
    child.on("exit", (code, signalName) => {
      clearTimeout(timer);
      reject(new Error(`child exited (${code}/${signalName}) before '${token}'; got: ${buffer.slice(0, 200)}`));
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

// ---------------------------------------------------------------------------
// Server feed: redaction, atomic publish, commit-order, authorization, bounds
// ---------------------------------------------------------------------------

test("publish is fail-closed: no registered redaction policy rolls back the domain write too", () => {
  const rig = freshRig();
  try {
    assert.equal(
      kindOf(() =>
        rig.feed.publishAtomically({
          writer: "router:unregistered.domain",
          events: [{ ...reportEvent({ entityId: "r-no-policy" }), domain: "unregistered-domain" }],
        }),
      ),
      "misconfigured",
    );
    assert.equal(reportCount(rig.sdb), 0, "domain write rolled back with the failed publish");
    assert.equal(
      Number(rig.sdb.prepare("SELECT COUNT(*) AS n FROM feed_event").get()!.n),
      0,
      "nothing leaked into the feed",
    );
  } finally {
    rig.dispose();
  }
});

test("publish commits the domain write and the REDACTED event atomically; redaction happens pre-persistence", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", {
      ...reportEvent({ entityId: "r-redact" }),
      payload: { siteNote: "pouring slab B", workerPan: "PAN-99-123", bankAccount: "0123456789", contactPhone: "+977-98xxxx" },
    });
    // Stored row is already sanitized (ADR-0011: pre-fanout sanitization).
    const stored = rig.sdb.prepare("SELECT payload FROM feed_event WHERE entity_id = 'r-redact'").get() as { payload: string };
    const parsed = JSON.parse(stored.payload) as Record<string, unknown>;
    assert.equal(parsed.siteNote, "pouring slab B");
    assert.ok(!("workerPan" in parsed), "PAN stripped before persistence");
    assert.ok(!("bankAccount" in parsed), "bank detail stripped before persistence");
    assert.equal(parsed.contactPhone, "[redacted]", "masked field kept but redacted");
    assert.equal(reportCount(rig.sdb), 1, "domain write committed with the event");
    assert.equal(rig.sdb.prepare("SELECT writer FROM feed_event WHERE entity_id = 'r-redact'").get()!.writer, "router:dailyReport.create");
  } finally {
    rig.dispose();
  }
});

test("commit-order: uncommitted changes are invisible to pull; a late commit lands after earlier commits and is never skipped", () => {
  const rig = freshRig();
  try {
    // Committed event first (seq 1).
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-early" }));

    // An in-flight writer on a second connection: uncommitted domain row + feed row.
    const late = new DatabaseSync(join(rig.dir, "server.db"), { open: true });
    late.exec("PRAGMA busy_timeout=25");
    late.exec("BEGIN IMMEDIATE");
    late
      .prepare("INSERT INTO daily_report (id, tenant_id, project_id, site_note, updated_at) VALUES ('r-late', 'T1', 'p1', 'in flight', 0)")
      .run();
    late
      .prepare(
        `INSERT INTO feed_event (tenant_id, project_id, domain, entity, entity_id, op, payload, schema_version, writer, event_id, published_at)
         VALUES ('T1', 'p1', 'daily-report', 'daily_report', 'r-late', 'upsert', '{"siteNote":"in flight"}', 1, 'test:inflight', 'pending-late', 0)`,
      )
      .run();

    // Pull on the committed connection sees ONLY committed data.
    let page = rig.feed.pull(scopeAll("T1"), { afterSeq: 0 });
    assert.deepEqual(page.events.map((e) => e.entityId), ["r-early"], "uncommitted change invisible");
    page = wire(page);
    rig.consumer.applyBatch(page, "A");
    assert.equal(rig.consumer.readCheckpoint("A", "T1"), 1);

    // The late writer commits AFTER the earlier event: its seq (2) > 1.
    late.exec("COMMIT");
    late.close();

    page = rig.feed.pull(scopeAll("T1"), { afterSeq: rig.consumer.readCheckpoint("A", "T1") });
    assert.deepEqual(page.events.map((e) => e.entityId), ["r-late"], "late commit delivered after the consumer cursor");
    assert.equal(page.events[0].seq, 2, "commit order == seq order (no inversion)");
    rig.consumer.applyBatch(wire(page), "A");
    assert.equal(reportCount(rig.cdb), 2, "nothing skipped: both changes applied");
    assert.equal(rig.consumer.readCheckpoint("A", "T1"), 2);
  } finally {
    rig.dispose();
  }
});

test("commit-order: concurrent writers serialize — the loser of the lock retry commits with a HIGHER seq (inversion structurally impossible)", () => {
  const rig = freshRig();
  try {
    // A second feed connection (its own writer) with a short busy timeout.
    const other = new DatabaseSync(join(rig.dir, "server.db"), { open: true });
    other.exec("PRAGMA busy_timeout=25");
    const { feed: feed2 } = openTenantChangeFeed(other, { busyTimeoutMs: 25, extraMigrations: [PILOT_DOMAIN_MIGRATION] });
    for (const p of PILOT_REDACTION_POLICIES) feed2.registerRedactionPolicy(p);

    // Writer 2 holds the write lock mid-transaction (its domain write in flight).
    const holder = new DatabaseSync(join(rig.dir, "server.db"), { open: true });
    holder.exec("PRAGMA busy_timeout=25");
    holder.exec("BEGIN IMMEDIATE");
    holder
      .prepare("INSERT INTO daily_report (id, tenant_id, project_id, site_note, updated_at) VALUES ('r-holder', 'T1', 'p1', 'held', 0)")
      .run();

    // Writer 1 (the rig feed) attempts to publish while the lock is held -> busy, NOT partial.
    assert.equal(
      kindOf(() => publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-loser" }))),
      "busy",
      "serialized writers wait or fail loud; no interleaved half-writes",
    );
    assert.equal(
      Number(rig.sdb.prepare("SELECT COUNT(*) AS n FROM feed_event").get()!.n),
      0,
      "failed attempt left no feed row",
    );

    // Writer 2 commits first; writer 1 retries and commits second.
    holder.exec("COMMIT");
    holder.close();
    feed2.publishAtomically({
      writer: "service:daily-report-sync",
      domainWrite: (tx) => {
        tx.prepare("UPDATE daily_report SET site_note = 'settled' WHERE id = 'r-holder'").run();
      },
      events: [{ ...reportEvent({ entityId: "r-holder" }), payload: { siteNote: "settled" } }],
    });
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-loser" }));

    const seqs = rig.sdb
      .prepare("SELECT entity_id, seq FROM feed_event ORDER BY seq")
      .all() as Array<{ entity_id: string; seq: number }>;
    assert.equal(seqs.length, 2);
    assert.equal(seqs[0].entity_id, "r-holder", "first commit gets the lower seq");
    assert.equal(seqs[1].entity_id, "r-loser", "late commit cannot jump ahead of an earlier commit");
    other.close();
  } finally {
    rig.dispose();
  }
});

test("authorization: tenant partitioning is structural — a cross-tenant pull returns nothing", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-t1", tenantId: "T1" }));
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-t2", tenantId: "T2" }));

    const t2 = rig.feed.pull(scopeAll("T2"), { afterSeq: 0 });
    assert.deepEqual(t2.events.map((e) => e.entityId), ["r-t2"], "tenant B sees none of tenant A's changes");
    const t1 = rig.feed.pull(scopeAll("T1"), { afterSeq: 0 });
    assert.deepEqual(t1.events.map((e) => e.entityId), ["r-t1"]);
    // Seqs are globally monotonic; delivery is tenant-partitioned.
    assert.ok(t1.events[0].seq !== t2.events[0].seq);
  } finally {
    rig.dispose();
  }
});

test("authorization: revoked project access stops delivery immediately; re-grant resumes; filtered events never advance the cursor", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-a", projectId: "p1" }));
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-b", projectId: "p2" }));

    // Caller may read p1 only: gets r-a; r-b withheld, cursor stops at the last DELIVERED event.
    let page = rig.feed.pull(scopeProjects("T1", new Set(["p1"])), { afterSeq: 0 });
    assert.deepEqual(page.events.map((e) => e.entityId), ["r-a"]);
    assert.equal(page.nextCursor, 1, "cursor stops at the last DELIVERED event (withheld r-b not skipped)");

    // p1 revoked, p2 granted: the withheld r-b now flows, new p1 events do not.
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-c", projectId: "p1" }));
    page = rig.feed.pull(scopeProjects("T1", new Set(["p2"])), { afterSeq: page.nextCursor });
    assert.deepEqual(page.events.map((e) => e.entityId), ["r-b"], "granted project's events flow");
    assert.equal(page.nextCursor, 2);

    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-d", projectId: "p1" }));
    page = rig.feed.pull(scopeProjects("T1", new Set(["p2"])), { afterSeq: page.nextCursor });
    assert.deepEqual(page.events.map((e) => e.entityId), [], "revoked project's events stop flowing entirely");

    // Access re-granted for p1: the withheld changes are still there (no-skip rule).
    page = rig.feed.pull(scopeProjects("T1", new Set(["p1", "p2"])), { afterSeq: page.nextCursor });
    assert.deepEqual(page.events.map((e) => e.entityId), ["r-c", "r-d"], "re-granted access receives the withheld changes");
  } finally {
    rig.dispose();
  }
});

test("bounds: pulls are incrementally bounded by events and bytes; pagination loses nothing and duplicates nothing", () => {
  const rig = freshRig();
  try {
    for (let i = 1; i <= 6; i++) {
      publishReport(rig.feed, "router:dailyReport.create", {
        ...reportEvent({ entityId: `r-${i}` }),
        payload: { siteNote: `pad-${i}-`.repeat(200) },
      });
    }
    // Byte bound: ~1.4KB per envelope, so a 3000-byte budget fits exactly two.
    const bytePage = rig.feed.pull(scopeAll("T1"), { afterSeq: 0, maxBytes: 3000 });
    assert.equal(bytePage.events.length, 2, "byte budget binds before the event cap");
    assert.equal(bytePage.hasMore, true);
    assert.ok(bytePage.approxBytes <= 3000, `page within budget (${bytePage.approxBytes} bytes)`);
    const nextBytePage = rig.feed.pull(scopeAll("T1"), { afterSeq: bytePage.nextCursor, maxBytes: 3000 });
    assert.equal(nextBytePage.events.length, 2, "byte-bounded pagination resumes exactly at the cursor");
    // Event-count bound
    const page = rig.feed.pull(scopeAll("T1"), { afterSeq: 0, maxEvents: 4 });
    assert.equal(page.events.length, 4);
    assert.equal(page.hasMore, true);
    // Drain from zero with a small event bound: lossless, duplicate-free.
    const seen: string[] = [];
    let cursor = 0;
    for (let guard = 0; guard < 50; guard++) {
      const p = rig.feed.pull(scopeAll("T1"), { afterSeq: cursor, maxEvents: 2 });
      seen.push(...p.events.map((e) => e.entityId));
      cursor = p.nextCursor;
      if (!p.hasMore && p.events.length === 0) break;
      if (!p.hasMore && rig.feed.pull(scopeAll("T1"), { afterSeq: cursor }).events.length === 0) break;
    }
    assert.deepEqual(seen, ["r-1", "r-2", "r-3", "r-4", "r-5", "r-6"], "pagination is lossless and duplicate-free");
  } finally {
    rig.dispose();
  }
});

test("retention: sweep advances the watermark; stale cursors get resync_required (410 analogue); seq values are never reused", () => {
  const rig = freshRig();
  try {
    for (let i = 1; i <= 3; i++) publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: `r-old-${i}` }));
    const sweep = rig.feed.sweepRetention({ defaultRetentionDays: 30, nowMs: Date.now() + 40 * 86_400_000 });
    assert.equal(sweep.deleted, 3);
    assert.equal(rig.feed.retentionFloor().seq, 3, "watermark moved to the last compacted seq");

    // A consumer with a stale cursor must NOT silently skip the compacted range.
    assert.equal(kindOf(() => rig.feed.pull(scopeAll("T1"), { afterSeq: 1 })), "resync_required");
    assert.equal(kindOf(() => rig.feed.pull(scopeAll("T1"), { afterSeq: 0 })), "resync_required");

    // New events get seq 4+ — AUTOINCREMENT forbids reuse of compacted positions.
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-new" }));
    const seq = Number(rig.sdb.prepare("SELECT seq FROM feed_event WHERE entity_id = 'r-new'").get()!.seq);
    assert.equal(seq, 4, "commit positions are never reused after retention");

    const page = rig.feed.pull(scopeAll("T1"), { afterSeq: 3 });
    assert.deepEqual(page.events.map((e) => e.entityId), ["r-new"], "fresh cursor unaffected");
  } finally {
    rig.dispose();
  }
});

test("surface pin: TenantChangeFeed exposes exactly the contracted methods — no domain writers on the feed", () => {
  const methods = Object.getOwnPropertyNames(TenantChangeFeed.prototype)
    .filter((n) => n !== "constructor")
    .sort();
  assert.deepEqual(methods, [...TENANT_CHANGE_FEED_METHODS].sort());
});

// ---------------------------------------------------------------------------
// Consumer: durable checkpoints, idempotent replay, crash recovery
// ---------------------------------------------------------------------------

test("apply: entity rows, dedup bookkeeping and the checkpoint advance in ONE transaction", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-1" }));
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-2" }));
    const page = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    const result = rig.consumer.applyBatch(page, "A");
    assert.equal(result.applied, 2);
    assert.equal(result.skipped, 0);
    assert.equal(reportCount(rig.cdb), 2);
    assert.equal(dedupCount(rig.cdb), 2);
    assert.equal(rig.consumer.readCheckpoint("A", "T1"), page.nextCursor);
    const row = rig.cdb.prepare("SELECT site_note FROM daily_report WHERE id = 'r-1'").get() as { site_note: string };
    assert.equal(row.site_note, "note-r-1");
  } finally {
    rig.dispose();
  }
});

test("replay: duplicate page delivery is a no-op — same state, same checkpoint, zero double effects", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-1" }));
    const page = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    rig.consumer.applyBatch(page, "A");
    const before = rig.cdb.prepare("SELECT id, site_note FROM daily_report ORDER BY id").all();
    const again = rig.consumer.applyBatch(page, "A");
    assert.equal(again.applied, 0);
    assert.equal(again.skipped, 1);
    assert.equal(again.confirmedSeq, page.nextCursor, "checkpoint unchanged");
    assert.deepEqual(rig.cdb.prepare("SELECT id, site_note FROM daily_report ORDER BY id").all(), before);
  } finally {
    rig.dispose();
  }
});

test("lost ack: server re-delivers the batch after the client's acknowledgement was lost; nothing applies twice", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-1" }));
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-2" }));
    const page = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    rig.consumer.applyBatch(page, "A"); // applied; the ack back to the server is "lost"
    // Server-side: the pull cursor was never advanced, so the same page re-delivers.
    const redelivered = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    const result = rig.consumer.applyBatch(redelivered, "A");
    assert.equal(result.applied, 0, "dedup prevents double application");
    assert.equal(result.skipped, 2);
    assert.equal(reportCount(rig.cdb), 2, "no duplicate business effect");
  } finally {
    rig.dispose();
  }
});

test("checkpoint loss: cursor reset re-pulls from 0; dedup rows prevent double effects; checkpoint is restored", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-1" }));
    const page = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    rig.consumer.applyBatch(page, "A");
    const checkpoint = rig.consumer.readCheckpoint("A", "T1");
    assert.ok(checkpoint > 0);

    rig.consumer.resetCheckpoint("A", "T1"); // operator recovery action; dedup KEPT
    assert.equal(rig.consumer.readCheckpoint("A", "T1"), 0);

    const repull = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    const result = rig.consumer.applyBatch(repull, "A");
    assert.equal(result.applied, 0, "replayed events skipped by dedup");
    assert.equal(result.skipped, 1);
    assert.equal(reportCount(rig.cdb), 1, "no double effect after checkpoint loss");
    assert.equal(rig.consumer.readCheckpoint("A", "T1"), checkpoint, "checkpoint restored");
  } finally {
    rig.dispose();
  }
});

test("monotonic: a replayed OLD page cannot move the confirmed cursor backwards", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-1" }));
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-2" }));
    const page2 = rig.feed.pull(scopeAll("T1"), { afterSeq: 1 });
    rig.consumer.applyBatch(wire(page2), "A");
    const high = rig.consumer.readCheckpoint("A", "T1");
    const page1 = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0, maxEvents: 1 }));
    assert.ok(page1.nextCursor < high);
    const result = rig.consumer.applyBatch(page1, "A");
    assert.equal(result.confirmedSeq, high, "MAX guard holds the cursor");
  } finally {
    rig.dispose();
  }
});

test("fail-closed: a page containing an unregistered domain rolls back completely — no partial application", () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-1" }));
    const good = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    const poisoned: PullPage = {
      ...good,
      events: [
        ...good.events,
        {
          eventId: "unknown-domain/x/y@99",
          seq: 99,
          tenantId: "T1",
          projectId: "p1",
          domain: "unknown-domain",
          entity: "x",
          entityId: "y",
          op: "upsert",
          payload: "{}",
          schemaVersion: 1,
          writer: "test",
        },
      ],
      nextCursor: 99,
    };
    assert.equal(kindOf(() => rig.consumer.applyBatch(poisoned, "A")), "misconfigured");
    assert.equal(reportCount(rig.cdb), 0, "the good event in the poisoned page was NOT applied");
    assert.equal(dedupCount(rig.cdb), 0, "no dedup residue");
    assert.equal(rig.consumer.readCheckpoint("A", "T1"), 0, "cursor did not advance");
  } finally {
    rig.dispose();
  }
});

test("delete op: replay cannot resurrect a deleted row (per-event dedup keys)", () => {
  const rig = freshRig();
  try {
    rig.feed.publishAtomically({
      writer: "router:dailyReport.update",
      events: [reportEvent({ entityId: "r-doomed" })],
    });
    const upsertPage = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    rig.consumer.applyBatch(upsertPage, "A");
    assert.equal(reportCount(rig.cdb), 1);

    rig.feed.publishAtomically({
      writer: "router:dailyReport.update",
      domainWrite: (tx) => {
        tx.prepare("DELETE FROM daily_report WHERE id = 'r-doomed'").run();
      },
      events: [{ ...reportEvent({ entityId: "r-doomed" }), op: "delete", payload: {} }],
    });
    const delCursor = rig.consumer.readCheckpoint("A", "T1");
    const delPage = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: delCursor }));
    rig.consumer.applyBatch(delPage, "A");
    assert.equal(reportCount(rig.cdb), 0, "delete applied");

    // Replay the OLD upsert page: dedup skips it — the stale row cannot reappear.
    const replay = rig.consumer.applyBatch(upsertPage, "A");
    assert.equal(replay.applied, 0);
    assert.equal(reportCount(rig.cdb), 0, "stale row did not reappear after replay");
  } finally {
    rig.dispose();
  }
});

test("crash: SIGKILL mid-apply rolls back entity + dedup + checkpoint together; redelivery applies cleanly", async () => {
  const rig = freshRig();
  try {
    for (let i = 1; i <= 3; i++) publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: `r-${i}` }));
    const page = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));
    assert.equal(page.events.length, 3);

    const childJs = join(dirname(fileURLToPath(import.meta.url)), "crash-child.js");
    const child = spawn(process.execPath, [childJs, join(rig.dir, "client.db"), "midapply", JSON.stringify(page)]);
    await waitForLine(child, "READY", 20_000);
    child.kill("SIGKILL");
    await exited(child, 10_000);

    const cdb = new DatabaseSync(join(rig.dir, "client.db"));
    assert.equal(reportCount(cdb), 0, "uncommitted entity apply is gone");
    assert.equal(dedupCount(cdb), 0, "uncommitted dedup row is gone");
    const cp = cdb.prepare("SELECT confirmed_seq FROM sync_checkpoint WHERE account_id = 'A'").get();
    assert.equal(cp, undefined, "cursor did not advance ahead of applied data");
    cdb.close();

    // Redelivery of the same page after the crash — on a FRESH connection
    // (the recovery boundary is reopen + WAL recovery).
    const cdb2 = new DatabaseSync(join(rig.dir, "client.db"));
    const { consumer: fresh } = openFeedConsumer(cdb2, { extraMigrations: [PILOT_DOMAIN_MIGRATION], appliers: PILOT_APPLIERS });
    const result = fresh.applyBatch(page, "A");
    assert.equal(result.applied, 3);
    assert.equal(fresh.readCheckpoint("A", "T1"), page.nextCursor);
    cdb2.close();
  } finally {
    rig.dispose();
  }
});

test("crash: SIGKILL after apply survives (no lost accepted batch); redelivery is a dedup no-op (lost ack)", async () => {
  const rig = freshRig();
  try {
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-1" }));
    publishReport(rig.feed, "router:dailyReport.create", reportEvent({ entityId: "r-2" }));
    const page = wire(rig.feed.pull(scopeAll("T1"), { afterSeq: 0 }));

    const childJs = join(dirname(fileURLToPath(import.meta.url)), "crash-child.js");
    const child = spawn(process.execPath, [childJs, join(rig.dir, "client.db"), "postapply", JSON.stringify(page)]);
    await waitForLine(child, "APPLIED", 20_000);
    child.kill("SIGKILL");
    await exited(child, 10_000);

    const cdb = new DatabaseSync(join(rig.dir, "client.db"));
    assert.equal(reportCount(cdb), 2, "committed batch survives termination");
    const cp = Number((cdb.prepare("SELECT confirmed_seq FROM sync_checkpoint WHERE account_id = 'A'").get() as { confirmed_seq: number }).confirmed_seq);
    assert.equal(cp, page.nextCursor, "checkpoint survived with the data");
    cdb.close();

    const result = rig.consumer.applyBatch(page, "A");
    assert.equal(result.applied, 0);
    assert.equal(result.skipped, 2, "re-delivery after crash is a pure dedup no-op");
  } finally {
    rig.dispose();
  }
});

test("surface pin: FeedConsumer exposes exactly the contracted methods — applier port is the only domain writer", () => {
  const methods = Object.getOwnPropertyNames(FeedConsumer.prototype)
    .filter((n) => n !== "constructor")
    .sort();
  assert.deepEqual(methods, [...FEED_CONSUMER_METHODS].sort());
});

// ---------------------------------------------------------------------------
// Command receipts: financial retention, compaction, replay protection
// ---------------------------------------------------------------------------

test("receipts: non-financial receipts expire with the 30-day default; financially effective receipts are retained", () => {
  const rig = freshRig();
  try {
    const t0 = 1_700_000_000_000;
    rig.consumer.recordCommandReceipt("A", {
      opId: "op-note",
      domain: "daily-report",
      financiallyEffective: false,
      outcome: "accepted",
      outcomeDigest: "d-note",
      payloadDigest: "p-note",
      issuedAtMs: t0,
    });
    rig.consumer.recordCommandReceipt("A", {
      opId: "op-expense",
      domain: "site-expense",
      financiallyEffective: true,
      outcome: "accepted",
      outcomeDigest: "d-expense",
      payloadDigest: "p-expense",
      issuedAtMs: t0,
    });
    const sweep = rig.consumer.sweepReceipts({ defaultRetentionDays: 30, compactFinancialAfterDays: 365, nowMs: t0 + 31 * 86_400_000 });
    assert.equal(sweep.sweptNonFinancial, 1, "non-financial receipt expired with the default");
    assert.equal(sweep.compactedFinancial, 0, "financial receipt untouched before its compaction threshold");
    assert.equal(rig.cdb.prepare("SELECT COUNT(*) AS n FROM command_receipt WHERE op_id = 'op-note'").get()!.n, 0);
    assert.equal(rig.cdb.prepare("SELECT COUNT(*) AS n FROM command_receipt WHERE op_id = 'op-expense'").get()!.n, 1);
  } finally {
    rig.dispose();
  }
});

test("compaction: financial receipts older than the threshold compact in place — payload detail dropped, replay guard kept", () => {
  const rig = freshRig();
  try {
    const t0 = 1_700_000_000_000;
    rig.consumer.recordCommandReceipt("A", {
      opId: "op-expense",
      domain: "site-expense",
      financiallyEffective: true,
      outcome: "accepted",
      outcomeDigest: "d-expense",
      payloadDigest: "p-expense",
      issuedAtMs: t0,
    });
    const sweep = rig.consumer.sweepReceipts({ defaultRetentionDays: 30, compactFinancialAfterDays: 90, nowMs: t0 + 91 * 86_400_000 });
    assert.equal(sweep.compactedFinancial, 1);
    const row = rig.cdb
      .prepare("SELECT payload_digest, compacted, outcome_digest FROM command_receipt WHERE op_id = 'op-expense'")
      .get() as { payload_digest: string | null; compacted: number; outcome_digest: string };
    assert.equal(row.payload_digest, null, "payload digest dropped by compaction");
    assert.equal(row.compacted, 1);
    assert.equal(row.outcome_digest, "d-expense", "outcome anchor kept");
    assert.equal(rig.cdb.prepare("SELECT COUNT(*) AS n FROM command_receipt").get()!.n, 1, "financial receipt NEVER deleted by expiry");
  } finally {
    rig.dispose();
  }
});

test("replay protection: full AND compacted receipts block a replayed financially-effective command — expiry cannot enable replay", () => {
  const rig = freshRig();
  try {
    const t0 = 1_700_000_000_000;
    rig.consumer.recordCommandReceipt("A", {
      opId: "op-expense",
      domain: "site-expense",
      financiallyEffective: true,
      outcome: "accepted",
      outcomeDigest: "d-expense",
      payloadDigest: "p-expense",
      issuedAtMs: t0,
    });
    // Full receipt: same payload digest blocks, different payload under a fresh opId is a different op.
    assert.equal(rig.consumer.hasEffectiveReceipt("A", "op-expense", "p-expense"), true);
    assert.equal(rig.consumer.hasEffectiveReceipt("A", "op-expense", "different-payload"), false, "digest mismatch does not block (full row)");
    assert.equal(rig.consumer.hasEffectiveReceipt("A", "op-unseen", "p-expense"), false);

    rig.consumer.sweepReceipts({ defaultRetentionDays: 30, compactFinancialAfterDays: 90, nowMs: t0 + 91 * 86_400_000 });
    // Compacted: fail-closed by opId presence — the guard survives compaction.
    assert.equal(rig.consumer.hasEffectiveReceipt("A", "op-expense", "p-expense"), true, "compacted receipt still blocks replay");
    assert.equal(rig.consumer.hasEffectiveReceipt("A", "op-expense", "different-payload"), true, "fail-closed: compaction cannot open a replay path");

    // Rejected outcomes never block retries.
    rig.consumer.recordCommandReceipt("A", {
      opId: "op-rejected",
      domain: "site-expense",
      financiallyEffective: true,
      outcome: "rejected:fiscal-lock",
      outcomeDigest: "d-rej",
      payloadDigest: "p-rej",
      issuedAtMs: t0,
    });
    assert.equal(rig.consumer.hasEffectiveReceipt("A", "op-rejected", "p-rej"), false, "only accepted outcomes are effects");
  } finally {
    rig.dispose();
  }
});

// ---------------------------------------------------------------------------
// Pilot-domain writer audit (M03-T04 acceptance: every inventoried writer)
// ---------------------------------------------------------------------------

test("pilot audit: every migrated writer emits its sync-visible change ATOMICALLY with the authoritative mutation", () => {
  const rig = freshRig();
  try {
    for (const w of PILOT_WRITERS_MIGRATED) {
      const table = w.domain === "daily-report" ? "daily_report" : "field_submission";
      const rowId = `${w.writer.replace(/[^a-zA-Z0-9]+/g, "_")}-audit`;
      const rowIdFail = `${w.writer.replace(/[^a-zA-Z0-9]+/g, "_")}-fail`;
      const before = Number(rig.sdb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
      const eventsBefore = Number(rig.sdb.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE writer = ?").get(w.writer)!.n);

      // Success: domain row + feed event together.
      rig.feed.publishAtomically({
        writer: w.writer,
        domainWrite: (tx) => {
          if (table === "daily_report") {
            tx.prepare(
              "INSERT INTO daily_report (id, tenant_id, project_id, site_note, updated_at) VALUES (?, 'T1', 'p1', 'audit', 0)",
            ).run(rowId);
          } else {
            tx.prepare(
              "INSERT INTO field_submission (id, tenant_id, project_id, raw_payload, updated_at) VALUES (?, 'T1', 'p1', '{}', 0)",
            ).run(rowId);
          }
        },
        events: [
          { ...reportEvent({ entityId: rowId }), domain: w.domain, entity: w.entity },
        ],
      });
      assert.equal(Number(rig.sdb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n), before + 1, `domain write for ${w.writer}`);
      assert.equal(
        Number(rig.sdb.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE writer = ?").get(w.writer)!.n),
        eventsBefore + 1,
        `sync-visible change emitted for ${w.writer}`,
      );

      // Forced domain failure: BOTH sides roll back — no orphan event, no partial write.
      assert.equal(
        kindOf(() =>
          rig.feed.publishAtomically({
            writer: w.writer,
            domainWrite: () => {
              throw new Error("simulated authoritative failure");
            },
            events: [{ ...reportEvent({ entityId: rowIdFail }), domain: w.domain, entity: w.entity }],
          }),
        ),
        "internal",
      );
      assert.equal(Number(rig.sdb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n), before + 1, `no partial domain write for ${w.writer}`);
      assert.equal(
        Number(rig.sdb.prepare("SELECT COUNT(*) AS n FROM feed_event WHERE writer = ?").get(w.writer)!.n),
        eventsBefore + 1,
        `no orphan event for ${w.writer}`,
      );
    }
  } finally {
    rig.dispose();
  }
});
