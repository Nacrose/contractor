# Changelog

Schema releases follow semantic versioning through Git tags named
`platform-contracts/v<major>.<minor>.<patch>`. Compatible changes are released
with a changelog entry; a breaking schema change requires a new major contract
version and an explicit migration plan. Consumers pin an exact tag or commit.

## v1.0.0 (2026-10-09)

- Establish the canonical Protobuf/Buf package layout and release policy.
- Add exact-decimal, date-only, and UTC-instant wrappers with generated
  TypeScript and Dart bindings and semantic fixture checks.

## Unreleased
