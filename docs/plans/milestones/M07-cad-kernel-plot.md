# M07 — CAD kernel, topology, rendering and plot

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M07, §3 CAD row. Dependencies: M02, M03 and the M01 file/compute gate. Shares the operation substrate with M06. Registered at **WP level** — refine before the M02 gate opens.
> Prior art: [cad-viewer evaluation](../reports/M07/prior-art-cad-viewer.md) · Dependency posture: [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md) — open-source-only, no paid components.

Exit (v3): command/geometry/plot fixture parity, file compatibility matrix, bounded memory and CAD interaction benchmarks on native/web. Broader AutoCAD parity remains gated by the full command/format matrix.

---

- [ ] **M07-W01** — Preserve central command registry and input state machines
  - Acceptance sketch: command line, aliases, numeric/relative input, cancel/repeat, selection, grips, snap, ortho, units, undo, layouts retained from `src/lib/cad/` (v3 §3, §6 M07); Flutter views send engine commands, never modify entities.

- [ ] **M07-W02** — Robust shared topology primitives
  - Acceptance sketch: segment/curve intersections, connectivity, split/join, offsets, polygon validity, holes, tolerance policy; large survey coordinates, near-coincident points, degeneracies covered by fixtures (v3 §6 M07).

- [ ] **M07-W03** — Spatial indexing, invalidation, bounded visible geometry batches
  - Acceptance sketch: renderer consumes compact batches; no per-entity bridge calls; benchmark text, hatches, blocks, dimensions, selection and snapping — not only simple lines (v3 §6 M07).

- [ ] **M07-W04** — Import fidelity and entity identity preservation
  - Acceptance sketch: entity IDs preserved across imports/edits where defined; unsupported objects explicit; DWG product limitation (from M01 spike outcome) ships documented (v3 §6 M07); no AutoCAD-parity claims from command labels.

- [ ] **M07-W05** — Model/paper space, viewports, scale, lineweights, fonts, vector PDF plot via one layout/plot engine
  - Acceptance sketch: one layout/plot engine + platform file/print adapters; plot fidelity fixtures (v3 §6 M07).

- [ ] **M07-W06** — Entity/group operation revision checks and conflict resolution
  - Acceptance sketch: topology-changing/group operations validate the whole affected set atomically; topology-breaking partial group acceptance blocked (v3 §5.4 CAD row, §6 M07).

- [ ] **M07-W07** — File compatibility matrix
  - Acceptance sketch: DXF/DWG coverage per M00 fixtures + M01 spike; conversion requirements explicit per platform.

- [ ] **M07-W08** — Benchmarks on native and web: bounded memory + CAD interaction latencies
  - Acceptance sketch: 100k/1m-entity fixtures per §7 with declared mixes; render/snap/select reported separately; web path exercised through the browser binding.

- [ ] **M07-W09** — 👤 GATE — M07 exit evidence
  - Acceptance sketch: command/geometry/plot parity evidence aggregated; M08 geometry-primitive reuse contract confirmed; owner approval per protocol R8.

## Refinement contract

Before `M02-W08` merges (M07's dependency path), refine to `M07-Tnn` tasks with testable acceptance criteria (protocol R9).
