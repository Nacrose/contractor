# M02 — Central contracts and shared UX foundation

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M02, §4 contracts, §5.1. Dependency satisfied: M01 owner gate approved and merged as PR #11. This file refines the former work packages into ordered task-level work per protocol R9. M02 task work may now begin within the listed acceptance criteria.

Exit: native/web component contract tests and accessibility checks pass; no production feature cutover and no per-screen alternative primitives.

---

- [ ] **M02-T01** — Scaffold the canonical platform contracts package
  - Depends on: M01-GATE approved · Output: `packages/platform_contracts/` skeleton, schema source, release/changelog conventions
  - Acceptance:
    - Uses Protobuf proto3 and Buf v2 only if ADR-0012 remains approved at M01-GATE; otherwise follow the owner-ratified replacement.
    - Defines versioning, package layout, pinned toolchain/plugin policy, and generated-artifact locations without adding speculative domain schemas.
    - No server/API transport change is included.

- [ ] **M02-T02** — Generate and verify TypeScript, Dart, and Rust bindings
  - Depends on: M02-T01 · Output: committed generated bindings, pinned plugins/runtimes, generation and drift-check CI
  - Acceptance:
    - Regeneration is deterministic; CI fails on generated diff, formatting/lint errors, or breaking changes against the prior schema release.
    - Shared fixtures prove exact decimal string/scaled-int and date-only/UTC-instant semantics in each available target; absent Rust targets remain an explicit blocked check rather than a stubbed pass.
    - A versioned release includes a Git tag and changelog entry; no hosted registry dependency is required.

- [ ] **M02-T03** — Build the central Flutter component library core
  - Depends on: M01-GATE approved · Output: `packages/construction_ui/` core component package
  - Acceptance:
    - Implements Flutter equivalents for `ConstructionTable`, `ActionBar`, `StatusBadge`, dialogs, and query/error/empty/loading states using existing design-system rule IDs.
    - Components are presentation and action-coordination layers; financial arithmetic, permissions, persistence, and authoritative domain rules remain in existing services.
    - No production route or screen cutover is included.

- [ ] **M02-T04** — Derive platform tokens from one canonical source
  - Depends on: M01-GATE approved · Output: canonical token source and generated React/Flutter token artifacts
  - Acceptance:
    - Both codebases consume generated artifacts from the same source; CI detects stale or hand-edited generated tokens.
    - Color, typography, spacing, state, and semantic tokens preserve existing design-system IDs and document intentional platform-specific values.

- [ ] **M02-T05** — Model local-save and cloud-sync status centrally
  - Depends on: M02-T03 · Output: shared save/sync state model and component/action contract
  - Acceptance:
    - Distinguishes local persistence, server acceptance, attachment completion, and backup state.
    - Background upload does not block unrelated app interaction; retry/rejection states preserve pending work and explain the next user action.
    - Changes to the design-system action contract are made centrally once; no page-specific bypass is introduced.

- [ ] **M02-T06** — Define shared route, command, and capability registries
  - Depends on: M02-T01, M02-T03 · Output: typed route/command/capability registries consumed by navigation and feature availability
  - Acceptance:
    - Each capability declares platform availability and fallback behavior explicitly; no feature is hidden behind an install prompt or implicit platform branch.
    - Route and command identities are stable, typed, and do not encode authorization decisions in client state.

- [ ] **M02-T07** — Verify responsive layouts, accessibility, and keyboard contracts
  - Depends on: M02-T03, M02-T04, M02-T06 · Output: native/web component contract tests and accessibility evidence
  - Acceptance:
    - Core components pass keyboard/focus semantics, responsive viewport, semantic accessibility, and interaction contract checks on web and desktop.
    - Platform-specific behavior and unsupported capabilities are visible and recorded; no production feature cutover is included.

- [ ] **M02-T08** — 👤 GATE — M02 exit evidence
  - Depends on: M02-T01…T07 · Output: `[M02-GATE]` evidence packet and owner decision
  - Acceptance:
    - All task evidence is linked; schema and generated artifacts are in sync; component contracts and accessibility evidence pass.
    - M03 is refined to task level before its gate opens.
    - Owner approval is recorded under protocol R8 before merge.
