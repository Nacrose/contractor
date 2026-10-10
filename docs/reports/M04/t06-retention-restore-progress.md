# M04-T06: Retention, restore, and attachment download progress

- **Status:** mounted attachment re-fetch and digest verification are implemented and tested locally; M04-T06 acceptance remains open.
- **Branch:** `m04-t06-restore`, stacked on the M04-T05 checkpoint.
- **Evidence:** `flutter test test/mount/attachment_transfer_test.dart` — 5 passed; targeted `dart analyze` — no issues.

## Implemented contract

`AttachmentTransferManager.restoreRegistered` accepts a registered receipt and object ID, the expected SHA-256, project scope claims, and a `RegisteredAttachmentFetchPort`. The host fetcher is expected to call `attachments.downloadRegistered` and revalidate tenant, project, and role authorization on every request. The returned bytes go through the same app-private source, attachment journal, atomic object-store staging, and post-finalization SHA-256 verification as captured photos. The pre-existing server receipt is retained; restore does not upload or register a second object. A digest mismatch is recorded as a typed `digestMismatch` failure and cannot become complete.

The tests cover successful fetch plus local persistence, final bytes matching the expected digest, and tampered bytes remaining incomplete. The fetch interface carries scope claims, but there is no HTTP/product-server implementation in this branch.

## Required evidence still missing

- The server route, receipt-to-object lookup, authorization revalidation, and download response are not implemented or verified against `Construction_Manager`.
- Snapshot bootstrap is available in the M03 package, but the Flutter mount does not yet apply snapshot daily-report rows into the T03 local domain repository. New-device record restoration therefore remains unproven.
- The mounted T05 conflict/revocation tests prove local report retention for those outcomes, but no explicit server `rejected` outcome test yet demonstrates fix-and-retry from the user path.
- No product feed association proves restored registered photos reappear on a second device.

These gaps depend on the daily-report server binding and real product routes. This progress report does not claim T06 complete.
