# M04-T03: Daily-report workflow implementation progress

- **Status:** implementation in progress; task acceptance is not claimed.
- **Branch:** `m04-t03-daily-workflow`
- **Date:** 2026-10-10

## Implemented locally

- A shared Flutter daily-report editor uses the M02 `RouteRegistry` and `CommandRegistry`, `construction_ui` `ActionBar`, and `SaveSyncStatusPanel`.
- The form model preserves the current product `workflow.dailyReport.createFieldReport` fields and JSON section names. A follow-on on `m04-t06-restore` now serializes registered attachment receipt/digest references in `photos`; the product procedure still needs the approved schema and transaction/feed update before those references can be accepted.
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
- **Product adapter follow-on (2026-10-10):** after user approval, [Construction_Manager PR #165](https://github.com/Nacrose/Construction_Manager/pull/165) adds `/api/native/sync` for `workflow.dailyReport.createFieldReport`, reusing the protected procedure, plus server-verified registered-photo references. Focused tests (105), TypeScript, and the production build pass; the user checked the production login build. The PR remains draft and is not merged. The product repository does not contain the CDC worker or feed pull route, so this adapter alone does not prove an atomic feed event, server-side feed visibility, or a second-device round trip. T03 remains open.
- **Live scope and verification:** the widget host must supply real authenticated account/project data and an endpoint; the owner still needs the end-to-end acceptance proof and M04-T08 verification request.
- Photos, device fault matrix, restore, hardware telemetry, and the owner gate remain assigned to T04–T09.
