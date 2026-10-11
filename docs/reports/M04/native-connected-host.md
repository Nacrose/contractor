# M04 native connected host

Status: connected native host implemented; device acceptance and M04 exit evidence remain open.

## Composition

`ConnectedM04Host` composes the existing `DailyReportScreen` with native PKCE identity, OS secure storage, the local SQLite outbox, the product sync endpoint, the resumable photo-upload route, and the enrolled project's `project.list` procedure. The same report widget is also used by the browser mount. The host keeps project choices in an account-scoped local cache for offline startup. Product permission checks remain authoritative on the server.

The native callback is `com.nacrose.contractor.constructionclient://auth/callback`. The host is selected with `CONTRACTOR_SERVER_URL`; omitting that define retains the local preview. Project upload references use the registered FieldPhoto receipt, matching the product `workflow.dailyReport.createFieldReport` contract. Local UUIDs remain journal identities.

The preview and connected host now apply the same M04 SQLite migrations, including version 9 for the project cache. This prevents a database opened in preview from appearing to require a destructive downgrade when the connected host starts.

## Local environment

The signup PostgreSQL cluster is at `127.0.0.1:5433`, database `contractor_m04_signup`. The additive native PKCE and resumable photo journal migrations (`20261023100000_native_pkce_sessions` and `20261023110000_native_photo_upload`) applied successfully; existing account data was preserved. The local product server is running on port 3108 and uses this database. The LAN address for a device on the same Wi-Fi is `192.168.1.66:3108`.

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
screen, the full Flutter suite passes (203 tests) and `flutter analyze
--no-pub` is clean. Current compile-only builds also pass for unsigned iOS
release (`build/ios/iphoneos/Runner.app`), macOS debug
(`build/macos/Build/Products/Debug/construction_client.app`), and web release
(`build/web`). These builds compile the shared Flutter host; the iOS build is
unsigned and no platform app was launched or installed by the agent. The
expired-sign-in and revoked-access notices are shown inside the shared device
sync-health card and covered by separate widget tests; the mounted fault tests
verify auth-event delivery with the pending operation ID. The login route
returned HTTP 200 over both loopback and the Mac Wi-Fi address. The iOS build
uses that Wi-Fi address so a physical iPhone can reach the local server.

## Remaining M04 evidence

A compile and mocked protocol suite do not prove the device round trip. Still required are a user-run native sign-in, accepted report visible in the web app and a second device, interrupted upload recovery on device, a new-device snapshot and registered-photo restore, the full mounted fault matrix, real-device latency/battery/background/crash telemetry, native-and-web recorded workflow evidence, the current-rule parity audit, and the owner's M04 gate after M05 refinement. No M04 task beyond T01 and T02 is marked complete by this report.
