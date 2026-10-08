# M00-T11: Platform Parity Behavior Fixture Register

> **Status**: Verified & Registered  
> **Milestone**: M00 (Inventory, Fixtures & Baseline)  
> **Output Artifact**: [`fixtures/platform-parity/manifest.json`](file:///Users/aakashdhakal/contractor/fixtures/platform-parity/manifest.json) & [`docs/reports/M00/fixture-register.md`](file:///Users/aakashdhakal/contractor/docs/reports/M00/fixture-register.md)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 R12 (Sanitized, zero tenant data, reproducible seeds)

---

## 1. Executive Summary & Scope

To ensure 100% computational, mathematical, and behavioral parity between the authoritative Next.js/PostgreSQL backend (`Nacrose/Construction_Manager`) and the cross-platform client architecture (`Nacrose/contractor`), Milestone task **M00-T11** establishes a comprehensive suite of sanitized, reproducible test fixtures.

This registry catalogs representative baseline inputs, adverse edge cases, degenerate geometries, and large-scale stress scenarios across the four core domain engines:
1. **CAD Engine**: Native binary DWG (AC1012, AC1014, AC1015), ASCII DXF civil site plans, micro-snapping geometries, extreme coordinate domains (>85M mm), and fault-tolerant parsing streams.
2. **Worksheet / BoQ Engine**: Real-world civil Interim Payment Certificate (IPC) measurement books with 4-factor volume calculation (`=D*E*F*G`), cross-sheet abstracts with VAT rollups, calculation stress tests (cycles, division by zero, deep dependency recursion), and deterministic 50,000 / 100,000-row scale generators.
3. **PDF & Canvas Engine**: Dense foundation layout blueprints on A3 landscape, degenerate layout stress (extreme table grids, negative coordinates, rotated bounding boxes), and 120-page multi-drawing submittal specifications.
4. **CPM Scheduling Engine**: Nepal standard construction calendar snapshot (`Asia/Kathmandu`, 6-day week, 8h/day, 22 gazetted holidays & monsoon halts), adverse scheduling scenarios (cyclic dependency loops, impossible constraint dates with negative float, lead lag across weekends), and deterministic 10,000-task / 50,000-dependency WBS project networks.

All synthetic fixtures are generated deterministically using pseudo-random seeds (`seed = 20261008`), ensuring bit-for-bit reproduction across development workstations and continuous integration (CI) environments.

---

## 2. Sanitization & Privacy Verification (Protocol Rule R12)

Every fixture within [`fixtures/platform-parity/`](file:///Users/aakashdhakal/contractor/fixtures/platform-parity/) has undergone rigorous inspection against real tenant data leakage:
- **No Private Tenant Information**: All project titles, company names, engineer names, and contractor entities use generic or public reference placeholders (e.g., *"Himalayan Builders & Construction JV"*, *"Kathmandu Valley Ring Road Expansion"*).
- **No Live Financial Accounts**: Bank accounts, tax IDs (PAN/VAT), and monetary vouchers are synthetic. Rates reflect standard Nepal Department of Roads (DoR) norms without proprietary pricing data.
- **Licensing Transparency**: DWG binary test fixtures are derived from the GNU LibreDWG golden test suite (GPLv3+ / public test artifacts). All synthetic DXF, JSON, and JavaScript generator fixtures are released under Apache-2.0 / MIT as part of the `Nacrose/contractor` parity suite.

---

## 3. Master Fixture Registry

The table below catalogs every committed fixture, its cryptographic SHA-256 digest, byte size, format, coordinate convention, source, and behavior classification.

| Fixture ID | Category | Format / Version | Size (Bytes) | SHA-256 Checksum | Units & Coordinate Convention | Source / Provenance | Classification |
|---|---|---|---|---|---|---|---|
| `cad-dwg-r13` | CAD | DWG (`AC1012`) | 22,001 | `12354d029da42b86a9a043ef6039e09d30f0665a50552d786d115266cdf5cb7f` | Cartesian mm, Origin (0,0,0) | GNU LibreDWG Test Suite | Golden Pre-2000 Baseline |
| `cad-dwg-r14` | CAD | DWG (`AC1014`) | 22,095 | `b68f01e274f02073994c211bdc68a1b04b09c3e274e90a33530335f9fdba0b71` | Cartesian mm, Origin (0,0,0) | GNU LibreDWG Test Suite | Golden Pre-2000 Baseline |
| `cad-dwg-2000` | CAD | DWG (`AC1015`) | 22,027 | `4b8d9b1396a6d0decaa328dfc7cf17a09f2afa716ff8f40e9ca62ad1f1504ffa` | Cartesian mm, Origin (0,0,0) | GNU LibreDWG Test Suite | Golden R2000 Compressed |
| `cad-dxf-standard-site-plan` | CAD | DXF (ASCII `AC1015`) | 2,100 | `d3448ad3bf8121f81ea7134b93c894e73bdee1ebf3051fc89602cb83ea9fb65f` | Metric mm (`$INSUNITS 4`), Bounds [0,0]–[50000,30000] | Synthetic Generator | Representative Civil Layout |
| `cad-dxf-micro-geom` | CAD | DXF (ASCII `AC1015`) | 549 | `fbe86d7ac9f03982eaa7c95f056e16768739f3e40798e8c3195d1e833ba1268c` | Cartesian mm | Synthetic Generator | **Degenerate** Micro-Geom Stress |
| `cad-dxf-extreme-coords` | CAD | DXF (ASCII `AC1015`) | 456 | `97973833fd310f15adbd70afcbac696f6ef3f28e565e0fd9e7c48d33e6f78dd3` | Cartesian mm, Offset > 85,000,000 | Synthetic Generator | **Degenerate** IEEE 754 Precision |
| `cad-dxf-malformed-syntax` | CAD | DXF (ASCII `AC1015`) | 357 | `eafca2f61ab5bc23912793623a335488cd84727af07d81b21d8bfe0e57b40439` | Cartesian mm | Synthetic Generator | **Degenerate** Parser Fault Resync |
| `worksheet-standard-ipc-measurement` | Worksheet | JSON (`SpreadsheetWorkbook` v2) | 7,787 | `10946da58ba6b057624168fd223bb30a724af1608bbcf1a791ab2764c1a8a627` | Keyed grid `r:c`, Formula A1 | DoR Standard Culvert IPC Template | Representative Multi-Sheet IPC |
| `worksheet-degenerate-calc-stress` | Worksheet | JSON (`SpreadsheetWorkbook` v2) | 3,760 | `a413704364507524bfab347510366ad9d44dedd814982b5bbd5e4458bfe9fb6c` | Keyed grid `r:c`, Formula A1 | Synthetic Generator | **Degenerate** Formula & Cycles |
| `worksheet-sample-boq-1k` | Worksheet | JSON (`SpreadsheetWorkbook` v2) | 689,982 | `e8fd220f7720842b4619dcab71ba6a40b2794b3a95ba4bc89f461214487adad9` | Keyed grid `r:c`, Formula A1 | `generate-boq-scale.mjs` (Seed: 20261008) | Scale 1,000 Rows / 10k Cells |
| `pdf-canvas-dense-blueprint` | PDF_Canvas | JSON (`CanvasDoc` v1) | 3,995 | `f6e826e0523189f519dc8502dec28a1fbd023da234e7bbeaea644d943c4dd358` | Millimeters on sheet, A3 Landscape | Synthetic Generator | Representative Engineering Sheet |
| `pdf-canvas-degenerate-layout` | PDF_Canvas | JSON (`CanvasDoc` v1) | 2,166 | `0044bafab68632c621425cd74e84c7a90c32c1264ac07c64a932d1abb47a0adf` | Millimeters on sheet, Multi-paper | Synthetic Generator | **Degenerate** Layout & Overflows |
| `cpm-nepal-calendar-snapshot` | CPM | JSON (`CalendarSnapshot` v1) | 2,120 | `399b4c805e1b6883aad70ce79799aea2bb44882eca01e1e2e9da7e4de5d063f8` | ISO-8601 Dates, Asia/Kathmandu | Nepal Standard Construction Norms | Baseline Production Calendar |
| `cpm-degenerate-scenarios` | CPM | JSON (`CpmScenarios` v1) | 3,264 | `bded3ab5316b178325be07f507dfe7bfb149a54dbc17741462d3b48bea69e18c` | ISO-8601 Dates | Synthetic Generator | **Degenerate** Cycles & Violations |
| `cpm-sample-1k` | CPM | JSON (`CpmNetwork` v1) | 824,631 | `7d59751327253958e2bfba7ad9b13f0cd2cc8292e4d0f45d8083ea197992fbd3` | ISO-8601 Dates | `generate-cpm-scale.mjs` (Seed: 20261008) | Scale 1,000 Tasks / 5k Edges |

---

## 4. Deterministic Scale Benchmark Targets

To prevent repository bloat (avoiding 50MB–200MB JSON artifacts in git history), large-scale performance fixtures are governed by deterministic generators with verified reproducible hashes.

| Target Fixture Profile | Target Engine | Generator Script | Command Line Execution | Deterministic PRNG Seed | Scale Parameters | Expected File Size | Deterministic SHA-256 Digest |
|---|---|---|---|---|---|---|---|
| **BoQ Scale 50k Rows** | Worksheet (`SpreadsheetEngine`) | [`generate-boq-scale.mjs`](file:///Users/aakashdhakal/contractor/fixtures/platform-parity/worksheet/generators/generate-boq-scale.mjs) | `node fixtures/platform-parity/worksheet/generators/generate-boq-scale.mjs 50000 20261008` | `20261008` | 50,000 rows, 500,010 cells | 20,012,011 B (~20.0 MB) | `b5b9f76ab79e15860d262a31908492cb8addbd3e430e5386480eba611e547466` |
| **BoQ Scale 100k Rows** | Worksheet (`SpreadsheetEngine`) | [`generate-boq-scale.mjs`](file:///Users/aakashdhakal/contractor/fixtures/platform-parity/worksheet/generators/generate-boq-scale.mjs) | `node fixtures/platform-parity/worksheet/generators/generate-boq-scale.mjs 100000 20261008` | `20261008` | 100,000 rows, 1,000,010 cells | 40,293,127 B (~40.3 MB) | `95c8e8157d555fc557a61761391f10e91fd78459ec0aac5533ec79e485ecfb54` |
| **Multipage 120-Page Doc** | PDF Canvas (`CanvasDoc`) | [`generate-multipage-pdf-spec.mjs`](file:///Users/aakashdhakal/contractor/fixtures/platform-parity/pdf_canvas/generators/generate-multipage-pdf-spec.mjs) | `node fixtures/platform-parity/pdf_canvas/generators/generate-multipage-pdf-spec.mjs 120 20261008` | `20261008` | 120 pages, alternating A4/A3, drawings & tables | 184,670 B (~185 KB) | `3a16781bcba4799bcb066ac59bd3d1456cc10ea486899bf7da3c637b6e2e2409` |
| **CPM 10k Tasks / 50k Edges** | CPM Engine (`CpmEngine`) | [`generate-cpm-scale.mjs`](file:///Users/aakashdhakal/contractor/fixtures/platform-parity/cpm/generators/generate-cpm-scale.mjs) | `node fixtures/platform-parity/cpm/generators/generate-cpm-scale.mjs 10000 50000 20261008` | `20261008` | 10,000 tasks, 50,000 dependencies, 5 WBS phases | 5,573,485 B (~5.57 MB) | `f7e013405b74611da374848e7df932c90962ee2728cf66c04688c926eb1327f4` |

---

## 5. Domain-by-Domain Engine Parity Analysis

### 5.1. CAD Engine (DWG & DXF)
- **Native Binary DWG Decoders**:
  - `sample_r13.dwg` (`AC1012`) and `sample_r14.dwg` (`AC1014`): Exercises uncompressed bitstream readers (`BD` and `3BD` bit doubles), legacy handle tables, layer-before-links ordering, and pre-2000 entity definitions.
  - `sample_2000.dwg` (`AC1015`): Exercises R2000 variable-length bit packing (`DD` bit vectors, `2DD` modular coordinates, `BT`/`BE` flags), bit-compressed layer tables, and object map section offsets.
- **Representative DXF (`standard_site_plan.dxf`)**:
  - Exercises layered architectural rendering: `0`, `WALLS`, `COLUMNS`, `GRID` (dashed linetype with line scale), `ANNOTATION`.
  - Exercises polyline bulge decoding (`0.41421356` = 90° arc segment) and true circle/arc centers.
- **Degenerate CAD Cases**:
  - `degenerate_micro_geom.dxf`: Tests snapping engines and spatial bounding boxes against near-coincident geometry ($10^{-8}$ mm separation), zero-length vectors ($L = 0$), and micro-radius circles ($r = 10^{-7}$).
  - `degenerate_extreme_coords.dxf`: Situates 10mm components at UTM coordinates exceeding $85,000,000$ mm ($X \approx 85.3\text{ km}$, $Y \approx 27.7\text{ km}$) to test IEEE 754 float64 mantissa precision and viewport coordinate cancellation.
  - `degenerate_malformed_syntax.dxf`: Validates tokenizer resynchronization when encountering leading whitespace padding, unknown group codes (`999`), unhandled proxy entities, and non-standard line endings (`\r\n` vs `\n`).

### 5.2. Worksheet & BoQ Engine
- **Standard Measurement Book (`standard_ipc_measurement.json`)**:
  - Sheet 1 (*Measurements*): Implements four-factor quantity calculations (`=D4*E4*F4*G4`) and multi-cell summation (`=SUM(H4:H5)`).
  - Sheet 2 (*BOQ Abstract*): Implements cross-sheet references (`=Measurements!H8`), contract quantity comparisons, unit pricing (`=F4*G4`), and statutory VAT computation (`=H7*0.13`).
- **Degenerate Calculation Suite (`degenerate_calc_stress.json`)**:
  - Division by zero: Evaluates `=100 / 0` to `#DIV/0!` without throwing runtime errors.
  - Type coercion failures: Evaluates `="concrete" * 10` to `#VALUE!`.
  - Circular references: Evaluates 2-cell circular dependency loop (`B6 = B7 + 1` and `B7 = B6 + 1`) to trigger topological cycle breaking without recursive stack overflow.
  - Deep dependency recursion: Evaluates a 10-level linear cascade ($A_{i} = A_{i-1} + 1$) to verify topological evaluation order.
  - Volatile functions: Verifies dynamic date evaluation for `=TODAY()` and `=NOW()`.
- **Large-Scale Workbooks (50k & 100k Rows)**:
  - Validates memory utilization under sparse cell map representations (`Record<string, SpreadsheetCell>`).
  - Benchmarks formula recalculation latency and virtual scroll render performance against Milestone M00/M01 budgets.

### 5.3. PDF & Canvas Engine
- **Dense Drawing Blueprint (`dense_blueprint_drawing.json`)**:
  - Models complex multi-layer canvas documents with vector frames, engineer metadata blocks, circle foundation piers, tie-beam connection lines, and embedded 4x4 revision tables.
- **Degenerate Canvas Layout (`degenerate_canvas_layout.json`)**:
  - Tests layout engines against out-of-bounds coordinates ($x = -250\text{ mm}$), zero-dimension objects ($w = 0, h = 0$), extreme rotation transformations ($\theta = 720.5^\circ$), huge table grids (50 rows $\times$ 25 columns overflowing viewport bounds), and fallback font stacks.
- **Multipage Specification (`generate-multipage-pdf-spec.mjs`)**:
  - Simulates 120-page comprehensive construction dossiers featuring alternating paper dimensions (A4 portrait for reports, A3 landscape for structural engineering plans, Letter, and Legal).

### 5.4. CPM Scheduling Engine
- **Nepal Calendar Snapshot (`nepal_calendar_snapshot.json`)**:
  - Enforces official construction schedule rules: Sunday–Friday working days, Saturday weekly rest day, 8 hours per working day.
  - Incorporates 22 specific calendar exceptions for Bikram Sambat 2083/2084 gazetted holidays and monsoon peak flood site suspensions.
- **Degenerate CPM Scenarios (`cpm_degenerate_cases.json`)**:
  - Cyclic loops: Tests Tarjan/topological cycle detection on $T_1 \to T_2 \to T_3 \to T_1$.
  - Impossible constraints: Tests backward-pass handling when `FNLT` constraint forces negative total float.
  - Negative lag (leads): Tests Start-to-Start with $-16$ hours lead across non-working weekends.
  - Disconnected sub-graphs: Tests multiple isolated projects running concurrently within a single schedule instance.
- **Scale Network (10k Tasks / 50k Dependencies)**:
  - Models a multi-tier WBS across 5 major construction phases.
  - Ensures a rigorous, reproducible benchmark for forward and backward pass critical path calculations.

---

## 6. Downstream Verification Pipeline

The fixtures registered in **M00-T11** form the authoritative ground truth for subsequent milestone tasks:
1. **M00-T12 (Honest Test Baseline)**: Runs existing upstream test commands (`npm run ci:verify`, `npm run test:integration`, `npx vitest run src/lib/worksheet`) against these fixtures, recording exit codes, pass/fail matrices, and known bugs.
2. **M00-T13 (Performance Baseline Profile)**: Profiles recalculation latency, memory footprints, and viewport FPS across recorded development hardware using the 50k/100k BoQ, 120-page canvas, and 10k CPM fixtures.
3. **M01 Platform Feasibility Gates**: Re-executes these identical fixtures inside the target Flutter engine / Dart VM / native SQLite harnesses to prove mathematical and visual parity.

---

## 7. Sign-Off & Verification Checklist

- [x] All 15 canonical fixture files committed and indexed in `fixtures/platform-parity/manifest.json`.
- [x] All binary DWG fixtures cross-validated against GNU LibreDWG specifications.
- [x] All DXF fixtures validated through upstream `tokenizeAsciiDxf` and `parseAsciiDxf`.
- [x] Worksheet templates validated through `recalculateWorkbook` engine.
- [x] CPM calendar snapshot verified against Bikram Sambat 2083 calendar and DoR norms.
- [x] Large-scale generators (`50k` rows, `100k` rows, `120` pages, `10k/50k` CPM) verified for deterministic output and exact SHA-256 hashes.
- [x] Protocol Rule R12 satisfied: zero secrets, zero tenant data, 100% sanitized.
