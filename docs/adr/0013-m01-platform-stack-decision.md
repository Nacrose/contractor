# ADR-0013: M01 platform stack and staged continuation

- **Status:** Accepted at M01-GATE
- **Date:** 2026-10-09
- **Deciders:** Repository owner (required under protocol R8)
- **Related:** ADR-0012, ADR-0011, M01-T03…T16 evidence in `docs/reports/M01/`

## Context

M01 prototypes show that a Flutter client can exercise useful browser and desktop paths, and identify plausible Dart, TypeScript, PDF, and storage approaches. They do not establish a production cross-platform stack against all ratified hardware tiers and workloads. The T16 fallback matrix has six failed/not-demonstrated rows and one SQLite engine-level pass. Four failed rows require product-scope proposals that only the owner may decide. Cross-language parity failed, and no production Flutter PDF/DWG dependency is selected.

The current production application and its TypeScript services remain the known product baseline. The M01 prototypes are isolated under `prototype/` and do not imply production cutover.

## Proposed decision

**Do not accept a production Flutter replacement stack or begin a broad engine rewrite on the current evidence.** Keep the existing React/TypeScript application and services as the production authority. Continue only bounded, disposable Flutter prototypes and contract work after the owner approves this gate and resolves or explicitly defers each product-scope proposal. Preserve the §1 parity outcome and all affected browser targets while those decisions remain open.

For calculation semantics, keep one authoritative TypeScript implementation per engine unless a per-engine record establishes a different safe strategy. Where that implementation currently runs in the browser, the server API/execution boundary must be explicitly designed before a cross-platform production cutover; M01 has not demonstrated that boundary for worksheet or geometry. Treat new client calculations as previews unless differential fixtures, binding strategy, ownership, and a removal/reconciliation gate are approved. Do not adopt a Rust semantic kernel on T14/T16 evidence.

Candidate directions for further evidence, not production selections:

- **Worksheet:** retain a focused Dart candidate for comparison; keep the product TypeScript engine as the current semantic baseline. Its server execution/API boundary must be verified before calling it server-authoritative or adding a Flutter production binding.
- **CPM:** retain the existing server TypeScript engine as authority; govern the Dart preview as a temporary duplicate with shared fixtures and the M09 reconciliation/removal gate.
- **2D geometry:** retain a focused Dart candidate and compact rendering batches for comparison; no Rust adoption or production port is approved.
- **PDF:** retain PDF.js as current web reference and advance pdfrx/PDFium only to a representative binary-PDF/native prototype. No new renderer is selected.
- **Contracts:** ADR-0012 already accepts Protobuf/Buf as the schema format; target adoption remains gated. Begin package implementation after M01-GATE unless the owner amends ADR-0012.

## Alternatives considered

1. **Accept Flutter as the production cross-platform stack now.** Rejected for this proposal because browser engineering/field performance, representative PDF and native dependency coverage, native minimum-device performance, and cross-language semantics are not established. This would turn missing evidence into an implicit acceptance.
2. **Immediately narrow product scope to installed Flutter apps plus retained React web.** Not adopted. It changes the §1 platform outcome and the T16 matrix explicitly requires an owner ADR for each product-scope row.
3. **Keep the current production application and make Flutter continuation evidence-gated.** Recommended. It preserves existing behavior and parity requirements while allowing bounded research and contract foundations after the owner decides how to handle the open gates.

## Consequences if approved

- No production feature or route moves to Flutter based solely on M01 prototype results.
- M02 task work may proceed only after this M01 gate is approved; its refined task register uses ADR-0012's accepted schema-format decision unless the owner amends it.
- Browser performance, field workflow, DWG, PDF/takeoff, cross-language, and adapter-level SQLite gaps remain tracked gates. No target or feature is silently dropped.
- Ratified §7 budgets stay unchanged. A measured failure later requires a separate documented budget decision; it cannot be resolved by lowering a target silently.
- Each engine must have an approved authority, target/binding strategy, shared fixture set, and duplication classification before a screen depends on it.

## Owner decision

The repository owner approved this staged continuation and chose to retain the current §1 product scope for all four T16 proposals, requiring the missing evidence before any scope change. ADR-0012's accepted schema-format decision remains in force; target adoption remains gated by binding and parity evidence.

The per-engine records in `docs/reports/M01/gate-evidence.md` remain planning drafts. They do not authorize production bindings or screen dependencies; each engine's final authority, binding, fixtures, and duplication status must be approved before a dependent screen is built.

This decision was recorded by the repository owner on 2026-10-09 in the approval for PR #11. No production cutover is authorized.
