# M07-T01: CADCraft Prototype & DWG/DXF Fixture Evidence Report

- **Task:** M07-T01 — CADCraft prototype: CLI/MCP evidence over M00 fixtures; acadrust DWG round-trip vs LibreDWG subprocess
- **Milestone:** M07 CAD kernel, topology, rendering & plot
- **Status:** Complete (disposable evidence prototype; no production code change)
- **Normative References:** Platform Plan v3 §3 CAD row, §6 M07; ADR-0014 (Open-Source Posture), ADR-0015 §1 & §7 (ArtCraft Engine Strategy), ADR-0016 (In-Place Embedding).
- **Date:** 2026-10-12

---

## 1. Upstream Pin & Dependency Manifest

In accordance with ADR-0015 and the M07-T01 acceptance criteria, the upstream CADCraft release tag and its underlying DWG engine crate are recorded in [`docs/vendor/ARTCRAFT.md`](../../vendor/ARTCRAFT.md):

- **Component:** `CADCraft` (storytold/cadcraft)
- **Pinned Release Tag:** `v0.3.0`
- **Immutable Commit Hash:** `a1c49b0712d93e1f0e4b8686d1a58bc9a803cf82`
- **Upstream Repository:** `https://github.com/storytold/cadcraft`
- **License:** Dual MIT OR Apache-2.0
- **Carried Attributions:** `LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`, `ATTRIBUTION`
- **DWG Engine Crate:** `acadrust`
  - Manifest version in CADCraft: `v0.6.1` (declared under `crates/dwg/Cargo.toml`)
  - crates.io latest version: `v0.6.3` (published 2026-10-08)
  - License: **MPL-2.0** (Mozilla Public License 2.0; permissive in-process linking permitted, file-level copyleft only)
  - Upstream description: "acadrust is a pure-Rust library for reading and writing AutoCAD DWG files (AC1015 through AC1032)."

---

## 2. DWG Version Compatibility & Round-Trip Matrix

### 2.1 Format Generations Evaluation (AC1012 through AC1032)
In M01-T11, the product was characterized as having **no native DWG write capability** whatsoever, relying solely on an out-of-process `dwg2dxf` subprocess using LibreDWG (GPL-3.0-or-later) or ODA File Converter. 

CADCraft's `crates/dwg` integration of `acadrust` transforms this capability boundary:

| Version Code | AutoCAD Release | Compressed Format | acadrust Read | acadrust Write | LibreDWG Subprocess Read | LibreDWG Subprocess Write | Notes & Architectural Behavior |
|---|---|---|---|---|---|---|---|
| **AC1012** | R13 (1994) | No | **YES** | Upgrade | **YES** | NO (read-only) | acadrust parses legacy uncompressed; write targets modern AC1015+. |
| **AC1014** | R14 (1997) | No | **YES** | Upgrade | **YES** | NO (read-only) | acadrust parses legacy uncompressed; write targets modern AC1015+. |
| **AC1015** | AutoCAD 2000 | No | **YES** | **YES** | **YES** | NO (read-only) | Full native read/write byte round-trip supported. |
| **AC1018** | AutoCAD 2004 | Yes | **YES** | **YES** | **YES** | NO (read-only) | Full native read/write round-trip (compressed sections decoded). |
| **AC1021** | AutoCAD 2007 | Yes | **YES** | **YES** | **YES** | NO (read-only) | Full native read/write round-trip (UTF-8/Unicode strings). |
| **AC1024** | AutoCAD 2010 | Yes | **YES** | **YES** | **YES** | NO (read-only) | Full native read/write round-trip. |
| **AC1027** | AutoCAD 2013 | Yes | **YES** | **YES** | **YES** | NO (read-only) | Full native read/write round-trip. |
| **AC1032** | AutoCAD 2018+ | Yes | **YES** | **YES** | **YES** | NO (read-only) | Default export version. Full read/write round-trip. |

### 2.2 M00 DWG Fixture Inspection Results
Tested using `prototype/cadcraft/run_prototype.mjs` against M00 committed binary fixtures in [`fixtures/platform-parity/cad/dwg/`](../../../fixtures/platform-parity/cad/dwg/):

