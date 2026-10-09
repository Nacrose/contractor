# M01-GATE — Measured evidence and owner decision packet

**Status: complete; M01-GATE approved and merged as PR #11.** M01-T01…T16 evidence is assembled here for the owner gate. This document makes no claim of production readiness or feature cutover.

## Gate result

M01 does **not** establish acceptance of a production cross-platform stack. The M01-T16 matrix classifies six gates as failed/not demonstrated and one as passed at the SQLite engine level. The failures are often missing representative evidence, not measured numeric misses. Four failed rows require explicit product-scope decisions; their proposals remain unaccepted. The §1 parity outcome and affected browser, DWG, and takeoff gates remain in force.

| Evidence area | Result | What the evidence supports | Remaining limit |
|---|---|---|---|
| Browser startup/data access (T03) | Prototype pass | Static browser boot and in-browser data-access path were exercised without a local app server/native plugin. Browser storage is treated as an evictable cache. | Does not prove full engineering or field-workflow performance. |
| Worksheet viewport (T04) | Prototype pass, partial workload | Reported 50k-row virtualization, interaction, and fixture performance. | §7 also names 100k rows and minimum-device/release-profile conditions; report does not establish that full envelope. |
| CAD viewport (T05) | Prototype pass, partial workload | Reported fixture display, spatial picking/snapping, web route, and timing on a development workstation. | Does not establish 100k/1m entity mixes or ratified minimum-browser hardware. |
| Synthetic PDF viewport/takeoff (T06) | Prototype pass, not a renderer result | Bounded cache behavior and measurement interaction on generated content. | Generated vectors are not a binary PDF renderer or cross-platform dependency proof. |
| Comparative kernels (T07–T09) | Directional prototype results | Existing reports compare candidate shapes and fixtures; CPM names server TypeScript as authority and its Dart implementation as a temporary preview duplicate. | Some “Rust/server” benchmark adapters call the Dart implementation. Candidate timings do not consistently establish declared minimum-device and full workload evidence. |
| PDF package spike (T10) | Browser one-page run; no selection | `pdfrx`/PDFium advances as the lead to a real binary-PDF prototype; web release path opened a generated one-page PDF. | No native-device result, large-file memory/cancellation/fidelity result, or network-disabled proof. |
| Dependency/DWG matrix (T11–T12) | Inventory and feasibility assessment | DWG reader covers legacy AC1012/14/15; conditional converter path and licensing questions are recorded. PDF/XLSX fit is separated by platform. | No DWG writer, no verified modern all-target offline DWG path, and no verified native PDF dependency for the declared workload. |
| SQLite durability (T13) | Pass at engine level | Process-kill, recovery, acknowledgement, contention, migration, and `SQLITE_FULL` cases pass on macOS SQLite and Linux CI. | No Flutter adapter/native app/device integration proof; that remains an M03 gate. |
| Cross-language semantics (T14) | Gate failed | Dart and an independent JavaScript fixture runner pass the fixture contract. The absent Rust FFI/Wasm/server candidates and shared Dart benchmark inner kernels do not prove cross-target parity. | Multi-language kernel adoption is blocked; single authoritative server-language semantics is the precommitted fallback. |
| Canonical contract format (T15) | Accepted for schema format; target adoption remains gated | ADR-0012 records Protobuf proto3 with Buf v2 policy, generated committed artifacts, and drift/breaking checks. | No schema package or code generation exists yet; Rust plugin/runtime quality remains unverified. |
| Fallback matrix (T16) | All seven rows resolved | Six failed/not-demonstrated outcomes, one SQLite engine-level pass; four owner proposals remain pending; budgets unchanged. | See [fallback-matrix-outcomes.md](fallback-matrix-outcomes.md). |

## Proposed architecture decision for the owner

The draft [ADR-0013](../../adr/0013-m01-platform-stack-decision.md) recommends a staged redesign: retain the existing React/TypeScript application and its current service boundaries as production behavior; keep Flutter work in disposable, bounded prototypes; do not authorize production cutover or a broad engine rewrite from the current M01 evidence. Preserve the full §1 parity target until the owner explicitly decides otherwise in ADRs. Keep the product TypeScript implementations as current semantic baselines; explicitly verify or establish server authority and binding per engine before production Flutter use. Client Dart calculations remain previews unless a per-engine decision record and parity evidence authorize more.

The proposal records candidate directions, not a general Flutter rejection: Dart remains a focused candidate for worksheet and 2D geometry; CPM stays server-TypeScript-authoritative with the existing governed Dart preview duplicate; `pdfrx`/PDFium is only a lead for a required real-PDF/native spike. ADR-0012 already accepts Protobuf/Buf as the schema format; package implementation proceeds only after the M01 gate opens, and target adoption remains subject to parity and binding evidence.

### Owner decisions recorded

