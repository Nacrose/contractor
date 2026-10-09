# M00-T13: Performance Baseline Profile on Recorded Hardware

> **Status**: Measured & Recorded  
> **Milestone**: M00 (Inventory, Fixtures & Baseline)  
> **Output Artifacts**: [`docs/reports/M00/baseline-perf.md`](file:///Users/aakashdhakal/contractor/docs/reports/M00/baseline-perf.md) & [`docs/reports/M00/baseline-perf.json`](file:///Users/aakashdhakal/contractor/docs/reports/M00/baseline-perf.json)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 §6 M00 (Measured, not estimated; recorded on declared hardware; gaps vs §7 budgets documented for M00-T19 ratification)

---

## 1. Executive Summary

Milestone task **M00-T13** establishes empirical performance baselines for the four core computation engines of the platform:
1. **Worksheet & BoQ Recalculation Engine**: Evaluated on civil IPC measurement books, 1,000-row, 10,000-row, and 50,000-row formula workbooks (up to 500,010 populated cells).
2. **CAD & DWG Engine**: Evaluated on native binary DWG decoding (AC1012, AC1014, AC1015) and ASCII DXF parsing and SVG rendering.
3. **PDF & Canvas Takeoff Engine**: Evaluated on high-density blueprint element z-ordering and 120-page multi-drawing document compilation.
4. **CPM Scheduling Engine**: Evaluated on full-scale WBS project networks (1,000 tasks / 5,000 dependencies up to 10,000 tasks / 50,000 dependencies) using the official Nepal standard construction calendar (`Asia/Kathmandu`, 6-day week, 8h/day).

All measurements represent actual execution metrics gathered on declared local development hardware using the test fixtures established in **M00-T11**.

---

## 2. Test Execution Hardware & Environment

Measurements were conducted on the declared primary hardware platform:

| Parameter | Specification | Notes |
|---|---|---|
| **System Model** | Apple Silicon (Mac) | Hardware baseline environment |
| **Processor (CPU)** | Apple M1 (8 Cores: 4 Performance + 4 Efficiency) | Recorded baseline architecture |
| **Memory (RAM)** | 8 GB Unified Memory (LPDDR4X) | Standard minimum memory envelope |
| **Operating System** | macOS 15.x / Darwin Kernel 27.0.0 (ARM64) | POSIX / Unix host |
| **JavaScript Engine** | V8 (Node.js `v26.3.0`) | Upstream execution runtime |
| **Execution Toolchain** | TypeScript execution via `tsx` (Vitest engine layer) | Development mode |
| **Dataset Source** | Versioned fixtures in `fixtures/platform-parity/` | Seed: `20261008` |
| **Measurement Timestamp** | `2026-10-08T16:58:07Z` | Captured synchronously |

---

## 3. Measured Performance Results

### 3.1. Worksheet & BoQ Recalculation Engine
Worksheet recalculation was benchmarked using `recalculateWorkbook` across topological DAG formula trees with four-factor measurements (`=D*E*F*G`) and rate multipliers (`=H*I`):

| Dataset / Profile | Rows | Total Cells | Recalculation Time (ms) | Throughput (Cells/sec) | Memory Heap Delta (MB) | Status vs §7 Target |
|---|---|---|---|---|---|---|
| **Standard IPC Book** | 50 | 85 | **0.76 ms** | ~112,000 | < 1.0 MB | **Exceeds Target** (< 50 ms) |
| **Scale BoQ 1k** | 1,000 | 10,010 | **64.6 ms** | 154,970 | 15.3 MB | **Within Envelope** |
| **Scale BoQ 10k** | 10,000 | 100,010 | **626.8 ms** | 159,559 | 77.9 MB | **Background Acceptable** |
| **Scale BoQ 50k** | 50,000 | 500,010 | **4,167.1 ms** (4.17 s) | 119,989 | 384.5 MB | **GAP: Exceeds Budget** |

#### Analysis & Architectural Implication:
- Recalculation throughput remains consistent at ~120,000–160,000 cells/second in pure JavaScript.
- However, at 50,000 rows (500,010 cells), full workbook recalculation requires **4.17 seconds** and consumes **384.5 MB** of heap delta.
- **Critical Finding for M01/M06**: A single cell edit cannot trigger a synchronous whole-workbook recalculation on the UI thread without freezing the interface. The client architecture must:
  1. Implement dirty-cell dependency sub-graph recalculation (only re-evaluate cells dependent on the edited cell).
  2. Offload recalculation to background Web Workers (web) or native background isolates (mobile/desktop).
  3. Explore native/Wasm/Rust kernel bindings during M01 comparative prototyping.

---

### 3.2. CAD & DWG Engine
Evaluated on native binary DWG decoding (`readDwgDocument`) and ASCII DXF parsing / SVG rendering (`parseAsciiDxf` and `renderDxfToSvg`):

| Fixture File | Format / Version | Payload Size (Bytes) | Average Decode / Parse Time (ms) | Minimum Time (ms) | Maximum Time (ms) | Throughput & Notes |
|---|---|---|---|---|---|---|
| `sample_r13.dwg` | DWG (`AC1012`) | 22,001 | **0.212 ms** | 0.117 ms | 0.492 ms | Pre-2000 uncompressed BD/3BD |
| `sample_r14.dwg` | DWG (`AC1014`) | 22,095 | **0.097 ms** | 0.090 ms | 0.107 ms | Pre-2000 bitstream reader |
| `sample_2000.dwg` | DWG (`AC1015`) | 22,027 | **0.149 ms** | 0.087 ms | 0.480 ms | R2000 variable-length bit packing |
| `standard_site_plan.dxf` (Parse) | DXF ASCII | 2,100 | **0.141 ms** | 0.120 ms | 0.210 ms | Tokenization & entity extraction |
| `standard_site_plan.dxf` (SVG) | SVG Renderer | N/A | **0.238 ms** | 0.180 ms | 0.350 ms | Vector SVG generation |
| **Total DXF Pipeline** | DXF -> SVG | 2,100 | **0.379 ms** | 0.300 ms | 0.560 ms | Full end-to-end display pipeline |

#### Analysis:
- Binary DWG and DXF decoding are extremely fast (< 0.5 ms for baseline civil drawings).
- Even with 100x entity growth, initial load and parse will remain well within the 250 ms navigation budget.
- 60 Hz frame budget (16.7 ms) is easily maintained for standard vector drawing rendering.

---

### 3.3. PDF Canvas Engine
Evaluated on vector element z-ordering and multipage document specification compilation:

| Operation / Workload | Scope | Duration | Output Size / Memory | Status vs Target |
|---|---|---|---|---|
| **Z-Order Sort** (`elementsInZOrder`) | 11 Blueprint elements | **0.0024 ms** | Negligible | Sub-microsecond |
| **120-Page Doc Spec Generation** | 120 pages (A3/A4/Letter) | **0.49 ms** | 120 pages | Fast generative layout |
| **120-Page JSON Serialization** | Multi-sheet document bundle | **0.56 ms** | 184,670 Bytes (~180 KB) | Highly compact |

#### Analysis:
- Canvas document data model manipulation is lightweight and performant.
- Memory overhead for 120 pages of vector/tabular specifications is under 200 KB before rasterization.

---

### 3.4. CPM Scheduling Engine
Evaluated on topological critical path forward/backward pass calculations using `computeCpmSchedule` with full calendar snapshots:

| Network Scale | Tasks | Dependencies | Calculation Time (ms) | Throughput (Tasks/sec) | Heap Delta (MB) | Status vs §7 Budget |
|---|---|---|---|---|---|---|
| **CPM 1k** | 1,000 | 5,000 | **69.6 ms** | 14,364 | 19.7 MB | **Excellent** (< 100 ms) |
| **CPM 5k** | 5,000 | 25,000 | **324.4 ms** | 15,412 | 7.4 MB | **Acceptable Background** |
| **CPM 10k** | 10,000 | 50,000 | **677.1 ms** | 14,768 | 13.8 MB | **Within Envelope** (< 1.0 s) |

#### Analysis:
- Scheduling calculation scales linearly: $O(V + E)$ topological traversal completes 10,000 tasks and 50,000 dependencies in **677 ms**.
- Memory footprint is remarkably modest (~14 MB heap delta for 10k tasks).
- Calculation easily meets the requirement that heavy CPM calculations execute asynchronously without blocking interactive Gantt zooming/panning.

---

## 4. Gap Analysis vs. v3 §7 Initial Proposed Budgets

The table below maps the measured baselines against the initial proposed budgets defined in [Platform Plan v3 §7](file:///Users/aakashdhakal/contractor/docs/plans/native-web-platform-plan-v3.md#7-performance-acceptance-and-measurement):

| Workload Area | §7 Proposed Budget Target | Measured Baseline Result (Apple M1) | Gap Status | Recommendation for M00-T19 Ratification |
|---|---|---|---|---|
| **Ordinary Cell Edit** | p95 input response $\le 50\text{ ms}$; dependent calculation separate | **0.76 ms** (Standard IPC)<br>**64.6 ms** (1k rows)<br>**4,167 ms** (50k rows) | ⚠️ **GAP at 50k rows** | Cell editing MUST decouple input response from dependent recalculation. Dirty-graph recalculation required. Whole-sheet recalculation cannot block UI. |
| **BoQ Scale Capacity** | 50k and 100k rows, viewport scales with visible cells | **4.17 s** recalculation at 50k rows; 384 MB heap | ⚠️ **GAP in Memory & Latency** | Mandates row virtualization in UI (only render 30–50 visible rows). Evaluate native/Rust kernel prototype in M01 comparative evaluation. |
| **CAD Viewport Pipeline** | Decode & frame time $\le 16.7\text{ ms}$ (60 Hz) | **0.21 ms** (DWG decode)<br>**0.38 ms** (DXF to SVG) |  **MET** | Baseline vectors render far below 16.7 ms budget. High-entity stress testing (100k entities) to be evaluated in M01. |
| **PDF Multipage Processing** | Bounded decoding on 100+ page / 200 MB fixture | **0.5 ms** generation / serialization for 120 pages |  **MET** (Spec Level) | Document spec manipulation is bounded. PDF raster rendering will be benchmarked on Flutter canvas in M01. |
| **CPM 10k / 50k Network** | Calculation latency reported separately from interaction | **677.1 ms** (10k tasks / 50k dependencies) |  **MET** | 677 ms is well within the 1.0–2.0s background schedule computation budget. Dart VM port or isolate worker is fully viable. |

---

## 5. Input to Milestone Gate and M00-T19 Ratification

1. **Ratification of Worksheet Budget**:
   The initial budget for cell edits ($\le 50\text{ ms}$) is achievable only if the calculation engine operates on a **dirty dependency subgraph** rather than invoking `recalculateWorkbook` across 50,000 rows synchronously. Whole-workbook recalc must be classified as an asynchronous background job with visible calculation indicators.
2. **Kernel Comparative Prototype Selection (M01)**:
   The 4.17s latency at 50k rows validates the platform plan hypothesis: the Worksheet engine is the strongest candidate for comparative prototyping between Dart VM, Wasm, and Rust kernels.
3. **CPM Port Viability**:
   CPM computation at 677 ms indicates that a pure Dart or TypeScript isolate port will provide responsive scheduling performance without requiring specialized native C/Rust kernels.
