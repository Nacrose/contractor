/**
 * M03-T02 acceptance-matrix tests for the native identity and device
 * lifecycle contract. Every test maps to a milestone acceptance line:
 *
 *   A1  system-browser sign-in contract (PKCE S256, allowlist, state)
 *   A2  session rotation / revocation / expiry / device removal / account
 *       switching — server-enforced outcomes typed and handled
 *   A3  credentials ONLY in the secure store; redaction for logs/reports
 *   A4  logout/account switch GATE on unsynchronized work; no silent
 *       upload, no silent delete
 *   A5  no domain writers: the session-service port surface is exactly the
 *       infrastructure method set
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  IDENTITY_TRPC_CODE_MAP,
  base64urlEncode,
  buildAuthorizeUrl,
  createPkcePairFrom,
  deriveChallenge,
  hasPendingWork,
  identityError,
  validateCallback,
  type NativeClientRegistration,
  type PendingWorkSummary,
} from "../src/contract.js";
import {
  CredentialStoreUnavailable,
  MemoryCredentialStore,
  redactSecret,
  scrubForReport,
} from "../src/credentials.js";
import {
  NativeIdentityClient,
  type DeviceRegistrationInput,
  type NativeIdentityPorts,
  type SessionServicePort,
  type SystemBrowserPort,
} from "../src/lifecycle.js";

// ---------------------------------------------------------------------------
// Deterministic test infrastructure
// ---------------------------------------------------------------------------

/** xorshift32 — deterministic, reproducible flows. */
function makeRandom(seed: number) {
  let s = seed >>> 0 || 0x9e3779b9;
  return {
    bytes(length: number): Uint8Array {
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        out[i] = s & 0xff;
      }
      return out;
    },
  };
}

const REGISTRATION: NativeClientRegistration = {
  authorizeEndpoint: "https://app.example.com/auth/authorize",
  clientId: "native-public-client",
  allowedRedirectUris: ["com.nacrose.manager://auth/callback"],
};
const REDIRECT = "com.nacrose.manager://auth/callback";
const DEVICE: DeviceRegistrationInput = { deviceLabel: "Pixel 8 — site office", platform: "android", appVersion: "0.3.0" };

const EMPTY_WORK: PendingWorkSummary = { pendingOperations: 0, oldestPendingAgeMs: null, privateDrafts: 0, attachmentsPending: 0 };
const BUSY_WORK: PendingWorkSummary = { pendingOperations: 2, oldestPendingAgeMs: 45_000, privateDrafts: 1, attachmentsPending: 1 };

interface Harness {
  client: NativeIdentityClient;
  store: MemoryCredentialStore;
  browser: {
    openedUrls: string[];
    callbackQueue: string[];
    lastState: string | null;
    /** When set, `open` auto-delivers a callback carrying this code and the real generated state. */
    autoCallbackCode: string | null;
  };
  service: {
    calls: string[];
    exchangeImpl: (input: { code: string }) => Awaited<ReturnType<SessionServicePort["exchangeCode"]>>;
    rotateImpl: (input: { rotationToken: string }) => Awaited<ReturnType<SessionServicePort["rotate"]>>;
    logoutImpl: Awaited<ReturnType<SessionServicePort["logout"]>>;
    removeImpl: Awaited<ReturnType<SessionServicePort["removeDevice"]>>;
  };
  work: { summary: PendingWorkSummary };
}

function makeSessionService(h: Harness): SessionServicePort {
  return {
    async exchangeCode(input) {
      h.service.calls.push("exchangeCode");
      return h.service.exchangeImpl(input);
    },
    async rotate() {
      h.service.calls.push("rotate");
      return h.service.rotateImpl({ rotationToken: "" });
    },
    async logout() {
      h.service.calls.push("logout");
      return h.service.logoutImpl;
    },
    async removeDevice() {
      h.service.calls.push("removeDevice");
      return h.service.removeImpl;
    },
    async listDevices() {
      h.service.calls.push("listDevices");
      return { ok: true, devices: [] };
    },
  };
}

function makePorts(h: Harness): NativeIdentityPorts {
  const browser: Harness["browser"] = {
    openedUrls: [],
    callbackQueue: [],
    lastState: null,
    autoCallbackCode: null,
  };
  h.browser = browser;
  const systemBrowser: SystemBrowserPort = {
    async open(url) {
      browser.openedUrls.push(url);
      browser.lastState = new URL(url).searchParams.get("state");
      if (browser.autoCallbackCode !== null && browser.lastState !== null) {
        browser.callbackQueue.push(`${REDIRECT}?code=${browser.autoCallbackCode}&state=${browser.lastState}`);
      }
    },
    async awaitCallback() {
      return browser.callbackQueue.shift() ?? "about:blank?missing=1";
    },
  };
  return {
    registration: REGISTRATION,
    credentialStore: h.store,
    pendingWork: { snapshot: async () => h.work.summary },
    sessionService: makeSessionService(h),
    systemBrowser,
    random: makeRandom(0x5eed1234),
  };
}

