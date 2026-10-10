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
- The web mount can open SQLite WASM over the package's IndexedDB VFS. It uses SQLite's rollback journal (the VFS does not provide WAL shared memory), `synchronous=FULL`, and a queued-write flush barrier after each report save. The database remains an evictable browser cache, with server synchronization as its recovery path.
- `MountOptions` accepts a pre-opened platform SQLite driver and attachment ports, allowing the browser to inject `openBrowserSqliteDriver(...)` while native hosts keep their filesystem defaults.
- `web/sqlite3.wasm` is the official `sqlite3.dart` 2.9.4 release asset; the package's MIT license applies.

## Evidence run

- `flutter test test/workflows/daily_report_workflow_test.dart test/workflows/daily_report_screen_test.dart test/mount/sync_orchestrator_test.dart test/mount/drain_triggers_test.dart` — **20 tests passed on 2026-10-10**. The tests cover atomic rollback, reopen durability, pre-dispatch edits, widget rendering and local save, lost-ACK replay, dependency ordering, auth stop, conflict retention, and trigger binding.
- `dart analyze` on the workflow, mount, tests, and screen — **no issues found**.
- `dart analyze lib/mount lib/workflows/daily_report_workflow.dart lib/workflows/daily_report_screen.dart` — **no issues found** after adding the browser driver.
- `flutter build web --wasm --release -t lib/m04_compile_check.dart` — **web compilation succeeded** for the injected browser mount, driver, and daily-report screen dependency graph. The temporary compile entrypoint was removed after the run.
- `flutter test --platform chrome test/mount/browser_sqlite_driver_test.dart` — **not verified**: the Chrome test harness did not complete the IndexedDB persistence check. The temporary probe was removed; a passing browser reload test is still required.

## Acceptance still open

- **Browser persistence runtime:** the IndexedDB-backed driver is implemented and compiles, but this session did not run the daily-report widget in a browser and reload it to prove the record and queued operation survive. The Flutter host still needs to initialize its mount with `await openBrowserSqliteDriver(...)` and supply the authenticated scope and sync endpoint.
- **Server binding:** product PR [#165](https://github.com/Nacrose/Construction_Manager/pull/165) prepares the approved POST adapter for `workflow.dailyReport.createFieldReport` and registered-photo references. The local product checkout has no pull-change endpoint or CDC feed writer, so this PR alone does not meet the atomic feed/second-device criterion. Its merge status could not be checked in this session (the PR API returned 404 for the private product repo, and `gh` has no logged-in host).
- **User browser check:** on 2026-10-10 the user confirmed the Flutter build at `http://localhost:3102/login` renders its login screen and controls. This does not exercise the daily-report save/sync flow or prove second-device visibility.
- **Live scope and verification:** the widget host must supply real authenticated account/project data and an endpoint; the owner still needs the end-to-end acceptance proof and M04-T08 verification request.
- Photos, device fault matrix, restore, hardware telemetry, and the owner gate remain assigned to T04–T09.
