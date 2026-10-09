# Platform contracts

This package is the canonical home for transport-neutral platform schemas and
their generated bindings. Protocol Buffers with proto3 syntax is the selected
schema format, and Buf v2 owns formatting, linting, generation, dependency
locking, and breaking-change checks under [ADR-0012](../../docs/adr/0012-platform-contract-schema-format.md).
This package does not select or change an API transport.

## Layout

```text
packages/platform_contracts/
├── buf.yaml
├── buf.lock                 # added with the first external schema dependency
├── proto/                   # canonical .proto sources; package path mirrors package name
├── gen/typescript/          # committed TypeScript bindings
├── gen/dart/                # committed Dart bindings
├── gen/rust/                # committed Rust bindings when a real Rust target exists
├── CHANGELOG.md
└── BUF_VERSION
```

`proto/` is intentionally empty of domain declarations in this scaffold. Add
schemas only through a registered task that defines their owner, semantics, and
compatibility requirements. Do not add speculative messages, services, or
transport-specific definitions.

Generated files belong under the corresponding `gen/` target directory and are
committed alongside their source. They are generated artifacts: do not edit them
by hand. The first generation task must add an explicit `buf.gen.yaml`, pin every
plugin to an exact version and revision, and pin generated-code runtimes. Rust
generator/runtime pins are selected only when a real Rust target and fixture
compilation are available. No generator or runtime is implied by this scaffold.

## Toolchain and compatibility policy

- The Buf CLI version is recorded exactly in `BUF_VERSION`; update it only in a
  reviewed change that also validates the package configuration and generation.
- Use Buf configuration version `v2`, `STANDARD` lint rules, and `FILE` breaking
  checks. CI must compare breaking changes with the prior schema release.
- Pin external Buf module dependencies in `buf.lock` when the first dependency is
  introduced. This package does not require the hosted Buf Schema Registry.
- Keep proto package names versioned (for example, `contractor.example.v1`) and
  mirror each package name in its source directory. Reserve removed field numbers
  and names; use exact decimal and distinct date-only/UTC-instant semantics as
  specified by ADR-0012.
- Release compatible schema changes with a semver Git tag and a changelog entry.
  Breaking changes require a new major contract version and an explicit
  migration plan. Consumers pin an exact tag or commit.

## Commands

Run Buf commands from this directory using the exact CLI version in `BUF_VERSION`:

```sh
buf format --diff
buf lint
buf breaking --against <prior-schema-ref>
buf generate
```

Generation, stale-output checks, and language fixture compilation are established
by M02-T02. Until then, this package contains no generated bindings.
