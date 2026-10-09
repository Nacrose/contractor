# Schema sources

Canonical `.proto` files belong here. Their directory path must mirror the
declared Protobuf package and its version, such as
`contractor/example/v1/example.proto` for `contractor.example.v1`.

The schema defines transport-neutral exact-decimal, date-only, and UTC-instant
value wrappers plus the registered `SaveSyncStatus` projection for local save,
server acceptance, attachment completion, and backup. It declares no services
or API transport. New source files require a registered task that establishes
their owner and semantics.
