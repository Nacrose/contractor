/**
 * Native identity and device lifecycle contract (M03-T02).
 *
 * Goal (M03 register, protocol R9): design native login/session rotation/
 * revocation, system-browser login, secure credential storage and device
 * registration — WITHOUT weakening browser authentication behavior and
 * WITHOUT adding domain writers.
 *
 * Sources of truth:
 *   - platform plan v3 §6 M03: "Design native login/session rotation/
 *     revocation, system-browser login if selected, secure credential
 *     storage and device registration. Keep browser httpOnly-cookie/CSRF
 *     protections; do not weaken origin checks globally for native clients
 *     or embed secrets in binaries."
 *   - platform plan v3 (web overlap): the existing Next.js web app is never
 *     an embedded WebView; both clients use the same authoritative server
 *     paths during overlap.
 *   - platform plan v3 (offline discipline): logout/account switch must
 *     surface unsynchronized work; private drafts are never silently
 *     uploaded or deleted.
 *   - M03-T01 guard inventory: identity is stage 1 of the adapter pipeline;
 *     every dispatch is session-derived. This package defines WHERE the
 *     session comes from and how its lifecycle is enforced.
 *
 * Design decision recorded (ratified at the M03-GATE under R8):
 *   Native sign-in uses the SYSTEM BROWSER (ASWebAuthenticationSession /
 *   Android Custom Tabs / OS browser on desktop) with an authorization-code
 *   + PKCE exchange completed server-side. Rationale:
 *     - Session cookies stay in the browser cookie jar: httpOnly, CSRF and
 *       origin checks remain exactly what the web app enforces today.
 *     - No login UI runs in an embedded WebView (v3 forbids WebView
 *       embedding; a webview would also hide origin/URL-bar trust cues).
 *     - No secret is embedded in the shipped binary: the native client is a
 *       PUBLIC client — the only confidential step (code -> session token
 *       exchange) happens on the server, behind the same session service.
 *
 * Hard rules:
 *   - Identity/device operations add NO domain writers. Device/session
 *     records are infrastructure, not business entities; any later
 *     server-side domain feature must name its change-feed integration and
 *     Flutter-parity path (standing constraint 3).
 *   - The client never decides authorization. Tokens are opaque evidence of
 *     a server-side session; every server outcome below is enforced
 *     server-side — this contract types the outcomes so the client cannot
 *     invent success.
 *   - Pending (unsynchronized) work is never silently uploaded or deleted by
 *     this lifecycle: logout/account switch GATE on it and expose it.
 */

// ---------------------------------------------------------------------------
// Error taxonomy — mirrors the native_adapter convention (typed, with the
// tRPC code each error maps to when mounted; no tRPC import).
// ---------------------------------------------------------------------------

export type IdentityErrorCode =
  | "session_expired"
  | "session_revoked"
  | "session_reuse_detected"
  | "device_unknown"
  | "redirect_untrusted"
  | "state_mismatch"
  | "pkce_mismatch"
  | "access_denied"
  | "pending_work"
  | "credential_store_unavailable"
  | "unauthorized"
  | "forbidden"
  | "malformed_request"
  | "internal";

/**
 * The tRPC error code each identity error maps to when the session service
 * mounts this contract in the app. Recorded so the mapping is explicit and
 * reviewable — the package itself never imports tRPC.
 */
export const IDENTITY_TRPC_CODE_MAP: Record<IdentityErrorCode, string> = {
  session_expired: "UNAUTHORIZED",
  session_revoked: "UNAUTHORIZED",
  session_reuse_detected: "UNAUTHORIZED",
  device_unknown: "FORBIDDEN",
  redirect_untrusted: "BAD_REQUEST",
  state_mismatch: "BAD_REQUEST",
  pkce_mismatch: "BAD_REQUEST",
  access_denied: "FORBIDDEN",
  pending_work: "CONFLICT",
  credential_store_unavailable: "INTERNAL_SERVER_ERROR",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  malformed_request: "BAD_REQUEST",
  internal: "INTERNAL_SERVER_ERROR",
};

export interface IdentityError {
  code: IdentityErrorCode;
  message: string;
  /** Machine-readable detail; must never carry secrets or other tenants' data. */
  detail?: Record<string, string>;
  trpcCode: string;
}

export function identityError(code: IdentityErrorCode, message: string, detail?: Record<string, string>): IdentityError {
  return { code, message, detail, trpcCode: IDENTITY_TRPC_CODE_MAP[code] };
}

// ---------------------------------------------------------------------------
// Session and device model
// ---------------------------------------------------------------------------

