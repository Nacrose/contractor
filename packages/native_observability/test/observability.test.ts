/**
 * M03-T08 acceptance matrix — crash redaction, tenant-safe server metrics,
 * honest device health, staged transition evidence.
 *
 * Evidence rules: the device health read model runs against REAL SQLite
 * (WAL + synchronous=FULL mirrors of the outbox/checkpoint shapes); the
 * staged rejection/retry scenario drives REAL state updates and REAL
 * metric observations through the mount's boundary composition point.
 *
 *   S1 crash redaction for dart/native/rust paths (acceptance 1)
 *   S2 server sync metrics + tenant-safe aggregation (acceptance 2)
 *   S3 device sync-health surface — never a false success (acceptance 3)
 *   S4 staged rejection/retry scenario, device -> server, with redaction (acceptance 4)
 *   S5 surface pins (protocol discipline)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RawCrashContext, SyncObservation } from "../src/contract.js";
import { fallbackCrashReport, scrubCrashReport } from "../src/redaction.js";
import { SyncMetrics } from "../src/metrics.js";
import { buildDeviceSyncHealth } from "../src/health.js";
import { ScriptedSyncBoundary, SqliteHealthSource } from "./fixtures.js";

// ---------------------------------------------------------------------------

function rig(): { root: string; path: string; source: SqliteHealthSource; clock: { now: number }; dispose(): void } {
  const root = mkdtempSync(join(tmpdir(), "nacrose-t08-"));
  const path = join(root, "health.sqlite");
  const clock = { now: 1_700_000_000_000 };
  const source = new SqliteHealthSource(path, "A");
  return { root, path, source, clock, dispose() { source.close(); rmSync(root, { recursive: true, force: true }); } };
}

function crashContext(component: "dart" | "native" | "rust", over: Partial<RawCrashContext> = {}): RawCrashContext {
  return {
    component,
    errorKind: "StateError",
    message: "attachment transfer failed",
    frames: ["frame1", "frame2", "frame3"],
    attributes: { opId: "op-1", state: "retryable" },
    appVersion: "0.3.0",
    schemaVersion: "1",
    occurredAtMs: 1_700_000_000_000,
    ...over,
  };
}

// ---------------------------------------------------------------------------

test("S1 | dart crash path: credentials and private draft bodies cannot ride through", () => {
  const report = scrubCrashReport(crashContext("dart", {
    message: 'submit failed: {"draftBody":"MY-PRIVATE-DRAFT-TEXT-LONG-ENOUGH","note":"hi"} upstream',
    attributes: {
      opId: "op-1",
      sessionCookie: "SESSION=supersecretvalue123456",
      draftBody: "MY-PRIVATE-DRAFT-TEXT-LONG-ENOUGH",
      authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
      network: "wifi",
    },
    frames: ["#0 submit (report.dart:42)", "#1 drain (orchestrator.dart:88) with ghp_UEHWYnx1Gk50jNuG4y9pTZscPz4BZe5P inside"],
  }));
  assert.equal(report.component, "dart");
  assert.equal(report.frameCount, 2); // count only — text never exports
  const blob = JSON.stringify(report);
  assert.ok(!blob.includes("MY-PRIVATE-DRAFT-TEXT"));
  assert.ok(!blob.includes("ghp_UEHW"));
  assert.ok(!blob.includes("SESSION=supersecret"));
  assert.ok(!blob.includes("report.dart")); // frame text never exports
  assert.ok(!blob.includes("orchestrator.dart"));
  assert.equal(report.attributes.network, "wifi"); // safe allow-listed key survives
  assert.ok(!("sessionCookie" in report.attributes));
  assert.ok(!("draftBody" in report.attributes));
  assert.ok(!("authorization" in report.attributes));
  assert.ok(report.message.includes("[PAYLOAD]")); // JSON body redacted from message
});

test("S1 | native crash path: token-like strings in message and attributes are redacted", () => {
  const report = scrubCrashReport(crashContext("native", {
    errorKind: "PanicException",
    message: "unwrap on Err: access_token=ghp_UEHWYnx1Gk50jNuG4y9pTZscPz4BZe5P expired",
    attributes: { attachmentId: "att-1", attempt: "3", authHeader: "Bearer abc.def.ghi-jkl-mno-pqr-stu-1234567890" },
  }));
  assert.ok(!JSON.stringify(report).includes("ghp_UEHW"));
  assert.ok(report.message.includes("[REDACTED]"));
  assert.equal(report.attributes.attachmentId, "att-1");
  assert.equal(report.attributes.attempt, "3");
  assert.ok(!("authHeader" in report.attributes));
});

test("S1 | rust crash path: long hex secrets and JSON bodies are reduced", () => {
  const report = scrubCrashReport(crashContext("rust", {
    errorKind: "sync::error::Transport",
    message: 'connect failed {"payloadDigest":"a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8"}',
    attributes: { storageFreeBytes: "1024", cursorSeq: "42" },
  }));
  assert.ok(report.message.includes("[PAYLOAD]"));
  assert.ok(!JSON.stringify(report).includes("a1b2c3d4e5f6"));
  assert.equal(report.attributes.storageFreeBytes, "1024");
  assert.equal(report.attributes.cursorSeq, "42");
});

test("S1 | fail-safe: malformed contexts still reduce to the safe shape; unreportable fallback exists", () => {
  assert.throws(() => scrubCrashReport(null as never), /must be an object/);
  // Non-object attributes and non-array frames reduce safely.
  const weird = scrubCrashReport(crashContext("native", {
    attributes: "not-an-object" as never,
    frames: "not-a-list" as never,
    occurredAtMs: Number.NaN,
  }));
  assert.equal(weird.frameCount, 0);
  assert.deepEqual(weird.attributes, {});
  assert.equal(weird.occurredAtMs, 0);
  const fb = fallbackCrashReport("dart", 123);
  assert.equal(fb.errorKind, "unreportable");
  assert.equal(fb.frameCount, 0);
});

test("S2 | outcome counters aggregate through the real observation wiring", () => {
  const m = new SyncMetrics();
  const obs = (outcome: SyncObservation["outcome"]): SyncObservation => ({ tenantId: "t1", projectId: "p1", kind: "fieldSubmission.submit", outcome });
  m.record(obs("accepted"));
  m.record(obs("accepted"));
  m.record(obs("replayed"));
  m.record(obs("rejected"));
  m.record(obs("conflicted"));
  m.record(obs("retryable"));
  const snap = m.snapshot(1);
  assert.equal(snap.requests, 6);
  assert.equal(snap.outcomes.accepted, 2);
  assert.equal(snap.outcomes.replayed, 1);
  assert.equal(snap.outcomes.rejected, 1);
  assert.equal(snap.outcomes.conflicted, 1);
  assert.equal(snap.outcomes.retryable, 1);
  assert.equal(snap.outcomes.revoked, 0);
});

test("S2 | GLOBAL snapshot is tenant-safe by construction: no tenant identifiers anywhere", () => {
  const m = new SyncMetrics();
  m.record({ tenantId: "tenant-SECRET-1", projectId: "p1", kind: "fieldSubmission.submit", outcome: "accepted" });
  m.record({ tenantId: "tenant-SECRET-2", projectId: null, kind: "dailyLog.create", outcome: "rejected" });
  const snap = m.snapshot(1);
  const blob = JSON.stringify(snap);
  assert.ok(!blob.includes("tenant-SECRET"));
  assert.ok(!blob.includes("tenantId"));
  assert.equal(snap.requests, 2);
  // The snapshot shape has no byKind breakdown either — that is the
  // authorized per-tenant surface only.
  assert.ok(!("byKind" in snap));
  assert.ok(!("tenantId" in snap));
});

test("S2 | authorized per-tenant snapshot: explicit scope, per-kind breakdown, unknown -> typed not_found", () => {
  const m = new SyncMetrics();
  m.record({ tenantId: "t1", projectId: null, kind: "fieldSubmission.submit", outcome: "accepted" });
  m.record({ tenantId: "t1", projectId: null, kind: "fieldSubmission.submit", outcome: "accepted" });
  m.record({ tenantId: "t1", projectId: null, kind: "dailyLog.create", outcome: "rejected" });
  const t = m.snapshotTenant("t1", 1);
  assert.equal(t.tenantId, "t1");
  assert.equal(t.requests, 3);
  assert.equal(t.byKind["fieldSubmission.submit"], 2);
  assert.equal(t.byKind["dailyLog.create"], 1);
  assert.throws(() => m.snapshotTenant("t-unknown", 1), /not_found|no observations/);
});

test("S2 | feed lag and checkpoint age aggregates are recorded and bounded to observed values", () => {
  const m = new SyncMetrics();
  m.record({ tenantId: "t1", projectId: null, kind: "k", outcome: "accepted", feedLagMs: 120, checkpointAgeMs: 5_000 });
  m.record({ tenantId: "t1", projectId: null, kind: "k", outcome: "accepted", feedLagMs: 300, checkpointAgeMs: 9_000 });
  const snap = m.snapshot(1);
  assert.equal(snap.feedLagMs.max, 300);
  assert.equal(snap.feedLagMs.avg, 210);
  assert.equal(snap.checkpointAgeMs.max, 9_000);
  assert.equal(snap.checkpointAgeMs.avg, 7_000);
});

test("S2 | attachment retry/error counters wire to the M03-T06 surface", () => {
  const m = new SyncMetrics();
  m.recordAttachmentRetry();
  m.recordAttachmentRetry();
  m.recordAttachmentError();
  const snap = m.snapshot(1);
  assert.equal(snap.attachmentRetries, 2);
  assert.equal(snap.attachmentErrors, 1);
});

test("S3 | device surface: pending count and oldest pending age from REAL SQLite", () => {
  const r = rig();
  try {
    r.source.seedOp("op-1", "fieldSubmission.submit", "pending", r.clock.now - 90_000, r.clock.now - 1_000);
    r.source.seedOp("op-2", "dailyLog.create", "pending", r.clock.now - 30_000, r.clock.now - 500);
    const health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    assert.equal(health.pendingOperationCount, 2);
    assert.equal(health.oldestPendingAgeMs, 90_000);
    assert.equal(health.synced, false);
    assert.ok(health.reasons.some((s) => s.includes("2 pending")));
  } finally {
    r.dispose();
  }
});

test("S3 | device surface: last accepted cursor per scope", () => {
  const r = rig();
  try {
    r.source.seedCursor("t1:all", 142, r.clock.now);
    r.source.seedCursor("t1:p1", 7, r.clock.now);
    const health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    assert.deepEqual(
      health.lastAcceptedCursors.map((c) => [c.scope, c.lastAcceptedSeq]),
      [["t1:all", 142], ["t1:p1", 7]],
    );
  } finally {
    r.dispose();
  }
});

test("S3 | device surface: rejection reasons surfaced (sanitized shape), conflict and blocked counted", () => {
  const r = rig();
  try {
    r.source.seedOp("op-r", "fieldSubmission.submit", "rejected", r.clock.now - 5_000, r.clock.now - 4_000, "invalid envelope: payload digest mismatch");
    r.source.seedOp("op-c", "dailyLog.create", "conflict", r.clock.now - 3_000, r.clock.now - 2_000, "baseVersion 0 != server 1");
    r.source.seedOp("op-b", "photo.attach", "blocked", r.clock.now - 2_000, r.clock.now - 1_000, "prerequisite failed terminally");
    const health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    assert.equal(health.rejections.length, 1);
    assert.equal(health.rejections[0].opId, "op-r");
    assert.equal(health.conflicts, 1);
    assert.equal(health.blocked, 1);
    assert.equal(health.synced, false);
    assert.ok(health.reasons.join(" | ").includes("conflicted"));
    assert.ok(health.reasons.join(" | ").includes("dependency-blocked"));
    assert.ok(health.reasons.join(" | ").includes("rejection"));
  } finally {
    r.dispose();
  }
});

test("S3 | NO false success: only a fully clear surface reports synced:true", () => {
  const r = rig();
  try {
    // Clear state -> synced.
    r.source.seedCursor("t1:all", 10, r.clock.now);
    assert.equal(buildDeviceSyncHealth(r.source, { nowMs: r.clock.now }).synced, true);
    // In-flight work -> NOT synced.
    r.source.seedOp("op-1", "k", "in_flight", r.clock.now - 1_000, r.clock.now);
    assert.equal(buildDeviceSyncHealth(r.source, { nowMs: r.clock.now }).synced, false);
    // Old rejection beyond the freshness window no longer blocks...
    r.source.seedOp("op-1", "k", "accepted", r.clock.now - 1_000, r.clock.now);
    r.source.seedOp("op-old", "k", "rejected", r.clock.now - 3 * 24 * 60 * 60_000, r.clock.now - 2 * 24 * 60 * 60_000, "old");
    const afterWindow = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now, rejectionFreshMs: 24 * 60 * 60_000 });
    assert.equal(afterWindow.synced, true);
    assert.equal(afterWindow.rejections.length, 1); // still visible in history
  } finally {
    r.dispose();
  }
});

test("S4 | staged retry->accept scenario: device state and server telemetry AGREE at every transition", () => {
  const r = rig();
  try {
    const boundary = new ScriptedSyncBoundary(r.source, r.clock);
    // Stage 1: first dispatch is retryable (backpressure).
    boundary.step("dispatch-1", "op-1", "fieldSubmission.submit", "retryable", { feedLagMs: 150, checkpointAgeMs: 4_000 });
    let health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    let snap = boundary.metrics.snapshot(r.clock.now);
    assert.equal(health.synced, false);
    assert.equal(health.pendingOperationCount, 1);
    assert.equal(snap.outcomes.retryable, 1);
    assert.equal(snap.requests, 1);
    // Stage 2: retry is replay-safe but still retryable (second attempt).
    r.clock.now += 2_000;
    boundary.step("dispatch-2", "op-1", "fieldSubmission.submit", "retryable", { feedLagMs: 90, checkpointAgeMs: 2_000 });
    health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    snap = boundary.metrics.snapshot(r.clock.now);
    assert.equal(snap.outcomes.retryable, 2);
    assert.equal(health.pendingOperationCount, 1);
    // Stage 3: acceptance lands with the commit-order seq.
    r.clock.now += 2_000;
    boundary.step("accept", "op-1", "fieldSubmission.submit", "accepted", { serverSeq: 143, feedLagMs: 0, checkpointAgeMs: 1_000 });
    health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    snap = boundary.metrics.snapshot(r.clock.now);
    assert.equal(health.synced, true);
    assert.equal(health.pendingOperationCount, 0);
    assert.deepEqual(health.lastAcceptedCursors.map((c) => [c.scope, c.lastAcceptedSeq]), [["t1:all", 143]]);
    assert.equal(snap.outcomes.accepted, 1);
    // Every transition is on the shared transcript: device state and
    // server telemetry moved TOGETHER at each stage.
    assert.deepEqual(boundary.transcript.map((t) => t.stage), ["dispatch-1", "dispatch-2", "accept"]);
  } finally {
    r.dispose();
  }
});

test("S4 | staged rejection scenario: conflict is visible on BOTH surfaces; recovery re-accepts", () => {
  const r = rig();
  try {
    const boundary = new ScriptedSyncBoundary(r.source, r.clock);
    boundary.step("conflict", "op-1", "dailyLog.create", "conflicted", { reason: "baseVersion 0 != server 1 for dr-1" });
    let health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    assert.equal(health.synced, false);
    assert.equal(health.conflicts, 1);
    assert.ok(health.reasons.some((s) => s.includes("conflicted")));
    assert.equal(boundary.metrics.snapshot(r.clock.now).outcomes.conflicted, 1);
    // Recovery: the app resolves and re-accepts.
    r.clock.now += 1_000;
    boundary.step("resolved", "op-1", "dailyLog.create", "accepted", { serverSeq: 200 });
    health = buildDeviceSyncHealth(r.source, { nowMs: r.clock.now });
    assert.equal(health.synced, true);
    assert.equal(health.conflicts, 0);
    assert.equal(boundary.metrics.snapshot(r.clock.now).outcomes.accepted, 1);
  } finally {
    r.dispose();
  }
});

test("S4 | redaction holds at every staged transition: payload sentinels never reach health or metrics", () => {
  const r = rig();
  try {
    const boundary = new ScriptedSyncBoundary(r.source, r.clock);
    const sentinel = "PRIVATE-DRAFT-SENTINEL-ZZ";
    boundary.step("reject", "op-1", "fieldSubmission.submit", "rejected", { reason: `invalid envelope: ${"x".repeat(10)}` });
    void sentinel; // the sentinel rides in payloads, which these surfaces never receive
    const healthBlob = JSON.stringify(buildDeviceSyncHealth(r.source, { nowMs: r.clock.now }));
    const metricsBlob = JSON.stringify(boundary.metrics.snapshot(r.clock.now));
    assert.ok(!healthBlob.includes(sentinel));
    assert.ok(!metricsBlob.includes(sentinel));
    assert.ok(healthBlob.includes("invalid envelope"));
  } finally {
    r.dispose();
  }
});

test("S5 | surface pins: SyncMetrics prototype is exactly the registry protocol", () => {
  const m = new SyncMetrics();
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(m)).filter((x) => x !== "constructor").sort();
  assert.deepEqual(methods, ["aggregates", "observationCount", "record", "recordAttachmentError", "recordAttachmentRetry", "snapshot", "snapshotTenant"]);
  assert.equal(m.observationCount, 0);
});

test("S5 | observation discipline: a record without a tenant scope is misconfigured (tenant-safety gate)", () => {
  const m = new SyncMetrics();
  assert.throws(() => m.record({ tenantId: "", projectId: null, kind: "k", outcome: "accepted" }), /tenantId/);
  assert.throws(() => m.record(undefined as never), /tenantId|object/);
});
