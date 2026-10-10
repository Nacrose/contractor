# M04 exit evidence package — draft

- **Status:** draft; M04 exit criteria are not satisfied.
- **Date:** 2026-10-10.
- **Flutter evidence branch:** `m04-t06-restore`, commit `7a023659139ce3e59e3345532786a0b0c5518dc1`.
- **Product prerequisite:** the `workflow.dailyReport.createFieldReport` adapter/feed/photo-reference binding has not been merged. The client has no demonstrated server acceptance or second-device visibility.

## Task evidence inventory

| Task | Current evidence | Exit state |
|---|---|---|
| M04-T01 | [Domain path trace](domain-path-trace.md); merged PR #44 | Complete per execution plan |
| M04-T02 | [Flutter mount report](flutter-mount.md); merged PR #45 | Complete per execution plan |
| M04-T03 | [Workflow progress](t03-daily-report-workflow.md); local transaction/reopen tests, typed row payload widget test, and Chrome IndexedDB persistence probe | Open: product procedure binding, authenticated host, server acceptance, and second-device visibility are unproven |
| M04-T04 | [Photo transfer progress](t04-photo-transfer-progress.md) | Open: product-backed registration/download and real-device session evidence remain missing |
| M04-T05 | [Vertical fault matrix](fault-matrix-vertical.md) | Open: automated mounted legs exist; reboot/hardware/server evidence and complete health transcripts remain missing |
| M04-T06 | [Retention and restore progress](t06-retention-restore-progress.md) | Open: product download route/auth, applying snapshot rows, rejection fix-and-retry, and second-device photo restore remain missing |
| M04-T07 | [Device telemetry](device-telemetry.md) | Open: no Android/iOS device is available on the capture host; no real workflow telemetry or correlated server metrics were captured |
| M04-T08 | [Rule parity progress](daily-report-rule-parity-progress.md) | Open: local row editor parity improved; native and web workflow recordings, live-route fixture, complete T03–T07 evidence, and owner verification are missing |
| M04-T09 | This packet and the M05 task refinement are prerequisites | Not reached; the owner must review and approve the gate after all task evidence is complete |

## Verification already run

- `flutter analyze` in `prototype/construction_client/` — no issues.
- `flutter test` in `prototype/construction_client/` — 181 tests passed.
- Chrome IndexedDB durability probe — saved a local report and matching pending operation, closed and reopened the browser mount, and read both back. The probe uses a test credential fixture; it does not exercise sign-in or the product server.
- Web release compilation of the browser mount dependency graph passed in the earlier T06 checkpoint. This is a compile result, not an authenticated browser workflow session.

## Open exit evidence

1. Merge the product adapter for `workflow.dailyReport.createFieldReport`, preserving its permission checks and atomic feed event and accepting registered-photo references. Then demonstrate server acceptance and visibility in the current web app and on a second device.
2. Record the workflow on a real supported Android or iOS device, including sync latency, battery/background behavior, crash-free rate, and sanitized crash reporting. Correlate one full sync with server M03-T08 metrics.
3. Complete T04–T06 product-backed attachment registration, snapshot application, and recoverable rejection/fix/retry evidence.
4. Finish the full current-rule parity fixture against the product route and link the native and web recordings.
5. After tasks T01–T08 satisfy their criteria, request owner verification and open the M04-T09 gate PR. The owner makes the gate decision.

## Owner verification request

**Owner: please verify the recorded native and web daily-report workflow against the linked evidence before approving M04-T09.** The recordings and live product round trip have not yet been produced, so this is a requested future verification step, not a claim that verification occurred.