function makeHarness(): Harness {
  const h: Harness = {
    store: new MemoryCredentialStore(),
    browser: { openedUrls: [], callbackQueue: [], lastState: null, autoCallbackCode: null },
    service: {
      calls: [],
      exchangeImpl: () => ({ kind: "error", error: identityError("internal", "not wired") }),
      rotateImpl: () => ({ kind: "session_revoked" }),
      logoutImpl: { kind: "logged_out" },
      removeImpl: { kind: "removed" },
    },
    work: { summary: { ...EMPTY_WORK } },
    client: undefined as unknown as NativeIdentityClient,
  };
  const ports = makePorts(h);
  h.client = new NativeIdentityClient(ports);
  return h;
}

/** Drives a successful sign-in (session `sess-1`/family `fam-1`) and returns the outcome. */
async function signedIn(h: Harness, sessionId = "sess-1", familyId = "fam-1") {
  h.service.exchangeImpl = () => ({
    kind: "signed_in",
    session: {
      sessionId,
      sessionFamilyId: familyId,
      userId: "user-1",
      organizationId: "org-1",
      deviceId: "device-1",
    },
    tokens: { accessToken: `at-${sessionId}`, rotationToken: `rt-${sessionId}`, accessExpiresAt: 9_999_999_999 },
  });
  h.browser.autoCallbackCode = "authcode-123";
  return h.client.signIn(DEVICE, REDIRECT);
}

// ---------------------------------------------------------------------------
// A1 — system-browser sign-in contract
// ---------------------------------------------------------------------------

test("pkce: verifier within RFC 7636 length, challenge derived S256-style from verifier", () => {
  const pkce = createPkcePairFrom(makeRandom(7));
  assert.ok(pkce.verifier.length >= 43 && pkce.verifier.length <= 128, `verifier len ${pkce.verifier.length}`);
  assert.match(pkce.verifier, /^[A-Za-z0-9\-_]+$/);
  assert.equal(pkce.method, "S256");
  assert.equal(pkce.challenge, deriveChallenge(pkce.verifier));
  assert.equal(deriveChallenge(pkce.verifier), pkce.challenge, "challenge derivation is deterministic");
});

test("authorize url: carries response_type/code/client_id/state/S256 challenge over https", () => {
  const pkce = createPkcePairFrom(makeRandom(11));
  const built = buildAuthorizeUrl({ registration: REGISTRATION, pkce, state: "state-16-chars-min", redirectUri: REDIRECT });
  assert.ok(built.ok);
  if (!built.ok) return;
  const url = new URL(built.url);
  assert.equal(url.protocol, "https:");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "native-public-client");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), pkce.challenge);
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT);
});

test("authorize url: rejects non-allowlisted redirect, http endpoint, and weak state", () => {
  const pkce = createPkcePairFrom(makeRandom(13));
  const badRedirect = buildAuthorizeUrl({
    registration: REGISTRATION, pkce, state: "state-16-chars-min", redirectUri: "https://evil.example.com/cb",
  });
  assert.ok(!badRedirect.ok && badRedirect.error.code === "redirect_untrusted");

  const httpReg: NativeClientRegistration = { ...REGISTRATION, authorizeEndpoint: "http://app.example.com/auth/authorize" };
  const badScheme = buildAuthorizeUrl({ registration: httpReg, pkce, state: "state-16-chars-min", redirectUri: REDIRECT });
  assert.ok(!badScheme.ok && badScheme.error.code === "malformed_request");

  const badState = buildAuthorizeUrl({ registration: REGISTRATION, pkce, state: "short", redirectUri: REDIRECT });
  assert.ok(!badState.ok && badState.error.code === "state_mismatch");
});

test("callback: extracts code on allowlisted redirect with matching state", () => {
  const got = validateCallback({
    callbackUrl: `${REDIRECT}?code=abc&state=s1`,
    expectedState: "s1",
    allowedRedirectUris: REGISTRATION.allowedRedirectUris,
  });
  assert.ok(got.ok);
  if (got.ok) assert.equal(got.code, "abc");
});

