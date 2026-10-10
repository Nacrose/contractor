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
- Combined attachment/editor/workflow/fault-matrix run: **20 Flutter tests passed**; targeted Dart analysis — **no issues found**. Screen evidence verifies report UUID propagation, receipt references in the outbox payload, save blocking while a photo is incomplete, and registered-only previews.

## Acceptance still open

- Tests use contract fakes; no real registration endpoint or second-device read has been demonstrated.
- The current product procedure accepts inline photo uploads, while the M04 client now sends registered attachment receipt/digest references. The product schema, transactional attachment linkage, and feed write must be updated to accept this contract; explicit approval for product-repo edits is still pending.
- The editor exposes the injectable photo port, but the running product host does not yet instantiate it with real camera/gallery and registrar bindings.
- The local report UUID is stored on the client attachment row and passed to the registrar contract. The report outbox payload includes the registered attachment ID, receipt, digest, and byte count; the server has not yet accepted or linked those references, so no claim is made that a registered photo is visible on the server report.
- Real camera/gallery capture, interrupted app process recovery, and device telemetry still require a real device session.
