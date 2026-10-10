# M04-T05: Vertical workflow fault matrix

- **Status:** local mounted-engine matrix passes for eight automated legs; M04-T05 acceptance remains open.
- **Branch:** `m04-t05-vertical-fault-matrix`, stacked on M04-T04.
- **Run:** `flutter test test/workflows/m04_fault_matrix_test.dart` — 8 tests passed on 2026-10-10.
- **Harness:** Flutter mount with a temporary on-disk SQLite database and deterministic fake sync transport.

## Results

| Boundary | Engine | Invariant | Recovery | Result |
|---|---|---|---|---|
| Office edit conflicts with local report | Flutter mount + SQLite | I1/I4: local report retained; conflict is visible in sync health | Resolve against current server version, then retry | PASS — conflict row and original remarks remain; conflict count is 1 |
| Permission revoked during batch | Flutter mount + SQLite | I1/I3/I4: no later work is discarded or sent after revocation | Restore project access, then resume pending work | PASS — batch stops after one request and the later report remains pending |
| Expired login during batch | Flutter mount + SQLite | I1/I4: report survives and batch stops | Reauthenticate, then retry | PASS — outcome is `authentication_required`; report and pending op remain |
| Absent network | Flutter mount + SQLite | I1/I4: report stays durable and pending | Restore connectivity, then retry | PASS — transport exception requeues the op; health still reports one pending operation |
| Server rejection | Flutter mount + SQLite | I1/I4: rejected report remains available with rejection health | Review rejection, correct, and resubmit | PASS — local row remains; op state is `rejected`; health exposes a rejection |
| App process closes with operation in flight | Flutter mount + reopened SQLite file | I1/I2/I4: stable operation identity and original server receipt | Replay the same operation; server's previous-acceptance receipt is recorded | PASS — same op ID receives original receipt; local report remains |
| Slow network / retryable timeout | Flutter mount + SQLite | I1/I4: pending report survives retry delay | Retry after backoff | PASS — report remains pending with health count 1, then accepted on retry |
| Disk full during local save | Flutter mount + SQLite | I1/I4: domain row and pending operation commit atomically | Free space and save again | PASS — neither row remains after failure; SQLite integrity check is `ok` |
| Lost acknowledgement after server acceptance | Package-level evidence only | I1/I2: replay records the original receipt without repeating the effect | Replay stable operation ID | M03-T09 global matrix covers the server/package boundary; mounted vertical leg remains open |
| Incomplete photo upload / digest failure | M04-T04 attachment manager + SQLite | I1/I4: no incomplete or corrupt photo is complete | Resume from server offset or retry after resolving digest failure | Existing M04-T04 tests cover receipt-gated completion, interrupted chunk resume, and digest mismatch; not run in this matrix |
| Device reboot | Not exercised | I1/I4 across actual device restart | Relaunch and reconcile journal | OPEN — reopening the SQLite file in a test process is not device reboot evidence |
| Absent network | Not exercised as a distinct offline leg | I1/I4: local work remains durable and retryable | Restore connectivity, then retry | OPEN — retryable timeout is the only mounted network leg here |

## Limits and follow-up

The eight tests run the mounted workflow repositories and orchestrator against a real on-disk SQLite file, but use a fake transport; they do not establish product-server acceptance, second-device visibility, or actual hardware behavior. The restart leg closes and reopens the database in one test process. Health assertions exist for conflict, offline pending work, and rejection; a complete health-surface transcript is not captured for every scenario. Photo transfer states are covered in the separate T04 journal/editor suite, not in this vertical fault runner. Those gaps prevent claiming the M04-T05 acceptance criteria complete.

The product server binding for `workflow.dailyReport.createFieldReport` and receipt-to-report photo association is still a prerequisite for end-to-end server fault legs. M04-T07/T08 will also require real device sessions and owner verification; this report does not substitute for them.
