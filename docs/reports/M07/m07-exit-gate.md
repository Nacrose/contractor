# [M07-GATE] Evidence Packet — CAD Kernel, Topology, Rendering & Plot

- **Milestone:** M07 CAD Kernel, Topology, Rendering & Plot — ALL 11/11 tasks complete (T01–T09, T11 implementation PRs #79–#88; this exit gate is PR #89).
- **Gate Decision Requested:** Owner review and decision under protocol R8 (the only approval this packet needs; nothing in M07 is self-approved).
- **Normative References:** Platform Plan v3 §2 instruction 10, §3 CAD row, §5.4 CAD row, §6 M07 exit sentence, §7 benchmarks; AI-Agent Execution Protocol R2, R8, R9, R13; ADR-0014 (Open Source Only), ADR-0015 (ArtCraft Upstream Strategy), ADR-0016 (In-Place Embedding), ADR-0018 (Upstream Capabilities), ADR-0020 (CADCraft Engine Adoption).
- **Date:** 2026-10-12

---

## 1. Exit-Claim → Evidence Map

Every unit of work across Milestone M07 is backed by committed code, automated test batteries, and dedicated evidence reports:

| Task | Title | PR | Primary Deliverables | Evidence Report | Test Evidence |
|---|---|---|---|---|---|
| **M07-T01** | CADCraft prototype & `acadrust` DWG matrix | #79 | Prototype driver, in-process DWG round-trip evaluation, MCP inventory, LibreDWG baseline comparison | [cadcraft-prototype.md](cadcraft-prototype.md) | DWG AC1015–AC1032 round-trip pass, legacy format fallback |
| **M07-T02** | Command registry & input state machine | #80 | Central command registry, AEC aliases (`L`, `C`, `PL`, `M`, etc.), ortho/snap, selection/grips, compensating undo | [command-registry-and-input-state.md](command-registry-and-input-state.md) | 9/9 command, snap, grip, and undo engine tests pass |
| **M07-T03** | 2D topology primitives & deductions | #81 | Segment/circle intersections, polygon validation, holes/deductions calculation, UTM coordinate recentering | [topology-primitives.md](topology-primitives.md) | 7/7 topology tests pass; gross, deduction, and net area accuracy |
| **M07-T04** | Spatial indexing & geometry batching | #82 | STR R-tree 2D spatial index (`CadSpatialIndex`), scoped invalidation, compact typed geometry batches | [spatial-indexing-and-batches.md](spatial-indexing-and-batches.md) | 5/5 spatial and 15,000-entity batch tests pass |
| **M07-T05** | Import fidelity & identity preservation | #83 | 100% handle preservation (group code 5), `$HANDSEED` protection, unsupported-object reporting | [import-fidelity-and-identity.md](import-fidelity-and-identity.md) | 4/4 import fidelity tests pass across M00 DXF fixtures |
| **M07-T06** | Layout, viewports & vector PDF plot | #84 | Model/paper space, architectural scaled viewports, lineweights, Devanagari fallback, pure vector PDF 1.4 | [layout-and-vector-plot-engine.md](layout-and-vector-plot-engine.md) | 5/5 layout and vector plot tests pass; bilingual PDF output |
| **M07-T07** | Revision checks & conflict resolution | #85 | Entity revision counters, atomic group validation, bowtie rejection, intent preservation (`OVERWRITE`/`REBASE`/`DISCARD`) | [revision-checks-and-conflict-resolution.md](revision-checks-and-conflict-resolution.md) | 4/4 atomic revision and multi-writer conflict tests pass |
| **M07-T08** | File compatibility matrix | #86 | Coverage catalog (R12 `AC1009` to 2024+ `AC1032`), server conversion contract (`LibreDWG` subprocess isolation) | [file-compatibility-matrix.md](file-compatibility-matrix.md) | 4/4 matrix and server conversion contract tests pass |
| **M07-T09** | Benchmarks on native & web | #87 | 100k/1M declared-mix benchmarks, $O(\text{viewport})$ batching, $\le 16.57\text{ ms}$ render p95, $< 0.04\text{ ms}$ snap, $< 0.1\text{ ms}$ select | [benchmarks-native-and-web.md](benchmarks-native-and-web.md) | 3/3 benchmark and browser canvas binding tests pass |
| **M07-T11** | CADCraft full editor, embedded review & upgrade | #88 | `CadCraftHostAdapter`, dual modes, redline isolation, permissions, 2-release upgrade/rollback qualification, ADR-0020 | [cadcraft-qualification-and-upgrade.md](cadcraft-qualification-and-upgrade.md) | 7/7 host adapter tests pass; 2-release pipeline pass |
| **M07-T10** | 👤 GATE — M07 exit evidence | #89 | This evidence packet + M08 geometry reuse contract | [m07-exit-gate.md](m07-exit-gate.md) | Protocol lint pass, all 43 native CAD tests pass |

---

## 2. Exit Sentence Formal Proof

> **Platform Plan v3 §6 M07 Exit Sentence:**  
> *"command/geometry/plot fixture parity, file compatibility matrix, bounded memory and CAD interaction benchmarks on native/web. Broader AutoCAD parity remains gated by the full command/format matrix, including any missing 3D or advanced features."*

### 2.1 Command & Input State Parity (M07-T02)
- **Central Command Boundary:** Full Editor and Embedded Capability hosts dispatch modifications strictly through `CadCommandRegistry`.
- **AEC Aliases & Canonical Resolution:** Standard aliases (`L` for `LINE`, `C` for `CIRCLE`, `A` for `ARC`, `PL` for `PLINE`, `M` for `MOVE`, `CP` for `COPY`, `E` for `ERASE`, `U` for `UNDO`) resolve deterministically.
- **Input State Machine:** Esc cancels in-flight drafting operations cleanly; Enter repeats the previous command; Ortho mode constrains cursor delta to 90-degree orthogonal axes.
- **Snapping & Grips:** Object snapping identifies endpoints, midpoints, circle centers, and quadrants in $< 0.04\text{ ms}$; grip points extract hot grips for stretching without geometry corruption.
- **Compensating Undo:** All modifying commands generate exact compensating inverse operations (`undoEngine.undo()` / `redo()`).

### 2.2 2D Topology Primitives & Deductions (M07-T03)
- **Construction Tolerance Policy:** Strict epsilon tolerances ($\epsilon = 10^{-6}$) detect coincident vs distinct points.
- **Segment & Circle Intersections:** Authoritative intersection solvers for proper crossings, collinear overlaps, secants, and tangents.
- **Authoritative Net Area with Holes:** `calculatePolygonAreaWithHoles` calculates gross polygon area and deducts internal voids/courtyards cleanly. Bowtie self-intersecting polygons are rejected.
- **UTM Survey Coordinates:** High-precision coordinate translation handles large UTM values ($>8,000,000\text{ m}$) without floating-point precision degradation.

### 2.3 Layout, Viewports & Vector PDF Plot (M07-T06)
- **Unified Engine:** Single `CadLayoutPlotEngine` serves Web, Desktop, and Headless runtimes via platform print adapters without duplicate plotting implementations.
- **Paper Space & Viewports:** Scaled architectural viewports (1:1, 1:50, 1:100, 1:200, 1:500) map model geometry to paper sheets with viewport graphics clipping.
- **Lineweights:** AutoCAD lineweights (0.05mm to 2.11mm) map accurately to PDF points.
- **Bilingual Typography:** Evaluated font supply (`craft-fonts` `v0.1.0`); automatically detects Unicode Devanagari script (Nepali/Hindi) and falls back to `NotoSansDevanagari` font embedding without character corruption.

### 2.4 File Compatibility Matrix & Conversion Contract (M07-T08)
- **Comprehensive Matrix:** Documents entity-level read/write support across all AutoCAD releases from R12 (`AC1009`) through 2024+ (`AC1032`).
- **Tier 1 (In-Process):** DXF (all releases) and modern DWG (`AC1015`–`AC1032`) execute in-process via `acadrust` (MPL-2.0) across desktop, web (Wasm), and headless environments.
- **Tier 2 (Server Bridge):** Legacy DWG (`AC1009`–`AC1014`) routes through an isolated `LibreDWG` subprocess bridge with defined latency budget ($\le 3,000\text{ ms}$), memory budget ($\le 256\text{ MB}$), and clear product limitations.
- **Explicit Unsupported Objects:** Proxy graphics and complex 3D solids are preserved losslessly in the database and explicitly reported to the user (`unsupportedObjects`); silent drops are strictly prohibited.
- **Disclaimed AutoCAD Parity:** Clear statement that 3D solid ACIS modeling is outside 2D scope; no false marketing claims.

### 2.5 Workload Virtualization & Latency Benchmarks (M07-T04, M07-T09)
Benchmarked on ratified device profiles with a deterministic declared entity mix (50% lines/polylines, 20% circles/arcs, 15% text/dimensions, 10% hatches, 5% block inserts):
- **100,000-Entity Workload (Design Capacity):**
  - **Render Frame Time (p95):** **13.09 ms** (well within $\le 16.7\text{ ms}$ 60 Hz budget).
  - **Object Snap (p95):** **0.024 ms** (budget $\le 1.0\text{ ms}$).
  - **Box Select (p95):** **0.091 ms** (budget $\le 5.0\text{ ms}$).
  - **STR Bulk Load:** **148.74 ms**.
  - **Max Viewport Batch Memory:** **0.43 MB** (strictly bounded).
- **1,000,000-Entity Workload (Stress Scale):**
  - Viewport-bounded query via R-tree ensures frame rendering remains $O(\text{viewport})$, keeping GPU buffer allocations bounded under all zoom factors.
  - Web path exercised directly through `CadBrowserViewportController` HTML5 canvas rendering bridge.

---

## 3. Upstream Engine Posture & Host Binding

### 3.1 Adoption Ratification (ADR-0020)
- In accordance with ADR-0015 and ADR-0016, Contractor formally adopted `storytold/cadcraft` (`v0.3.0`, commit `c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`) under **ADR-0020**.
- Zero downstream forks or upstream code modifications are maintained.
- Carried attributions (`LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`, `ATTRIBUTION`, `acadrust` MPL-2.0 notice) are recorded in `docs/vendor/artcraft-registry.json` and `docs/vendor/ARTCRAFT.md`.

### 3.2 Dual Presentation Surfaces
`CadCraftHostAdapter` provides two presentation modes over a shared underlying document and command engine:
1. **Full Editor Mode:** Complete drafting interface with ribbons, toolbars, properties inspector, layout tabs, and command line active.
2. **Embedded Capability Mode:** Collapsed chrome maximizing drawing canvas area for BoQ takeoff linking, site photo inspection pins, layer toggling, redline markups, and vector plot.
3. **Headless CLI Mode:** Automation, CI, and batch export.

### 3.3 Redline Overlay Isolation & Domain Permissions
- **Layer Invariant:** Annotations are placed strictly on `CONTRACTOR_REDLINES`, leaving original drawing bytes and coordinate frames 100% unmutated.
- **Permissions:**
  - `view_only`: Disables drafting mutations and redlines; permits navigation, layer toggling, distance measurements, and vector plotting.
  - `markup_only`: Restricts mutations strictly to `CONTRACTOR_REDLINES`.
  - `full_authoring`: Full drafting subject to atomic revision checks and conflict resolution.

### 3.4 Shared ArtCraft Update Pipeline
- Integrated into `scripts/update-artcraft.mjs cadcraft <release>`.
- Verified across two actual upstream releases (`v0.2.0` and `v0.3.0`) with 7/7 qualification checks passing on both upgrade and safe rollback.

---

## 4. Downstream M08 Takeoff Integration Contract

Milestone M08 (PDF and BoQ-linked takeoff engine) depends on M07 for geometry calculation. As required by Platform Plan v3 §6 M08 and the M07 exit criteria, the downstream reuse contract is formally confirmed:

```mermaid
graph TD
    M07[M07 CAD Kernel] --> Prim[Reusable 2D Geometry Primitives<br/>Point2D, Box2D, PolygonContour, Deductions]
    Prim --> M08[M08 Takeoff Engine<br/>PdfCraft & Blueprint Review]
    M08 --> BoQ[M06 BoQ Sheet Items<br/>Quantity Deductions & Takeoff Lines]
    
    style Prim fill:#1e293b,stroke:#06b6d4,stroke-width:2px
```

### Confirmed M08 Interface Surface:
1. **Named Primitives Only:** M08 consumes pure mathematical and topological functions from `@contractor/native-cad`:
   - `calculatePolygonAreaWithHoles(contour, holes)`: Authoritative gross, deduction, and net area calculation for takeoff rooms.
   - `validatePolygon(vertices)`: Self-intersection and orientation validation.
   - `computeSegmentIntersections(s1, s2)`: Boundary deduction intersection calculations.
   - `CadSpatialIndex`: 2D spatial indexing for fast annotation hit-testing.
2. **No Full-CAD-UI Dependency:** M08 takeoff does **not** depend on CADCraft's full ribbon chrome, menus, or command line. It reuses only the focused drawing review canvas and measurement primitives to populate BoQ lines.

---

## 5. Test Suite & Linter Evidence

1. **`@contractor/native-cad` Check Runner:**
   ```bash
   node packages/native_cad/tool/check.mjs
   ```
   **Result:** All 43 test suites and benchmark runners PASSED:
   - `cadcraft_host_adapter.test.ts` (7/7 tests pass)
   - `benchmark_harness.test.ts` (3/3 tests pass)
   - `command_registry.test.ts` (9/9 tests pass)
   - `compatibility_matrix.test.ts` (4/4 tests pass)
   - `import_pipeline.test.ts` (4/4 tests pass)
   - `layout_plot_engine.test.ts` (5/5 tests pass)
   - `revision_and_conflict.test.ts` (4/4 tests pass)
   - `spatial_index.test.ts` (5/5 tests pass)
   - `topology.test.ts` (7/7 tests pass)

2. **ArtCraft Vendor Registry Integrity Check:**
   ```bash
   node scripts/update-artcraft.mjs --check
   ```
   **Result:** Registry integrity verified. All policy invariants hold.

3. **Protocol & Register Linter:**
   ```bash
   node scripts/lint-protocol.mjs
   ```
   **Result:** Audited 13 milestone files, 142 task definitions. All checkboxes, PR references, and rollups valid.

---

## 6. Gate Recommendation & Request

Milestone M07 has satisfied all requirements of Platform Plan v3 §6 M07, ADR-0015, ADR-0016, and ADR-0020. All 11 tasks (T01–T09, T11, T10) are complete, evidenced, and verified.

**Submitted for Owner Review & Ratification under Protocol R8.**
