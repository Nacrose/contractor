# M04-T06: Retention, restore, and attachment download progress

- **Status:** snapshot bootstrap, durable resume, rejected-report correction, and connected registered-photo re-fetch are implemented locally; live product round-trip evidence is still missing.
- **Current branch:** `codex/m04-connected-host`, with the connected restore follow-on in Contractor PR #55.
- **Latest evidence:** full Flutter client suite — 210 passed; `flutter analyze --no-pub` — no issues. Focused snapshot/bootstrap, exact feed-cursor display, saved-report recovery, reopened rejection-correction, and lost-ack screen-retry tests are included.

## Implemented contract

`AttachmentTransferManager.restoreRegistered` accepts a report UUID, registered receipt and object ID, expected SHA-256, project scope claims, and a `RegisteredAttachmentFetchPort`. The host fetcher must call the product-approved download route and revalidate tenant, project, and role authorization on every request. Returned bytes go through the same report-linked attachment journal, app-private source, atomic object-store staging, and post-finalization SHA-256 verification as captured photos. The existing server receipt is retained; restore does not upload or register a second object. A digest mismatch is recorded as typed `digestMismatch` and cannot become complete.

The tests cover successful fetch plus local persistence, final bytes matching the expected digest, and tampered bytes remaining incomplete. The fetch interface carries scope claims, but there is no HTTP/product-server implementation in this branch. Shared editor tests verify report UUID propagation and registered-only previews.

## Required evidence still missing

- Product PR #165 contains the protected read procedure `workflow.dailyReport.getAttachmentData({ id })`; the connected Flutter host now fetches registered bytes through the authenticated `GET /api/files/[key]` route and revalidates scope on each request. The local restore path checks the snapshot digest and byte count before marking a restored object complete, but has not been exercised against the product account.
- Product PR #166 includes an authenticated project-scoped snapshot endpoint and documented payload contract; PR #170 adds served photo digests/sizes and the resumable photo routes. PRs #165–#167 and #170 remain unmerged. The Flutter mount applies snapshot pages into a separate accepted-report replica, persists its page cursor, resumes after restart, closes the manifest before deleting stale replicas, protects pending operation IDs, and stores the decimal feed watermark for incremental pull. Local fake-transport proof exists; product-backed restore remains unproven.
- A server rejection can now be corrected into a new client UUID and queued as a new operation while the rejected payload remains intact. Local repository coverage exists; a real product rejection and user-session retry remain unproven.
- The feed/snapshot path has not been exercised live to prove registered photos reappear on a second device.

## Browser persistence follow-on (2026-10-10)

The T06 worktree also contains a browser SQLite WASM + IndexedDB driver, a SQLite-backed object store, an async browser mount, and a browser photo service. Local writes await `flushDurability()` before the editor reports a save. Browser hosts must supply a credential binding explicitly; the mount does not fall back to the native keystore on web. The official `sqlite3.wasm` release asset was checksum-verified before vendoring. The full native suite passed at 185 tests at this earlier checkpoint; the release web compile importing the actual browser mount dependency graph passed then. The existing `flutter run -d chrome --web-port 4181 -t tool/m04_browser_probe.dart` probe logged PASS after saving and reopening a report plus pending operation. It uses a test-only credential fixture and does not exercise sign-in or product routes. `flutter test --platform chrome` did not complete the earlier driver-only lifecycle probe. Authenticated product restore and second-device evidence remain open.

The local snapshot and rejection paths do not claim authenticated server acceptance or T06 completion.

## Connected restore follow-on (2026-10-11)

The connected host now implements `HttpRegisteredAttachmentFetcher` and invokes `restoreRegistered` for registered photos in accepted report snapshots. It downloads by the registered `storageKey` through the existing authenticated `GET /api/files/[key]` route, which rechecks the caller’s tenant, source record, and project permission on each read. The Flutter manager compares both the served byte count and SHA-256 from the snapshot before marking a restored object complete; a failed or mismatched fetch stays incomplete and retryable. Product PR #170 adds those served digest/size fields to the project-scoped snapshot.

The Flutter restore tests, focused transport tests, full 207-test suite, and iOS/macOS/web compilation pass. The M04 health card reads the exact decimal watermark stored by snapshot bootstrap rather than deriving a feed cursor from outbox receipt sequences. A saved rejected report can now be reopened after the screen is recreated, corrected into a new UUID, and retained alongside the immutable rejected operation. Product PR #170 and its stacked prerequisites remain unmerged, and no live new-device restore has been exercised. T06 therefore remains open pending server-backed, cross-device evidence.

Product PRs #165, #166, #167, and #170 have a last recorded state of draft and unmerged; a fresh GitHub API check was unavailable. The user created a local account and confirmed the login page renders, but the native sign-in attempt reloaded the login page and did not establish a session. Authenticated download, live snapshot/feed reconcile, a real rejected-response correction, and second-device restore have not been exercised through Flutter.