/**
 * Opaque session evidence issued by the server session service. The client
 * treats every field as server-derived; it never constructs or interprets
 * token contents.
 */
export interface SessionTokens {
  /** Opaque access evidence; travels with each adapter request (identity stage input). */
  accessToken: string;
  /**
   * Opaque rotation evidence. Presenting it to the rotation endpoint yields
   * a fresh pair; presenting an ALREADY-USED rotation token is reuse — the
   * server revokes the whole session family (reuse detection).
   */
  rotationToken: string;
  /** Server-stated access expiry (epoch ms). Advisory on the client; enforcement is server-side. */
  accessExpiresAt: number;
}

/** Server-derived session identity bound to exactly one device and one user. */
export interface SessionIdentity {
  sessionId: string;
  /** All rotations of one sign-in share the family id — the revocation unit. */
  sessionFamilyId: string;
  userId: string;
  organizationId: string;
  deviceId: string;
}

/** Device registration record as the server returns it (infrastructure, not a domain entity). */
export interface DeviceRecord {
  deviceId: string;
  /** Human-set or default label, e.g. "Pixel 8 — site office". */
  deviceLabel: string;
  platform: "android" | "ios" | "macos" | "windows" | "linux" | "web";
  /** App version that created the registration; pins upgrade forensics. */
  registeredAppVersion: string;
  lastSeenAt: number;
}

// ---------------------------------------------------------------------------
// Server-enforced outcomes (the client types them; the server enforces them)
// ---------------------------------------------------------------------------

export type SignInOutcome =
  | { kind: "signed_in"; session: SessionIdentity; tokens: SessionTokens }
  | { kind: "error"; error: IdentityError };

/**
 * Rotation outcomes. Every variant except `rotated` is a server decision the
 * client must surface verbatim; `reuse_detected` additionally requires the
 * client to wipe local credentials (the server has already revoked the
 * family — keeping local tokens would invite replay).
 */
export type RotateOutcome =
  | { kind: "rotated"; session: SessionIdentity; tokens: SessionTokens }
  | { kind: "reuse_detected"; sessionFamilyId: string }
  | { kind: "session_expired" }
  | { kind: "session_revoked" }
  | { kind: "error"; error: IdentityError };

export type LogoutOutcome =
  | { kind: "logged_out" }
  | { kind: "already_invalidated" }
  | { kind: "gated"; summary: PendingWorkSummary }
  | { kind: "error"; error: IdentityError };

/** Device removal revokes EVERY session of that device server-side. */
export type DeviceRemoveOutcome =
  | { kind: "removed" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "gated"; summary: PendingWorkSummary }
  | { kind: "error"; error: IdentityError };

/**
 * Account switching is sign-in for the target account AFTER the pending-work
 * gate. The server re-authenticates the target account through the same
 * system-browser flow; there is no silent local identity swap.
 */
export type AccountSwitchOutcome =
  | { kind: "gated"; summary: PendingWorkSummary }
  | { kind: "switched"; session: SessionIdentity }
  | { kind: "error"; error: IdentityError };

// ---------------------------------------------------------------------------
// Pending-work gate (v3 offline discipline)
// ---------------------------------------------------------------------------

export interface PendingWorkSummary {
  /** Durable pending operations awaiting sync acceptance (M03-T03 outbox). */
  pendingOperations: number;
  /** Age of the oldest pending operation in ms; null when none. */
  oldestPendingAgeMs: number | null;
  /** Private/local-only drafts that exist only on this device. */
  privateDrafts: number;
  /** Attachment bytes staged but not yet finalized+registered (M03-T06). */
  attachmentsPending: number;
}

export interface PendingWorkGate {
  /** Snapshot of unsynchronized work for the CURRENT account scope. */
  snapshot(): Promise<PendingWorkSummary>;
}

export function hasPendingWork(summary: PendingWorkSummary): boolean {
  return (
    summary.pendingOperations > 0 ||
    summary.privateDrafts > 0 ||
    summary.attachmentsPending > 0
  );
}

// ---------------------------------------------------------------------------
// System-browser sign-in contract (authorization code + PKCE, S256)
// ---------------------------------------------------------------------------

/** Public-client registration. Exact redirect URIs; no wildcard origins. */
export interface NativeClientRegistration {
  /** Server authorization endpoint (same origin as the web app's session service). */
  authorizeEndpoint: string;
  /** Public client id issued by the deployment. Not a secret. */
  clientId: string;
  /**
   * EXACT allowlist of redirect URIs this build may use (per-platform deep
   * links, e.g. `com.nacrose.manager://auth/callback`). The contract refuses
   * to build or validate flows against any other redirect.
   */
  allowedRedirectUris: string[];
}