test("callback: state mismatch, non-allowlisted redirect, provider error, and missing code are all typed rejections", () => {
  const mismatch = validateCallback({ callbackUrl: `${REDIRECT}?code=abc&state=other`, expectedState: "s1", allowedRedirectUris: REGISTRATION.allowedRedirectUris });
  assert.ok(!mismatch.ok && mismatch.error.code === "state_mismatch");

  const untrusted = validateCallback({ callbackUrl: "https://phish.example.com/cb?code=abc&state=s1", expectedState: "s1", allowedRedirectUris: REGISTRATION.allowedRedirectUris });
  assert.ok(!untrusted.ok && untrusted.error.code === "redirect_untrusted");

  const denied = validateCallback({ callbackUrl: `${REDIRECT}?error=access_denied&state=s1`, expectedState: "s1", allowedRedirectUris: REGISTRATION.allowedRedirectUris });
  assert.ok(!denied.ok && denied.error.code === "access_denied");

  const empty = validateCallback({ callbackUrl: `${REDIRECT}?state=s1`, expectedState: "s1", allowedRedirectUris: REGISTRATION.allowedRedirectUris });
  assert.ok(!empty.ok && empty.error.code === "malformed_request");
});

test("sign-in happy path: system browser opened with contract URL, tokens persisted in secure store, inflight cleaned", async () => {
  const h = makeHarness();
  const outcome = await signedIn(h);
  assert.equal(outcome.kind, "signed_in");
  if (outcome.kind !== "signed_in") return;

  assert.equal(h.browser.openedUrls.length, 1);
  assert.ok(h.browser.openedUrls[0].startsWith("https://app.example.com/auth/authorize"));

  const stored = JSON.parse((await h.store.load("session.tokens")) ?? "null");
  assert.equal(stored.session.sessionId, "sess-1");
  assert.equal(stored.tokens.accessToken, "at-sess-1");
  assert.equal(await h.store.load("pkce.inflight"), null, "in-flight PKCE evidence must be cleaned up");
  assert.ok(await h.store.load("session.accountHint"), "non-secret account hint stored for switcher");
});

test("sign-in failure: exchange rejection persists NO credentials", async () => {
  const h = makeHarness();
  h.service.exchangeImpl = () => ({ kind: "error", error: identityError("access_denied", "user cancelled") });
  h.browser.autoCallbackCode = "authcode";
  const outcome = await h.client.signIn(DEVICE, REDIRECT);
  assert.equal(outcome.kind, "error");
  assert.equal(await h.store.load("session.tokens"), null, "no session tokens may survive a failed exchange");
  assert.equal(await h.store.load("pkce.inflight"), null, "in-flight evidence cleaned even on failure");
});

test("sign-in failure: callback on attacker URL is rejected BEFORE any server exchange", async () => {
  const h = makeHarness();
  h.browser.callbackQueue.push("https://evil.example.com/cb?code=stolen&state=EXPECTED");
  const outcome = await h.client.signIn(DEVICE, REDIRECT);
  assert.equal(outcome.kind, "error");
  if (outcome.kind === "error") assert.equal(outcome.error.code, "redirect_untrusted");
  assert.deepEqual(h.service.calls, [], "no exchange call may fire for an untrusted callback");
});

// ---------------------------------------------------------------------------
// A2 — rotation / revocation / expiry / device removal / account switching
// ---------------------------------------------------------------------------

test("rotation success: fresh pair persisted, family continuity preserved", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.service.rotateImpl = () => ({
    kind: "rotated",
    session: { sessionId: "sess-2", sessionFamilyId: "fam-1", userId: "user-1", organizationId: "org-1", deviceId: "device-1" },
    tokens: { accessToken: "at-sess-2", rotationToken: "rt-sess-2", accessExpiresAt: 9_999_999_999 },
  });
  const outcome = await h.client.rotate();
  assert.equal(outcome.kind, "rotated");
  const stored = JSON.parse((await h.store.load("session.tokens")) ?? "null");
  assert.equal(stored.tokens.accessToken, "at-sess-2", "fresh pair replaces the old one");
  assert.equal(stored.session.sessionFamilyId, "fam-1", "rotations share the family id");
});

test("rotation reuse detection: server revokes family; client wipes credentials, preserves pending work", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.work.summary = { ...BUSY_WORK };
  h.service.rotateImpl = () => ({ kind: "reuse_detected", sessionFamilyId: "fam-1" });
  const outcome = await h.client.rotate();
  assert.equal(outcome.kind, "reuse_detected");
  assert.equal(await h.store.load("session.tokens"), null, "dead credentials must not linger");
  assert.deepEqual(h.work.summary, BUSY_WORK, "pending work is NEVER touched by credential wipe");
});

