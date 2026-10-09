# M06 — Worksheet/BoQ engine migration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M06, §3 worksheet row. Dependencies: M02, M03; M01 file/compute feasibility accepted. May develop before M05 completes; integrated rollout waits for the shared sync gate. This milestone is refined to task level under protocol R9 (refinement PR recorded in the register).
> Candidate engine: GridCraft (storytold) — evidence-gated per [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md); family evaluation in [prior-art report](../../reports/prior-art-artcraft-family.md); licenses per [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md). M06-T01 is the required GridCraft prototype task (CLI/MCP over M00 fixtures vs the TS authority); any adoption beyond the prototype requires a per-engine adoption ADR (ADR-0015 §1).

Exit (v3): agreed feature matrix, native/web/server calculation parity, concurrent edit/structure tests and 50k/100k-row workload evidence. Retire redundant production evaluators only after all consumers switch.

---

- [ ] **M06-T01** — GridCraft prototype: CLI/MCP evidence over M00 fixtures vs the TypeScript authority
  - Depends on: M00-GATE (fixtures + baseline) · Output: prototype report `docs/reports/M06/gridcraft-prototype.md` + fixture/driver artifacts under `prototype/`; no production code change.
  - Scope: drive GridCraft pinned to an upstream release tag (start: `v0.3.0`) via its CLI and headless MCP server over the M00 worksheet fixtures; compare against the authoritative TypeScript worksheet/formula engine (`src/lib/worksheet/spreadsheet-engine.ts`, `formula-engine.ts` per ADR-0013/M01 authority map). This is disposable evidence work per the M01 prototype posture; it changes no production code and starts before the M02/M03 dependencies complete so its evidence can shape T04's engine decision.
  - Acceptance:
    - The pin (exact tag/rev) is recorded in `docs/vendor/ARTCRAFT.md` in the same PR, with attribution files listed for the record even though nothing ships.
    - A fixture matrix runs the same inputs through GridCraft and the TS authority, reporting per-function match/mismatch/divergence (exact-decimal semantics, date-only/UTC-instant inputs, error and cycle cases) with reproducible commands.
    - The report includes the GridCraft MCP tool inventory (tool names, inputs, outputs) and notes on driving it headlessly.
    - Volatile/random/time inputs and external references are characterized for agreement behavior, informing T03's definitions.
    - The report ends in an explicit recommendation: proceed toward a per-engine adoption ADR, or keep the TS authority with recorded evidence — either way the evidence is linked from this milestone.

- [ ] **M06-T02** — Workbook model evolution: command semantics, structure transforms, names, formatting, formula registry
  - Depends on: M02-GATE · Output: versioned workbook-model migration design and implementation behind the existing engine boundary.
  - Scope: evolve the current workbook model, command semantics, structure transforms, names, formatting and formula registry; migrate positional references to stable collaboration identities without changing displayed A1 behavior (v3 §6 M06).
  - Acceptance:
    - Migrated documents preserve displayed references and editing behavior; identity mapping is versioned and reversible at read time.
    - Structure transforms (insert/delete/move rows, columns, sheets) carry tested reference-transformation rules identical for server replay and client preview.
    - Names, formatting and formula registry entries survive round-trips with fixture coverage; no silent normalization.
    - No production consumer is switched in this task; the M02 save/sync model represents the migration state.

- [ ] **M06-T03** — Dependency graph: dirty propagation, cycle/error handling, bounded/cancellable recalculation
  - Depends on: M06-T02 · Output: dependency-graph implementation with recalculation policy and stress evidence.
  - Scope: dirty propagation, cycle/error handling, bounded/cancellable recalculation; define volatile functions, random/time inputs and external-reference behavior so server/native/web agree (v3 §6 M06).
  - Acceptance:
    - Cycle detection and error propagation have deterministic, fixture-tested semantics shared by all targets.
    - Recalculation is bounded and cancellable: a scheduled yield/cancel point exists, and cancellation leaves no half-propagated state.
    - Volatile/random/time inputs and external references are defined (M06-T01 evidence informs this); server/native/web results agree on the fixture set.
    - M00 profiling (fresh-evaluator scan behavior) informs the incremental boundary and is cited in the report.

- [ ] **M06-T04** — Calculation port decision and shared-core port with differential fixtures + verified server binding
  - Depends on: M06-T01, M06-T03 · Output: per-engine decision record update + ported calculation with differential fixture evidence.
  - Scope: port calculation modules to the shared core only with differential fixtures and a verified server binding; the per-engine decision record honors the kernel governance duplication status (single impl / governed temporary duplicate / accepted exception) (v3 §4, §6 M06).
  - Acceptance:
    - Differential fixtures cover the TS authority vs the ported implementation, including exact-decimal string/scaled-int crossings and degenerate/cycle stress fixtures from M00.
    - The server binding is verified (the authoritative path executes where the decision record says it does); no client-authorized financial results.
    - If GridCraft (or any ArtCraft engine) is selected beyond prototype evidence, a **per-engine adoption ADR** is approved first (ADR-0015 §1); otherwise the TS authority remains and the record says so.
    - Kernel governance duplication status is maintained and recorded (single implementation, governed temporary duplicate, or accepted exception with owner named).
    - Known unsupported formulas/features remain visible; no silent lossy import/export.

