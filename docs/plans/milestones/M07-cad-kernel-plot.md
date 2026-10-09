# M07 — CAD kernel, topology, rendering and plot

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M07, §3 CAD row. Dependencies: M02, M03 and the M01 file/compute gate. Shares the operation substrate with M06. This milestone is refined to task level under protocol R9 (refinement PR recorded in the register).
> Prior art: [cad-viewer evaluation](../reports/M07/prior-art-cad-viewer.md) · [ArtCraft family evaluation](../reports/prior-art-artcraft-family.md) · Dependency posture: [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md) — open-source-only, no paid components · Candidate engine: CADCraft (storytold) per [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md). M07-T01 is the required CADCraft prototype task (CLI/MCP over M00 fixtures; acadrust DWG round-trip vs LibreDWG subprocess); any adoption beyond the prototype requires a per-engine adoption ADR (ADR-0015 §1, §7).

Exit (v3): command/geometry/plot fixture parity, file compatibility matrix, bounded memory and CAD interaction benchmarks on native/web. Broader AutoCAD parity remains gated by the full command/format matrix.

---

- [ ] **M07-T01** — CADCraft prototype: CLI/MCP evidence over M00 fixtures; acadrust DWG round-trip vs LibreDWG subprocess
  - Depends on: M00-GATE (fixtures + baseline), M01 DWG spike outcome · Output: prototype report `docs/reports/M07/cadcraft-prototype.md` + fixture/driver artifacts under `prototype/`; no production code change.
  - Scope: drive CADCraft pinned to an upstream release tag (start: `v0.3.0`) via its CLI and headless MCP server over the M00 DXF/DWG fixtures; compare 2D drafting semantics against the authoritative TypeScript CAD modules (`src/lib/cad/` per ADR-0013/M01 authority map). Exercise the `acadrust` (MPL-2.0, crates.io) DWG bridge behind their `dwg` crate for read **and** write round-trips, and compare fidelity against the LibreDWG subprocess baseline recorded in the M01 spike. Disposable evidence work per the M01 prototype posture; starts before the M02/M03 dependencies complete so its evidence shapes T03/T05/T08 design decisions.
  - Acceptance:
    - The pin (exact tag/rev) is recorded in `docs/vendor/ARTCRAFT.md` in the same PR; `acadrust` version under CADCraft's manifest noted against crates.io latest.
    - DWG round-trip matrix over M00 fixtures: open → save → reopen entity/type/fidelity comparison for acadrust bridge vs LibreDWG subprocess (read-only), with reproducible commands and per-version results (AC1015–AC1032 as claimed upstream).
    - 2D drafting semantic comparison (lines/arcs/polylines/dimensions/hatches/blocks/layouts/plot) between CADCraft and the TS authority on the fixture set; divergences listed with severity.
    - The report includes the CADCraft MCP tool inventory (tool names, inputs, outputs) and notes on headless driving.
    - The report ends in an explicit recommendation: proceed toward a per-engine adoption ADR (replacing or complementing the LibreDWG fallback per ADR-0015 §7), or keep the recorded fallback — either way the evidence is linked from this milestone.

- [ ] **M07-T02** — Preserve central command registry and input state machines
  - Depends on: M02-GATE · Output: command registry and input state machines carried into the kernel boundary with contract tests.
  - Scope: command line, aliases, numeric/relative input, cancel/repeat, selection, grips, snap, ortho, units, undo, layouts retained from `src/lib/cad/` (v3 §3, §6 M07); Flutter views send engine commands, never modify entities.
  - Acceptance:
    - The command registry remains the single command authority; Flutter views dispatch commands and render results only.
    - Input state machines (numeric/relative input, cancel/repeat, ortho/snap/units) have fixture tests identical to existing behavior.
    - Selection/grip semantics preserved with interaction tests; undo semantics unchanged.
    - No production route cutover in this task.

- [ ] **M07-T03** — Robust shared topology primitives
  - Depends on: M07-T02 · Output: shared topology primitives with tolerance policy and degeneracy fixtures.
  - Scope: segment/curve intersections, connectivity, split/join, offsets, polygon validity, holes, tolerance policy; large survey coordinates, near-coincident points, degeneracies covered by fixtures (v3 §6 M07).
  - Acceptance:
    - Fixture set covers large survey coordinates, near-coincident points, tangent/parallel/degenerate cases with declared tolerance policy.
    - Polygon validity/holes semantics match the TS authority on the differential fixture set.
    - Primitives are shared substrate for M06/M08 consumers (no private duplicates in other milestones).
    - Kernel governance duplication status recorded per v3 §4.

- [ ] **M07-T04** — Spatial indexing, invalidation, bounded visible geometry batches
  - Depends on: M07-T03 · Output: spatial index + batched renderer feed with benchmark evidence.
  - Scope: spatial indexing and invalidation; bounded visible geometry batches for the renderer (v3 §6 M07); pattern reference: cad-viewer evaluation (R-tree, batching/instancing).
  - Acceptance:
    - Renderer consumes compact batches; no per-entity bridge calls; invalidation is scoped to changed regions.
    - Benchmarks cover text, hatches, blocks, dimensions, selection and snapping — not only simple lines (v3 §6 M07).
    - Memory bounded by viewport/zoom policy with evidence on the ratified device profile.

