# M04 native connected host

Status: connected native host implemented; device acceptance and M04 exit evidence remain open.

## Composition

`ConnectedM04Host` composes the existing `DailyReportScreen` with native PKCE identity, OS secure storage, the local SQLite outbox, the product sync endpoint, the resumable photo-upload route, and the enrolled project's `project.list` procedure. The same report widget is also used by the browser mount. The host keeps project choices in an account-scoped local cache for offline startup. Product permission checks remain authoritative on the server.

The native callback is `com.nacrose.contractor.constructionclient://auth/callback`. The host is selected with `CONTRACTOR_SERVER_URL`; omitting that define retains the local preview. Project upload references use the registered FieldPhoto receipt, matching the product `workflow.dailyReport.createFieldReport` contract. Local UUIDs remain journal identities.

The preview and connected host now apply the same M04 SQLite migrations, including version 9 for the project cache. This prevents a database opened in preview from appearing to require a destructive downgrade when the connected host starts.

## Native sign-in diagnostic

The owner tried the connected iPhone sign-in flow; the browser returned to the
login page instead of showing a completed session or returning to Contractor
OS. Product source inspection found that the local Next dev-origin allowlist
includes `localhost` and `127.0.0.1`, but not the Mac Wi-Fi host used by the
iPhone (`192.168.1.66`). The login form submits through a client-side React
handler and has no server form action. If the LAN-origin restriction prevents
the login JavaScript from loading, the browser can fall back to a GET and
reload the login page. This is the leading code-based diagnosis, not a proven
runtime cause; browser network/console evidence is unavailable. The product
repo requires explicit owner confirmation before edits, so the LAN-origin
change remains pending approval. Native sign-in and live sync acceptance are
still open.

## Local environment

At the earlier connected-host checkpoint, the signup PostgreSQL cluster was at `127.0.0.1:5433`, database `contractor_m04_signup`; the additive native PKCE and resumable-photo migrations applied successfully and preserved existing account data. On the current 2026-10-11 check, neither `127.0.0.1:3108` nor the LAN forwarder `192.168.1.66:3000` accepts connections. Start the local product server and its Wi-Fi forwarder before retrying device sign-in. The previous login-page reload remains the last device result; no authenticated session is established.

## Run the M04 app

Use `prototype/construction_client/`, not the separate `apps/construction_client/` Flutter counter scaffold. From the Flutter client directory, run `flutter run -d <iPhone-UDID> --dart-define=CONTRACTOR_SERVER_URL=http://<Mac-Wi-Fi-IP>:3108`; for the Mac desktop, use `flutter run -d macos --dart-define=CONTRACTOR_SERVER_URL=http://127.0.0.1:3108`. The Xcode workspace is `prototype/construction_client/ios/Runner.xcworkspace`. Launch a debug build from Flutter tooling or Xcode, not from the iPhone Home Screen.

## Validation

- Native identity, daily report editor, callback, attachment journal, snapshot bootstrap, and mounted fault fixture tests: 30 passed.
- Flutter analysis of the connected host, identity client, migrations, and editor: no issues.
- Connected iOS release build: succeeded (no code signing; not installed or launched).
- Connected macOS debug build: succeeded (not launched in this checkpoint).
- Local login route returned HTTP 200; upload endpoint returned HTTP 401 without credentials, confirming auth is required.
- Product schema reports all 89 migrations applied to the local signup database.
- In this checkpoint, no app was opened and no screen was viewed or captured by the agent.

## 2026-10-11 follow-on

After wiring orchestrator authentication/revocation events into the shared
screen, the full Flutter suite passes (207 tests) and `flutter analyze
--no-pub` is clean. Current compile-only builds also pass for unsigned iOS
release (`build/ios/iphoneos/Runner.app`), macOS debug
(`build/macos/Build/Products/Debug/construction_client.app`), and web release
(`build/web`). The screen now lists account-and-tenant-scoped locally saved reports and
reopens their fields after navigation or process restart; dispatched reports
are read-only, while rejected reports can be corrected as a new operation.
Widget coverage verifies reopened drafts and rejected corrections. These builds
compile the shared Flutter host; the iOS build is
unsigned and no platform app was launched or installed by the agent. The
expired-sign-in and revoked-access notices are shown inside the shared device
sync-health card and covered by separate widget tests; the mounted fault tests
verify auth-event delivery with the pending operation ID. The login route
returned HTTP 200 over both loopback and the Mac Wi-Fi address. The iOS build
uses that Wi-Fi address so a physical iPhone can reach the local server.

Subsequent M04 status work makes incomplete photo transfers count as retained
work, exposes retry from the Save and sync panel, and adds an offline transport
failure transcript through the mounted sync-health screen. The latest full
Flutter suite passes **208 tests** and `flutter analyze --no-pub` is clean.
Those platform compile checks predate the status-only changes. No app was
launched or screen inspected for that follow-on.

## Remaining M04 evidence

A compile and mocked protocol suite do not prove the device round trip. Still required are a user-run native sign-in, accepted report visible in the web app and a second device, interrupted upload recovery on device, a new-device snapshot and registered-photo restore, the full mounted fault matrix, real-device latency/battery/background/crash telemetry, native-and-web recorded workflow evidence, the current-rule parity audit, and the owner's M04 gate after M05 refinement. No M04 task beyond T01 and T02 is marked complete by this report.