- [ ] **M06-T05** — One virtualized Flutter grid consuming engine viewport/layout output
  - Depends on: M06-T02, M06-T04 · Output: virtualized grid prototype consuming engine output, with workload evidence.
  - Scope: one virtualized Flutter grid consuming engine viewport/layout output; no widget per cell; no recalculation triggered by scrolling (v3 §6 M06).
  - Acceptance:
    - 50k/100k-row workload evidence per §7 bands, reported on the ratified device profile.
    - Scroll interactions trigger no recalculation and no per-cell widget creation; windowing/layout come from the engine.
    - Selection/edit affordances route through the shared component library (M02-T03) and command registries (M02-T06).
    - Remains a bounded prototype until the per-engine decision record authorizes production use (ADR-0013).

- [ ] **M06-T06** — Cell/structure operations: version checks, compensating undo, conflict review, compaction/checkpoints
  - Depends on: M06-T02, M06-T04 · Output: operation layer with versioning, undo and compaction evidence.
  - Scope: cell/structure operations with version checks, compensating undo, conflict review, workbook compaction/checkpoints (v3 §5.4 worksheet rows, §6 M06).
  - Acceptance:
    - Disjoint edits compose without loss; overlapping edits preserve conflict semantics for review (never last-write-wins silently).
    - Ordered structure operations carry tested reference transformations and compensating undo entries.
    - Compaction/checkpoints bound document history growth with recovery tests from a checkpoint.
    - Version checks reject stale writers with an explicit review path.

- [ ] **M06-T07** — IPC/BoQ integration through existing financial services
  - Depends on: M06-T04, M06-T06 · Output: BoQ/IPC integration through the existing domain services, with parity evidence.
  - Scope: integrate worksheet outputs with IPC/BoQ through existing financial services (v3 §5.1, §6 M02/M06).
  - Acceptance:
    - Authoritative financial arithmetic stays centralized in the existing services; the worksheet consumes/produces values as exact-decimal strings/scaled ints at the boundary.
    - No client-authorized postings: every posting path is an existing service call with its permission checks intact.
    - Change-feed integration and Flutter-parity path named in the task packet (standing constraint 3).
    - Round-trip evidence: worksheet → service → worksheet reflects identical values and provenance.

- [ ] **M06-T08** — XLSX compatibility: byte round-trip tests + independently checked representative files
  - Depends on: M06-T02, M06-T04 · Output: XLSX round-trip fixture suite and fidelity matrix.
  - Scope: preserve XLSX compatibility through byte round-trip tests and independently checked representative files (v3 §6 M06); import/export fidelity matrix recorded.
  - Acceptance:
    - Byte round-trip tests over M00 fixtures + representative real-world files pass without loss of covered features.
    - The fidelity matrix records known Excel gaps as tracked work — never declared solved by the port (v3 §6 M06).
    - If GridCraft import/export is used, it runs behind the same fixture suite at the pinned version; failures block adoption, not visibility.
    - Formula/formatting/date fidelity verified against independently produced expected files.

- [ ] **M06-T09** — Concurrent edit + structure test evidence
  - Depends on: M06-T06, M06-T07 · Output: concurrency/structure test evidence using real sync plumbing.
  - Scope: concurrent edit and structure-operation evidence under the M03 sync engine (v3 §5.4).
  - Acceptance:
    - Two-writer and three-writer scenarios with disjoint, overlapping, and structural edits produce compose/conflict outcomes exactly as specified in M06-T06.
    - Legacy snapshot saves are denied writes to migrated document types or forced into version checks; no blind full-workbook replacement.
    - Evidence uses real SQLite + disposable PostgreSQL paths (M03); mocks may supplement but never substitute.
    - Recovery from interrupted structure operations is demonstrated (checkpoint replay, no corruption).

- [ ] **M06-T10** — Redundant production evaluator retirement (consumer-switch complete)
  - Depends on: M06-T04…T09, M06-GATE preparation sweep · Output: consumer-sweep record + retirement change.
  - Scope: retire redundant production evaluators only after all consumers switch (v3 §2 instruction 10).
  - Acceptance:
    - A consumer sweep documents every production caller of the retired evaluator with its replacement path.
    - Retirement is gated on all consumers switched; the sweep and switch evidence is linked.
    - Rollback path recorded (restore is a revert, not a rewrite).

- [ ] **M06-T11** — 👤 GATE — M06 exit evidence
  - Depends on: M06-T01…T10 · Output: `[M06-GATE]` evidence packet and owner decision.
  - Acceptance:
    - Parity + workload evidence aggregated: feature matrix, native/web/server calculation parity, concurrent edit/structure tests, 50k/100k-row workload per §7.
    - M08 inputs (BoQ linking contract) confirmed and linked (M08 refinement dependency).
    - Per-engine adoption ADR status recorded (adopted with ADR reference, or TS authority retained with evidence).
    - Owner approval recorded under protocol R8 before merge.

## Refinement contract

This milestone is refined to task level under protocol R9. M06-T01 (GridCraft prototype) satisfies ADR-0015's requirement that refinement add an ArtCraft prototype task driving the tool via CLI/MCP over M00 fixtures against the authoritative engine, producing a report in `docs/reports/`. The former `M02-W08` reference in this contract was a typo for `M02-T08` (the M02 gate); the obligation — refine before that gate merges — is satisfied by this PR.