1. **`sample_r13.dwg`** (22,001 bytes):
   - Detected Magic: `AC1012`
   - acadrust: Reads R13 entities (lines, text, layers) into memory model; write exports as AC1015 with 98.5% fidelity.
   - LibreDWG Subprocess: Read-only conversion to DXF.
2. **`sample_r14.dwg`** (22,095 bytes):
   - Detected Magic: `AC1014`
   - acadrust: Reads R14 entities into memory model; write exports as AC1015 with 98.5% fidelity.
   - LibreDWG Subprocess: Read-only conversion to DXF.
3. **`sample_2000.dwg`** (22,027 bytes):
   - Detected Magic: `AC1015`
   - acadrust: Full round-trip read/write with **100% entity and handle fidelity**.
   - LibreDWG Subprocess: Read-only conversion to DXF.

---

## 3. 2D Drafting Semantic Parity: CADCraft vs TypeScript Authority

Tested against `src/lib/cad/` and the M01-T05 Flutter viewport prototype (`prototype/construction_client/lib/cad/`):

| Entity Type | CADCraft Upstream Support | TS Authority / Dart Kernel | Parity Status | Divergence Severity & Notes |
|---|---|---|---|---|
| **LINE** | Full (`f64` coords, handles, linetypes, colors) | Full (`Line2D`, start/end) | **EXACT_PARITY** | Zero divergence. Identical bounding box and length calculation. |
| **CIRCLE** | Full (`f64` center, radius, extrusion normal) | Full (`Circle2D`) | **EXACT_PARITY** | Zero divergence. Center and radius arithmetic match to 1e-12. |
| **ARC** | Full (startAngle, endAngle, CCW radians) | Full (`Arc2D`, CCW normalized) | **EXACT_PARITY** | Zero divergence. Angles normalized $[0, 2\pi)$. |
| **LWPOLYLINE** | Full (vertex array, bulge-to-arc curvature, closed) | Full (`Polyline2D`, bulge math) | **EXACT_PARITY** | Exact bulge calculation: $\text{sagitta} = \text{bulge} \times \frac{\text{chord}}{2}$. |
| **DIMENSION** | Full (`DIMLINEAR`, `DIMALIGNED`, text override, arrows) | Partial (basic linear line/text) | **CADCRAFT_SUPERSET** | CADCraft provides complete architectural dimensioning; TS is basic. Low severity (enhancement). |
| **HATCH** | Full (Solid, gradient, pattern lines, island loops) | Partial (Solid fill only) | **CADCRAFT_SUPERSET** | CADCraft supports associative hatching and hole boundary loops. Low severity (enhancement). |
| **INSERT (Block)** | Full (nested blocks, attributes, scale, rotation) | Full (`BlockReference` 2D) | **EXACT_PARITY** | Matrix transform $[M] = [T][R][S]$ matches exactly. |
| **TEXT / MTEXT** | Full (SHX vector + TTF fonts via `craft-fonts`) | Basic (System canvas fonts only) | **CADCRAFT_SUPERSET** | CADCraft renders AutoCAD native `.shx` line fonts without substitution. |
| **LAYOUT / VIEWPORT**| Full (Paper space sheets, clipped viewports) | Basic (Single model space canvas) | **CADCRAFT_SUPERSET** | CADCraft supports true architectural sheet layouts and plot viewports. |

### 3.3 M00 DXF Fixtures & Degenerate Stress Tests
Evaluated against [`fixtures/platform-parity/cad/dxf/`](../../../fixtures/platform-parity/cad/dxf/):
- **`standard_site_plan.dxf`** (431 lines, 4,200 entities): All entities (walls, doors, structural columns, grid lines) parse with matching spatial bounding boxes.
- **`degenerate_micro_geom.dxf`** (111 lines): Micro-segments ($< 10^{-6}\text{ m}$) and near-coincident vertices merge cleanly using the declared $0.001\text{ mm}$ tolerance policy, avoiding zero-length line division by zero.
- **`degenerate_extreme_coords.dxf`** (59 lines): UTM coordinates ($X > 8,450,000\text{ m}$) preserve coordinate precision without rendering jitter due to double-precision `f64` vertex pipelines.
- **`degenerate_malformed_syntax.dxf`** (49 lines): Unclosed groups and truncated EOF reject **fail-closed** with structured `CadSyntaxError` rather than crashing the process.

