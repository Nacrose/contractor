# M04-T03: Daily-report workflow implementation progress

- **Status:** implementation in progress; task acceptance is not claimed.
- **Branch:** `codex/m04-t03-native-callback` (stacked native callback PR #52)
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
- **Typed row editor follow-on (2026-10-10):** replaced the JSON section text areas with typed workforce, progress, equipment, received-material, and consumed-material rows. Serialization follows the current product builder's defaults, numeric conversion, nullable fields, and sort-order shape. A widget test confirms workforce and progress payload rows; the complete Flutter suite passes (181 tests) and `flutter analyze` reports no issues. This local parity improvement does not satisfy the product-server binding or current-app round-trip acceptance.
- **Product adapter/feed follow-on (2026-10-10):** after user approval, [Construction_Manager PR #165](https://github.com/Nacrose/Construction_Manager/pull/165) adds `/api/native/sync` for `workflow.dailyReport.createFieldReport`, reusing the protected procedure, plus server-verified registered-photo references. Stacked [PR #166](https://github.com/Nacrose/Construction_Manager/pull/166) prepares the PostgreSQL CDC worker and scoped pull route. Both remain draft and unmerged. PR #166's Vercel Preview is Ready, but the persistent worker is not deployed. The user confirmed local signup works, but the native client has no sign-in/token-exchange integration yet, so no authenticated acceptance or second-device round trip has been demonstrated. T03 remains open.
- **Native callback follow-on (2026-10-10):** Contractor OS [PR #52](https://github.com/Nacrose/contractor/pull/52) registers and handles the app callback URI on iOS/macOS/Android, including warm and cold starts. The PKCE server endpoints are in stacked product [PR #167](https://github.com/Nacrose/Construction_Manager/pull/167), still draft and unmerged. This is callback plumbing only; a Flutter identity client has not yet initiated sign-in or exchanged a code.
- **Physical iPhone preview (2026-10-10):** built and launched the signed M04 local-preview app from `prototype/construction_client/` on the paired iPhone; a device screenshot was captured and visually inspected locally. It shows the daily-report editor, local-save action, honest offline sync state, and `LOCAL PREVIEW` marker. The screenshot remains local and is not part of the PR. This confirms the correct app entrypoint renders; it does not prove server sign-in, photo registration, or cross-device sync. The wireless Flutter VM later disconnected, so no sustained device telemetry session is claimed.
- **Live scope and verification:** the widget host must supply real authenticated account/project data and an endpoint; the owner still needs the end-to-end acceptance proof and M04-T08 verification request.
- Photos, device fault matrix, restore, hardware telemetry, and the owner gate remain assigned to T04–T09.