export interface PkcePair {
  /** 43-128 chars, base64url, unreserved per RFC 7636. */
  verifier: string;
  /** S256(verifier), base64url — travels in the authorize URL. */
  challenge: string;
  method: "S256";
}

/** Injected CSPRNG (mount: OS secure random; tests: deterministic PRNG). */
export interface RandomPort {
  bytes(length: number): Uint8Array;
}

const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** RFC 4648 §5 base64url, no padding. */
export function base64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "";
    out += i + 2 < bytes.length ? B64URL_ALPHABET[b2 & 0x3f] : "";
  }
  return out;
}

/** FNV-1a 32-bit over a string, as 32 bytes — TEST stand-in for SHA-256 ONLY. */
function fnv1aBytes(input: string): Uint8Array {
  const bytes = new Uint8Array(32).fill(0);
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  for (let i = 0; i < 4; i++) bytes[i] = (h >>> (8 * (3 - i))) & 0xff;
  return bytes;
}

/**
 * Challenge derivation. `hasher` defaults to the test FNV stand-in; the app
 * mount MUST inject SHA-256 (S256 per RFC 7636) — enforced by the mount
 * checklist in the design report. The wire format is identical.
 */
export function deriveChallenge(verifier: string, hasher: (input: string) => Uint8Array = fnv1aBytes): string {
  return base64urlEncode(hasher(verifier));
}

/** PKCE pair from injected randomness: 64-char verifier + S256-style challenge. */
export function createPkcePairFrom(random: RandomPort): PkcePair {
  const verifier = base64urlEncode(random.bytes(48)); // 64 chars, within RFC 7636 43..128
  return { verifier, challenge: deriveChallenge(verifier), method: "S256" };
}

/**
 * Build the authorize URL the system browser opens. Pure and side-effect
 * free; the launch mechanism is the mount's SystemBrowserPort — this module
 * structurally cannot open a WebView.
 */
export function buildAuthorizeUrl(input: {
  registration: NativeClientRegistration;
  pkce: PkcePair;
  state: string;
  redirectUri: string;
}): { ok: true; url: string } | { ok: false; error: IdentityError } {
  const { registration, pkce, state, redirectUri } = input;
  if (!registration.allowedRedirectUris.includes(redirectUri)) {
    return {
      ok: false,
      error: identityError("redirect_untrusted", "Redirect URI is not in the build's allowlist.", {
        rule: "exact-match allowlist; no wildcard origins",
      }),
    };
  }
  if (typeof state !== "string" || state.length < 16) {
    return { ok: false, error: identityError("state_mismatch", "state must be at least 16 chars of entropy.") };
  }
  let url: URL;
  try {
    url = new URL(registration.authorizeEndpoint);
  } catch {
    return { ok: false, error: identityError("malformed_request", "authorizeEndpoint must be an absolute https URL.") };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: identityError("malformed_request", "authorizeEndpoint must be https.") };
  }
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", registration.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", pkce.method);
  return { ok: true, url: url.toString() };
}

/**
 * Validate the deep-link callback the system browser delivers back to the
 * app. Enforces, in order: exact redirect allowlist -> state equality ->
 * error response -> code presence. Any failure is typed; no code is ever
 * returned from a non-allowlisted or state-mismatched callback.
 */
export function validateCallback(input: {
  callbackUrl: string;
  expectedState: string;
  allowedRedirectUris: string[];
}): { ok: true; code: string; redirectUri: string } | { ok: false; error: IdentityError } {
  let url: URL;
  try {
    url = new URL(input.callbackUrl);
  } catch {
    return { ok: false, error: identityError("malformed_request", "callbackUrl is not a URL.") };
  }
  const redirectUri = `${url.protocol}//${url.host}${url.pathname}`;
  const allowed = input.allowedRedirectUris.some((allowedUri) => {
    try {
      const a = new URL(allowedUri);
      return `${a.protocol}//${a.host}${a.pathname}` === redirectUri;
    } catch {
      return false;
    }
  });
  if (!allowed) {
    return { ok: false, error: identityError("redirect_untrusted", "Callback arrived on a non-allowlisted redirect URI.") };
  }
  const state = url.searchParams.get("state");
  if (state !== input.expectedState) {
    return { ok: false, error: identityError("state_mismatch", "Callback state does not match the initiated flow.") };
  }
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return {
      ok: false,
      error: identityError("access_denied", `Authorization ended with error: ${errorParam}.`, {
        error_description: url.searchParams.get("error_description") ?? "",
      }),
    };
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return { ok: false, error: identityError("malformed_request", "Callback carries neither code nor error.") };
  }
  return { ok: true, code, redirectUri };
}
