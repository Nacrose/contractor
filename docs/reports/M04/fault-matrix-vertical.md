# M04-T05: Vertical workflow fault matrix

- **Status:** local mounted-engine matrix passes for ten automated legs; M04-T05 acceptance remains open.
- **Current branch:** `codex/m04-connected-host`, with the connected recovery follow-on in Contractor PR #55.
- **Run:** `flutter test test/workflows/m04_fault_matrix_test.dart` — 10 tests passed on 2026-10-11.
- **Harness:** Flutter mount with a temporary on-disk SQLite database and deterministic fake sync transport.

## 2026-10-11 follow-on: access recovery surfaced

The connected Flutter host now subscribes to the mounted orchestrator's typed
`authentication_required` and `revoked` events. Inside the shared
Device sync health card, expired authentication shows a sign-in action and
revoked project access tells the user to contact an admin; both notices state
that locally saved reports are retained. The fault-matrix assertions verify
each event carries the stopped operation ID, and screen tests verify the
recovery copy and sign-in action. A further mounted offline test now drains a
saved report through the failing transport, then verifies the rendered health
surface says `Needs attention`, `1 pending operation(s)`, and
`1 pending operation(s) not yet accepted`. The full Flutter client suite
passes (216 tests), and `flutter analyze --no-pub` reports no issues. The offline
and retryable-timeout screen tests invoke **More actions → Sync now**, confirm
retained pending work and honest health status, then retry to acceptance. The
lost-ack, expired-session, and revocation screen assertions are reproducible health transcripts;
they do not count as device-recorded evidence.

A conflict-health widget test now marks a saved operation as conflicted, checks
that its local remarks remain intact, and verifies the shared screen says
`Needs attention`, `1 conflict(s) need review`, and
`1 conflicted operation(s) awaiting resolution`. This is a screen transcript,
not an office-edit reproduction or proof of the current server version.

The conflict recovery action is now wired in the shared report editor. A user
can reopen the retained conflict, refresh accepted server reports with **Sync
now**, compare those reports against the local copy, and save a new operation.
The client
keeps the original conflict state and payload unchanged. The widget test
verifies that behavior and the explicit review guidance. This is a safe,
user-directed local recovery path; the editor cannot yet prove the displayed
server report is the exact version that caused the conflict.

## Results

| Boundary | Engine | Invariant | Recovery | Result |
|---|---|---|---|---|
| Office edit conflicts with local report | Flutter mount + SQLite | I1/I4: local report retained; conflict is visible in sync health | Review synced reports, reconcile a copy, then submit a new operation | PARTIAL — local row and immutable operation remain; screen now offers a reviewed-copy recovery action with a new UUID. No live office edit or exact current-server-version comparison is exercised |
| Permission revoked during batch | Flutter mount + SQLite + shared screen | I1/I3/I4: no later work is discarded or sent after revocation | Ask project admin to restore access, then resume pending work | PASS — batch stops after one request; the later report remains pending and the screen gives project-admin recovery guidance |
| Expired login during batch | Flutter mount + SQLite + shared screen | I1/I4: report survives and batch stops | Sign in again, then retry | PASS — outcome is `authentication_required`; report and pending op remain, and the screen offers sign-in recovery |
| Absent network | Flutter mount + SQLite + shared sync-health screen | I1/I4: report stays durable and pending | Restore connectivity, then retry | PASS — transport exception requeues the op; rendered health shows `Needs attention`, one pending op, and `1 pending operation(s) not yet accepted` |
| Server rejection | Flutter mount + SQLite | I1/I4: rejected report remains available with rejection health | Review rejection, correct, and resubmit | PASS — local row remains; op state is `rejected`; health exposes a rejection |
| App process closes with operation in flight | Separate Flutter test process + reopened SQLite file | I1/I2/I4: stable operation identity and original server receipt | Replay the same operation; server's previous-acceptance receipt is recorded | PASS — a child process writes and marks the operation in flight, exits, then a second process reopens SQLite; the same op ID receives the original receipt and local report remains |
| Lost acknowledgement after server accepts | Flutter mount + reopened SQLite file + deterministic server fixture | I1/I2/I4: durable report and stable op identity; one server effect | Replay the same op ID; recover the original receipt | PASS — first response is lost after the fixture records one effect; replay has the same op ID and payload digest, records the original receipt, and clears pending health |
| Photo upload interrupted, then mount reopened | Attachment manager + Flutter mount + deterministic registrar fixture | I1/I4: incomplete bytes stay incomplete; journal/source retained | Resume from registrar offset after reopen | PASS — a retryable chunk failure remains incomplete and pending, then resumes to the matching bytes/receipt after reopening the mount |
| Slow network / retryable timeout | Flutter mount + SQLite + shared screen | I1/I4: pending report survives retry delay | Retry through **More actions → Sync now** after backoff | PASS — report remains pending with `Needs attention` and one unaccepted operation; retry preserves the operation ID and reaches acceptance |
| Disk full during local save | Flutter mount + SQLite + shared editor | I1/I4: domain row and pending operation commit atomically; unsaved form values remain available | Free space and retry save | PASS — neither row remains after failure; SQLite integrity check is `ok`; the form retains its entry and shows a visible error by the save controls, then retry persists it |
| Tampered photo bytes / digest mismatch | M04-T04 attachment manager + SQLite | I1/I4: no corrupt photo is complete | Retry after resolving the storage or digest failure | Separate attachment tests prove a typed digest mismatch remains incomplete |
| Device reboot | Not exercised | I1/I4 across actual device restart | Relaunch and reconcile journal | OPEN — reopening the SQLite file in a test process is not device reboot evidence |

