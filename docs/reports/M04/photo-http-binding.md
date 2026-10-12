# M04-T04 HTTP photo registrar binding

Status: adapter implemented; authenticated host and device acceptance remain open.

`HttpPhotoUploadRegistrar` binds the attachment journal to the product route
`POST /api/native/photos/upload`. Authorization headers are supplied afresh by
the session owner, never written into the upload journal. One implementation
uses package:http for Flutter web and installed targets.

The adapter opens an idempotent upload, queries its committed offset, appends
bounded chunks, and completes with source digest/length verification. Typed
authentication, permission, rejection, digest and transient failures retain
local bytes. Unknown bodies do not become successful registrations.

Migration 8 adds `registered_digest` and `registered_bytes`. These describe the
sanitized server object, while the existing digest/bytes describe the original
durable local object. Report references use the registered values; restarting
the app preserves both. Existing identity-preserving registrar fixtures remain
supported by the original port.

Validation: 14 focused Flutter transport, attachment/restart and editor tests
passed; targeted Flutter analysis passed. A further editor assertion checks
that the report payload uses the served digest and length, rather than the
original photo values.

Still required before T04 completion: compose the registrar with real PKCE
session ownership and camera/gallery in the host; deploy the upload migration
to the local test database; demonstrate authenticated interrupted upload and
registered report acceptance. The current default host remains explicitly a
local preview. No device screen was accessed or captured.
