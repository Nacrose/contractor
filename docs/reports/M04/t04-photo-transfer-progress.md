# M04-T04: Photo transfer implementation progress

- **Status:** transfer engine and native capture binding implemented locally; T04 acceptance is not claimed.
- **Branch:** `m04-t04-photo-attachment` (stacked on the M04-T03 checkpoint)
- **Date:** 2026-10-10

## Implemented locally

- Added a Dart device binding for the M03-T06 attachment journal with versioned migration, per-account rows, and append-only transfer events.
- Native gallery/camera capture validates JPEG/PNG signatures, copies the selected photo to an app-private durable source path, verifies SHA-256 after staging, re-verifies after finalization, and uploads chunks from the server's authoritative offset.
- The transfer row and M03 outbox attachment-health row advance together. A photo is `complete` only when state is `registered` and a server receipt exists.
- `resume` and `resumeAll` reconcile interrupted staging, finalization, and upload after database reopen. Retryable upload resumes from the server's current byte offset.
- The shared daily-report editor now accepts an injected photo port, offers camera/gallery actions, resumes transfers when mounted, displays state and retry controls, and previews bytes only for registered attachments. Saving is blocked while a selected-project transfer is incomplete.
- Daily-report payloads now carry the product's registered-photo shape (`attachmentId`, `receipt`, `digest`, `fileSize`); only server-complete transfers produce references. Draft encode/decode preserves the references.

## Evidence run

- `flutter test test/mount/attachment_transfer_test.dart` — **3 tests passed**: completion only after receipt, restart after interrupted chunk upload, and final-object digest mismatch retention.
- `flutter test test/workflows/daily_report_workflow_test.dart test/workflows/daily_report_screen_test.dart test/mount/attachment_transfer_test.dart` — **11 tests passed**, including receipt-metadata payload round-trip and injected photo UI state.
- `dart analyze` on the attachment manager, native photo service, port, and tests — **no issues found**.
- Targeted analysis of the daily-report screen/workflow/photo binding and their tests — **no issues found**.

## Acceptance still open

- Product PR [#165](https://github.com/Nacrose/Construction_Manager/pull/165) now prepares the daily-report adapter to link registered photos using receipt, digest, and size verification; stacked PR [#166](https://github.com/Nacrose/Construction_Manager/pull/166) adds the feed pull path. Both are still draft and unmerged, so tests use a contract fake and no real registration endpoint or second-device read has been demonstrated. PR #166's Vercel Preview is Ready, but its persistent worker is not deployed.
- Product PR #165 remains draft/unmerged, so the newly wired client has only contract-level verification; it has not been exercised against the real registrar, attachment download route, or second-device read.
- The user authorized the product-repo work; that authorization is no longer pending. The product PRs still need to merge and run against configured infrastructure before end-to-end acceptance.
- Real camera/gallery capture, interrupted app process recovery, and device telemetry still require a real device session.
- The local product database and test account are not configured, so authenticated upload, server registration, and second-device reads cannot yet be exercised here.