## Limits and follow-up

The ten matrix legs run mounted workflow repositories and attachment manager against a real on-disk SQLite file, but use deterministic transport and registrar fixtures; they do not establish product-server acceptance, second-device visibility, or actual hardware behavior. The in-flight process-restart leg writes from a child Flutter test process and reopens the database in the parent test process. Lost-ack recovery closes and reopens the database inside one test process. Offline, retryable timeout, conflict, rejection, lost acknowledgement, and disk-full recovery now have shared-screen evidence. The rejection transcript sends a rejected outcome through the mounted orchestrator, then checks the retained report, recent-rejection health, and corrected-copy action. The disk-full transcript verifies the open entry remains in the form, the error appears next to persistent save controls, and retry saves successfully; a separate matrix leg verifies transaction rollback and SQLite integrity. The lost-ack screen test drives the mobile action menu through the mounted orchestrator, simulates a server commit followed by a lost response, checks retained local report/health state, then retries the same operation and verifies the original receipt is recovered with one server effect. The offline and timeout screen tests trigger the mounted orchestrator from the sync menu, verify the report remains pending with `Needs attention`, and retry the same report to acceptance. The expired-session screen test delivers `authentication_required` from the orchestrator to the notice, verifies the saved report remains pending, and confirms the sign-in retry action is offered. These are deterministic fixture transcripts, not live server sessions. Revocation remains covered by event-delivery and shared-screen tests, but no connected-host device transcript exists. The tampered restore digest case remains covered in the separate attachment suite. The exact office-edit/current-server conflict and physical device reboot evidence remain missing, so M04-T05 acceptance is still open.

The conflict leg was strengthened on 2026-10-11: `flutter test --no-pub test/workflows/m04_fault_matrix_test.dart` passes all 10 tests, and the modeled conflict test asserts the exact original operation payload, local report, `conflict` state, health reason, and conflict state after closing and reopening the mount. A separate shared-screen test now covers opening that report, editing the retained values, saving a new pending operation, and confirming the original conflict and payload remain unchanged. These remain deterministic fixture tests, not an office-edit reproduction or exact server-version comparison.

The lost-ack leg now also has a mobile-sized screen transcript in `test/workflows/daily_report_screen_test.dart`. At a 430×932 logical viewport, it uses the same compact `More actions → Sync now` interaction as the phone, shows the saved report and pending health after the first response is lost, and returns to `No pending work` after retrying the stable operation ID and recovering its receipt. The deterministic fixture records one server effect across two requests. This does not replace real product-server or device evidence.

### Product conflict-semantics check (2026-10-11)

The product branch now includes optimistic versions for office edits and a
versioned native `workflow.dailyReport.updateFieldReport` operation. Both paths
use an `updatedAt` compare-and-swap; native retries retain their idempotency
key, and a stale version returns a conflict instead of overwriting the office
revision. A router-level test models an office save advancing the version, then
asserts that a native update with the old version is rejected before a second
write. The adapter tests separately cover dispatch of the native update
operation. Product PR #170 contains this implementation and test.

This closes the code-path gap that previously made an office-edit conflict
impossible, but it is still fixture-level evidence: there is no live PostgreSQL
race test or connected iPhone office/native conflict session. The Flutter
editor has a user-directed recovery path that keeps the original conflict and
payload intact while the user reviews the current accepted report and saves a
new operation. No automatic overwrite or retry is claimed. M04-T05 remains
open for live/server-backed fault evidence, hardware reboot evidence, and the
other exit criteria.

Product PRs [#165](https://github.com/Nacrose/Construction_Manager/pull/165), [#166](https://github.com/Nacrose/Construction_Manager/pull/166), [#167](https://github.com/Nacrose/Construction_Manager/pull/167), and [#170](https://github.com/Nacrose/Construction_Manager/pull/170) prepare the report adapter, feed/snapshot, native PKCE, and resumable photo/snapshot digest paths. A fresh remote check on 2026-10-11 confirms #170 is open as a draft at `16408be2`; Contractor PR #55 is open as a draft at `c04eb897`. The product login page was checked by the owner at `127.0.0.1:3110/login` and reported rendering. This is not evidence of a native session or accepted report. An earlier screenshot identified a missing `DATABASE_URL`; the local database service and server environment have since been restored. The owner has not yet supplied evidence of a live report round trip, real-device fault session, telemetry, or M04 gate verification.