- [ ] **M07-T05** — Import fidelity and entity identity preservation
  - Depends on: M07-T01, M07-T03 · Output: import pipeline with identity preservation and explicit unsupported-object reporting.
  - Scope: preserve entity IDs across imports/edits where defined; import fidelity, unsupported objects and DWG conversion requirements explicit; DWG product limitation (from M01 spike outcome and M07-T01 evidence) ships documented (v3 §6 M07); no AutoCAD-parity claims from command labels.
  - Acceptance:
    - Entity IDs preserved across import/edit cycles where the format defines them; fixture-verified.
    - Unsupported objects are explicit in import reports and UI; no silent drops.
    - DWG capability statement reflects measured evidence (M01 spike + M07-T01 matrix); product limitation documented if any.
    - DXF-first path remains authoritative; DWG route per M07-T01 recommendation and ADR-0015 §7.

- [ ] **M07-T06** — Model/paper space, viewports, scale, lineweights, fonts, vector PDF plot via one layout/plot engine
  - Depends on: M07-T02, M07-T04 · Output: layout/plot engine with platform file/print adapters and plot fidelity fixtures.
  - Scope: model/paper space, viewports, scale, lineweights, fonts, vector PDF plot through one layout/plot engine + platform file/print adapters (v3 §6 M07); font supply evaluated via craft-fonts (ADR-0015 §1; Devanagari gap tracked).
  - Acceptance:
    - One layout/plot engine serves native and web through platform adapters; no per-platform plot reimplementations.
    - Plot fidelity fixtures cover lineweights, scales, viewports, fonts (SHX/TTF handling stated).
    - Vector PDF output verified against expected-output fixtures; raster fallback explicit where vector is unsupported.

- [ ] **M07-T07** — Entity/group operation revision checks and conflict resolution
  - Depends on: M07-T02, M07-T03 · Output: revision-check and conflict layer for entity/group operations.
  - Scope: entity/group operation revision checks and conflict resolution; topology-changing/group operations validate the whole affected set atomically (v3 §5.4 CAD row, §6 M07).
  - Acceptance:
    - Topology-breaking partial group acceptance is blocked with explicit review path.
    - Version checks reject stale writers; conflicts preserve intent for review (v3 §5.4).
    - Atomic validation of the whole affected set has fixture evidence including failure cases.

- [ ] **M07-T08** — File compatibility matrix
  - Depends on: M07-T05, M07-T06 · Output: DXF/DWG compatibility matrix + conversion requirements per platform.
  - Scope: DXF/DWG coverage per M00 fixtures + M01 spike + M07-T01 evidence; conversion requirements explicit per platform (v3 §6 M07).
  - Acceptance:
    - The matrix states per-version/per-entity coverage with fixture links; unsupported combinations explicit.
    - Any server-side conversion step names its trigger, cost and failure behavior.
    - No AutoCAD-parity claims beyond measured coverage.

- [ ] **M07-T09** — Benchmarks on native and web: bounded memory + CAD interaction latencies
  - Depends on: M07-T04, M07-T06, M07-T08 · Output: benchmark report on ratified device profiles.
  - Scope: 100k/1m-entity fixtures per §7 with declared mixes; render/snap/select reported separately; web path exercised through the browser binding (v3 §6 M07).
  - Acceptance:
    - Benchmarks run on the ratified minimum profiles with declared entity mixes; results reproducible from committed harness.
    - Render, snap, and select latencies reported separately; memory bounded with evidence.
    - Web path exercised through the browser binding, not native-only.

- [ ] **M07-T10** — 👤 GATE — M07 exit evidence
  - Depends on: M07-T01…T09 · Output: `[M07-GATE]` evidence packet and owner decision.
  - Acceptance:
    - Command/geometry/plot parity evidence aggregated; file compatibility matrix and benchmark evidence linked.
    - M08 geometry-primitive reuse contract confirmed (named primitives, no full-CAD-UI dependency).
    - Per-engine adoption ADR status recorded (CADCraft adopted with ADR reference, or LibreDWG/fallback retained with evidence per ADR-0015 §7).
    - Owner approval recorded under protocol R8 before merge.

## Refinement contract

This milestone is refined to task level under protocol R9. M07-T01 (CADCraft prototype) satisfies ADR-0015's requirement that refinement add an ArtCraft prototype task driving the tool via CLI/MCP over M00 fixtures (acadrust DWG round-trip vs the LibreDWG subprocess baseline), producing a report in `docs/reports/`. The former `M02-W08` reference in this contract was a typo for `M02-T08` (the M02 gate); the obligation — refine before that gate merges — is satisfied by this PR.
