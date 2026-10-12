# M10 — Full feature parity and web migration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M10, §6.0 maintenance posture. Dependencies: M04–M09 and the M00 inventory; W09's document/deck legs also consume M12-W07. Long-tail overlap tax peaks here (v3 §6.0). Registered at **WP level** — refine before the preceding gates open.

Exit (v3): every agreed inventory item has passing platform evidence or an explicitly accepted scope decision. Browser feature omissions cannot be hidden behind an installation prompt.

Integration direction: [ADR-0018](../../adr/0018-upstream-capabilities-and-construction-integration.md) and the [platform integration strategy](../open-source-platform-integration-strategy.md) preserve original workflows while upstream projects supply generic capabilities. W07's documentation-only mapping may prepare specialist milestones after M00-T10/M02-T08; W08's source discovery may also prepare early. Production migration and accounting integration retain this milestone's dependencies.

---

- [ ] **M10-W01** — Migration waves over the M00 inventory: every workflow tracked (four engineering engines ≠ full parity)
  - Acceptance sketch: inventory items grouped into waves (billing/IPC, procurement, workforce/HR, accounting, documents, JV, admin…); each wave uses W07's original-tool disposition and maps to owning tasks and platform evidence. Preserve domain behavior while replacing suitable generic implementations through upstream adapters (v3 §6 M10).

- [ ] **M10-W02** — One route at a time; one active writer contract per entity/document version
  - Acceptance sketch: no duplicated authoritative business logic; no silently downgraded old clients (v3 §6 M10).

- [ ] **M10-W03** — Cross-cutting verification on both Flutter web and installed apps
  - Acceptance sketch: role-based visibility, imports/exports, print fidelity, file links, search, errors, keyboard behavior, accessibility, screen sizes, localization (v3 §6 M10).

- [ ] **M10-W04** — Deep links and session transitions between remaining Next.js areas and Flutter web
  - Acceptance sketch: deployment paths, asset caching, rollback explicit (v3 §6 M10).

- [ ] **M10-W05** — Superseded React UI retirement with rollback evidence
  - Acceptance sketch: removal only after accepted feature equivalence + rollback evidence; Next.js backend functionality preserved until deliberately migrated — frontend replacement is not permission to delete server routes (v3 §6 M10).

- [ ] **M10-W06** — 👤 GATE — M10 exit evidence
  - Depends on: M10-W01, M10-W02, M10-W03, M10-W04, M10-W05, M10-W07, M10-W08, M10-W09
  - Acceptance sketch: full cross-platform feature matrix, original-tool disposition, accounting qualification and connected-workflow evidence, or explicitly accepted scope decisions (owner ADRs); owner approval per protocol R8.

- [ ] **M10-W07** — Map every original custom tool to upstream reuse and retained domain rules
  - Depends on: M00-T10, M02-T08
  - Acceptance sketch: documentation-only audit of original sources and M00 inventory, including jobs/imports/background writers. For each tool name its consumers, behavior, retained domain rules, proposed upstream/API, state owner, adapters, platform/fixture coverage, gaps, migration/restore and retirement criteria. Assign implementation to existing or newly registered tasks; no implementation in this WP. Do not rebuild a specialist capability already available upstream or retire custom construction behavior by name matching. Mapping prepares M06/M07/M08/M09/M12 before their dependent cutovers; no completed task is reopened.

- [ ] **M10-W08** — Qualify and integrate the intended accounting library through existing services
  - Acceptance sketch: resolve actual `flutter_accounting` source/package/version and verify licensing; the owner's description is an input, not execution evidence. Prove monetary precision/rounding, balanced atomic journals, period locks, reversals, report reconciliation, migrations and runtime suitability on required targets. Integrate through existing Contractor accounting/approval services with one authoritative ledger, stable project/JV/source-record dimensions, retry-safe posting and M03 sync. Supply a domain-specific chart of accounts; no blind default seeds or duplicate Dart/TypeScript accounting rules. Evidence an actual dependency upgrade and data restore using shared release contracts; inspect transitive licenses. Retain the original ledger path until verification and migration pass; unresolved package identity blocks adoption rather than producing a substitute package with the same name.

- [ ] **M10-W09** — Verify connected original-app journeys across adopted upstream tools
  - Depends on: M10-W01, M10-W02, M10-W03, M10-W04, M10-W07, M10-W08, M12-W07
  - Acceptance sketch: actual takeoff→BoQ→procurement/billing, delivery/bill→stock/journal/report, and site-progress→TruePPM→document/deck journeys use stable context, source links and versioned authorized service commands. Reuse M12 evidence; full document/deck legs wait for the M12 providers, with no substitute editor or premature gate pass. Test full/focused views, native/web context transitions, offline/replay, rejection, conflicts, tenant isolation and no duplicated business effects. Exercise cross-component upgrades with pending local work and issued snapshots; retain originals/checkpoints and prove restore. Isolated vendor demos do not satisfy this WP; findings are registered against the owning milestone.

## Refinement contract

Before the M08/M09 gates merge, refine to `M10-Tnn` tasks (per-wave tasks) with testable acceptance criteria (protocol R9).
