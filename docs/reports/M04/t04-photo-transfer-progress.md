# M04-T04: Photo transfer implementation progress

- **Status:** transfer engine, report-linked capture contract, and shared editor controls implemented locally; T04 acceptance is not claimed.
- **Current branch:** `codex/m04-connected-host`, with the follow-on in Contractor PR #55.
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
- Product PRs [#165](https://github.com/Nacrose/Construction_Manager/pull/165), [#166](https://github.com/Nacrose/Construction_Manager/pull/166), [#167](https://github.com/Nacrose/Construction_Manager/pull/167), and [#170](https://github.com/Nacrose/Construction_Manager/pull/170) prepare the daily-report/photo binding, feed/snapshot, native PKCE, and resumable photo endpoints. They remain draft and unmerged; no live registrar, feed worker, or second-device read has been verified.
- The connected Flutter host instantiates the photo port with native camera/gallery capture and the authenticated resumable registrar, but the flow has not yet been verified in a signed-in device session against the product server.
- The local report UUID is stored on the client attachment row and passed to the registrar contract. The report outbox payload includes the registered attachment ID, receipt, digest, and byte count; the server has not yet accepted or linked those references, so no claim is made that a registered photo is visible on the server report.
- Real camera/gallery capture, interrupted app process recovery, and device telemetry still require a real device session.
- Earlier native sign-in attempts did not establish a session. A later screenshot showed the server-side Prisma failure caused by missing `DATABASE_URL`; the local database and dev server have since been restored. The owner later reported the daily-report page open on iPhone, but the build mode and connected session are unverified. Authenticated upload/registration has not been demonstrated.

## Connected-host follow-on (2026-10-11)

The connected host now instantiates `HttpPhotoUploadRegistrar` with the authenticated client and the report-linked attachment manager; camera/gallery capture is wired through the shared photo port. The sync-health card shows pending operations, oldest age, exact snapshot feed cursors, accepted operation sequences, conflicts, blocked operations, and rejection reasons. The editor previews a photo only after the manager reports it registered.

The shared Save and sync panel now also treats any incomplete report photo as
retained pending work. A retryable transfer displays “Upload delayed” and a
“Retry attachment uploads” action that retries the failed photo rows; the
screen test asserts the retained-work message and invokes the retry through
that action. This closes a false-clear status gap for pending uploads in the
shared editor, but does not replace the device sync-health model or prove a
live server upload.

The product upload/snapshot changes are pushed to the stacked Construction_Manager PR #170, but have not been merged or exercised against the user's account. The latest full **214-test** Flutter suite passes and `flutter analyze --no-pub` is clean. Connected-mode iOS (`--no-codesign`), macOS, and web release builds compiled with the server define at this checkpoint. Widget coverage checks the exact decimal snapshot cursor, reopening a saved report, incomplete-photo retry status, offline health, lost-ack retry, server-rejection correction, and visible disk-full recovery and auth/revocation recovery on the mounted screen. No photo was captured or uploaded on the user's device in this checkpoint, so server registration, interrupted-device recovery, and second-device visibility remain unproven. The owner-created account has not been verified in a post-fix native session.
