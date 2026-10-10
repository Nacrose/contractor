# M04-T04: Photo transfer implementation progress

- **Status:** transfer engine, report-linked capture contract, and shared editor controls implemented locally; T04 acceptance is not claimed.
- **Branch:** `m04-t04-photo-attachment` (stacked on the M04-T03 checkpoint)
- **Date:** 2026-10-10

## Implemented locally

- Added a Dart device binding for the M03-T06 attachment journal with versioned migration, per-account rows, and append-only transfer events.
- Native gallery/camera capture validates JPEG/PNG signatures, copies the selected photo to an app-private durable source path, verifies SHA-256 after staging, re-verifies after finalization, and uploads chunks from the server's authoritative offset.
- The transfer row and M03 outbox attachment-health row advance together. A photo is `complete` only when state is `registered` and a server receipt exists.
- `resume` and `resumeAll` reconcile interrupted staging, finalization, and upload after database reopen. Retryable upload resumes from the server's current byte offset.
- The shared report editor exposes camera/gallery actions behind `DailyReportPhotoPort`, associates captures with the stable local report UUID, displays transfer states, offers retry for failures, and previews bytes only after registration.
- Attachment schema migration v6 adds the daily-report association. The registrar contract carries that report UUID; registered-photo restore uses the same association and does not re-upload.

## Evidence run

- `flutter test test/mount/attachment_transfer_test.dart` — **3 tests passed**: completion only after receipt, restart after interrupted chunk upload, and final-object digest mismatch retention.
- `dart analyze` on the attachment manager, native photo service, port, and tests — **no issues found**.
- Latest combined attachment/editor/fault-matrix run: **17 Flutter tests passed** across transfer, workflow, screen, and T05 suites; targeted Dart analysis — **no issues found**. Screen evidence verifies report UUID propagation and registered-only previews.

## Acceptance still open

- The product server registrar/feed binding is not available, so tests use a contract fake and no real registration endpoint or second-device read has been demonstrated.
- The product registrar/feed binding is not available. It must accept and link report UUIDs plus M03-T06 receipts to `workflow.dailyReport.createFieldReport`; this requires explicit approval for product-repo edits, which is still pending.
- The editor exposes the injectable photo port, but the running product host does not yet instantiate it with real camera/gallery and registrar bindings.
- Real camera/gallery capture, interrupted app process recovery, and device telemetry still require a real device session.
