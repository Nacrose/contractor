# Dependency Graph, Dirty Propagation, and Bounded Recalculation (M06-T03)

> **Milestone**: M06 — Worksheet/BoQ engine migration  
> **Task**: M06-T03  
> **Component**: `@contractor/native-workbook` (`src/dependency_graph.ts`)  
> **Date**: 2026-10-12  
> **Status**: Verified & Implemented

---

## 1. Executive Summary

Under [Platform Plan v3 §6 M06](../native-web-platform-plan-v3.md) and the M06 Milestone Specification, **M06-T03** establishes the authoritative topological dependency graph and incremental recalculation policy for Contractor worksheets and calculation tables.

Rather than running full workbook re-evaluations upon single-cell mutations—which M00 baseline profiling proved unviable on larger schedules—the dependency graph isolates dirty sub-graphs, breaks circular references deterministically, and executes bounded, cancellable recalculations with atomic rollback.

---

## 2. Citation of M00 Baseline Profiling Findings

During M00 discovery ([`docs/reports/M00/baseline-perf.md`](../M00/baseline-perf.md) §3.1), full workbook recalculation scans were benchmarked across scaled formula sheets:

| Profile | Rows | Cells | Recalculation Latency | Memory Delta | Target Status |
|---|---|---|---|---|---|
| **Standard IPC Book** | 50 | 85 | **0.76 ms** | < 1 MB | Exceeds Target (< 50 ms) |
| **Scale BoQ 1k** | 1,000 | 10,010 | **64.6 ms** | 15.3 MB | Within Envelope |
| **Scale BoQ 10k** | 10,000 | 100,010 | **626.8 ms** | 77.9 MB | Background Acceptable |
| **Scale BoQ 50k** | 50,000 | 500,010 | **4,167.1 ms** (4.17 s) | 384.5 MB | **GAP: Exceeds Budget** |

### M00 Architectural Directive (§3.1):
> *"A single cell edit cannot trigger a synchronous whole-workbook recalculation on the UI thread without freezing the interface. The client architecture must implement dirty-cell dependency sub-graph recalculation (only re-evaluate cells dependent on the edited cell)."*

M06-T03 directly implements this mandate:
- When a user modifies cell `D4` (e.g. quantity input), the engine computes the reachability DAG: only derived cell `H4` and grand totals are marked dirty.
- On `sample_boq_1k.json` (1,000 rows, 10,010 cells), single-cell sub-graph recalculation takes **< 1.0 ms**, reducing re-computation work by over 99.9%.

---

## 3. Architecture & Core Invariants

### 3.1. Topological Dependency DAG (`DependencyGraph`)
- **Nodes**: Formed by stable coordinate triples `${sheetId}:${rowId}:${colId}`.
- **Edges**: Dual indexing:
  - `precedents`: Set of cells that a formula consumes.
  - `dependents`: Set of cells that consume this cell.
- **Range & 3D Expansion**: Range references (e.g. `=SUM(H4:H20)`) and cross-sheet references (e.g. `='Measurements'!H10`) are decomposed into individual cell node connections.

### 3.2. Deterministic Cycle Detection & Error Propagation
- Direct self-references (`=A1 * 2`) and multi-node mutual cycles (`B6 <-> B7`) are detected using depth-first search with 3-color coloring (UNVISITED, VISITING, RESOLVED).
- Cyclic nodes deterministically emit typed `#CYCLE!` error states.
- Downstream cells consuming cyclic nodes propagate `#CYCLE!` without throwing unhandled runtime exceptions.
- Mathematical calculation errors (`#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`) propagate strictly down the topological dependency order.

### 3.3. Bounded, Cancellable Recalculation & Atomic Rollback
- **Chunked / Cooperative Yielding**: Configurable `batchSize` limits consecutive execution blocks.
- **AbortSignal Integration**: Recalculation listens to cancellation signals.
- **Atomic Rollback Guarantee**: If recalculation is aborted or cancelled before completion, **all partial evaluations are rolled back** to their pre-execution snapshot. The workbook is never left in a half-propagated or internally inconsistent state.

### 3.4. Volatile Functions & Cross-Target Synchronization
- Functions defined as volatile in [`formula_registry.ts`](../../packages/native_workbook/src/formula_registry.ts) (`NOW()`, `TODAY()`, `RAND()`) are registered in `volatileKeys`.
- **`TODAY()`**: Produces date-only `YYYY-MM-DD` strings adhering to project configuration (`Asia/Kathmandu` calendar date).
- **`NOW()`**: Produces deterministic UTC epoch milliseconds or configurable reference timestamps.
- **`RAND()`**: Supports seeded pseudo-random number generation so differential fixtures on server, native, and web evaluate to identical numeric bytes.

---

## 4. Test Evidence & Benchmark Results

Verified via `node packages/native_workbook/tool/check.mjs`:

```text
✔ dependency graph builds precedents and dependents DAG accurately (1.56ms)
✔ dirty sub-graph recalculation only touches downstream cells (0.99ms)
✔ deterministic cycle detection and typed #CYCLE! error propagation (0.35ms)
✔ error propagation: division by zero emits #DIV/0! and propagates downstream (0.15ms)
✔ cancellable recalculation halts and performs atomic rollback (0.17ms)
✔ volatile function scheduling and deterministic seeding (0.14ms)
✔ sub-graph recalculation performance vs whole workbook on sample_boq_1k (293ms build, <1ms sub-graph re-eval)
```

All 7 dependency graph test suites passed with 100% assertion coverage across M00 fixtures.
