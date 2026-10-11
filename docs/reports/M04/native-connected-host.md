# M04 native connected host

Status: connected native host implemented; device acceptance and M04 exit evidence remain open.

## Composition

`ConnectedM04Host` composes the existing `DailyReportScreen` with native PKCE identity, OS secure storage, the local SQLite outbox, the product sync endpoint, the resumable photo-upload route, and the enrolled project's `project.list` procedure. The same report widget is also used by the browser mount. The host keeps project choices in an account-scoped local cache for offline startup. Product permission checks remain authoritative on the server.

The native callback is `com.nacrose.contractor.constructionclient://auth/callback`. The host is selected with `CONTRACTOR_SERVER_URL`; omitting that define retains the local preview. Project upload references use the registered FieldPhoto receipt, matching the product `workflow.dailyReport.createFieldReport` contract. Local UUIDs remain journal identities.

The preview and connected host now apply the same M04 SQLite migrations, including version 9 for the project cache. This prevents a database opened in preview from appearing to require a destructive downgrade when the connected host starts.

## Native sign-in diagnostic

The first connected iPhone sign-in attempts returned to the login page. At
that time, the LAN origin was absent from the Next dev allowlist and the
development bundle could be blocked. The owner approved the LAN-origin fix;
the product branch now includes the pre-hydration visibility and LAN-origin
changes (latest local product commit `b0fa3372`). A later owner screenshot
showed a different, explicit failure: Prisma could not find `DATABASE_URL`.
That newer evidence means the login request reached the product server, and
the missing server database configuration was the immediate blocker for that
attempt. The local dev environment has since been restarted with a working
database connection. The owner later reported that the iPhone opens the daily-
report page. That establishes owner-reported screen visibility, but does not
identify whether the build is local preview or connected mode, nor prove
callback exchange, an assigned project, or live sync acceptance. No
server-side HTML form fallback was added or is claimed.

## Local environment

At the earlier connected-host checkpoint, the signup PostgreSQL cluster was at `127.0.0.1:5433`, database `contractor_m04_signup`; the additive native PKCE and resumable-photo migrations applied successfully and preserved existing account data. At one 2026-10-11 check, the Wi-Fi forwarder at `192.168.1.66:3000` was not active. A later listener inspection found Node bound to `192.168.1.66:3000` and the product server bound to `*:3108`, but HTTP requests from the development sandbox could not connect to either port. This confirms neither iPhone reachability nor forwarding behavior. An HTTP 200 on the login page, when available, proves only that the page is served; it does not prove browser JavaScript hydration or a session. The owner first reported the direct `:3108` sign-in attempt reloading the login page, then later reported that the iPhone opens the daily-report page. Those reports establish screen visibility but do not identify the build mode or prove an authenticated session.

## Run the connected M04 app

Use `prototype/construction_client/`, not the separate `apps/construction_client/` Flutter counter scaffold. `ContractorOsApp` selects local preview whenever the compile-time `CONTRACTOR_SERVER_URL` define is absent. Opening `ios/Runner.xcworkspace` and pressing Xcode's default Run does not inherit a `--dart-define` passed to an earlier Flutter command; that build therefore opens the local preview directly on the report editor and cannot authenticate or sync.

For the connected iPhone build, use Flutter tooling from the client directory and pass the direct Mac Wi-Fi server URL on the same command. The local dev server is currently listening on port `3108` with its database environment configured; the environment is process-local and must be supplied again if that process exits. Prefer release mode for the wireless iPhone because the prior debug build installed but lost its Dart VM service connection:

```sh
cd prototype/construction_client
MAC_WIFI_IP="$(ipconfig getifaddr en0)"
flutter run --release -d <iPhone-UDID> \
  --dart-define="CONTRACTOR_SERVER_URL=http://${MAC_WIFI_IP}:3108"
```

The Xcode workspace remains `prototype/construction_client/ios/Runner.xcworkspace`; running it without setting the same compile-time define is only a local-preview check. For macOS, use `flutter run -d macos --dart-define=CONTRACTOR_SERVER_URL=http://127.0.0.1:3108`. After native sign-in, confirm the assigned test project, save one test report locally, then sync it. Do not treat the Safari `No assigned projects` screen as native-app evidence.

