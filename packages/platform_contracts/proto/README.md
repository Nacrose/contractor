# Schema sources

Canonical `.proto` files belong here. Their directory path must mirror the
declared Protobuf package and its version, such as
`contractor/example/v1/example.proto` for `contractor.example.v1`.

The initial schema defines transport-neutral exact-decimal, date-only, and
UTC-instant value wrappers for the shared semantic fixtures. It declares no
application messages, services, or API transport. Add further source files only
in a registered task that establishes their owner and semantics.
