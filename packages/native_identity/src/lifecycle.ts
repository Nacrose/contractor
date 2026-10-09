/**
 * Native identity lifecycle orchestration (M03-T02).
 *
 * Wires the contract pieces (system-browser sign-in, session rotation,
 * logout, device removal, account switching) around injected ports so the
 * app mount stays thin and every server-enforced outcome is testable.
 *
 * Guarantees enforced HERE, structurally:
 *   - The ONLY way to reach the login UI is `systemBrowser.open` — this
 *     client has no WebView surface at all.
 *   - Credentials are persisted ONLY through `SecureCredentialStore` and
 *     wiped (`wipeAll`) on: successful logout, account-switch teardown, and
 *     rotation reuse detection. Wiping credentials NEVER touches pending
 *     work — the outbox (M03-T03) is a different store and out of scope.
 *   - Logout and account switch GATE on the pending-work snapshot; with
 *     unsynchronized work present they return `gated` and touch NEITHER the
 *     server session NOR local data. There is no code path on this client
 *     that deletes or force-uploads pending work.
 *   - Expired/revoked credentials degrade to a signed-out state; pending
 *     work is preserved for the user to see (v3 offline discipline).
 *
 * Server enforcement obligations (typed as outcomes here, implemented by
 * the EXISTING session service at mount time — no new domain writers):
 *   - Rotation reuse => revoke the whole session family (reuse detection).
 *   - Logout/revocation/expiry => later adapter calls fail the identity
 *     stage (M03-T01 pipeline, stage 1) — never a client-side grace state.
 *   - Device removal => revoke every session of that device.
 */

import {
  AccountSwitchOutcome,
  base64urlEncode,
  buildAuthorizeUrl,
  createPkcePairFrom,
  DeviceRecord,
  DeviceRemoveOutcome,
  hasPendingWork,
  IdentityError,
  LogoutOutcome,
  NativeClientRegistration,
  PkcePair,
  RotateOutcome,
  SessionIdentity,
  SessionTokens,
  SignInOutcome,
  validateCallback,
  identityError,
  PendingWorkGate,
  PendingWorkSummary,
} from "./contract.js";
import { CredentialRef, SecureCredentialStore } from "./credentials.js";

/** Stored credential shape under `session.tokens` (JSON). */
interface StoredSession {
  session: SessionIdentity;
  tokens: SessionTokens;
}

/** Server session-service port. Implemented by the mount against EXISTING auth services. */
export interface SessionServicePort {
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    device: DeviceRegistrationInput;
  }): Promise<SignInOutcome>;
  rotate(input: { rotationToken: string }): Promise<RotateOutcome>;
  logout(input: { accessToken: string }): Promise<{ kind: "logged_out" } | { kind: "already_invalidated" } | { kind: "error"; error: IdentityError }>;
  removeDevice(input: { accessToken: string; deviceId: string }): Promise<DeviceRemoveOutcome>;
  listDevices(input: { accessToken: string }): Promise<{ ok: true; devices: DeviceRecord[] } | { ok: false; error: IdentityError }>;
}

export interface DeviceRegistrationInput {
  deviceLabel: string;
  platform: "android" | "ios" | "macos" | "windows" | "linux" | "web";
  appVersion: string;
}

/** The system browser port — the ONLY launch mechanism this client knows. */
export interface SystemBrowserPort {
  /** Launch the OS browser (ASWebAuthenticationSession / Custom Tabs / desktop browser). */
  open(authorizeUrl: string): Promise<void>;
  /** Resolve with the deep-link callback URL once the browser redirects back. */
  awaitCallback(): Promise<string>;
}

export interface RandomPort {
  bytes(length: number): Uint8Array;
}

export interface NativeIdentityPorts {
  registration: NativeClientRegistration;
  credentialStore: SecureCredentialStore;
  pendingWork: PendingWorkGate;
  sessionService: SessionServicePort;
  systemBrowser: SystemBrowserPort;
  random: RandomPort;
}

// ---------------------------------------------------------------------------
// PKCE randomness comes from contract.ts (createPkcePairFrom) with the
// injected RandomPort; no local crypto here.
// ---------------------------------------------------------------------------

function createState(random: RandomPort): string {
  return base64urlEncode(random.bytes(16)); // ~22 chars >= 16 required
}

// ---------------------------------------------------------------------------

const REF_TOKENS: CredentialRef = "session.tokens";
const REF_INFLIGHT: CredentialRef = "pkce.inflight";
const REF_ACCOUNT_HINT: CredentialRef = "session.accountHint";

interface InFlightSignIn {
  pkce: PkcePair;
  state: string;
  redirectUri: string;
  device: DeviceRegistrationInput;
}

export class NativeIdentityClient {
  constructor(private readonly ports: NativeIdentityPorts) {}