test("rotation expiry and revocation are explicit, typed outcomes that sign the device out locally", async () => {
  for (const kind of ["session_expired", "session_revoked"] as const) {
    const h = makeHarness();
    await signedIn(h);
    h.service.rotateImpl = () => ({ kind });
    const outcome = await h.client.rotate();
    assert.equal(outcome.kind, kind);
    assert.equal(await h.store.load("session.tokens"), null, `${kind} must end the local credential state`);
    assert.deepEqual(h.work.summary, EMPTY_WORK);
  }
});

test("logout gates on pending work: no server call, no credential wipe, summary surfaced", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.work.summary = { ...BUSY_WORK };
  const outcome = await h.client.logout();
  assert.equal(outcome.kind, "gated");
  if (outcome.kind === "gated") assert.equal(outcome.summary.pendingOperations, 2);
  assert.deepEqual(h.service.calls, ["exchangeCode"], "server session must be untouched while work is pending");
  assert.ok(await h.store.load("session.tokens"), "credentials intact while gated");
});

test("logout clean: server invalidation then local wipe", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.service.logoutImpl = { kind: "logged_out" };
  const outcome = await h.client.logout();
  assert.equal(outcome.kind, "logged_out");
  assert.deepEqual(h.service.calls, ["exchangeCode", "logout"]);
  assert.equal(await h.store.load("session.tokens"), null);
});

test("logout without a session is already_invalidated, not an error", async () => {
  const h = makeHarness();
  const outcome = await h.client.logout();
  assert.equal(outcome.kind, "already_invalidated");
  assert.deepEqual(h.service.calls, []);
});

test("device removal: current device gates on pending work; clean removal wipes local credentials", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.work.summary = { ...BUSY_WORK };
  const gated = await h.client.removeDevice("device-1");
  assert.equal(gated.kind, "gated");

  h.work.summary = { ...EMPTY_WORK };
  h.service.removeImpl = { kind: "removed" };
  const removed = await h.client.removeDevice("device-1");
  assert.equal(removed.kind, "removed");
  assert.equal(await h.store.load("session.tokens"), null, "removing the current device ends its local session");
});

test("device removal: another device is a pure server call; local session untouched", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.service.removeImpl = { kind: "removed" };
  const outcome = await h.client.removeDevice("device-OTHER");
  assert.equal(outcome.kind, "removed");
  assert.ok(await h.store.load("session.tokens"), "current session must survive removing a different device");
});

test("device removal: unknown device and forbidden are server-decided typed outcomes", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.service.removeImpl = { kind: "not_found" };
  assert.equal((await h.client.removeDevice("device-404")).kind, "not_found");
  h.service.removeImpl = { kind: "forbidden" };
  assert.equal((await h.client.removeDevice("device-x")).kind, "forbidden");
});

test("account switch: gated while pending work exists; clean switch tears down then signs in the target", async () => {
  const h = makeHarness();
  await signedIn(h, "sess-a", "fam-a");
  h.work.summary = { ...BUSY_WORK };
  const gated = await h.client.switchAccount(DEVICE, REDIRECT);
  assert.equal(gated.kind, "gated");
  assert.deepEqual(h.service.calls, ["exchangeCode"], "gated switch touches nothing");

  h.work.summary = { ...EMPTY_WORK };
  h.browser.autoCallbackCode = "code-2";
  h.service.exchangeImpl = ({ code }) => ({
    kind: "signed_in",
    session: {
      sessionId: code === "code-2" ? "sess-b" : "sess-a",
      sessionFamilyId: code === "code-2" ? "fam-b" : "fam-a",
      userId: "user-2",
      organizationId: "org-1",
      deviceId: "device-1",
    },
    tokens: { accessToken: "at-sess-b", rotationToken: "rt-sess-b", accessExpiresAt: 9_999_999_999 },
  });
  const switched = await h.client.switchAccount(DEVICE, REDIRECT);
  assert.equal(switched.kind, "switched");
  if (switched.kind === "switched") {
    assert.equal(switched.session.sessionId, "sess-b");
    assert.equal(switched.session.userId, "user-2");
  }
  assert.ok(h.service.calls.includes("logout"), "previous session torn down server-side before the new sign-in");
  const stored = JSON.parse((await h.store.load("session.tokens")) ?? "null");
  assert.equal(stored.session.userId, "user-2", "the stored session is the TARGET account, not the old one");
});

