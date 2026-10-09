# ADR-0012: Protocol Buffers as the Platform Contract Schema

- Date: 2026-10-09 (Asia/Kathmandu)
- Status: **Accepted for schema format; target adoption remains gated**
- Context: M01-T15
- Companion: [platform plan v3](../plans/native-web-platform-plan-v3.md) (§4 contract artifact) · [cross-language parity report](../reports/M01/cross-language-parity.md)

---

## 1. Context

The platform plan calls for one versioned source for transport and operation schemas, with generated TypeScript, Dart, and Rust bindings committed alongside it. The current tracked repository has the Flutter/Dart prototype and JavaScript tooling, but no server TypeScript kernel, Rust kernel, or platform-contract package. M01-T14 therefore records a failed multi-language parity gate. This decision selects a schema format and repeatable generation policy; it does not establish that all target implementations exist or that the parity gate passed.

Candidates were compared on target binding coverage, drift and compatibility checks, and versioning:

| Candidate | TypeScript / Dart / Rust bindings | Drift and compatibility controls | Versioning and fit | Score (1–5) |
| --- | --- | --- | --- | --- |
| **Protocol Buffers + Buf** | TypeScript has the Buf-maintained Protobuf-ES implementation; Dart has the official `protoc-gen-dart`; Rust generation is available in the Protobuf/Buf ecosystem. Exact repository-specific Rust plugin and generated-code compilation still need verification when a Rust target exists. | Buf provides a shared generation manifest with pinned plugin versions, formatting/linting and breaking-change checks. | Stable field-numbered messages, binary and canonical JSON representations, and versioned schema modules. Does not dictate the RPC transport. | **4** |
| OpenAPI 3.1 / JSON Schema | OpenAPI Generator lists Dart, Rust and TypeScript client generators; the Rust generator documents gaps in polymorphism and composition. | Generator output can be committed and diffed, but each target is coupled to generator templates/options; schema compatibility policy needs separate tooling. | Strong fit for HTTP endpoints, but makes the contract HTTP-shaped and less transport-neutral. | 3 |
| Hand-authored JSON Schema | Broad validation ecosystem; target binding generation would require separately selected TypeScript, Dart and Rust generators. No single pinned generator pipeline is established in this repository. | Validation is mature, but generated-binding drift and schema breaking-change checks require additional tooling choices. | Flexible JSON contracts; less direct support for strongly typed operation/service definitions. | 3 |

Scores are an engineering comparison of the documented toolchain fit, not a runtime benchmark. No generator was executed in this repository: `buf` and `protoc` are not installed, and Rust/server targets are absent. Official documentation establishes the available generation paths, while the end-to-end target quality remains a required implementation check.

## 2. Decision

Use **Protocol Buffers, proto3 syntax, as the canonical schema language** in the future `packages/platform_contracts/` package. Use **Buf v2 configuration** for schema formatting, lint, code generation orchestration, dependency locking, and breaking-change checks.

This decision chooses only the schema format. It does not select an RPC framework or change any current API transport. Define message types and operation envelopes in `.proto`; keep server routing and transport adapters outside generated schema code.

### Target generation policy

- **TypeScript/JavaScript:** use the Buf-maintained Protobuf-ES generator/runtime, pinned to a reviewed major and exact plugin/runtime versions. Enable JSON-compatible TypeScript types for boundaries that use Protobuf JSON.
- **Dart:** use the official Dart Protobuf compiler plugin (`protoc-gen-dart`) at an exact pinned version through a local plugin entry in the checked-in Buf generation manifest.
- **Rust:** select an exact Protobuf generator/runtime pair only when the repository introduces the real Rust target. The selected generator must compile the checked-in fixture corpus on every supported Rust target before bindings are adopted. A package catalog listing alone is insufficient evidence of quality.
- **Generated artifacts:** commit generated TypeScript, Dart, and Rust bindings with the `.proto` sources in the contract package. Do not hand-edit generated files.

### Data-semantic rules

- Financial decimals cross a contract as exact decimal strings or explicitly scaled integers; never as binary floating-point values.
- Date-only values and UTC instants use distinct fields/types. Do not encode a date-only value as a midnight timestamp.
- Geometry fields state their unit; comparison tolerance remains a semantic contract tested by the shared fixtures, not inferred from Protobuf's `double` type.
- Reserve removed field numbers and names; never reuse them. Use explicit presence or `oneof` where absence differs from a default value.

### Generation, drift, and release policy

1. Pin the Buf CLI, `buf.lock` dependencies, every remote plugin version and revision, the Dart plugin/runtime, and all generated-code runtimes. Do not use `latest` in generation configuration.
2. Run `buf format --diff`, `buf lint`, `buf breaking --against <base-ref>`, and `buf generate` in CI.
3. Regenerate into the committed binding directories and fail CI when `git diff --exit-code` detects stale or manually edited generated artifacts.
4. Compile and run shared semantic fixtures against each binding target that actually exists. A target missing from the repository is recorded as unverified; it cannot count as a passing parity check.
5. Release compatible contract changes with a semver Git tag and changelog entry. Consumers pin an exact tag or commit. Breaking schema changes require a new major contract version and an explicit migration plan; Buf's compatibility check is a pre-merge guard, not a replacement for that decision.
6. Keep schema sources and generation configuration in version control. The Buf Schema Registry may be evaluated later, but this ADR does not add a paid or hosted registry dependency.

## 3. Consequences

### Positive

- One language-neutral, transport-independent source can generate strongly typed message bindings across the planned clients.
- A checked-in, pinned Buf manifest gives CI one reproducible generation command and a clear stale-output failure.
- Field numbering and compatibility checks provide guardrails for long-lived offline clients and independently released server/client packages.

### Costs and limits

- Protobuf encodes business meaning only when the schema and adapters preserve the decimal/date/tolerance rules above; generated types do not prove semantic parity.
- Dart generation uses a local compiler plugin while TypeScript can use a Buf remote plugin, so both paths and tool versions need pinning.
- Rust generator and runtime quality is not proven in this repository. Before a Rust binding is adopted, M01 parity evidence or a follow-up implementation task must compile and exercise the shared fixtures against the selected toolchain.
- Existing server repository identity and integration remain subject to the M00 repository verification and M01-T17 owner gate. This ADR does not authorize a server migration or production cutover.

## 4. Evidence sources

- [Protocol Buffers Dart generated code](https://protobuf.dev/reference/dart/dart-generated/) — Dart messages are generated by a compiler plugin.
- [Buf code generation](https://buf.build/docs/generate/overview/) — generation uses checked-in configuration and can target TypeScript, Rust and other languages; remote plugin versions can be pinned.
- [Buf breaking-change checks](https://buf.build/docs/breaking/usage/) — compatibility rules are configured and run in CI.
- [Protobuf-ES v2](https://buf.build/blog/protobuf-es-v2) — Buf's TypeScript/JavaScript Protobuf implementation supports JSON-compatible TypeScript types.
- [OpenAPI Generator supported generators](https://openapi-generator.tech/docs/generators/) and [Rust generator limits](https://openapi-generator.tech/docs/generators/rust/) — comparison evidence for the OpenAPI alternative.
