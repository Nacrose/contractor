# M04-T03: Daily-report workflow implementation progress

- **Status:** implementation in progress; task acceptance is not claimed.
- **Branch:** `m04-t03-daily-workflow`
- **Date:** 2026-10-10

## Implemented locally

- A shared Flutter daily-report editor uses the M02 `RouteRegistry` and `CommandRegistry`, `construction_ui` `ActionBar`, and `SaveSyncStatusPanel`.
- The form model preserves the current product `workflow.dailyReport.createFieldReport` fields and JSON section names. Photos are left to M04-T04.
- The native local store commits `daily_report_local` and the matching `workflow.dailyReport.createFieldReport` outbox item in one SQLite transaction. Its feature migration is versioned after the M04-T02 mount schema.
- A report can be edited while its operation is pending and has never been dispatched. After the first attempt, its payload is immutable so its idempotency key cannot be replayed with changed data.
- The M03-T07 drain policy is mounted and its launch/foreground/manual/background trigger callback can be bound to an active account. Missing/mismatched acceptance receipts are retained for safe retry.
- The editor reads the M03-T08 device health model, showing pending work, age, conflicts, blocked operations, rejection reasons, and recorded accepted cursors without claiming pending work is synced.

## Evidence run

- `flutter test test/workflows/daily_report_workflow_test.dart test/workflows/daily_report_screen_test.dart test/mount/sync_orchestrator_test.dart test/mount/drain_triggers_test.dart` — **20 tests passed**. The tests cover atomic rollback, reopen durability, pre-dispatch edits, widget rendering and local save, lost-ACK replay, dependency ordering, auth stop, conflict retention, and trigger binding.
- `dart analyze` on the workflow, mount, tests, and screen — **no issues found**.
- `flutter build web --debug -t lib/m04_compile_check.dart` — **web compilation succeeded** for the screen's dependency graph. The temporary compile entrypoint was removed after the run.

## Acceptance still open

- **Browser persistence:** web compilation does not prove a browser can save. `openNativeSqliteDriver` still fail-closes on web, and no IndexedDB-backed implementation of `DailyReportWorkflowStore` is mounted.
- **Server binding:** the product repo still needs the approved M03 adapter/feed binding for `workflow.dailyReport.createFieldReport`, including server permission revalidation and an atomic feed event. Until that is merged, no server acceptance or second-device visibility is claimed. The user approval request for this separate product-repo PR is pending.
- **Live scope and verification:** the widget host must supply real authenticated account/project data and an endpoint; the owner still needs the end-to-end acceptance proof and M04-T08 verification request.
- Photos, device fault matrix, restore, hardware telemetry, and the owner gate remain assigned to T04–T09.
