# M02 — Central contracts and shared UX foundation

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M02, §4 contracts, §5.1. Dependencies: M01 accepted. Registered at **work-package (WP) level** — protocol R9 requires refinement to task level before the M01 gate opens.

Exit (v3): native/web component contract tests and accessibility checks pass; no production feature cutover and no per-screen alternative primitives.

---

- [ ] **M02-W01** — Scaffold `packages/platform_contracts/` on the M01-selected canonical format
  - Acceptance sketch: versioned operation/document schemas; repository layout per v3 §4 table; generation pipeline committed artifacts.

- [ ] **M02-W02** — Generated TS/Dart/Rust bindings + generation-drift checks
  - Acceptance sketch: bindings generated (not hand-maintained); drift check fails CI on manual edits; versioned release process (tag + changelog) documented.

- [ ] **M02-W03** — Central Flutter component library (`packages/construction_ui/`): core set
  - Acceptance sketch: Flutter equivalents of `ConstructionTable`, `ActionBar`, `StatusBadge`, dialogs, query/error/empty/loading states, currency formatting, action coordination (v3 §6 M02); design-system rule IDs preserved.

- [ ] **M02-W04** — Platform tokens derived from one canonical source
  - Acceptance sketch: React tokens and Flutter tokens generated from a single source; drift check between them; no hand-copied palettes.

- [ ] **M02-W05** — Local-save busy vs cloud-sync pending behavior modeled centrally
  - Acceptance sketch: shared status model distinguishes local persistence, server acceptance, attachment completion, backup states (v3 §6 M02 + M03 status rule); background upload never renders the app inert; design-system action contract amended once, centrally.

- [ ] **M02-W06** — Shared route/command and feature-capability registries
  - Acceptance sketch: registries consumed by navigation and feature gating; capability rows carry platform availability explicitly (no hidden omissions).

- [ ] **M02-W07** — Responsive layouts, semantic accessibility and keyboard navigation contract tests
  - Acceptance sketch: contract tests + accessibility checks pass for the core component set on web and desktop targets; keyboard navigation and focus semantics verified (v3 §6 M02 exit).

- [ ] **M02-W08** — 👤 GATE — M02 exit evidence
  - Acceptance sketch: all WPs ticked; contract-test + a11y evidence aggregated; M03 refined to task level in the same gate; owner approval per protocol R8.

## Refinement contract

Before `M01-T17` merges, this file is refined: every WP becomes `M02-Tnn` with depends-on, outputs, and testable acceptance criteria (protocol R9). Financial arithmetic stays centralized; only presentation formatting ports to Dart (v3 §6 M02) — carry this constraint into every refined task.
