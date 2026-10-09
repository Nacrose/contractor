# M03-T02: Native identity and device lifecycle design

- **Milestone:** M03 (Native identity, repositories and sync engine)
- **Task:** `M03-T02` — Implement native identity and device lifecycle
- **Evidence sources:** platform plan v3 §6 M03 (identity design mandate), §4 (no-WebView overlap rule, "do not weaken origin checks globally … or embed secrets in binaries"), v3 offline discipline ("logout/account switch must surface unsynchronized work"), [M03-T01 guard inventory](adapter-guard-inventory.md) (identity = stage 1 of the adapter pipeline), [M02-GATE packet](../M02/gate-evidence.md) (component/status-model conventions)
- **Contract package:** [`packages/native_identity/`](../../../packages/native_identity/)
- **Date:** 2026-10-09

---

## 1. Purpose and scope

This task delivers the **native login/session/device contract and the secure credential-storage adapter**: a pure TypeScript package (`@contractor/native-identity`, zero runtime dependencies, no tRPC import) that defines how a native client signs in, how its session is rotated and revoked, how a device is registered and removed, and how credentials are stored and redacted — plus the report recording the design decision and the server-enforcement obligations that make the acceptance criteria true. The package is the client-side half of the identity boundary; the server-side half stays where it is today: the app's existing session service and session middleware, which the mount binds to without adding a single domain writer (the port surface test in §8 pins the port to exactly five infrastructure methods).

Identity is stage 1 of the M03-T01 guard pipeline — every adapter dispatch is session-derived, and a session that is expired, revoked, or wiped fails that stage server-side. This package defines where that session comes from and what its lifecycle guarantees are; it deliberately does NOT re-implement any server decision. Every outcome type in the contract (`RotateOutcome`, `LogoutOutcome`, `DeviceRemoveOutcome`, `AccountSwitchOutcome`) is a **server decision typed for the client**, so the client cannot invent success.

## 2. Design decision: system-browser sign-in (selected, ratified at the M03-GATE)

The acceptance line reads "native sign-in uses the system browser **if the owner-ratified identity design selects that flow**." The v3 platform plan (owner-approved) already constrains the choice space: it forbids embedding the web app as a WebView, requires keeping browser httpOnly-cookie/CSRF protections and existing origin checks, and forbids weakening origin checks globally for native clients or embedding secrets in binaries. Within that space exactly one flow satisfies all three constraints, and this task selects it formally:

**Selected: system-browser authorization-code flow with PKCE (S256), exchange completed server-side.**

1. **The system browser (ASWebAuthenticationSession on iOS, Custom Tabs on Android, OS browser on desktop) owns the login UI and the session cookies.** httpOnly attributes, CSRF protections, and origin checks remain exactly what the web app enforces today — nothing moves, nothing is duplicated, nothing is weakened. A session cookie that the app never touches cannot be leaked by the app.
2. **No embedded WebView, structurally.** The contract exposes no webview surface at all; the only launch mechanism is the injected `SystemBrowserPort.open(authorizeUrl)`. A mount that wanted a WebView would have to bypass the port, which is visible in review.
3. **No secret in the binary.** The native client is a *public client*: its registration carries a client id (not a secret) and an exact redirect-URI allowlist. The only confidential step — exchanging the one-time authorization code for session tokens — happens **on the server**, behind the same session service the browser flow uses. An attacker decompiling the binary finds nothing usable.
4. **Anti-interception and anti-forgery are contract-enforced:** PKCE S256 (the verifier never leaves the device until the exchange; the challenge travels in the authorize URL), a ≥16-char `state` bound per flow, exact-match redirect allowlists (no wildcard origins), and callback validation that checks allowlist → state → error → code **in that order** before anything is sent to the server.

The selection is recorded here and in the package header; the M03-GATE (R8) is the owner-ratification checkpoint for the record, keeping the acceptance's conditional satisfied by construction.

## 3. Session lifecycle and server-enforced outcomes

Sessions are issued by the existing server session service as an **opaque token pair** (`accessToken`, `rotationToken`, server-stated `accessExpiresAt`). The client treats all three as opaque evidence — it never parses, constructs, or interprets them. All rotations of one sign-in share a `sessionFamilyId`, which is the revocation unit. The lifecycle, with the server obligation for each transition:

| Transition | Server-enforced outcome | Client behavior (tested) |
|---|---|---|
| Sign-in (code exchange) | Code is single-use and PKCE-verified server-side; device record created/updated; session + family minted | Tokens persisted ONLY in the secure store; in-flight PKCE evidence wiped on both success and failure; a failed exchange persists no credentials |
| Access expiry | Enforced server-side: expired access evidence fails the M03-T01 `identity` stage — there is no client-side grace state | Client uses rotation proactively; expiry surfaces as the typed `session_expired` outcome |
| Rotation | Fresh pair issued; old rotation token invalidated | Fresh pair replaces the stored one atomically; family id continuity asserted |
| **Rotation reuse detected** | **The whole session family is revoked server-side** (NIST 800-63B refresh-token-replay posture): a replayed rotation token is theft evidence | Client wipes all local credentials on `reuse_detected` — while preserving pending work (§6) |
| Logout | Session invalidated server-side; later adapter calls fail the identity stage | Gated on pending work first (§6); on clean logout, server invalidation then local `wipeAll` |
| Session revoked (anywhere) | Server rejects subsequent use; family dead | Typed `session_revoked`; credentials wiped; pending work preserved |
| Device removal | **Every session of that device is revoked** across all its families | Removing the CURRENT device gates on pending work first and wipes credentials on `removed`; removing another device is a pure server call and leaves the local session untouched |
| Account switch | The target account authenticates through the same system-browser flow; there is no silent local identity swap | Gate (§6) → server-side teardown of the current session → fresh sign-in; the stored session is asserted to be the TARGET account, and a teardown failure aborts with the working session intact |

Two structural guarantees deserve emphasis. First, **the gate runs before any destructive transition** — logout, current-device removal, and account switch all snapshot pending work and, if anything is pending, return `gated` with the summary having touched *neither* the server session *nor* local data (test: `logout gates on pending work` asserts the service call log ends at `exchangeCode` and the credentials remain). Second, **there is no code path on this client that uploads or deletes pending work** — the client has no such port; resolution belongs to the M03-T03 outbox and the M03-T07 orchestrator, and the gate's only job is to make sure the user sees the work before anything becomes inaccessible.

## 4. Device registration and removal

A device record is **infrastructure, not a business entity**: `deviceId`, human label, platform, the registering app version, and last-seen time. Registration happens as part of the code exchange (the exchange input carries the registration triple), so a device cannot exist without a session and a session cannot exist without a device — the pairing the sync engine (M03-T07 envelope: operation/device identity) depends on. Removal semantics follow the table above: the device is the revocation handle for every session it ever created, which is what makes a stolen-device story answerable ("remove the device → every session on it dies server-side, whatever its family"). The port also carries `listDevices` so the account surface can show registered devices; the seed test pins the port surface to exactly `exchangeCode, rotate, logout, removeDevice, listDevices` — no domain operation can hide there.

## 5. Secure credential storage and redaction

`SecureCredentialStore` is the **only** sanctioned persistence surface for credentials on a device, with a declared `SecureStorageBinding` naming the OS backing: `ios.keychain` / `macos.keychain` (Keychain, ThisDeviceOnly), `android.keystore` (Keystore-backed EncryptedSharedPreferences), `windows.credential-manager` (user scope; machine scope forbidden), `linux.secret-service`. Filesystem, SharedPreferences, SQLite, and NSUserDefaults are NOT credential stores; routing credentials anywhere else is a protocol violation caught in review by the declared binding. The store fails **closed**: when the OS store is unavailable, every operation throws the typed `credential_store_unavailable` error and the client never falls back to non-secure storage (tested on all four operations). The package ships only a `MemoryCredentialStore` test double — it never persists anything itself.

