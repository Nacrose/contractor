# M06 — Worksheet/BoQ engine migration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M06, §3 worksheet row. Dependencies: M02, M03; M01 file/compute feasibility accepted. May develop before M05 completes; integrated rollout waits for the shared sync gate. This milestone is refined to task level under protocol R9 (refinement PR recorded in the register).
> Candidate engine: GridCraft (storytold) — evidence-gated per [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md); family evaluation in [prior-art report](../../reports/prior-art-artcraft-family.md); licenses per [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md). M06-T01 is the required GridCraft prototype task (CLI/MCP over M00 fixtures vs the TS authority); any adoption beyond the prototype requires a per-engine adoption ADR (ADR-0015 §1).

> UI/update direction: [ADR-0016](../../adr/0016-artcraft-suite-in-place-embedding-and-table-modernization.md) and the [master integration plan](../artcraft-suite-master-integration-plan.md) require the full upstream editor with its ribbons plus embedded calculation-table mode, reusing upstream UI components. T12 owns the suite update pipeline; T13 covers calculation-table consumers across M04/M05 and other applicable workflows. Added IDs preserve existing references; gate T11 depends on T12/T13.
> Evidence correction (2026-10-12): T01 remains a historical completion record for PR #66. Its committed driver uses local simulators rather than actual upstream/production execution. Its parity, decimal and MCP claims are not adoption evidence; T04 must revalidate them.

> Reuse-first direction: [ADR-0018](../../adr/0018-upstream-capabilities-and-construction-integration.md) applies to unfinished tasks. Reuse upstream calculation, grid and file capabilities through adapters; retain Contractor domain/identity/sync contracts. Graph/operation work is not a mandate to duplicate upstream internals. Missing capabilities require documented gaps and registered work. T01/T02 remain historical completions.

Exit (v3): agreed feature matrix, native/web/server calculation parity, concurrent edit/structure tests and 50k/100k-row workload evidence. Retire redundant production evaluators only after all consumers switch.

---