## Validation

- Native identity, daily report editor, callback, attachment journal, snapshot bootstrap, and mounted fault fixture tests: 30 passed.
- Flutter analysis of the connected host, identity client, migrations, and editor: no issues.
- Connected iOS release build with `CONTRACTOR_SERVER_URL` set: succeeded (no code signing; not installed or launched).
- Connected macOS release build with `CONTRACTOR_SERVER_URL` set: succeeded (not launched).
- Connected web release build with `CONTRACTOR_SERVER_URL` set: succeeded (not launched in a browser).
- Local login route returned HTTP 200; upload endpoint returned HTTP 401 without credentials, confirming auth is required.
- Product schema reports all 89 migrations applied to the local signup database.
- In this checkpoint, no app was opened and no screen was viewed or captured by the agent.

## 2026-10-11 launch-mode correction

The owner's screenshot showing the report editor with a `LOCAL PREVIEW` ribbon is evidence of the preview host, not the connected host. The owner separately reported that the iPhone opened the report editor after launching from Xcode. Since the default Xcode Run scheme does not set `CONTRACTOR_SERVER_URL`, this was the expected preview fallback. A later connected debug run included the server define but Flutter could not keep the wireless Dart VM service connection and terminated; no connected sign-in or sync is established by that run. The Safari screenshot reading `No assigned projects` is a browser page and is not evidence about the native app's project list. The owner has since reported that the daily-report page is open in the iPhone app. This confirms reported page visibility; without a connected-mode state or accepted sync result, it does not distinguish preview from connected mode. Do not ask the owner to repeat launch steps just to prove the page renders.

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
work, exposes retry from the Save and sync panel, and adds offline, conflict,
rejection, lost-ack, and disk-full recovery transcripts through the shared
screen. The latest full Flutter suite passes **213 tests** and `flutter analyze
--no-pub` is clean. The lost-ack screen test retries the same operation and
recovers its original receipt after a simulated server commit/lost response;
the expired-session screen test routes the mounted orchestrator's auth event to
the sign-in recovery notice and confirms the report remains pending. Both remain
fixture evidence, not live server sessions.
The connected iOS release (`--no-codesign`), macOS release, and web release
were rebuilt after the recovery changes with `CONTRACTOR_SERVER_URL` set and
all three compiled successfully. The iOS artifact is unsigned. No app was
launched or screen inspected for that follow-on.

## 2026-10-11 local database configuration diagnosis

The owner later supplied a login-page screenshot showing Prisma's
`DATABASE_URL`-missing error. Inspection of the live local dev process confirmed
that its environment did not contain `DATABASE_URL`; the local PostgreSQL
service was stopped. The existing local database was retained, PostgreSQL was
started, and the Next.js dev server was relaunched on port 3108 with a database
URL and a process-local development auth secret. Prisma queries then executed
successfully in the server process. This verifies database connectivity only;
the owner later reported the daily-report page open on iPhone, but did not
identify the build mode or provide a connected-session result; session
creation, project loading, and report acceptance therefore remain unverified.
The environment was supplied to the
running process and was not written into the repository. The server process
must be restarted with equivalent environment values if it exits.

A local HTTP probe after relaunch returned 200 for `/login` through both
loopback and the Mac's LAN address. This confirms the server accepts requests
on that interface, not that the iPhone has reached it or completed sign-in.

After that recovery, connected-mode compile checks succeeded for iOS release
(`--no-codesign`), macOS release, and web release, each with
`CONTRACTOR_SERVER_URL` set to the current local dev origin. No target was
installed or launched by the agent; the iOS artifact remains unsigned.

## Remaining M04 evidence

A compile and mocked protocol suite do not prove the device round trip. Still required are a user-run native sign-in, accepted report visible in the web app and a second device, interrupted upload recovery on device, a new-device snapshot and registered-photo restore, the full mounted fault matrix, real-device latency/battery/background/crash telemetry, native-and-web recorded workflow evidence, the current-rule parity audit, and the owner's M04 gate after M05 refinement. No M04 task beyond T01 and T02 is marked complete by this report.
