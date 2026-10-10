# M04-T06: Retention, restore, and attachment download progress

- **Status:** mounted attachment re-fetch and digest verification are implemented and tested locally; M04-T06 acceptance remains open.
- **Branch:** `m04-t06-restore`, stacked on the M04-T05 checkpoint.
- **Evidence:** `flutter test test/mount/attachment_transfer_test.dart` — 5 passed; combined M04 transfer, editor, workflow, and expanded fault-matrix suites — 20 passed; targeted `dart analyze` — no issues.

## Implemented contract

`AttachmentTransferManager.restoreRegistered` accepts a report UUID, registered receipt and object ID, expected SHA-256, project scope claims, and a `RegisteredAttachmentFetchPort`. The host fetcher must call the product-approved download route and revalidate tenant, project, and role authorization on every request. Returned bytes go through the same report-linked attachment journal, app-private source, atomic object-store staging, and post-finalization SHA-256 verification as captured photos. The existing server receipt is retained; restore does not upload or register a second object. A digest mismatch is recorded as typed `digestMismatch` and cannot become complete.

The tests cover successful fetch plus local persistence, final bytes matching the expected digest, and tampered bytes remaining incomplete. The fetch interface carries scope claims, but there is no HTTP/product-server implementation in this branch. Shared editor tests verify report UUID propagation and registered-only previews.

## Required evidence still missing

- The server route, receipt-to-object lookup, authorization revalidation, and download response are not implemented or verified against `Construction_Manager`.
- Snapshot bootstrap is available in the M03 package, but the Flutter mount does not yet apply snapshot daily-report rows into the T03 local domain repository. New-device record restoration therefore remains unproven.
- The mounted T05 conflict/revocation tests prove local report retention for those outcomes, but no explicit server `rejected` outcome test yet demonstrates fix-and-retry from the user path.
- No product feed association proves restored registered photos reappear on a second device.

## Browser persistence follow-on (2026-10-10)

The T06 worktree now contains a browser SQLite WASM + IndexedDB driver, a SQLite-backed object store, an async browser mount, and a browser photo service. Local writes await `flushDurability()` before the editor reports a save. The official `sqlite3.wasm` release asset was checksum-verified before vendoring. `flutter analyze`, the full native `flutter test` suite (177 passed), and a release web compile importing the actual browser mount dependency graph passed. A Chrome persistence probe did not complete in the Flutter web test harness, so close/reopen durability remains unverified and this implementation is still a candidate, not acceptance evidence. Product route/auth scope, snapshot application, rejected fix-and-retry, and second-device restoration remain open.

These gaps depend on the daily-report server binding and real product routes. This progress report does not claim T06 complete.