Redaction is the shared vocabulary for the "never in logs, crash reports, or telemetry" acceptance line: `redactSecret` reduces any credential to a stable fingerprint (`fp_<fnv1a32-hex>_len<N>`), and `scrubForReport` deep-scrubs any object under credential-shaped keys (`token`, `secret`, `password`, `credential`, `authorization`, `cookie`, `verifier`, …), preserving diagnostic structure (counts, ids, labels) so reports stay useful. Tests assert the originals never survive scrubbing and that non-secret fields pass through untouched. The fingerprints are correlation aids, not security controls — the security property is removal, and that is what is tested.

## 6. Pending work: surfaced, never silent

The `PendingWorkGate` snapshot counts four buckets — pending operations (M03-T03 outbox), oldest pending age, private drafts, and staged-but-unregistered attachments (M03-T06) — and `hasPendingWork` treats any nonzero bucket as blocking. The gate is consulted by logout, current-device removal, and account switch; while work is pending these return `gated` with the summary so the surface can present it. This implements the v3 offline discipline verbatim: unsynchronized work is surfaced before it can become inaccessible, private drafts are never silently uploaded (the client cannot upload at all), and nothing is silently deleted (the client has no delete path). Credential wipes (logout/revocation/reuse) deliberately do NOT touch pending work — different store, different lifecycle — and the reuse-detection test asserts the summary survives the wipe intact.

## 7. Guard preservation and the no-domain-writers rule

Nothing here adds a server-side domain feature or a domain writer: sessions and devices are infrastructure records, the port surface is pinned to five infrastructure methods by test, and the device/session model introduces no business entity that would need change-feed integration. The standing constraint is still recorded for the future: any server-side domain feature added later must name its change-feed integration and Flutter-parity path in its own packet. On the guard side, the design *strengthens* the M03-T01 identity stage: sessions die server-side (rotation reuse, logout, revocation, device removal, expiry), so a stolen token set has a bounded life, and the adapter's identity stage is the single enforcement point that notices. Browser sessions are untouched: this contract creates a parallel native session, it does not alter the web app's httpOnly-cookie/CSRF/origin posture. The Flutter consumer for this contract is the M03-T07 orchestration surface (and the parity evidence path runs through M10); the mount PR will bind `SessionServicePort` to the app's existing session service and record the binding in the M03 register.

## 8. Test evidence and CI wiring

`packages/native_identity/test/identity.test.ts` runs **26 `node:test` cases** mapping the acceptance matrix: PKCE shape (verifier length/alphabet, S256-style challenge derivation, determinism); authorize-URL construction (https, response type, client id, state, challenge) and its three typed rejections (non-allowlisted redirect, http endpoint, weak state); callback validation order (code extraction; state mismatch; phished redirect; provider error; missing code); sign-in happy path (system browser opened with the contract URL, tokens persisted, in-flight evidence cleaned) and both failure modes (exchange rejection persists nothing; attacker callback rejected **before** any server call — asserted via an empty service-call log); rotation success with family continuity; reuse detection wiping credentials while preserving pending work; expiry/revocation as typed sign-outs; the logout gate (no server call, no wipe, summary surfaced) and clean logout; `already_invalidated` without a session; device removal gating/wipe/other-device/not_found/forbidden; account-switch gate, clean switch (target session asserted), and teardown-failure abort; credential-store round-trip plus fail-closed behavior on a simulated unavailable store; redaction guarantees; the pending-work predicate; and the no-domain-writers port-surface pin. CI runs the suite as a new **"Run Native Identity Contract Tests"** step (`tool/check.mjs`, pinned `typescript@5.9.3`) in the `lint_and_protocol` job of `client-ci.yml`, following the M03-T01 precedent.

## 9. Non-goals and follow-ups

- **No transport mount.** Binding `SessionServicePort` to the app's real session service, wiring the deep-link handler, and cutting the redirect-URI allowlist per platform are mount work in the Construction_Manager app; the ports here are shaped so that mount stays thin.
- **No server-side session-store changes.** Rotation reuse detection, family revocation, and device-scoped revocation are obligations the mount implements against the existing session infrastructure; if the current store lacks any of them, that is a follow-up task packet, not an amendment here.
- **No release cut, no domain activation.** Same posture as M03-T01 §7.
- **Dart/Rust ports** of this contract follow the M02 platform_contracts generation pattern when the Flutter mount lands (M03-T07 surface).