  /** Currently stored session, if any. Credentials live ONLY in the secure store. */
  async restoreSession(): Promise<SessionIdentity | null> {
    const raw = await this.ports.credentialStore.load(REF_TOKENS);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as StoredSession).session;
    } catch {
      return null;
    }
  }

  /**
   * Full sign-in flow: PKCE -> system browser -> server exchange (which
   * registers/updates the device record) -> secure persistence.
   */
  async signIn(device: DeviceRegistrationInput, redirectUri: string): Promise<SignInOutcome> {
    const inflight: InFlightSignIn = {
      pkce: createPkcePairFrom(this.ports.random),
      state: createState(this.ports.random),
      redirectUri,
      device,
    };
    const built = buildAuthorizeUrl({
      registration: this.ports.registration,
      pkce: inflight.pkce,
      state: inflight.state,
      redirectUri,
    });
    if (!built.ok) return { kind: "error", error: built.error };

    await this.ports.credentialStore.save(REF_INFLIGHT, JSON.stringify(inflight));
    await this.ports.systemBrowser.open(built.url);
    const callbackUrl = await this.ports.systemBrowser.awaitCallback();
    return this.completeSignIn(callbackUrl);
  }

  /** Validate the browser callback and finish the exchange. Safe to call after process restart. */
  async completeSignIn(callbackUrl: string): Promise<SignInOutcome> {
    const raw = await this.ports.credentialStore.load(REF_INFLIGHT);
    if (!raw) {
      return { kind: "error", error: identityError("malformed_request", "No in-flight sign-in; call signIn first.") };
    }
    const inflight = JSON.parse(raw) as InFlightSignIn;
    const validated = validateCallback({
      callbackUrl,
      expectedState: inflight.state,
      allowedRedirectUris: this.ports.registration.allowedRedirectUris,
    });
    if (!validated.ok) {
      await this.ports.credentialStore.delete(REF_INFLIGHT);
      return { kind: "error", error: validated.error };
    }

    const outcome = await this.ports.sessionService.exchangeCode({
      code: validated.code,
      redirectUri: inflight.redirectUri,
      codeVerifier: inflight.pkce.verifier,
      device: inflight.device,
    });
    await this.ports.credentialStore.delete(REF_INFLIGHT);
    if (outcome.kind !== "signed_in") return outcome;

    await this.ports.credentialStore.save(REF_TOKENS, JSON.stringify({ session: outcome.session, tokens: outcome.tokens }));
    await this.ports.credentialStore.save(
      REF_ACCOUNT_HINT,
      JSON.stringify({ userId: outcome.session.userId, organizationId: outcome.session.organizationId }),
    );
    return outcome;
  }

  /**
   * Rotation. `rotated` re-persists the fresh pair; `reuse_detected` wipes
   * credentials (server revoked the family) while PRESERVING pending work.
   */
  async rotate(): Promise<RotateOutcome> {
    const stored = await this.loadStored();
    if (!stored) return { kind: "session_revoked" };
    const outcome = await this.ports.sessionService.rotate({ rotationToken: stored.tokens.rotationToken });
    if (outcome.kind === "rotated") {
      await this.ports.credentialStore.save(
        REF_TOKENS,
        JSON.stringify({ session: outcome.session, tokens: outcome.tokens }),
      );
    } else if (outcome.kind === "reuse_detected" || outcome.kind === "session_expired" || outcome.kind === "session_revoked") {
      // Credentials are dead evidence — remove them. Pending work is a
      // different store (M03-T03) and is intentionally NOT touched here.
      await this.ports.credentialStore.wipeAll();
    }
    return outcome;
  }

  /**
   * Logout. GATES on unsynchronized work: with pending work present, the
   * server session and local credentials are untouched and the summary is
   * returned for the caller to surface. No path here uploads or deletes it.
   */
  async logout(): Promise<LogoutOutcome> {
    const stored = await this.loadStored();
    if (!stored) return { kind: "already_invalidated" };

    const summary = await this.ports.pendingWork.snapshot();
    if (hasPendingWork(summary)) return { kind: "gated", summary };

    const outcome = await this.ports.sessionService.logout({ accessToken: stored.tokens.accessToken });
    if (outcome.kind === "error") return outcome;
    await this.ports.credentialStore.wipeAll();
    return outcome;
  }

  /**
   * Device removal. Removing the CURRENT device gates on pending work first
   * (it ends this device's session); removing another device is a pure
   * server call. `removed` for the current device also wipes credentials.
   */
  async removeDevice(deviceId: string): Promise<DeviceRemoveOutcome> {
    const stored = await this.loadStored();
    if (!stored) return { kind: "error", error: identityError("session_revoked", "No active session.") };

    const isCurrent = stored.session.deviceId === deviceId;
    if (isCurrent) {
      const summary = await this.ports.pendingWork.snapshot();
      if (hasPendingWork(summary)) return { kind: "gated", summary };
    }
    const outcome = await this.ports.sessionService.removeDevice({
      accessToken: stored.tokens.accessToken,
      deviceId,
    });
    if (outcome.kind === "removed" && isCurrent) {
      await this.ports.credentialStore.wipeAll();
    }
    return outcome;
  }

  /**
   * Account switch: gate -> server-side teardown of the current session ->
   * fresh system-browser sign-in for the target account. The server (not
   * this client) proves which account signed in; `switched` carries the NEW
   * session identity.
   */
  async switchAccount(device: DeviceRegistrationInput, redirectUri: string): Promise<AccountSwitchOutcome> {
    const stored = await this.loadStored();
    if (stored) {
      const summary = await this.ports.pendingWork.snapshot();
      if (hasPendingWork(summary)) return { kind: "gated", summary };

      const logout = await this.ports.sessionService.logout({ accessToken: stored.tokens.accessToken });
      if (logout.kind === "error") return { kind: "error", error: logout.error };
      await this.ports.credentialStore.wipeAll();
    }
    const signedIn = await this.signIn(device, redirectUri);
    if (signedIn.kind !== "signed_in") return { kind: "error", error: signedIn.error };
    return { kind: "switched", session: signedIn.session };
  }

  /** Signed-out diagnosis for surfaces: counts of pending items the user must see. */
  async pendingWorkSnapshot(): Promise<PendingWorkSummary> {
    return this.ports.pendingWork.snapshot();
  }

  private async loadStored(): Promise<StoredSession | null> {
    const raw = await this.ports.credentialStore.load(REF_TOKENS);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }
}
