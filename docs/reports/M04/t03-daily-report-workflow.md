# M04-T03: Daily-report workflow implementation progress

- **Status:** implementation in progress; task acceptance is not claimed.
- **Current branch:** `codex/m04-connected-host` (Contractor PR #55, stacked on the native callback and photo workflow PRs)
- **Date:** 2026-10-10

## Implemented locally

- A shared Flutter daily-report editor uses the M02 `RouteRegistry` and `CommandRegistry`, `construction_ui` `ActionBar`, and `SaveSyncStatusPanel`.
- The form model preserves the current product `workflow.dailyReport.createFieldReport` fields and JSON section names. The T04/T06 client serializes only registered attachment references (`attachmentId`, `receipt`, `digest`, `fileSize`). Product PR #165 prepares the matching schema and transaction binding; it remains unmerged.
- The native local store commits `daily_report_local` and the matching `workflow.dailyReport.createFieldReport` outbox item in one SQLite transaction. Its feature migration is versioned after the M04-T02 mount schema.
- A report can be edited while its operation is pending and has never been dispatched. After the first attempt, its payload is immutable so its idempotency key cannot be replayed with changed data.
- The M03-T07 drain policy is mounted and its launch/foreground/manual/background trigger callback can be bound to an active account. Missing/mismatched acceptance receipts are retained for safe retry.
- The editor reads the M03-T08 device health model, showing pending work, age, conflicts, blocked operations, rejection reasons, and recorded accepted cursors without claiming pending work is synced.

## Evidence run

- `flutter test test/workflows/daily_report_workflow_test.dart test/workflows/daily_report_screen_test.dart test/mount/sync_orchestrator_test.dart test/mount/drain_triggers_test.dart` — **20 tests passed**. The tests cover atomic rollback, reopen durability, pre-dispatch edits, widget rendering and local save, lost-ACK replay, dependency ordering, auth stop, conflict retention, and trigger binding.
- `dart analyze` on the workflow, mount, tests, and screen — **no issues found**.
- `flutter build web --debug -t lib/m04_compile_check.dart` — **web compilation succeeded** for the screen's dependency graph. The temporary compile entrypoint was removed after the run.

## Acceptance still open

- **Browser persistence:** the browser host supplies its credential binding explicitly; `openBrowserMount` no longer falls back to the native keystore factory on web. The editor awaits the mount durability barrier after local writes. `flutter run -d chrome --web-port 4181 -t tool/m04_browser_probe.dart` logged PASS after saving a `DailyReportLocalStore` draft and matching pending operation, closing the browser mount, reopening IndexedDB, and reading both back. The probe uses a test-only credential fixture and does not exercise sign-in. The shared editor still lacks an authenticated product host, server acceptance, and second-device visibility, so T03 remains open.
- **Typed row editor and local recovery follow-on (2026-10-11):** replaced the JSON section text areas with typed workforce, progress, equipment, received-material, and consumed-material rows. Serialization follows the current product builder's defaults, numeric conversion, nullable fields, and sort-order shape. Widget coverage confirms all five payload shapes. The shared screen now lists account-and-tenant-scoped local reports and restores the form after it is recreated; unsent reports remain editable, dispatched reports are read-only, and rejected reports produce a corrected copy with a new UUID while retaining the rejected operation. The full Flutter suite passes (207 tests), `flutter analyze` reports no issues, and iOS/macOS/web builds compile. This improves local recovery but does not satisfy product-server binding or current-app round-trip acceptance.
- **Product adapter/feed/auth follow-on (2026-10-11):** after user approval, [Construction_Manager PR #165](https://github.com/Nacrose/Construction_Manager/pull/165) adds `/api/native/sync` for `workflow.dailyReport.createFieldReport`, reusing the protected procedure, plus server-verified registered-photo references. Stacked [PR #166](https://github.com/Nacrose/Construction_Manager/pull/166) prepares the scoped feed/snapshot route, [PR #167](https://github.com/Nacrose/Construction_Manager/pull/167) adds native PKCE endpoints, and [PR #170](https://github.com/Nacrose/Construction_Manager/pull/170) adds resumable photo upload and snapshot digest data. A fresh GitHub status check on 2026-10-11 confirmed these were open drafts; current GitHub API access is unavailable, so status has not been refreshed. The first native sign-in attempts did not establish a session; a later screenshot identified the missing local `DATABASE_URL` as the immediate server error. That environment has since been restored, and the owner reports the iPhone daily-report page open, but connected authentication, accepted report sync, and second-device visibility remain unproven.
- **Native callback follow-on (2026-10-10):** Contractor OS [PR #52](https://github.com/Nacrose/contractor/pull/52) registers and handles the app callback URI on iOS/macOS/Android, including warm and cold starts. The connected Flutter host now initiates native PKCE sign-in and processes the callback; the product endpoints remain in draft PR #167. T03 still lacks a successful authenticated report round trip.
- **Physical iPhone preview (2026-10-10):** built and launched the signed M04 local-preview app from `prototype/construction_client/` on the paired iPhone; a device screenshot was captured and visually inspected locally. It shows the daily-report editor, local-save action, honest offline sync state, and `LOCAL PREVIEW` marker. The screenshot remains local and is not part of the PR. This confirms the correct app entrypoint renders; it does not prove server sign-in, photo registration, or cross-device sync. The wireless Flutter VM later disconnected, so no sustained device telemetry session is claimed.
- **Live scope and verification:** the widget host must supply real authenticated account/project data and an endpoint; the owner still needs the end-to-end acceptance proof and M04-T08 verification request.
- Photos, device fault matrix, restore, hardware telemetry, and the owner gate remain assigned to T04–T09.

## Connected-host follow-on (2026-10-11)

The `codex/m04-connected-host` branch now has a connected Flutter host in `lib/main_m04_host.dart` and `lib/connected_m04_host.dart`. It starts native PKCE sign-in, uses the authorized HTTP client for the daily-report operation, fetches assigned projects, restores the snapshot/feed, binds photo registration, and renders the same `DailyReportScreen` on native and web. The user confirmed that `http://127.0.0.1:3108/login` renders; that check proves the local login page only, not native sign-in or report acceptance.

On 2026-10-11, the owner supplied an iPhone screenshot of the report editor in `LOCAL PREVIEW`. It showed no selected project, an unsaved device state, no queued server operation, zero pending work, and no accepted cursor. This is native-render evidence only. The preview is the documented fallback when `CONTRACTOR_SERVER_URL` is omitted; the connected-host path must be launched with that define to exercise PKCE and server sync. The image is intentionally not stored in or uploaded with the PR.

A later owner-supplied screenshot shows the connected-host sign-in gate on iPhone. This confirms the device launch reaches the native authentication entry point; it does not yet confirm browser authorization, callback handling, project loading, or server acceptance. The image is intentionally not stored in or uploaded with the PR.

The earliest iPhone sign-in attempts reloaded the login page; at that time the LAN dev-origin fix had not yet been applied. The owner approved that fix, which is present on the product branch along with the login-page pre-hydration visibility fix. A later screenshot showed an explicit Prisma error because the local dev server lacked `DATABASE_URL`; the local database service and server environment have since been restored, and Prisma queries execute. The owner subsequently reported that the iPhone opens the daily-report page. This does not identify whether that build is local preview or connected mode, so callback exchange, assigned-project loading, and server acceptance remain unverified. No credentials are recorded here.

Current code checks: full Flutter suite **215 passed**; `flutter analyze` **no issues**. The health card displays the exact decimal per-project checkpoint from `daily_report_feed_cursor` separately from outbox acceptance sequences; the focused widget test checks a value beyond JavaScript's exact-integer range. Widget tests also cover local draft recovery, reopened rejected-report correction, retained/visible conflict and rejection states, lost-ack recovery on the mounted screen by replaying the same operation and recovering its receipt, expired-session and revoked-access delivery to the corresponding recovery notices, mounted offline/timeout retry through acceptance, and rejection/disk-full recovery transcripts. These use deterministic fixtures, not the product server or a real disk failure. Connected-mode iOS release (`--no-codesign`), macOS release, and Flutter web release builds all compiled with `CONTRACTOR_SERVER_URL` set at this checkpoint. The local backend now has a database connection, and the owner reports the iPhone daily-report page is open; no authenticated sync result has been provided. Product adapter/feed/auth/photo work remains in the stacked Construction_Manager PRs and has not been exercised through Flutter with the local account. Therefore acceptance still lacks a successful authenticated report round trip, web visibility, and second-device visibility.

## Cross-repository verification update (2026-10-11)

- `flutter test` in `prototype/construction_client/` — **215 tests passed**.
- `flutter analyze` in `prototype/construction_client/` — **no issues found**.
- Native product route tests on the current M04 product branch — **41 tests passed across 7 files** (sync, change feed, snapshot, photo upload, and PKCE routes).
- The M03 native-adapter contract compiled with TypeScript 5.9.3 and its **18 contract tests passed**.
- Product commit `449f50ae` on PR #170 mounts `/api/native/sync` through the shared adapter, registry, exact version resolver, and guard chain. The product route maps existing server authorization and dispatches to `workflow.dailyReport.createFieldReport`; it does not use `fieldSubmission.create`.
- Product `tsc --noEmit` passed; `npm run build -- --webpack` generated all 73 routes. The default Turbopack attempt was unable to bind its PostCSS worker port in this environment after it resolved the adapter imports.

These checks independently verify the Flutter client, current product routes, and M03 adapter contract. Product PR #170 now includes the adapter binding; it remains unmerged. Automated checks do not substitute for authenticated report acceptance, photo registration, or second-device restore on the owner's local server.

The 2026-10-11 rerun on Contractor PR #55 commit `7d4da91` passed `flutter test --no-pub` — **215 tests** — and `flutter analyze --no-pub` — **no issues**. The latest additions cover visible disk-full recovery, rejection from the mounted sync transport, expired-session/revocation event delivery to the screen recovery notices, and offline/timeout retry through the mounted sync action to acceptance while retaining pending work after failure.

## Versioned edit and verification update (2026-10-11)

The shared Flutter editor now reopens accepted reports with their server
`updatedAt` version and submits edits as a new idempotent operation. If the
server reports a version conflict, the editor retains the local operation and
payload; the user can refresh accepted reports, compare/reconcile, and submit a
new operation without replacing the conflicted one. Product PR #170 now
dispatches `workflow.dailyReport.updateFieldReport`. Office and native updates
both use compare-and-swap on `updatedAt`. A product router test simulates an
office edit advancing the version and asserts a stale native update is
rejected before another write. This remains fixture evidence, not a live
database race or iPhone session.

The product repo's local login page at `http://127.0.0.1:3110/login` was checked
by the owner and reported rendering. The latest Safari evidence still showed
no assigned projects; project assignment, authenticated native sign-in, an
accepted report, and feed/second-device visibility have not been demonstrated.
Current verification on Contractor PR #55 is 219 passing Flutter tests with
clean `flutter analyze --no-pub`. Connected-mode release compilation also
passes for iOS (`--no-codesign`), macOS, and web with the local server origin.
These builds did not install or launch an app. M04-T03 remains open until the
product stack is merged and a connected report round trip is shown.

## Field-section parity follow-on (2026-10-11)

With the owner's approval, the shared Flutter editor now includes site visits and meetings, plus the current BOQ and plan-versus-actual progress fields: BOQ code and description, location, planned quantity, batched/placed quantity, payable quantity, and unit. Local drafts encode these as section rows. When reopening a legacy local draft, `taskDescription` and `actualQty` seed the newer description and quantity controls so existing work remains visible.

The product PR follow-up extends the `createFieldReport` schema and forwards visitor and meeting rows into the existing `syncNormalizedTables` service. Focused route tests check payload forwarding, normalized writes, and invalid JSON rejection before writes. The PR remains unmerged, and the test does not prove live account acceptance.

Latest verification on the current branch: `flutter test --no-pub` — **216 passed**; `flutter analyze --no-pub` — **no issues**. Connected release builds compiled for iOS (`--no-codesign`, server `http://192.168.1.66:3000`), macOS (server `http://127.0.0.1:3108`), and web (server `http://127.0.0.1:3108`). Product checks: the two affected Vitest files pass **72 tests**, `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` passes, and `NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack` compiles and generates all **73 routes**. Default Turbopack build remains unavailable in this environment because its PostCSS worker cannot bind its local port.

M04-T03 remains open pending a successful authenticated native report acceptance, feed delivery, visibility on the existing web app and a second device, and the live photo workflow. The owner has said they can assign the test account to a project; that assignment and the resulting project/report screen evidence are still pending.
