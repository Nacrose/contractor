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
passes (214 tests), and `flutter analyze --no-pub` reports no issues. The new
offline, lost-ack, expired-session, and revocation screen assertions are reproducible health transcripts;
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
| App process closes with operation in flight | Flutter mount + reopened SQLite file | I1/I2/I4: stable operation identity and original server receipt | Replay the same operation; server's previous-acceptance receipt is recorded | PASS — same op ID receives original receipt; local report remains |
| Lost acknowledgement after server accepts | Flutter mount + reopened SQLite file + deterministic server fixture | I1/I2/I4: durable report and stable op identity; one server effect | Replay the same op ID; recover the original receipt | PASS — first response is lost after the fixture records one effect; replay has the same op ID and payload digest, records the original receipt, and clears pending health |
| Photo upload interrupted, then mount reopened | Attachment manager + Flutter mount + deterministic registrar fixture | I1/I4: incomplete bytes stay incomplete; journal/source retained | Resume from registrar offset after reopen | PASS — a retryable chunk failure remains incomplete and pending, then resumes to the matching bytes/receipt after reopening the mount |
| Slow network / retryable timeout | Flutter mount + SQLite | I1/I4: pending report survives retry delay | Retry after backoff | PASS — report remains pending with health count 1, then accepted on retry |
| Disk full during local save | Flutter mount + SQLite + shared editor | I1/I4: domain row and pending operation commit atomically; unsaved form values remain available | Free space and retry save | PASS — neither row remains after failure; SQLite integrity check is `ok`; the form retains its entry and shows a visible error by the save controls, then retry persists it |
| Tampered photo bytes / digest mismatch | M04-T04 attachment manager + SQLite | I1/I4: no corrupt photo is complete | Retry after resolving the storage or digest failure | Separate attachment tests prove a typed digest mismatch remains incomplete |
| Device reboot | Not exercised | I1/I4 across actual device restart | Relaunch and reconcile journal | OPEN — reopening the SQLite file in a test process is not device reboot evidence |

## Limits and follow-up

The ten matrix legs run mounted workflow repositories and attachment manager against a real on-disk SQLite file, but use deterministic transport and registrar fixtures; they do not establish product-server acceptance, second-device visibility, or actual hardware behavior. The restart legs close and reopen the database in one test process. Offline, conflict, rejection, lost acknowledgement, and disk-full recovery now have shared-screen evidence. The rejection transcript sends a rejected outcome through the mounted orchestrator, then checks the retained report, recent-rejection health, and corrected-copy action. The disk-full transcript verifies the open entry remains in the form, the error appears next to persistent save controls, and retry saves successfully; a separate matrix leg verifies transaction rollback and SQLite integrity. The lost-ack screen test drives the mobile action menu through the mounted orchestrator, simulates a server commit followed by a lost response, checks retained local report/health state, then retries the same operation and verifies the original receipt is recovered with one server effect. The expired-session screen test delivers `authentication_required` from the orchestrator to the notice, verifies the saved report remains pending, and confirms the sign-in retry action is offered. These are deterministic fixture transcripts, not live server sessions. Revocation remains covered by event-delivery and shared-screen tests, but no connected-host device transcript exists. The tampered restore digest case remains covered in the separate attachment suite. The exact office-edit/current-server conflict and device reboot evidence remain missing, so M04-T05 acceptance is still open.

The conflict leg was strengthened on 2026-10-11: `flutter test --no-pub test/workflows/m04_fault_matrix_test.dart` passes all 10 tests, and the modeled conflict test asserts the exact original operation payload, local report, `conflict` state, health reason, and conflict state after closing and reopening the mount. A separate shared-screen test now covers opening that report, editing the retained values, saving a new pending operation, and confirming the original conflict and payload remain unchanged. These remain deterministic fixture tests, not an office-edit reproduction or exact server-version comparison.

The lost-ack leg now also has a mobile-sized screen transcript in `test/workflows/daily_report_screen_test.dart`. At a 430×932 logical viewport, it uses the same compact `More actions → Sync now` interaction as the phone, shows the saved report and pending health after the first response is lost, and returns to `No pending work` after retrying the stable operation ID and recovering its receipt. The deterministic fixture records one server effect across two requests. This does not replace real product-server or device evidence.

### Product conflict-semantics check (2026-10-11)

The first matrix row is a deterministic fake-transport scenario; it does not
reproduce an office edit through the product API. In the current product
checkout, `/api/native/sync` maps `TRPCError.CONFLICT` to a generic conflict
outcome, and `workflow.dailyReport.createFieldReport` raises that error when a
registered photo was filed by another request before this transaction could
claim it. The native sync operation is a create operation and carries no
server-report version or update operation. Therefore the existing row proves
local retention and health surfacing only; it does not prove the planned
simultaneous office-edit conflict or its recovery. That acceptance remains
open pending an authorized product binding that can identify the current
server state and a user-directed correction path. No automatic overwrite or
retry is claimed.

Product PRs [#165](https://github.com/Nacrose/Construction_Manager/pull/165), [#166](https://github.com/Nacrose/Construction_Manager/pull/166), [#167](https://github.com/Nacrose/Construction_Manager/pull/167), and [#170](https://github.com/Nacrose/Construction_Manager/pull/170) prepare the report adapter, feed/snapshot, native PKCE, and resumable photo/snapshot digest paths. The last confirmed GitHub check on 2026-10-11 found all four open as drafts; current status could not be refreshed. The first native sign-in attempts did not establish a session. A later screenshot identified the immediate server error as missing `DATABASE_URL`; the local database service and server environment have since been restored. The owner later reported the daily-report page open on iPhone, but build mode and connected session remain unverified. M04-T07/T08 will also require real device sessions and owner verification; this report does not substitute for them.
