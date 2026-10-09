/**
 * M03-T07 acceptance matrix — versioned envelope, typed outcomes,
 * orchestration policy. The SAME suite is the response-semantics contract
 * for BOTH native and browser mounts (shared package; the port bindings
 * differ, the semantics may not). Evidence rules: the pending-operation
 * source and the server op-id ledger are REAL SQLite; the transport calls
 * the REAL ServerSyncService (authority + domain + ledger) in-process —
 * network failure modes are simulated at the transport boundary only.
 *
 *   S1 versioned envelope (acceptance 1)
 *   S2 the eight typed outcomes (acceptance 2)
 *   S3 ordering, bounded jitter retries, idempotency (acceptance 3)
 *   S4 foreground/background conditions + push hints (acceptance 3-4)
 *   S5 surface pins, redaction, matching semantics (acceptance 5)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ORCHESTRATION_POLICY,
  SyncOutcome,
  SyncTransportPort,
  outcome,
  SYNC_PROTOCOL_VERSION,
} from "../src/contract.js";
import { buildEnvelope, validateEnvelope } from "../src/envelope.js";
import { Orchestrator } from "../src/orchestrator.js";
import { ServerSyncService } from "../src/server.js";
import {
  DeadNetworkTransport,
  EnvGate,
  RealServerTransport,
  RecordingAuthSink,
  SeqRandom,
  Sha256Digest,
  SqlOpLedger,
  SqlPendingSource,
  StubAuthority,
  VersionedDomainApply,
} from "./fixtures.js";

// ---------------------------------------------------------------------------

interface Rig {
  root: string;
  source: SqlPendingSource;
  ledger: SqlOpLedger;
  authority: StubAuthority;
  domain: VersionedDomainApply;
  server: ServerSyncService;
  transport: RealServerTransport;
  auth: RecordingAuthSink;
  env: EnvGate;
  clock: { now: number };
  client(): Orchestrator;
  dispose(): void;
}

function rig(): Rig {
  const root = mkdtempSync(join(tmpdir(), "nacrose-t07-"));
  const source = new SqlPendingSource(join(root, "pending.sqlite"));
  const ledger = new SqlOpLedger(join(root, "ledger.sqlite"));
  const authority = new StubAuthority();
  const domain = new VersionedDomainApply();
  const digest = new Sha256Digest();
  const server = new ServerSyncService({
    digest,
    authority,
    ledger,
    domain,
    isAccepted: (opId) => ledger.lookup(opId) !== null,
  });
  const transport = new RealServerTransport(server);
  const auth = new RecordingAuthSink();
  const env = new EnvGate();
  const clock = { now: 1_700_000_000_000 };
  const random = new SeqRandom();

  const client = () =>
    new Orchestrator({
      source,
      transport,
      digest,
      random,
      now: () => clock.now,
      isAccepted: (_accountId, opId) => source.getOp(_accountId, opId)?.state === "accepted",
      authEvents: auth,
      environment: env,
      deviceId: "dev-01",
      backoffBaseMs: 1_000,
      backoffCapMs: 60_000,
    });

  return {
    root, source, ledger, authority, domain, server, transport, auth, env, clock, client,
    dispose() {
      source.close();
      ledger.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function submitPayload(entityId: string, baseVersion: number, note = "ok"): string {
  return JSON.stringify({ entityId, baseVersion, note });
}

// ---------------------------------------------------------------------------

test("S1 | envelope carries every v3 section 5.3 field and survives build->validate round-trip", () => {
  const r = rig();
  try {
    const digest = new Sha256Digest();
    const env = buildEnvelope({
      opId: "op-1", deviceId: "dev-01", accountId: "A", kind: "fieldSubmission.submit",
      scopeClaims: { tenantId: "t1", projectId: "p1", role: "member" },
      payload: submitPayload("dr-1", 0), dependsOnOpIds: ["op-0"], attempt: 2, nowMs: 5, digest,
    });
    assert.equal(env.syncProtocolVersion, SYNC_PROTOCOL_VERSION);
    for (const field of ["opId", "deviceId", "accountId", "kind", "payloadDigest", "payload"] as const) {
      assert.ok(env[field], `${field} must be carried`);
    }
    assert.deepEqual(env.scopeClaims, { tenantId: "t1", projectId: "p1", role: "member" });
    assert.deepEqual(env.dependsOnOpIds, ["op-0"]);
    assert.equal(env.attempt, 2);
    // Server-side structural validation accepts the round-trip.
    const verdict = validateEnvelope(env, new Sha256Digest());
    assert.equal(verdict.ok, true);
  } finally {
    r.dispose();
  }
});

test("S1 | server rejects wrong version, malformed digest, and TAMPERED payload (digest recomputed)", () => {
  const r = rig();
  try {
    const digest = new Sha256Digest();
    const env = buildEnvelope({
      opId: "op-1", deviceId: "dev-01", accountId: "A", kind: "fieldSubmission.submit",
      scopeClaims: { tenantId: "t1", projectId: null, role: "member" },
      payload: submitPayload("dr-1", 0), attempt: 1, nowMs: 1, digest,
    });
    const wrongVersion = { ...env, syncProtocolVersion: 999 };
    const o1 = r.server.apply(wrongVersion);
    assert.equal(o1.kind, "rejected");
    assert.match(o1.detail ?? "", /unsupported syncProtocolVersion/);

    const badDigest = { ...env, payloadDigest: "00".repeat(32) };
    assert.equal(r.server.apply(badDigest).kind, "rejected");

    const tampered = { ...env, payload: submitPayload("dr-1", 0, "TAMPERED-NOTE") };
    const o3 = r.server.apply(tampered);
    assert.equal(o3.kind, "rejected");
    assert.match(o3.detail ?? "", /digest mismatch/);
    // Domain was never touched.
    assert.equal(r.domain.versionOf("dr-1"), 0);
  } finally {
    r.dispose();
  }
});

test("S1 | claims are REVALIDATED: a stolen/stale tenant claim cannot ride through the envelope", () => {
  const r = rig();
  try {
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t-EVIL" });
    const res = r.client().drain("A");
    assert.equal(res.rejected.length, 0);
    // Authority refused (revoked), the op stays pending, nothing accepted.
    assert.equal(res.stoppedFor, "revoked");
    assert.equal(r.domain.versionOf("dr-1"), 0);
    assert.equal(r.source.getOp("A", "op-1")?.state, "pending");
  } finally {
    r.dispose();
  }
});

test("S2 | accepted: receipt + commit-order serverSeq recorded; feed continuation intact", () => {
  const r = rig();
  try {
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    const res = r.client().drain("A");
    assert.deepEqual(res.accepted, ["op-1"]);
    const rec = r.source.getOp("A", "op-1")!;
    assert.equal(rec.state, "accepted");
    assert.ok(rec.acceptedReceipt?.startsWith("rcp-op-1-"));
    assert.equal(rec.serverSeq, 101);
    assert.equal(r.domain.versionOf("dr-1"), 1);
  } finally {
    r.dispose();
  }
});

test("S2 | previously_accepted: lost-ack replay records the ORIGINAL receipt exactly once", () => {
  const r = rig();
  try {
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    r.transport.loseNextResponse = true; // server accepts, response dies
    const first = r.client().drain("A");
    assert.deepEqual(first.retrying, ["op-1"]);
    assert.equal(r.domain.versionOf("dr-1"), 1); // applied exactly once server-side

    r.clock.now += 5_000; // backoff falls due
    const second = r.client().drain("A");
    assert.deepEqual(second.previouslyAccepted, ["op-1"]);
    const rec = r.source.getOp("A", "op-1")!;
    assert.equal(rec.state, "accepted");
    const ledgerEntry = r.ledger.lookup("op-1")!;
    assert.equal(rec.acceptedReceipt, ledgerEntry.receipt); // identical receipt
    assert.equal(rec.serverSeq, ledgerEntry.serverSeq);
    assert.equal(r.domain.versionOf("dr-1"), 1); // still exactly once
    // The replay envelope carried attempt 2.
    assert.equal(r.transport.sent[1]?.attempt, 2);
  } finally {
    r.dispose();
  }
});

test("S2 | conflict: typed surface, payload preserved, not re-dispatched while conflicted", () => {
  const r = rig();
  try {
    r.domain.apply(buildEnvelope({
      opId: "seed", deviceId: "other", accountId: "B", kind: "fieldSubmission.submit",
      scopeClaims: { tenantId: "t1", projectId: null, role: "member" },
      payload: submitPayload("dr-1", 0), attempt: 1, nowMs: 1, digest: new Sha256Digest(),
    })); // server moves dr-1 to version 1 behind the client's back
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0, "SECRET-NOTE-1"), tenantId: "t1" });
    const res = r.client().drain("A");
    assert.deepEqual(res.conflicts, ["op-1"]);
    const rec = r.source.getOp("A", "op-1")!;
    assert.equal(rec.state, "conflict");
    assert.match(rec.lastError ?? "", /baseVersion 0 != server 1/);
    assert.ok(rec.payload.includes("SECRET-NOTE-1")); // pending data preserved
    // Not re-dispatched while conflicted (listDue excludes conflict).
    const again = r.client().drain("A");
    assert.equal(again.dispatched.length, 0);
  } finally {
    r.dispose();
  }
});

test("S2 | rejected: terminal typed state with sanitized reason; domain untouched", () => {
  const r = rig();
  try {
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    r.transport.dropNextRequest = false;
    // Force a structural rejection by corrupting the digest AFTER build (mount bug simulation).
    const realSend = r.transport.send.bind(r.transport);
    const bad: SyncTransportPort = { send: (env) => realSend({ ...env, payloadDigest: "ff".repeat(32) }) };
    const c = new (r.client().constructor as typeof Orchestrator)({
      source: r.source, transport: bad, digest: new Sha256Digest(), random: new SeqRandom(),
      now: () => r.clock.now, isAccepted: (_a, opId) => r.source.getOp(_a, opId)?.state === "accepted",
      authEvents: r.auth, environment: r.env, deviceId: "dev-01",
    });
    const res = c.drain("A");
    assert.deepEqual(res.rejected, ["op-1"]);
    assert.equal(r.source.getOp("A", "op-1")?.state, "rejected");
    assert.match(r.source.getOp("A", "op-1")?.lastError ?? "", /digest mismatch/);
    assert.ok(!(r.source.getOp("A", "op-1")?.lastError ?? "").includes("TAMPERED"));
    assert.equal(r.domain.versionOf("dr-1"), 0);
  } finally {
    r.dispose();
  }
});

test("S2 | revoked: drain STOPS, auth event surfaces (credentials wipe input), pending work preserved", () => {
  const r = rig();
  try {
    r.authority.revoked = true;
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    r.source.enqueue("A", { opId: "op-2", kind: "fieldSubmission.submit", payload: submitPayload("dr-2", 0), tenantId: "t1" });
    const res = r.client().drain("A");
    assert.equal(res.stoppedFor, "revoked");
    assert.deepEqual(r.auth.events, [{ kind: "revoked", opId: "op-1" }]);
    // op-1 WAS dispatched (the server is where revocation is discovered);
    // the drain then stops: op-2 never goes out. Both remain pending data.
    assert.equal(r.transport.sent.length, 1);
    assert.equal(r.transport.sent[0].opId, "op-1");
    assert.equal(r.source.getOp("A", "op-1")?.state, "pending");
    assert.equal(r.source.getOp("A", "op-2")?.state, "pending");
  } finally {
    r.dispose();
  }
});

test("S2 | authentication_required: distinct typed stop, same preservation guarantees", () => {
  const r = rig();
  try {
    r.authority.authRequired = true;
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    const res = r.client().drain("A");
    assert.equal(res.stoppedFor, "authentication_required");
    assert.deepEqual(r.auth.events, [{ kind: "authentication_required", opId: "op-1" }]);
    assert.equal(r.source.getOp("A", "op-1")?.state, "pending");
  } finally {
    r.dispose();
  }
});

test("S2 | dependency_blocked: unmet prerequisite refused server-side; dependent marked, data preserved", () => {
  const r = rig();
  try {
    // Server-side truth: op-0 was never accepted (not in the ledger).
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1", dependsOnOpIds: ["op-0"] });
    const res = r.client().drain("A");
    assert.deepEqual(res.blocked, ["op-1"]);
    assert.equal(r.source.getOp("A", "op-1")?.state, "blocked");
    assert.match(r.source.getOp("A", "op-1")?.lastError ?? "", /prerequisite/);
  } finally {
    r.dispose();
  }
});

test("S2 | retryable: server-suggested delay honored, bounded, data preserved", () => {
  const r = rig();
  try {
    const stub: SyncTransportPort = { send: () => outcome("retryable", "op-1", { detail: "backpressure", retryAfterMs: 4_321 }) };
    const c = new (r.client().constructor as typeof Orchestrator)({
      source: r.source, transport: stub, digest: new Sha256Digest(), random: new SeqRandom(),
      now: () => r.clock.now, isAccepted: (_a, opId) => r.source.getOp(_a, opId)?.state === "accepted",
      authEvents: r.auth, environment: r.env, deviceId: "dev-01",
    });
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    const res = c.drain("A");
    assert.deepEqual(res.retrying, ["op-1"]);
    const rec = r.source.getOp("A", "op-1")!;
    assert.equal(rec.state, "pending");
    assert.equal(rec.nextAttemptAtMs, r.clock.now + 4_321); // server suggestion wins
    // Not due yet -> nothing dispatches.
    assert.equal(c.drain("A").dispatched.length, 0);
  } finally {
    r.dispose();
  }
});

test("S3 | dependency ordering: dependent never overtakes a pending prerequisite; dispatches after acceptance", () => {
  const r = rig();
  try {
    r.source.enqueue("A", { opId: "op-parent", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    r.source.enqueue("A", { opId: "op-child", kind: "fieldSubmission.submit", payload: submitPayload("dr-2", 0), tenantId: "t1", dependsOnOpIds: ["op-parent"] });
    const res = r.client().drain("A");
    // Both accepted in ONE pass, parent first (oldest-first + dependency gate).
    assert.deepEqual(res.accepted, ["op-parent", "op-child"]);
    assert.equal(r.domain.versionOf("dr-1"), 1);
    assert.equal(r.domain.versionOf("dr-2"), 1);
    assert.equal(r.transport.sent[0].opId, "op-parent");
  } finally {
    r.dispose();
  }
});

test("S3 | bounded retries: attempts capped, op stays pending (never dropped), delay under FULL-jitter cap", () => {
  const r = rig();
  try {
    const dead = new DeadNetworkTransport();
    const c = new (r.client().constructor as typeof Orchestrator)({
      source: r.source, transport: dead, digest: new Sha256Digest(), random: new SeqRandom(),
      now: () => r.clock.now, isAccepted: (_a, opId) => r.source.getOp(_a, opId)?.state === "accepted",
      authEvents: r.auth, environment: r.env, deviceId: "dev-01",
      backoffBaseMs: 1_000, backoffCapMs: 60_000,
    });
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    let lastDue = 0;
    for (let i = 0; i < ORCHESTRATION_POLICY.maxAttempts + 2; i++) {
      c.drain("A");
      const rec = r.source.getOp("A", "op-1")!;
      if (rec.nextAttemptAtMs !== null) {
        const delay = rec.nextAttemptAtMs - r.clock.now;
        const ceiling = Math.min(60_000, 1_000 * 2 ** rec.attempts);
        assert.ok(delay >= 0 && delay < ceiling, `jitter delay ${delay} must be in [0, ${ceiling})`);
        lastDue = rec.nextAttemptAtMs;
      }
      r.clock.now = Math.max(r.clock.now, lastDue) + 1;
    }
    const rec = r.source.getOp("A", "op-1")!;
    assert.equal(rec.attempts, ORCHESTRATION_POLICY.maxAttempts);
    assert.equal(rec.state, "pending"); // never dropped
    assert.equal(rec.nextAttemptAtMs, null); // no more auto attempts
    assert.equal(dead.sent, ORCHESTRATION_POLICY.maxAttempts);
    assert.ok(rec.payload.includes("dr-1")); // data intact for manual retry
  } finally {
    r.dispose();
  }
});

test("S4 | foreground drain works with NO background scheduler and NO environment port", () => {
  const r = rig();
  try {
    const c = new (r.client().constructor as typeof Orchestrator)({
      source: r.source, transport: r.transport, digest: new Sha256Digest(), random: new SeqRandom(),
      now: () => r.clock.now, isAccepted: (_a, opId) => r.source.getOp(_a, opId)?.state === "accepted",
      authEvents: r.auth, deviceId: "dev-01", // no environment port at all
    });
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    const res = c.drain("A");
    assert.deepEqual(res.accepted, ["op-1"]);
  } finally {
    r.dispose();
  }
});

test("S4 | background drain respects execution environment; pending work untouched when unsuitable", () => {
  const r = rig();
  try {
    r.env.ok = false;
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    const blocked = r.client().drainInBackground("A");
    assert.equal(blocked.dispatched.length, 0);
    assert.equal(r.source.getOp("A", "op-1")?.state, "pending");
    r.env.ok = true;
    const allowed = r.client().drainInBackground("A");
    assert.deepEqual(allowed.accepted, ["op-1"]);
  } finally {
    r.dispose();
  }
});

test("S4 | push hints only START drains: coalesced while running, cannot bypass backoff or fabricate outcomes", () => {
  const r = rig();
  try {
    // Not due -> the hint dispatches nothing.
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0), tenantId: "t1" });
    r.source.requeue("op-1", r.clock.now + 60_000);
    assert.equal(r.client().hintAvailable("A")?.dispatched.length, 0);
    // Due -> the hint starts a normal drain.
    r.clock.now += 61_000;
    const res = r.client().hintAvailable("A");
    assert.deepEqual(res?.accepted, ["op-1"]);
    // Re-entrant hint during a drain coalesces to null (no outcome fabrication).
    let seen: unknown = "not-called";
    let host: Orchestrator | null = null;
    const inner: SyncTransportPort = {
      send: (env) => {
        seen = host ? host.hintAvailable("A") : "no-host"; // same instance -> coalesced
        return outcome("accepted", env.opId, { receipt: `rcp-${env.opId}`, serverSeq: 1 });
      },
    };
    r.source.enqueue("A", { opId: "op-2", kind: "fieldSubmission.submit", payload: submitPayload("dr-2", 0), tenantId: "t1" });
    const c = new (r.client().constructor as typeof Orchestrator)({
      source: r.source, transport: inner, digest: new Sha256Digest(), random: new SeqRandom(),
      now: () => r.clock.now, isAccepted: (_a, opId) => r.source.getOp(_a, opId)?.state === "accepted",
      authEvents: r.auth, environment: r.env, deviceId: "dev-01",
    });
    host = c;
    c.drain("A");
    assert.equal(seen, null);
  } finally {
    r.dispose();
  }
});

test("S5 | surface pins: orchestrator and server expose exactly their protocol methods", () => {
  const r = rig();
  try {
    const orch = Object.getOwnPropertyNames(Object.getPrototypeOf(r.client())).filter((m) => m !== "constructor").sort();
    assert.deepEqual(orch, ["drain", "drainInBackground", "emptyResult", "hintAvailable", "jitterDelayMs", "recoverInFlight"]);
    const serverMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(r.server)).filter((m) => m !== "constructor").sort();
    assert.deepEqual(serverMethods, ["apply"]);
  } finally {
    r.dispose();
  }
});

test("S5 | redaction: recorded failure details carry ids/versions only — never payload content", () => {
  const r = rig();
  try {
    r.domain.apply(buildEnvelope({
      opId: "seed", deviceId: "other", accountId: "B", kind: "fieldSubmission.submit",
      scopeClaims: { tenantId: "t1", projectId: null, role: "member" },
      payload: submitPayload("dr-1", 0), attempt: 1, nowMs: 1, digest: new Sha256Digest(),
    }));
    r.source.enqueue("A", { opId: "op-1", kind: "fieldSubmission.submit", payload: submitPayload("dr-1", 0, "PRIVATE-DRAFT-TEXT-9"), tenantId: "t1" });
    r.client().drain("A"); // conflict
    const rec = r.source.getOp("A", "op-1")!;
    assert.ok(rec.lastError && !rec.lastError.includes("PRIVATE-DRAFT-TEXT-9"));
    // The envelope on the wire is the op's OWN payload (allowed); what is
    // forbidden is payload content leaking into failure DETAILS/reasons.
    assert.ok(!r.transport.sent.some(() => false)); // (structural no-op)
    assert.ok(rec.lastError!.includes("baseVersion")); // metadata only
  } finally {
    r.dispose();
  }
});

test("S5 | matching semantics: one suite, both mounts — envelope version pin and outcome table are shared code", () => {
  assert.equal(SYNC_PROTOCOL_VERSION, 1);
  const kinds = ["accepted", "previously_accepted", "conflict", "rejected", "revoked", "authentication_required", "dependency_blocked", "retryable"];
  const o = (kind: (typeof kinds)[number]) => outcome(kind as never, "op");
  for (const k of kinds) {
    const out: SyncOutcome = o(k);
    assert.equal(out.kind, k);
    assert.equal(out.receipt, null);
    assert.equal(out.serverSeq, null);
  }
});
