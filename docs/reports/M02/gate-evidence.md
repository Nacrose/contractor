# M02-GATE — Exit evidence and owner decision packet

**Status: evidence packet assembled; owner decision pending (protocol R8).** This document consolidates the evidence for M02-T01…T07 and the pre-gate conditions required before the `[M02-GATE]` PR can merge. M02's exit contract is deliberately narrow: native/web component contract tests and accessibility checks pass; **no production feature cutover and no per-screen alternative primitives**. Nothing here claims production readiness beyond that contract.

## 1. Task evidence (M02-T01…T07)

| Task | Deliverable | PR | Evidence |
|---|---|---|---|
| M02-T01 — Contracts package skeleton | `packages/platform_contracts/`: Protobuf proto3 + Buf v2 layout, versioning policy, pinned toolchain (`BUF_VERSION`, pinned npm/Dart tools), release/changelog conventions (`CHANGELOG.md`), no speculative domain schemas | #14 | Package structure and policy docs in-repo; no server/API transport change included |
| M02-T02 — TS/Dart/Rust bindings | Committed generated bindings (`gen/typescript/`, `gen/dart/` → `dart/lib/generated/`), pinned plugins/runtimes, generation + drift-check CI | #15 | `contracts-ci.yml` runs: Buf format/lint → breaking-change check vs prior schema release → deterministic regeneration → TS + Dart semantic fixtures (exact-decimal string/scaled-int, date-only/UTC-instant) → fail on stale generated bindings → Rust target status recorded |
| M02-T03 — Flutter component library core | `packages/construction_ui/`: `ConstructionTable`, `ActionBar`, `StatusBadge`, dialogs, query/error/empty/loading states, using existing design-system rule IDs | #16 | Components are presentation/action-coordination only — financial arithmetic, permissions, persistence, and domain rules remain in existing services; no route/screen cutover |
| M02-T04 — Canonical design tokens | `packages/design_tokens/` single source (`tokens.json`) → generated React (`react/tokens.ts`, `tokens.css`) and Flutter (`generated_tokens.dart`) artifacts; stale/hand-edited detection in CI | #17 (+ companion PR #163 in Nacrose/Construction_Manager) | Both codebases consume generated artifacts from the same source; existing design-system IDs preserved; platform-specific values documented |
| M02-T05 — Save/sync status model | Shared save/sync state model + action contract (`save_sync_status_panel.dart`, `action_coordinator.dart`): local persistence vs server acceptance vs attachment completion vs backup state | #18 | Background upload does not block unrelated interaction; retry/rejection states preserve pending work and explain next action; central action contract, no per-page bypass |
| M02-T06 — Route/command/capability registries | Typed registries (`packages/construction_application/lib/src/registries.dart` + tests): platform availability and fallback behavior declared per capability | #19 | No feature hidden behind install prompts or implicit platform branches; route/command identities stable and typed; no authorization decisions encoded in client state |
| M02-T07 — Responsive/a11y/keyboard contracts | Contract test suite (`packages/construction_ui/test/construction_ui_test.dart`) covering keyboard/focus semantics, responsive viewports, semantic accessibility, interaction contracts on web + desktop targets | #20 | Platform-specific behavior and unsupported capabilities visible and recorded; no production feature cutover |

