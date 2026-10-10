# M04 exit evidence package — draft

- **Status:** draft; M04 exit criteria are not satisfied.
- **Date:** 2026-10-10.
- **Flutter evidence branch:** `codex/m04-t03-native-callback` (Contractor PR #52, stacked on PR #51); the current task code includes the native auth callback handler.
- **Product prerequisites:** daily-report adapter/photo references [Construction_Manager PR #165](https://github.com/Nacrose/Construction_Manager/pull/165), CDC feed/pull PR [#166](https://github.com/Nacrose/Construction_Manager/pull/166), and native PKCE endpoints [#167](https://github.com/Nacrose/Construction_Manager/pull/167) are draft and unmerged. PR #166's Vercel Preview is Ready, but its persistent worker is not deployed. The user confirmed that local signup works, but a database-backed authenticated native workflow and second-device round trip have not been verified.

## Task evidence inventory

| Task | Current evidence | Exit state |
|---|---|---|
| M04-T01 | [Domain path trace](domain-path-trace.md); merged PR #44 | Complete per execution plan |
| M04-T02 | [Flutter mount report](flutter-mount.md); merged PR #45 | Complete per execution plan |
| M04-T03 | [Workflow progress](t03-daily-report-workflow.md); local transaction/reopen tests, typed row payload widget test, Chrome IndexedDB persistence probe, native callback PR #52, and a locally inspected iPhone local-preview capture; product adapter/auth PRs prepared but not merged | Open: Flutter PKCE sign-in/exchange, CDC feed/pull deployment, live server acceptance, and second-device visibility are unproven |
| M04-T04 | [Photo transfer progress](t04-photo-transfer-progress.md) | Open: product-backed registration/download and real-device session evidence remain missing |
| M04-T05 | [Vertical fault matrix](fault-matrix-vertical.md) | Open: automated mounted legs exist; reboot/hardware/server evidence and complete health transcripts remain missing |
| M04-T06 | [Retention and restore progress](t06-retention-restore-progress.md); mounted snapshot restore and rejected-report correction tests | Open: product endpoint PR is pushed but unmerged; product-backed attachment download, live restore, and second-device photo evidence remain missing |
| M04-T07 | [Device telemetry](device-telemetry.md) | Open: no Android/iOS device is available on the capture host; no real workflow telemetry or correlated server metrics were captured |
| M04-T08 | [Rule parity progress](daily-report-rule-parity-progress.md) | Open: local row editor parity improved; native and web workflow recordings, live-route fixture, complete T03–T07 evidence, and owner verification are missing |
| M04-T09 | This packet and the M05 task refinement are prerequisites | Not reached; the owner must review and approve the gate after all task evidence is complete |

## Verification already run

- Earlier native Flutter shell checkpoint on `m04-t06-restore`: `flutter build ios --debug --no-codesign` completed successfully; that checkpoint proved compilation only and did not install or launch the app on the iPhone. The later signed M04-host launch is recorded in the next item.
- Native M04 host on `codex/m04-t03-native-callback`: signed iOS release build completed and the app was launched on the paired iPhone with `devicectl`; a screenshot was visually inspected locally and showed the daily-report editor in local-preview mode. The screenshot is not included in the PR. The Flutter wireless VM disconnected after the debug launch, so no sustained telemetry or sync session is claimed.
- macOS preview host: after adding the macOS Keychain handler, `flutter build macos --debug` succeeded and `flutter run -d macos` started the app and Dart VM service. The host uses a local preview account/project, has no authenticated server session, and explicitly does not sync or upload photos. It does not demonstrate full product parity or close M04-T03/T04.
- `dart analyze` in `prototype/construction_client/` — no issues.
- `flutter test` in `prototype/construction_client/` — 185 tests passed, including snapshot resume/closure and rejected-copy flow.
- Chrome IndexedDB durability probe — saved a local report and matching pending operation, closed and reopened the browser mount, and read both back. The probe uses a test credential fixture; it does not exercise sign-in or the product server.
- Web release compilation of the browser mount dependency graph passed in the earlier T06 checkpoint. This is a compile result, not an authenticated browser workflow session.

## Open exit evidence

1. Merge product PRs [#165](https://github.com/Nacrose/Construction_Manager/pull/165) and [#166](https://github.com/Nacrose/Construction_Manager/pull/166), configure the database/test account, and deploy and verify both bootstrap and CDC paths. Demonstrate atomic feed delivery, server acceptance, and visibility in the current web app and on a second device before closing T03.
2. Record the workflow on a real supported Android or iOS device, including sync latency, battery/background behavior, crash-free rate, and sanitized crash reporting. Correlate one full sync with server M03-T08 metrics.
3. Complete T04–T06 product-backed attachment registration, snapshot application, and recoverable rejection/fix/retry evidence.
4. Finish the full current-rule parity fixture against the product route and link the native and web recordings.
5. After tasks T01–T08 satisfy their criteria, request owner verification and open the M04-T09 gate PR. The owner makes the gate decision.

## Owner verification request

**Owner: please verify the recorded native and web daily-report workflow against the linked evidence before approving M04-T09.** The recordings and live product round trip have not yet been produced, so this is a requested future verification step, not a claim that verification occurred.
