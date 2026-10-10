# M04-T04: Photo transfer implementation progress

- **Status:** transfer engine and native capture binding implemented locally; T04 acceptance is not claimed.
- **Branch:** `m04-t04-photo-attachment` (stacked on the M04-T03 checkpoint)
- **Date:** 2026-10-10

## Implemented locally

- Added a Dart device binding for the M03-T06 attachment journal with versioned migration, per-account rows, and append-only transfer events.
- Native gallery/camera capture validates JPEG/PNG signatures, copies the selected photo to an app-private durable source path, verifies SHA-256 after staging, re-verifies after finalization, and uploads chunks from the server's authoritative offset.
- The transfer row and M03 outbox attachment-health row advance together. A photo is `complete` only when state is `registered` and a server receipt exists.
- `resume` and `resumeAll` reconcile interrupted staging, finalization, and upload after database reopen. Retryable upload resumes from the server's current byte offset.

## Evidence run

- `flutter test test/mount/attachment_transfer_test.dart` — **3 tests passed**: completion only after receipt, restart after interrupted chunk upload, and final-object digest mismatch retention.
- `dart analyze` on the attachment manager, native photo service, port, and tests — **no issues found**.

## Acceptance still open

- Product PR [#165](https://github.com/Nacrose/Construction_Manager/pull/165) now prepares the daily-report adapter to link registered photos using receipt, digest, and size verification; stacked PR [#166](https://github.com/Nacrose/Construction_Manager/pull/166) adds the feed pull path. Both are still draft and unmerged, so tests use a contract fake and no real registration endpoint or second-device read has been demonstrated. PR #166's Vercel Preview is Ready, but its persistent worker is not deployed.
- The report/photo reference contract is prepared in PR #165, but the Flutter editor is not yet wired to the photo service and currently submits an empty `photos` list. The photo UI must submit only registered references and show transfer states; it must remain compatible with the product adapter before T04 acceptance.
- The user authorized the product-repo work; that authorization is no longer pending. The product PRs still need to merge and run against configured infrastructure before end-to-end acceptance.
- Real camera/gallery capture, interrupted app process recovery, and device telemetry still require a real device session.
- The local product database and test account are not configured, so authenticated upload, server registration, and second-device reads cannot yet be exercised here.