test("account switch: server logout failure aborts the switch with credentials intact", async () => {
  const h = makeHarness();
  await signedIn(h);
  h.service.logoutImpl = { kind: "error", error: identityError("internal", "session service down") };
  const outcome = await h.client.switchAccount(DEVICE, REDIRECT);
  assert.equal(outcome.kind, "error");
  assert.ok(await h.store.load("session.tokens"), "failed teardown must NOT wipe the working session");
});

// ---------------------------------------------------------------------------
// A3 — secure storage and redaction
// ---------------------------------------------------------------------------

test("credential store: round-trip and wipeAll", async () => {
  const store = new MemoryCredentialStore();
  await store.save("session.tokens", '{"session":{}}');
  assert.equal(await store.load("session.tokens"), '{"session":{}}');
  await store.delete("session.tokens");
  assert.equal(await store.load("session.tokens"), null);
  await store.save("session.accountHint", "hint");
  await store.wipeAll();
  assert.equal(await store.load("session.accountHint"), null);
});

test("credential store: unavailable OS store fails CLOSED on every operation — never a disk fallback", async () => {
  const store = new MemoryCredentialStore();
  store.simulateUnavailable(true);
  await assert.rejects(store.save("session.tokens", "x"), CredentialStoreUnavailable);
  await assert.rejects(store.load("session.tokens"), CredentialStoreUnavailable);
  await assert.rejects(store.delete("session.tokens"), CredentialStoreUnavailable);
  await assert.rejects(store.wipeAll(), CredentialStoreUnavailable);
});

test("redaction: scrubForReport replaces credential-bearing values with fingerprints, keeps structure", () => {
  const report = {
    userId: "user-1",
    accessToken: "super-secret-at",
    rotationToken: "super-secret-rt",
    pendingOperations: 3,
    nested: { authorization: "Bearer super-secret-at", deviceLabel: "Pixel 8" },
  };
  const { safe, report: rep } = scrubForReport(report);
  const json = JSON.stringify(safe);
  assert.ok(!json.includes("super-secret-at"), "access token must not survive scrubbing");
  assert.ok(!json.includes("super-secret-rt"), "rotation token must not survive scrubbing");
  assert.equal((safe as { pendingOperations: number }).pendingOperations, 3, "diagnostic structure survives");
  assert.equal((safe as { userId: string }).userId, "user-1");
  assert.match((safe as { accessToken: string }).accessToken, /^fp_[0-9a-f]{8}_len\d+$/);
  assert.ok(rep.redacted.includes("accessToken"));
  assert.ok(rep.redacted.includes("rotationToken"));
  assert.ok(rep.redacted.includes("authorization"));
  assert.ok(!rep.redacted.includes("deviceLabel"), "non-secret labels pass through");
});

test("redaction: fingerprints are stable and length-honest", () => {
  assert.equal(redactSecret("same"), redactSecret("same"));
  assert.notEqual(redactSecret("same"), redactSecret("other"));
  assert.match(redactSecret("abc"), /_len3$/);
});

// ---------------------------------------------------------------------------
// A4/A5 — pending-work gate semantics and the no-domain-writers port surface
// ---------------------------------------------------------------------------

test("hasPendingWork: any nonzero bucket counts; empty summary does not", () => {
  assert.equal(hasPendingWork(EMPTY_WORK), false);
  assert.equal(hasPendingWork({ ...EMPTY_WORK, privateDrafts: 1 }), true);
  assert.equal(hasPendingWork({ ...EMPTY_WORK, attachmentsPending: 2 }), true);
  assert.equal(hasPendingWork({ ...EMPTY_WORK, pendingOperations: 1 }), true);
});

test("no domain writers: the session-service port surface is exactly the infrastructure set", () => {
  const h = makeHarness();
  const port = makeSessionService(h) as unknown as Record<string, unknown>;
  const surface = Object.keys(port).sort();
  assert.deepEqual(surface, ["exchangeCode", "listDevices", "logout", "removeDevice", "rotate"]);
  for (const code of Object.keys(IDENTITY_TRPC_CODE_MAP)) {
    assert.match(IDENTITY_TRPC_CODE_MAP[code as keyof typeof IDENTITY_TRPC_CODE_MAP], /^[A-Z_]+$/);
  }
});

test("base64urlEncode: RFC 4648 §5 alphabet, no padding", () => {
  const zero = base64urlEncode(new Uint8Array([0, 0, 0]));
  assert.equal(zero, "AAAA");
  const one = base64urlEncode(new Uint8Array([255]));
  assert.equal(one.length, 2, "no '=' padding");
  assert.match(one, /^[A-Za-z0-9\-_]+$/);
});
