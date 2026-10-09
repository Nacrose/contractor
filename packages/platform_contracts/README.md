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
├── buf.gen.yaml             # pinned local TypeScript and Dart generators
├── proto/                   # canonical .proto sources; package path mirrors package name
├── gen/typescript/          # committed TypeScript bindings
├── gen/dart/                # committed Dart bindings
├── gen/rust/                # reserved until a real Rust target exists
├── dart/lib/generated/      # generated Dart package view of gen/dart
├── dart/                    # pinned Dart runtime, package entry point, fixture check
├── CHANGELOG.md
└── BUF_VERSION
```

The schema defines transport-neutral exact-decimal, date-only, and UTC-instant
value wrappers plus the registered local-save and sync-status projection. The
save/sync message separates local persistence, server acceptance, attachment
completion, backup state, retained pending work, and the next user action. It
does not define a transport, persistence engine, or business authorization.

Generated files belong under the corresponding `gen/` target directory and are
committed alongside their source. They are generated artifacts: do not edit them
by hand. The Dart package view at `dart/lib/generated/` is generated in the same
step so Flutter packages can consume bindings through a local package
dependency; CI checks both Dart outputs for drift. The checked-in `buf.gen.yaml`
invokes local plugins. Exact plugin and runtime versions are locked in
`package-lock.json` and `dart/pubspec.lock`; no remote plugin service or schema
registry is required. Rust generator/runtime pins
are selected only when a real Rust target and fixture compilation are available.
No Rust stub is generated: the Rust fixture check is blocked while this
repository has no Rust target.

## Toolchain and compatibility policy

- The Buf CLI version is recorded exactly in `BUF_VERSION` and the local npm
  dependency; update both only in a reviewed change that validates generation.
- Use Buf configuration version `v2`, `STANDARD` lint rules, and `FILE` breaking
  checks. CI must compare breaking changes with the prior schema release.
- Pin external Buf module dependencies in `buf.lock` when the first dependency is
  introduced. This package does not require the hosted Buf Schema Registry.
- Keep proto package names versioned (for example, `contractor.example.v1`) and
  mirror each package name in its source directory. Reserve removed field numbers
  and names; use exact decimal and distinct date-only/UTC-instant semantics as
  specified by ADR-0012.
- Release compatible schema changes with a semver Git tag such as
  `platform-contracts/v1.1.0` and a changelog entry.
  Breaking changes require a new major contract version and an explicit
  migration plan. Consumers pin an exact tag or commit.

## Commands

Run package commands from this directory. Exact dependency versions and
transitive versions are locked in the checked-in npm and Dart lockfiles:

```sh
buf format --diff
buf lint
npm run breaking
buf generate
npm run check:typescript
npm run check:dart
```

CI runs formatting, lint, compatibility, generation/drift, and fixture checks for
TypeScript and Dart. The shared fixture check for Rust is explicitly blocked
until a real Rust target is added.