**CI note (recorded for the gate):** M02-T07's PR exposed two CI infrastructure defects, both fixed on main before this gate: prototype kernel fixture tests were moved off the browser (DDC cannot provide file IO) while UI contract checks keep the Chrome job (commit `fbe75a5`), and the protocol linter's PR-title allowlist was made dynamic (PR #24). Both are governance/CI changes, not milestone scope changes.

## 2. Gate acceptance conditions (M02-T08)

| Condition | Status | Evidence |
|---|---|---|
| All task evidence linked | ✅ | Table §1 — every M02 task ticked with its PR reference |
| Schema and generated artifacts in sync | ✅ | `contracts-ci.yml` regeneration + `git diff --exit-code` stale-binding check green on the latest main run of every merged M02 PR; breaking-change check green against the prior schema release |
| Component contracts and accessibility evidence pass | ✅ | `client-ci.yml` Flutter test suite (web VM + Chrome UI-contract jobs) green on all merged M02 PRs; T07 contract suite is the a11y evidence of record |
| M03 refined to task level before its gate opens | ✅ (ahead of schedule) | M03 refined T01–T10 by PR #21 (merged); includes the R9 refinement contract for M04 |
| M06 refined before this gate merges (its dependency path) | ✅ | M06 refined T01–T11 incl. GridCraft prototype task per ADR-0015 — [PLAN-AMEND] stack, this PR series |
| M07 refined before this gate merges (its dependency path) | ✅ | M07 refined T01–T10 incl. CADCraft prototype task per ADR-0015 — same stack |
| M08 refined (contractually due before M06/M07 gates; done now per ADR-0015) | ✅ | M08 refined T01–T08 incl. PdfCraft prototype task — same stack |
| Documents/decks capability registered (ADR-0015 follow-up) | ✅ | M12 registered at WP level (WordCraft letters/reports/specs, deckcraft presentations — owner-required 2026-10-09) — same stack |
| Owner approval recorded under protocol R8 | ⏳ | **Pending — this packet is the approval request** |

## 3. What M02 establishes (and what it does not)

**Established.** One canonical contract pipeline (proto3 → pinned Buf → generated TS/Dart bindings, drift-checked in CI) with semantic fixtures proving exact-decimal and date/instant semantics on the two available targets. One shared Flutter component library and token pipeline fed from a single token source consumed by both codebases. Central save/sync status modeling and typed route/command/capability registries. A contract-test suite proving keyboard/focus, responsive, and semantic-accessibility behavior of the core components on web and desktop targets.

**Not established (by design).** No production screen consumes any of this yet — the exit contract forbids cutover. The Rust bindings target remains an explicit blocked check (`check-rust-target.mjs` records absent Rust toolchain status rather than stubbing a pass), consistent with ADR-0013's rejection of a Rust semantic kernel on current evidence. Browser storage remains an evictable cache per M01; the save/sync model defines states but the durability engine itself is M03 scope. Token/component parity with the React app is proven at the artifact level (generated from one source); screen-level parity is M10 scope.

## 4. Follow-through registered from this gate

- **M03 implementation** can start on owner approval of this gate — M03 is refined (PR #21) and its dependency `M02-GATE` is the only blocker.
- **ArtCraft prototypes** M06-T01 (GridCraft), M07-T01 (CADCraft), M08-T01 (PdfCraft) are registered tasks whose evidence feeds per-engine adoption ADRs; pins start at the verified tags (`gridcraft v0.3.0`, `cadcraft v0.3.0`, `pdfcraft v0.4.0`) recorded in [docs/vendor/ARTCRAFT.md](../../vendor/ARTCRAFT.md).
- **M12** (documents/decks) is registered at WP level; its refinement (with WordCraft + deckcraft prototype tasks) is due before the M12 gate, following the M06/M07/M08 pattern.
- Standing constraints 1–7 (EXECUTION-PLAN) continue to apply, including the change-feed naming duty from M03 onward.

## 5. Owner decision requested

Per protocol R8 the repository owner is asked to approve **M02-GATE**: accept the M02 exit evidence above, and authorize M03 task work to begin. Approval is recorded by merging the `[M02-GATE]` PR (which ticks M02-T08). No scope change, budget change, or production cutover is requested or implied by this gate.

## Sources

- [M02 milestone register](../../plans/milestones/M02-contracts-shared-ux.md) · [M03 refined register](../../plans/milestones/M03-identity-storage-sync.md)
- [M06](../../plans/milestones/M06-worksheet-boq-engine.md) / [M07](../../plans/milestones/M07-cad-kernel-plot.md) / [M08](../../plans/milestones/M08-pdf-takeoff.md) refinements · [M12 registration](../../plans/milestones/M12-documents-presentations.md)
- [ADR-0013](../../adr/0013-m01-platform-stack-decision.md) · [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md) · [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md) · [vendor registry](../../vendor/ARTCRAFT.md)
- [Contracts CI](../../../.github/workflows/contracts-ci.yml) · [Client CI](../../../.github/workflows/client-ci.yml) · [Protocol](../../rules/AI-AGENT-EXECUTION-PROTOCOL.md)