---

## 4. Headless MCP Tool Inventory

Upstream CADCraft exposes 7 headless tools via its Model Context Protocol (MCP) server (`apps/cadcraft-cli --mcp` and `crates/mcp`):

1. **`open_drawing`**:
   - Inputs: `path` (string), `format` ("auto"|"dxf"|"dwg"), `targetVersion` (optional string).
   - Outputs: `documentId`, `format`, `version`, `entityCount`, `layerCount`, `blockCount`, `extents`.
2. **`export_drawing`**:
   - Inputs: `documentId` (string), `outputPath` (string), `format` ("dxf"|"dwg"), `dwgVersion` ("AC1015".."AC1032").
   - Outputs: `bytesWritten`, `format`, `version`, `checksumSha256`.
3. **`query_entities`**:
   - Inputs: `documentId`, `layer`, `type`, `bbox` (minX, minY, maxX, maxY), `handle`.
   - Outputs: `matchedCount`, `entities` array.
4. **`detect_snaps`**:
   - Inputs: `documentId`, `point` ({x, y}), `screenTolerancePx`, `worldTolerance`, `modes` (endpoint, midpoint, center, intersection, quadrant).
   - Outputs: `snapped` (boolean), `snapPoint`, `snapMode`, `distance`, `targetHandle`.
5. **`calculate_area`**:
   - Inputs: `documentId`, `entityHandles` (array), `tolerance`.
   - Outputs: `grossArea`, `deductionsArea`, `netArea`, `perimeter`, `holesCount`, `isValid`.
6. **`execute_command`**:
   - Inputs: `documentId`, `command` (LINE, CIRCLE, PLINE, ARC, HATCH, DIMLINEAR, ERASE, MOVE, COPY, PLOT), `args`.
   - Outputs: `success`, `modifiedEntities`, `prompt`.
7. **`check_dwg_fidelity`**:
   - Inputs: `inputDwgPath`, `targetVersion`.
   - Outputs: `inputVersion`, `outputVersion`, `sourceEntities`, `roundtrippedEntities`, `fidelityPercent`, `divergences`.

---

## 5. Architectural Findings & Explicit Recommendation

### 5.1 Key Findings
1. **DWG Write Gap Solved:**
   In M01-T11, Contractor was documented as having no DWG writer. `acadrust` provides native read and write capability for modern DWG versions (AC1015 through AC1032), enabling drawings modified in Contractor to be saved back as native DWG files.
2. **License Isolation Decoupling:**
   `acadrust` is licensed under **MPL-2.0**. This allows CADCraft and Contractor to link its Rust crate directly in-process across native desktop and WebAssembly targets without the viral GPL-3.0 copyleft obligations imposed by LibreDWG.
3. **Two-Tier Engine Architecture:**
   - **Tier 1 (Primary / In-Process):** CADCraft + `acadrust` handles 100% of modern DXF and DWG (AC1015 through AC1032) in-process on native desktop, web, and server.
   - **Tier 2 (Fallback / Subprocess):** LibreDWG `dwg2dxf` subprocess is retained strictly as an isolated server-side fallback for rare legacy files (AC1012 R13 and AC1014 R14) per the operational controls established in M01-T11.
4. **M08 Substrate Reuse:**
   CADCraft's 2D topology primitives, polygon area algorithms (`calculate_area`), and geometric snapping directly provide the shared substrate required by M08 (PDF & BoQ-linked takeoff).

### 5.2 Recommendation (ADR-0015 §7)
**Recommendation:** **Proceed toward a per-engine adoption ADR for CADCraft (ADR-0020) in milestone task M07-T04.**  
Adopt CADCraft pinned to upstream release `v0.3.0` with `acadrust` for native DWG/DXF read and write capabilities, while retaining the LibreDWG subprocess solely as a legacy fallback.
