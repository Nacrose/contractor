/**
 * Contract compatibility + guard-boundary tests (M03-T01 acceptance):
 *  - supported and rejected protocol versions;
 *  - malformed input (envelope structure, operation id, missing requestId);
 *  - authorization failures (unauthenticated, tenant mismatch);
 *  - guards demonstrably preserved at the boundary: any rejection happens
 *    BEFORE dispatch — the authoritative service is never invoked.
 *
 * Run: tsc --project tsconfig.json && node .test-build/test/contract.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  AdapterRequest,
  GUARD_ORDER,
  adapterError,
  resolveVersion,
  validateEnvelope,
  VersionPolicy,
} from "../src/contract.js";
import {
  NativeAdapterConfig,
  createNativeAdapter,
  identityGuard,
  rateLimitGuard,
  tenantScopeGuard,
} from "../src/adapter.js";
import { SEED_OPERATIONS } from "../src/registry.js";
import { parseVersion } from "../src/version.js";

const POLICY: VersionPolicy = { supported: [parseVersion("1.1.0")!, parseVersion("1.0.0")!] };

function baseRequest(overrides: Partial<AdapterRequest> = {}): AdapterRequest {
  return {
    protocolVersion: "1.1.0",
    operationId: "dashboard.summary",
    auth: { authenticated: true, organizationId: "org-1", userId: "user-1" },
    payload: { projectId: "proj-1" },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<NativeAdapterConfig> = {}): NativeAdapterConfig & { dispatches: string[] } {
  const dispatches: string[] = [];
  const config: NativeAdapterConfig = {
    versionPolicy: POLICY,
    operations: SEED_OPERATIONS,
    guards: {
      identity: identityGuard,
      tenantScope: tenantScopeGuard("org-1"),
      rateLimit: rateLimitGuard(() => 5),
      projectMembership: { name: "projectMembership", check: () => ({ ok: true }) },
      projectPermission: { name: "projectPermission", check: () => ({ ok: true }) },
      capability: { name: "capability", check: () => ({ ok: true }) },
      inputReferences: { name: "inputReferences", check: () => ({ ok: true }) },
      delegation: { name: "delegation", check: () => ({ ok: true }) },
      financial: { name: "financial", check: () => ({ ok: true }) },
      fiscalLock: { name: "fiscalLock", check: () => ({ ok: true }) },
      idempotency: { name: "idempotency", check: () => ({ ok: true }) },
    },
    dispatch: async ({ operationId, service }) => {
      dispatches.push(`${operationId}->${service}`);
      return { echoed: operationId };
    },
  };
  return Object.assign(config, { dispatches });
}

// ---------------------------------------------------------------------------
// Version compatibility
// ---------------------------------------------------------------------------

test("supported versions resolve exactly (1.1.0 and 1.0.0)", () => {
  assert.equal(resolveVersion("1.1.0", POLICY).ok, true);
  assert.equal(resolveVersion("1.0.0", POLICY).ok, true);
});

test("rejected: unserved minor within served major", () => {
  const r = resolveVersion("1.2.0", POLICY);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.code, "version_unsupported");
    assert.match(r.error.detail!.supported, /1\.1\.0/);
  }
});

test("rejected: different major (breaking change requires client upgrade)", () => {
  const r = resolveVersion("2.0.0", POLICY);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.code, "version_unsupported");
    assert.match(r.error.message, /major 2/);
    assert.equal(r.error.trpcCode, "BAD_REQUEST");
  }
});

// ---------------------------------------------------------------------------
// Malformed envelope
// ---------------------------------------------------------------------------

test("rejected: malformed protocolVersion", () => {
  const err = validateEnvelope(baseRequest({ protocolVersion: "latest" }));
  assert.equal(err?.code, "malformed_envelope");
});

test("rejected: non-namespaced operationId", () => {
  assert.equal(validateEnvelope(baseRequest({ operationId: "submit" }))?.code, "malformed_envelope");
  assert.equal(validateEnvelope(baseRequest({ operationId: "Router.procedure" }))?.code, "malformed_envelope");
});

test("rejected: missing auth block (identity evidence is not client-optional)", () => {
  const bad = baseRequest();
  delete (bad as Partial<AdapterRequest>).auth;
  assert.equal(validateEnvelope(bad as AdapterRequest)?.code, "malformed_envelope");
});

test("rejected: mutation without durable requestId (idempotency carrier)", async () => {
  const cfg = makeConfig();
  const adapter = createNativeAdapter(cfg);
  const res = await adapter.handle(baseRequest({ operationId: "siteExpense.create", requestId: undefined }));
  assert.equal(res.kind, "error");
  if (res.kind === "error") {
    assert.equal(res.error.code, "malformed_envelope");
    assert.match(res.error.message, /requestId/);
  }
  assert.equal(cfg.dispatches.length, 0, "no dispatch on malformed mutation envelope");
});

// ---------------------------------------------------------------------------
// Authorization failures — guards preserved at the boundary
// ---------------------------------------------------------------------------

test("rejected: unauthenticated caller gets unauthorized, dispatch never runs", async () => {
  const cfg = makeConfig();
  const adapter = createNativeAdapter(cfg);
  const res = await adapter.handle(baseRequest({ auth: { authenticated: false } }));
  assert.equal(res.kind, "error");
  if (res.kind === "error") {
    assert.equal(res.error.code, "unauthorized");
    assert.equal(res.error.trpcCode, "UNAUTHORIZED");
  }
  assert.equal(cfg.dispatches.length, 0);
});

test("rejected: tenant mismatch gets forbidden, dispatch never runs", async () => {
  const cfg = makeConfig();
  const adapter = createNativeAdapter(cfg);
  const res = await adapter.handle(baseRequest({ auth: { authenticated: true, organizationId: "org-other" } }));
  assert.equal(res.kind, "error");
  if (res.kind === "error") {
    assert.equal(res.error.code, "forbidden");
    assert.equal(res.error.trpcCode, "FORBIDDEN");
  }
  assert.equal(cfg.dispatches.length, 0);
});

test("rejected: rate limit produces rate_limited before dispatch", async () => {
  const cfg = makeConfig();
  cfg.guards.rateLimit = rateLimitGuard(() => 0);
  const adapter = createNativeAdapter(cfg);
  const res = await adapter.handle(baseRequest());
  assert.equal(res.kind, "error");
  if (res.kind === "error") assert.equal(res.error.code, "rate_limited");
  assert.equal(cfg.dispatches.length, 0);
});

test("unknown operation is rejected with typed error, no dispatch", async () => {
  const cfg = makeConfig();
  const adapter = createNativeAdapter(cfg);
  const res = await adapter.handle(baseRequest({ operationId: "nonexistent.probe" }));
  assert.equal(res.kind, "error");
  if (res.kind === "error") assert.equal(res.error.code, "unknown_operation");
  assert.equal(cfg.dispatches.length, 0);
});

// ---------------------------------------------------------------------------
// Successful path — dispatch to the NAMED authoritative service only
// ---------------------------------------------------------------------------

test("happy path dispatches exactly once, to the registered service", async () => {
  const cfg = makeConfig();
  const adapter = createNativeAdapter(cfg);
  const res = await adapter.handle(baseRequest({ operationId: "siteExpense.create", requestId: "req-123" }));
  assert.equal(res.kind, "ok");
  assert.equal(cfg.dispatches.length, 1);
  assert.match(cfg.dispatches[0], /^siteExpense\.create->site-expense engine/);
});

test("financial mutation guard chain follows fixed pipeline order", () => {
  const cfg = makeConfig();
  const adapter = createNativeAdapter(cfg);
  const chain = adapter.effectiveGuardChain("siteExpense.create")!;
  const positions = chain.map((g) => GUARD_ORDER.indexOf(g));
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
    "effective chain must follow GUARD_ORDER",
  );
  assert.equal(chain[0], "identity");
  assert.equal(chain[chain.length - 1], "idempotency");
});

// ---------------------------------------------------------------------------
// Structural guarantees of the registry
// ---------------------------------------------------------------------------

test("misconfiguration: operation without identity guard fails at construction", () => {
  const cfg = makeConfig();
  cfg.operations = { "bad.op": { kind: "query", service: "x", guards: ["tenantScope"] } };
  assert.throws(() => createNativeAdapter(cfg), /identity guard/);
});

test("misconfiguration: out-of-order guard declaration fails at construction", () => {
  const cfg = makeConfig();
  cfg.operations = {
    "bad.op": { kind: "query", service: "x", guards: ["identity", "financial", "tenantScope"] },
  };
  assert.throws(() => createNativeAdapter(cfg), /pipeline order/);
});

test("seed registry: every mutation requires idempotency or is explicitly justified", () => {
  for (const [opId, binding] of Object.entries(SEED_OPERATIONS)) {
    if (binding.kind === "mutation") {
      assert.ok(
        binding.guards.includes("idempotency") || binding.guards.includes("fiscalLock"),
        `${opId}: engine-mediated mutation must declare idempotency or a fiscal-lock boundary`,
      );
    }
  }
});

test("adapterError always carries its tRPC mapping", () => {
  const e = adapterError("locked", "Fiscal year locked.");
  assert.equal(e.trpcCode, "CONFLICT");
});