The repository owner approved ADR-0013's staged continuation and chose to retain the current §1 product scope for each of the four T16 proposals. The missing evidence remains required; no browser target, DWG capability, takeoff platform, or other product scope is removed or narrowed. No budgets are changed.

ADR-0012 remains accepted for schema format. Its target adoption remains gated by binding and parity evidence. The per-engine records below remain planning drafts and do not authorize production bindings; each must be finalized before a dependent screen is built. No production cutover is authorized.

## Per-engine decision-record drafts

The owner left these records as planning drafts at M01-GATE. They do not select production bindings or authorize an engine-dependent screen. Final per-engine authority, binding, fixture, and duplication decisions must be approved before any dependent screen is built.

| Engine/semantics | Authority proposed | Execution targets and binding strategy | Shared fixtures | Duplication status and gate |
|---|---|---|---|---|
| Worksheet calculation | Proposed sole semantic source: the product TypeScript worksheet/formula engine (`src/lib/worksheet/spreadsheet-engine.ts`, `formula-engine.ts`). The exact server execution path and active-writer boundary must be confirmed against the product checkout before this can be called server-authoritative. | Existing React/TypeScript path remains current product behavior. Flutter native/web: bounded Dart prototype only, never authoritative for accepted financial values; any future binding/serving path is an M02/M03 design input. | Existing worksheet fixtures including `degenerate_calc_stress.json`; add differential coverage against the product TypeScript implementation before any client calculation is relied on. | No Rust adoption. The Dart prototype is not approved as a governed duplicate until an owner, shared fixtures, and a removal/reconciliation gate are registered. |
| CPM/scheduling | Existing server TypeScript CPM engine. | Server TypeScript computes authoritative baselines/approvals; Dart is local interactive preview only; accepted schedules reconcile through the server API. | `cpm_degenerate_cases.json`, `sample_cpm_1k.json`, Nepal calendar/date fixtures. | Temporary client duplicate per T08 report, with named “Cross-Platform Core Engine Team” owner and M09 reconciliation/removal gate; ratify owner identity at T17. |
| 2D geometry | Proposed sole semantic source: product TypeScript CAD geometry/command modules (`src/lib/cad/geom.ts`, `entity-ops.ts`, `command-registry.ts`). Server execution and write authority must be confirmed before labeling this a server-authoritative API. | Existing React/TypeScript path remains current product behavior. Dart prototype and compact renderer adapter are not production bindings. No per-vertex FFI calls. | M00 DXF geometry fixtures and T14 geometry-tolerance cases. | No Rust adoption in M01. The Dart prototype is not approved as a governed duplicate until fixture parity, a named owner, and a removal gate are recorded. |
| PDF measurement | Existing TypeScript document session/measurement engine. Renderer adapter must not own calibration, markup persistence, authorization, or BoQ links. | Current web reference: PDF.js; proposed native/web candidate: pdfrx/PDFium pending native and large-file proof; existing renderer stays until a verified adapter is selected. | Existing document-measurement fixtures plus the required sanitized large/vector/scanned/rotated/malformed binary PDFs. | No new renderer selected. Dependency choice waits for the T10/T12 spike, offline tests, and target-platform results. |
| Decimal, geometry tolerance, and date semantics | One server-language implementation per affected engine; exact authority named in each engine record before a dependent screen is built. | Clients consume authoritative results through the versioned binding/serving strategy. No independent Rust FFI/Wasm semantic kernel is adopted on current evidence. | `fixtures/platform-parity/semantics/cross-language.json` plus engine-specific shared fixtures. | Cross-language gate failed. No parity claim; T14/T16 single-authority fallback applies. |

## M02 refinement and sequence

The [M02 task register](../../plans/milestones/M02-contracts-shared-ux.md) is refined from WPs to T01–T08 per protocol R9. Its M01 owner-gate dependency is satisfied by PR #11. T01 uses ADR-0012's accepted schema-format direction unless the owner amends it; all tasks exclude production screen cutover. The M02 gate remains owner-approved under R8.

## Limits and follow-up gates

- This packet consolidates recorded evidence; it does not rerun benchmarks or upgrade prototype reports into device certification.
- Required follow-up includes declared-minimum-device profiles, representative 100k-row and 100k/1m-entity workload coverage, M04 field-workflow performance, a real binary-PDF fixture/native matrix, and native SQLite adapter/device verification.
- No budget has been renegotiated or lowered. The four scope proposals were not adopted; current §1 scope remains in force pending additional evidence.
- No production cutover is proposed. M02 work starts only after owner approval and with the above constraints explicit.

## Sources

- [M01 fallback outcomes](fallback-matrix-outcomes.md)
- [Capacity and hardware ratification](../M00/capacity-ratification.md)
- [M01 reports](../M01/)
- [Platform Plan v3](../../plans/native-web-platform-plan-v3.md)
- [Protocol R8/R9](../../rules/AI-AGENT-EXECUTION-PROTOCOL.md)
