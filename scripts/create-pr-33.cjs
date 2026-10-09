#!/usr/bin/env node
/** Create PR #33 for M03-T02 (native identity & device lifecycle). */
const https = require("https");

const BODY = `## Task
Closes the **M03-T02** register item: implement native identity and device lifecycle. One task → one PR → one checkbox.

**Output (register):** native login/session/device contract and secure credential-storage adapter.

## What lands
- **\`packages/native_identity/\`** — new zero-dep TS contract package \`@contractor/native-identity\` (no tRPC import):
  - **System-browser sign-in** (authorization code + PKCE S256): \`buildAuthorizeUrl\` + \`validateCallback\` enforce, in order: exact redirect allowlist → state equality → provider error → code presence. The only launch mechanism is the injected \`SystemBrowserPort\` — no WebView surface exists structurally.
  - **Session lifecycle outcomes** typed for the client, enforced server-side: rotation (fresh pair; family continuity), **reuse detection → family revocation → local credential wipe**, expiry/revocation as explicit typed sign-outs, device removal (revokes every session of the device; current-device removal gates on pending work), account switch (gate → server teardown → fresh system-browser sign-in for the target).
  - **Secure credential storage**: \`SecureCredentialStore\` is the only sanctioned persistence surface (Keychain/Keystore/Credential Manager/Secret Service bindings declared); fails CLOSED when the OS store is unavailable — never a disk fallback. \`scrubForReport\`/\`redactSecret\` are the shared redaction vocabulary for logs/crash reports.
  - **Pending-work gate**: logout/current-device removal/account switch snapshot pending work first and return \`gated\` without touching server session or local data. The client has NO path that uploads or deletes pending work (v3 offline discipline).
- **\`docs/reports/M03/identity-device-design.md\`** — the design-decision record: system-browser flow selected (rationale: cookies stay in the browser jar; no WebView per v3; no secrets in binaries — public client + server-side exchange), server-enforcement obligations table, credential/redaction guarantees, guard-preservation notes, non-goals.
- **CI**: new "Run Native Identity Contract Tests" step in \`lint_and_protocol\` (\`tool/check.mjs\`, pinned typescript@5.9.3), following M03-T01 precedent.

## Acceptance mapping
- ✅ System-browser sign-in selected & structurally forced; browser httpOnly-cookie/CSRF/origin behavior untouched (report §2; no webview surface exists)
- ✅ Rotation, logout, revocation, expiry, device removal, account switching — explicit server-enforced outcomes, each handled in tests (report §3)
- ✅ Credentials only in OS secure storage; redaction tests prove originals never reach report shapes (report §5)
- ✅ Logout/account switch gate on unsynchronized work; no silent upload, no silent delete (report §6)
- ✅ No domain writers: port surface pinned by test to exactly \`exchangeCode, rotate, logout, removeDevice, listDevices\` (report §7)

## Evidence
- 26/26 node:test cases green locally (acceptance matrix per test name)
- Protocol linter PASS (13 milestone files, 129 tasks, rollup 48/129)
- Checkbox M03-T02 ticked with this PR ref; EXECUTION-PLAN M03 row → 2/10, program total 48/129
`;

const payload = JSON.stringify({
  title: "[M03-T02] feat: native identity and device lifecycle contract (system-browser PKCE, secure credential storage, pending-work gate)",
  head: "m03-t02-identity-device",
  base: "main",
  body: BODY,
});

const req = https.request(
  { hostname: "api.github.com", path: "/repos/Nacrose/contractor/pulls", method: "POST",
    headers: { "User-Agent": "task-bot", Authorization: "token " + process.env.GH_TOKEN,
      Accept: "application/vnd.github+json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
  (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => { const j = JSON.parse(d); console.log(res.statusCode, j.number ? `PR #${j.number} ${j.html_url}` : d.slice(0, 400)); });
  }
);
req.on("error", (e) => console.error("ERR", e.message));
req.end(payload);
