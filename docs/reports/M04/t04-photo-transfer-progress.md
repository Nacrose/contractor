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

- The product server registrar/feed binding is not available, so tests use a contract fake and no real registration endpoint or second-device read has been demonstrated.
- The daily-report payload currently has no registered-photo reference field. The server side must accept and link M03-T06 receipts to `workflow.dailyReport.createFieldReport`; this requires explicit approval for product-repo edits, which is still pending.
- The daily-report editor does not yet expose the photo service until report linkage is implemented; user-visible transfer states and registered-only previews remain to be wired.
- Real camera/gallery capture, interrupted app process recovery, and device telemetry still require a real device session.
