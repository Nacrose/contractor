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
passes (209 tests), and `flutter analyze --no-pub` reports no issues. The new
offline screen assertion is a reproducible health transcript for that leg;
it does not count as device-recorded evidence.

A conflict-health widget test now marks a saved operation as conflicted, checks
that its local remarks remain intact, and verifies the shared screen says
`Needs attention`, `1 conflict(s) need review`, and
`1 conflicted operation(s) awaiting resolution`. This is a screen transcript,
not an office-edit reproduction or a conflict-resolution action.

## Results

| Boundary | Engine | Invariant | Recovery | Result |
|---|---|---|---|---|
| Office edit conflicts with local report | Flutter mount + SQLite | I1/I4: local report retained; conflict is visible in sync health | Resolve against current server version, then retry | PARTIAL — local row and original remarks remain and conflict count is 1; the Flutter screen has no current-server-version review or correction action, so recovery is not demonstrated |
| Permission revoked during batch | Flutter mount + SQLite | I1/I3/I4: no later work is discarded or sent after revocation | Restore project access, then resume pending work | PASS — batch stops after one request and the later report remains pending |
| Expired login during batch | Flutter mount + SQLite | I1/I4: report survives and batch stops | Reauthenticate, then retry | PASS — outcome is `authentication_required`; report and pending op remain |
| Absent network | Flutter mount + SQLite + shared sync-health screen | I1/I4: report stays durable and pending | Restore connectivity, then retry | PASS — transport exception requeues the op; rendered health shows `Needs attention`, one pending op, and `1 pending operation(s) not yet accepted` |
| Server rejection | Flutter mount + SQLite | I1/I4: rejected report remains available with rejection health | Review rejection, correct, and resubmit | PASS — local row remains; op state is `rejected`; health exposes a rejection |
| App process closes with operation in flight | Flutter mount + reopened SQLite file | I1/I2/I4: stable operation identity and original server receipt | Replay the same operation; server's previous-acceptance receipt is recorded | PASS — same op ID receives original receipt; local report remains |
| Lost acknowledgement after server accepts | Flutter mount + reopened SQLite file + deterministic server fixture | I1/I2/I4: durable report and stable op identity; one server effect | Replay the same op ID; recover the original receipt | PASS — first response is lost after the fixture records one effect; replay has the same op ID and payload digest, records the original receipt, and clears pending health |
| Photo upload interrupted, then mount reopened | Attachment manager + Flutter mount + deterministic registrar fixture | I1/I4: incomplete bytes stay incomplete; journal/source retained | Resume from registrar offset after reopen | PASS — a retryable chunk failure remains incomplete and pending, then resumes to the matching bytes/receipt after reopening the mount |
| Slow network / retryable timeout | Flutter mount + SQLite | I1/I4: pending report survives retry delay | Retry after backoff | PASS — report remains pending with health count 1, then accepted on retry |
| Disk full during local save | Flutter mount + SQLite | I1/I4: domain row and pending operation commit atomically | Free space and save again | PASS — neither row remains after failure; SQLite integrity check is `ok` |
| Tampered photo bytes / digest mismatch | M04-T04 attachment manager + SQLite | I1/I4: no corrupt photo is complete | Retry after resolving the storage or digest failure | Separate attachment tests prove a typed digest mismatch remains incomplete |
| Device reboot | Not exercised | I1/I4 across actual device restart | Relaunch and reconcile journal | OPEN — reopening the SQLite file in a test process is not device reboot evidence |

## Limits and follow-up

The ten matrix legs run mounted workflow repositories and attachment manager against a real on-disk SQLite file, but use deterministic transport and registrar fixtures; they do not establish product-server acceptance, second-device visibility, or actual hardware behavior. The restart legs close and reopen the database in one test process. Offline, conflict, and rejection now have shared-screen evidence. The rejection widget test checks the visible recent-rejection health reason and correction/resubmit path using a locally injected rejected state; it is not a product-server rejection. Lost acknowledgement still has model assertions only, and complete screen transcripts remain missing for other faults. Auth and revocation have event-delivery assertions and separate shared-screen tests, but no connected-host device transcript yet. The tampered restore digest case remains covered in the separate attachment suite. Device reboot evidence remains missing, so M04-T05 acceptance is still open.

The conflict leg was strengthened on 2026-10-11: `flutter test --no-pub test/workflows/m04_fault_matrix_test.dart` passes all 10 tests, and the modeled conflict test now asserts the exact original operation payload, local report, `conflict` state, health reason, and conflict state after closing and reopening the mount. This remains deterministic fake-transport evidence, not an office-edit reproduction or a recovery action.

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

Product PRs [#165](https://github.com/Nacrose/Construction_Manager/pull/165), [#166](https://github.com/Nacrose/Construction_Manager/pull/166), [#167](https://github.com/Nacrose/Construction_Manager/pull/167), and [#170](https://github.com/Nacrose/Construction_Manager/pull/170) prepare the report adapter, feed/snapshot, native PKCE, and resumable photo/snapshot digest paths. Their last recorded state is draft and unmerged; a fresh GitHub API check was unavailable. The user created a local account and attempted native sign-in, but the login page reloaded. Server logs show no login POST or token exchange, so the account is not authenticated in Flutter. M04-T07/T08 will also require real device sessions and owner verification; this report does not substitute for them.
