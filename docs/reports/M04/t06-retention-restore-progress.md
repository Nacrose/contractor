# M04-T06: Retention, restore, and attachment download progress

- **Status:** snapshot bootstrap application, durable resume, and rejected-report correction are implemented locally; registered-photo re-fetch remains a contract only and live product round-trip evidence is still missing.
- **Branch:** `m04-t06-restore`, stacked on the M04-T05 checkpoint.
- **Evidence:** full native Flutter suite — 185 passed; `dart analyze` — no issues. Focused snapshot/bootstrap and rejection-correction tests are included.

## Implemented contract

`AttachmentTransferManager.restoreRegistered` accepts a report UUID, registered receipt and object ID, expected SHA-256, project scope claims, and a `RegisteredAttachmentFetchPort`. The host fetcher must call the product-approved download route and revalidate tenant, project, and role authorization on every request. Returned bytes go through the same report-linked attachment journal, app-private source, atomic object-store staging, and post-finalization SHA-256 verification as captured photos. The existing server receipt is retained; restore does not upload or register a second object. A digest mismatch is recorded as typed `digestMismatch` and cannot become complete.

The tests cover successful fetch plus local persistence, final bytes matching the expected digest, and tampered bytes remaining incomplete. The fetch interface carries scope claims, but there is no HTTP/product-server implementation in this branch. Shared editor tests verify report UUID propagation and registered-only previews.

## Required evidence still missing

- Product PR #165 contains the protected read procedure `workflow.dailyReport.getAttachmentData({ id })`; each request resolves the report project, calls `assertDailyReportView`, and reads bytes from `StoredFile`. The Flutter fetcher is still only a contract port, so this route is not wired or exercised by the mount.
- Product PR #166 now includes an authenticated project-scoped snapshot endpoint and documented payload contract (commit `adc46e6f` pushed after local build and browser check). PR #166 and its prerequisite #165 remain unmerged. The Flutter mount applies snapshot pages into a separate accepted-report replica, persists its page cursor, resumes after restart, closes the manifest before deleting stale replicas, protects pending operation IDs, and stores the decimal feed watermark for incremental pull. Local fake-transport proof exists; product-backed restore remains unproven.
- A server rejection can now be corrected into a new client UUID and queued as a new operation while the rejected payload remains intact. Local repository coverage exists; a real product rejection and user-session retry remain unproven.
- No product feed association proves restored registered photos reappear on a second device.

## Browser persistence follow-on (2026-10-10)

The T06 worktree also contains a browser SQLite WASM + IndexedDB driver, a SQLite-backed object store, an async browser mount, and a browser photo service. Local writes await `flushDurability()` before the editor reports a save. Browser hosts must supply a credential binding explicitly; the mount does not fall back to the native keystore on web. The official `sqlite3.wasm` release asset was checksum-verified before vendoring. The full native suite now passes at 185 tests; the release web compile importing the actual browser mount dependency graph passed earlier. The existing `flutter run -d chrome --web-port 4181 -t tool/m04_browser_probe.dart` probe logged PASS after saving and reopening a report plus pending operation. It uses a test-only credential fixture and does not exercise sign-in or product routes. `flutter test --platform chrome` did not complete the earlier driver-only lifecycle probe. Authenticated product restore, registered-photo download wiring, and second-device evidence remain open.

The local snapshot and rejection paths do not claim authenticated server acceptance or T06 completion.

Product PRs #165 and #166 remain draft and unmerged. The local product database and test account are not configured, so authenticated download, live snapshot/feed reconcile, a real rejected-response correction, and second-device restore have not been exercised.