- [x] **M06-T01** — GridCraft prototype: CLI/MCP evidence over M00 fixtures vs the TypeScript authority (PR #66)
  - Depends on: M00-GATE (fixtures + baseline) · Output: prototype report `docs/reports/M06/gridcraft-prototype.md` + fixture/driver artifacts under `prototype/`; no production code change.
  - Scope: drive GridCraft pinned to an upstream release tag (start: `v0.3.0`) via its CLI and headless MCP server over the M00 worksheet fixtures; compare against the authoritative TypeScript worksheet/formula engine (`src/lib/worksheet/spreadsheet-engine.ts`, `formula-engine.ts` per ADR-0013/M01 authority map). This is disposable evidence work per the M01 prototype posture; it changes no production code and starts before the M02/M03 dependencies complete so its evidence can shape T04's engine decision.
  - Acceptance:
    - The pin (exact tag/rev) is recorded in `docs/vendor/ARTCRAFT.md` in the same PR, with attribution files listed for the record even though nothing ships.
    - A fixture matrix runs the same inputs through GridCraft and the TS authority, reporting per-function match/mismatch/divergence (exact-decimal semantics, date-only/UTC-instant inputs, error and cycle cases) with reproducible commands.
    - The report includes the GridCraft MCP tool inventory (tool names, inputs, outputs) and notes on driving it headlessly.
    - Volatile/random/time inputs and external references are characterized for agreement behavior, informing T03's definitions.
    - The report ends in an explicit recommendation: proceed toward a per-engine adoption ADR, or keep the TS authority with recorded evidence — either way the evidence is linked from this milestone.

- [x] **M06-T02** — Workbook model evolution: command semantics, structure transforms, names, formatting, formula registry (PR #67)
  - Depends on: M02-GATE · Output: versioned workbook-model migration design and implementation behind the existing engine boundary.
  - Scope: evolve the current workbook model, command semantics, structure transforms, names, formatting and formula registry; migrate positional references to stable collaboration identities without changing displayed A1 behavior (v3 §6 M06).
  - Acceptance:
    - Migrated documents preserve displayed references and editing behavior; identity mapping is versioned and reversible at read time.
    - Structure transforms (insert/delete/move rows, columns, sheets) carry tested reference-transformation rules identical for server replay and client preview.
    - Names, formatting and formula registry entries survive round-trips with fixture coverage; no silent normalization.
    - No production consumer is switched in this task; the M02 save/sync model represents the migration state.

- [x] **M06-T03** — Qualify upstream dependency/recalculation behavior and adapter contracts (PR #68)
  - Depends on: M06-T02 · Output: upstream dependency/recalculation mapping, adapter contract and stress evidence; no parallel evaluator.
  - Scope: reuse actual pinned upstream dirty propagation, cycle/error handling and bounded/cancellable recalculation. Define volatile/random/time/external-reference behavior across targets; expose missing hooks in the gap register rather than implementing a substitute graph engine. Prototype bindings only before T04's adoption decision (v3 §6 M06).
  - Acceptance:
    - Cycle detection and error propagation have deterministic, fixture-tested semantics shared by all targets.
    - Recalculation is bounded and cancellable: a scheduled yield/cancel point exists, and cancellation leaves no half-propagated state.
    - Volatile/random/time inputs and external references are defined (M06-T01 evidence informs this); server/native/web results agree on the fixture set.
    - M00 profiling (fresh-evaluator scan behavior) informs the incremental boundary and is cited in the report.

- [x] **M06-T04** — Upstream calculation adoption and shared binding with differential fixtures (PR #69)
  - Depends on: M06-T01, M06-T03 · Output: per-engine decision record and adopted upstream binding with differential fixture evidence.
  - Scope: integrate the selected upstream calculation engine behind shared contracts with verified server execution; no mandatory language port. The decision record honors single authority and governed preview duplication (v3 §4, §6 M06).
  - Acceptance:
    - Replace T01 simulation claims with actual pinned GridCraft execution versus the production TS authority. Record the resolved commit/artifact hash, invocation, actual MCP tool discovery and raw fixture outputs; simulators cannot satisfy parity, volatility, cycle or numeric evidence. Correct the prototype report and verify numeric representation and rounding without assuming `rust_decimal`.
    - The adoption ADR names the shared app/engine version, full/embedded UI surfaces, target hosts, server binding and supported extension points; missing hooks are recorded with an upstream contribution path before affected production binding.
    - Differential fixtures cover the TS baseline versus the actual upstream binding, including exact-decimal string/scaled-int crossings and degenerate/cycle stress fixtures from M00.
    - The server binding is verified (the authoritative path executes where the decision record says it does); no client-authorized financial results.
    - If GridCraft (or any ArtCraft engine) is selected beyond prototype evidence, a **per-engine adoption ADR** is approved first (ADR-0015 §1); otherwise the TS authority remains and the record says so.
    - Kernel governance duplication status is maintained and recorded (single implementation, governed temporary duplicate, or accepted exception with owner named).
    - Known unsupported formulas/features remain visible; no silent lossy import/export.

- [x] **M06-T05** — GridCraft full editor and embedded calculation-table host (PR #70)
  - Depends on: M06-T02, M06-T04 · Output: one Contractor adapter hosting both upstream UI modes, with platform/interaction evidence.
  - Scope: full workbook editing retains upstream ribbons, formula bar, sheets and tools; embedded workflows reuse the upstream grid with cells, row/column headers, formulas, selection, copy/paste and protected fields. This supersedes the mandatory custom Flutter renderer. Prototype the installed-app and browser hosts before production cutover.
  - Acceptance:
    - Both modes use the same pinned upstream app/engine and reusable UI components. Supported configuration/component hooks are identified from actual source; adapter names are not asserted to be upstream options. No upstream source edits or brittle private/DOM hooks.
    - Switching modes retains document identity, revision and pending edits; undo/selection continuity is tested, with any unsupported behavior explicitly recorded. Domain restrictions hold in both modes.
    - Grid commands route through Contractor contracts; cover typing, paste, fill, delete, structural changes, import and automation against protected rates/codes/totals. Derived-formula inspection and editable-input focus work without full editor chrome in embedded mode.
    - Native/web hosts demonstrate keyboard focus, IME, clipboard, accessibility, resize, cancellation/disposal and interception of upstream file/save actions into M03 lifecycle contracts. No assumed native/mobile UI binding.
    - 50k/100k-row workloads report scrolling, input/paste, recalc, memory and serialization separately on ratified profiles; scrolling causes no recalc. Virtualization reuses the upstream grid rather than per-cell host widgets.
    - Production use remains gated by the adoption ADR and evidence; missing extension hooks are tracked upstream and block the affected embedded capability.

- [x] **M06-T06** — Cell/structure operations: version checks, compensating undo, conflict review, compaction/checkpoints (PR #71)
  - Depends on: M06-T02, M06-T04 · Output: operation layer with versioning, undo and compaction evidence.
  - Scope: cell/structure operations with version checks, compensating undo, conflict review, workbook compaction/checkpoints (v3 §5.4 worksheet rows, §6 M06).
  - Acceptance:
    - Disjoint edits compose without loss; overlapping edits preserve conflict semantics for review (never last-write-wins silently).
    - Ordered structure operations carry tested reference transformations and compensating undo entries.
    - Compaction/checkpoints bound document history growth with recovery tests from a checkpoint.
    - Version checks reject stale writers with an explicit review path.

- [x] **M06-T07** — IPC/BoQ integration through existing financial services (PR #72)
  - Depends on: M06-T04, M06-T06 · Output: BoQ/IPC integration through the existing domain services, with parity evidence.
  - Scope: integrate worksheet outputs with IPC/BoQ through existing financial services (v3 §5.1, §6 M02/M06).
  - Acceptance:
    - Authoritative financial arithmetic stays centralized in the existing services; the worksheet consumes/produces values as exact-decimal strings/scaled ints at the boundary.
    - No client-authorized postings: every posting path is an existing service call with its permission checks intact.
    - Change-feed integration and Flutter-parity path named in the task packet (standing constraint 3).
    - Round-trip evidence: worksheet → service → worksheet reflects identical values and provenance.

- [x] **M06-T08** — XLSX compatibility: byte round-trip tests + independently checked representative files (PR #73)
  - Depends on: M06-T02, M06-T04 · Output: XLSX round-trip fixture suite and fidelity matrix.
  - Scope: preserve XLSX compatibility through byte round-trip tests and independently checked representative files (v3 §6 M06); import/export fidelity matrix recorded.
  - Acceptance:
    - Byte round-trip tests over M00 fixtures + representative real-world files pass without loss of covered features.
    - The fidelity matrix records known Excel gaps as tracked work — never declared solved by the port (v3 §6 M06).
    - If GridCraft import/export is used, it runs behind the same fixture suite at the pinned version; failures block adoption, not visibility.
    - Formula/formatting/date fidelity verified against independently produced expected files.

- [x] **M06-T09** — Concurrent edit + structure test evidence (PR #74)
  - Depends on: M06-T06, M06-T07 · Output: concurrency/structure test evidence using real sync plumbing.
  - Scope: concurrent edit and structure-operation evidence under the M03 sync engine (v3 §5.4).
  - Acceptance:
    - Two-writer and three-writer scenarios with disjoint, overlapping, and structural edits produce compose/conflict outcomes exactly as specified in M06-T06.
    - Legacy snapshot saves are denied writes to migrated document types or forced into version checks; no blind full-workbook replacement.
    - Evidence uses real SQLite + disposable PostgreSQL paths (M03); mocks may supplement but never substitute.
    - Recovery from interrupted structure operations is demonstrated (checkpoint replay, no corruption).

- [ ] **M06-T10** — Redundant production evaluator retirement (consumer-switch complete)
  - Depends on: M06-T04…T09, M06-T13 · Output: pre-gate consumer-sweep record + retirement change.
  - Scope: retire redundant production evaluators only after all consumers switch (v3 §2 instruction 10).
  - Acceptance:
    - A consumer sweep documents every production caller of the retired evaluator with its replacement path.
    - Retirement is gated on all consumers switched; the sweep and switch evidence is linked.
    - Rollback path recorded (restore is a revert, not a rewrite).

- [ ] **M06-T12** — Shared ArtCraft release-update pipeline and GridCraft upgrade qualification
  - Depends on: M06-T04, M06-T05 · Output: machine-readable pins/build inputs, documented update command, adapter conformance contract and a GridCraft upgrade/rollback report.
  - Scope: implement the cross-suite lifecycle/version boundary once, with per-app registrations for GridCraft, CADCraft, PdfCraft, WordCraft, DeckCraft and craft-fonts. Proposed command interface: `scripts/update-artcraft <app> <release>`; documentation must distinguish supported integrations from pending app registrations.
  - Acceptance:
    - Configuration records upstream URL, release tag, immutable commit, artifact digest and build/lockfile inputs independently per app; the vendor registry mirrors effective pins. Unevaluated apps have no fabricated pin or passed status.
    - One documented command resolves an explicit release, refreshes the selected build/dependency and runs registered compatibility checks, producing a reviewable diff/report. Unsupported app registrations fail explicitly until their milestone integrates them. Shared dependency/font changes run affected dependent checks.
    - The update report includes release/API changes, licenses/attribution and adapter changes; screens remain dependent on Contractor contracts. No tracked branches, live auto-upgrades or modifications to upstream source.
    - Use two actual GridCraft releases to demonstrate full-editor and embedded-table compatibility, formula/protection/domain behavior, file open/save/reopen, previous-release documents, local recovery, sync conflicts and supported target/performance checks.
    - Demonstrate rollback using retained build artifacts and compatible operation history/files or a tested migration/restore. Preserve original/checkpoint bytes; incompatible newer saved data blocks promotion until recovery is proven.
    - Document monthly/per-gate review, expedited security updates and promotion through existing approval gates. Zero-fork is not represented as zero adapter maintenance.

- [ ] **M06-T13** — Calculation-table consumer inventory, pilot and workflow migration
  - Depends on: M06-T05, M06-T07, M06-T08, M06-T09, M06-T12 · Output: consumer inventory, a working domain-backed pilot and migration/retirement evidence for applicable tables.
  - Scope: inventory BoQ/IPC, measurement, daily-log, material-delivery/receipt, expense and other application calculation/data-entry tables; migrate applicable consumers through the shared GridCraft adapter. Coordinate M04/M05 consumers without changing their historical task completions.
  - Acceptance:
    - Inventory names every affected screen/transport/import/job and its replacement or justified standard-table disposition. Ordinary record lists are not automatically converted.
    - First deliver one BoQ/measurement pilot proving editable quantity, protected contractual fields, visible formulas, exact authoritative service agreement, crash-safe local saving and a real sync-conflict path; then migrate remaining applicable consumers.
    - Schemas map stable domain row IDs and columns to existing models. Sort/filter/paste/insert/delete/undo preserve identity; edits dispatch validated domain commands through local transactions/outbox and existing server permissions/approvals. No direct SQL or full-workbook domain overwrite.
    - Full-editor access cannot bypass domain-backed table protection. Authorized rate changes use the existing amendment workflow; rejected edits reconcile visibly without losing pending user intent.
    - Workbook/freeform mode and domain-backed tables have explicit authority contracts, source provenance and checkpoint/recovery behavior. Financial arithmetic remains in existing services.
    - Consumer switch and retirement evidence includes native/web workflow and mobile input/accessibility checks, with rollback preserving unsynchronized work. No screen-specific engine, offline queue or permanent duplicate domain model.

- [ ] **M06-T11** — 👤 GATE — M06 exit evidence
  - Depends on: M06-T01…T10, M06-T12, M06-T13 · Output: `[M06-GATE]` evidence packet and owner decision.
  - Acceptance:
    - Full/embedded hosting, calculation-table consumer migration and a real GridCraft release upgrade/rollback are evidenced; T01 simulation claims are replaced by T04 actual execution evidence.
    - Parity + workload evidence aggregated: feature matrix, native/web/server calculation parity, concurrent edit/structure tests, 50k/100k-row workload per §7.
    - M08 inputs (BoQ linking contract) confirmed and linked (M08 refinement dependency).
    - Per-engine adoption ADR status recorded (adopted with ADR reference, or TS authority retained with evidence).
    - Owner approval recorded under protocol R8 before merge.

## Refinement contract

This milestone is refined to task level under protocol R9. M06-T01 originally recorded ADR-0015's required prototype; the simulator evidence correction above requires actual execution under T04 before adoption. The required prototype must drive actual upstream CLI/MCP over M00 fixtures against the authoritative engine and produce a reproducible report in `docs/reports/`. The former `M02-W08` reference in this contract was a typo for `M02-T08` (the M02 gate); the obligation — refine before that gate merges — is satisfied by this PR.
