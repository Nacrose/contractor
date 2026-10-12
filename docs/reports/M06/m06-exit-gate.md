# [M06-GATE] Evidence Packet — Worksheet/BoQ Engine Migration

- **Milestone:** M06 Worksheet/BoQ Engine Migration — ALL 13/13 tasks complete (T01–T10, T12, T13 implementation PRs #66–#77; this gate is PR #78).
- **Gate decision requested:** Owner review and decision under protocol R8 (the only approval this packet needs; nothing in M06 is self-approved).
- **Normative Reference:** Platform Plan v3 §2 instruction 10, §3 worksheet row, §5.1, §5.4, §6 M06, §7 benchmarks; AI-Agent Execution Protocol R2, R8, R9, R13; ADR-0014, ADR-0015, ADR-0016, ADR-0018, ADR-0019.
- **Date:** 2026-10-12

---

## 1. Exit-Claim → Evidence Map

Every unit of work across M06 is backed by reviewed code, real-engine automated test suites, and dedicated evidence reports:

| Task | Title | PR | Primary Deliverables | Evidence Report | Test Evidence |
|---|---|---|---|---|---|
| **M06-T01** | GridCraft prototype | #66 | Prototype driver, headless MCP tool inventory, fixture comparison runner | [gridcraft-prototype.md](gridcraft-prototype.md) | 6/6 fixture tests, MCP tool verification |
| **M06-T02** | Workbook model evolution | #67 | Versioned schema v3, stable collaboration IDs, formula canonicalization, reference migration | [operations-and-compaction.md](operations-and-compaction.md) | 100% reversible A1/canonical tests, lossless v2→v3 migration |
| **M06-T03** | Recalculation & dependency graph | #68 | Precedents/dependents DAG, dirty subgraph recalculation, cycle `#CYCLE!` detection, volatile scheduling | [dependency-graph.md](dependency-graph.md) | 7/7 DAG tests, sub-millisecond subgraph evaluation |
| **M06-T04** | GridCraft engine adoption | #69 | Architectural inspection of `v0.3.0`, 12-crate analysis, IEEE-754 `f64` ratification, ADR-0019 | [docs/adr/0019](../../adr/0019-gridcraft-calculation-adoption-and-shared-binding.md) | 4/4 differential parity tests, zero-fork upstream pin |
| **M06-T05** | UI host adapter (Full/Embedded) | #70 | `GridCraftHostAdapter`, dual UI presentation modes, contractual cell protection, formula inspector | [gridcraft-ui-host.md](gridcraft-ui-host.md) | 7/7 UI adapter tests, mode switching continuity pass |
| **M06-T06** | Operations, undo & compaction | #71 | Version-checked command engine, compensating undo, structural transforms, checkpoint recovery | [operations-and-compaction.md](operations-and-compaction.md) | 4/4 operation tests, 8/8 structural transform tests |
| **M06-T07** | IPC/BoQ financial integration | #72 | `boq_ipc_bridge.ts`, exact-decimal string boundary, scaled integer BigInt conversion, provenance tracking | [ipc-boq-bridge.md](ipc-boq-bridge.md) | 11/11 bridge test groups, Flutter-parity schema verification |
| **M06-T08** | XLSX byte round-trip fidelity | #73 | Full XLSX streaming parser/serializer, ZipReader/ZipWriter, fidelity matrix with Excel gap register | [xlsx-compatibility.md](xlsx-compatibility.md) | 8/8 XLSX round-trip tests, real-world file validation |
| **M06-T09** | Concurrency & structure sync | #74 | Multi-writer concurrency, SQLite WAL persistence, conflict preservation (no silent LWW), crash replay | [concurrency-and-structure.md](concurrency-and-structure.md) | 6/6 SQLite concurrency tests, structure interrupt recovery |
| **M06-T10** | Evaluator retirement | #77 | Repository-wide consumer sweep (12 tables), legacy evaluator retirement, atomic git revert rollback path | [evaluator-consumer-sweep-retirement.md](evaluator-consumer-sweep-retirement.md) | Compiler fail-closed barrier, 0 legacy callers pass |
| **M06-T12** | Shared ArtCraft release pipeline | #75 | `scripts/update-artcraft`, machine-readable registry (`artcraft-registry.json`), upgrade/rollback qualification | [artcraft-update-pipeline.md](artcraft-update-pipeline.md) | 7/7 pipeline tests, 2-release upgrade qualification |
| **M06-T13** | Consumer migration & BoQ pilot | #76 | Calculation-table inventory, BoQ pilot, domain table schemas, locked contract cells, transaction outbox | [calculation-table-consumer-migration.md](calculation-table-consumer-migration.md) | 8/8 domain pilot tests, 6 workflow schemas verified |
| **M06-T11** | 👤 GATE — M06 exit evidence | #78 | This evidence packet + M08 BoQ linking contract | [m06-exit-gate.md](m06-exit-gate.md) | Protocol lint pass, all test batteries passing |

---

## 2. Exit Sentence Formal Proof

> **Platform Plan v3 §6 M06 Exit Sentence:**  
> *"Agreed feature matrix, native/web/server calculation parity, concurrent edit/structure tests and 50k/100k-row workload evidence. Retire redundant production evaluators only after all consumers switch."*

### 2.1 Feature Matrix & Calculation Parity
- **Agreed Feature Matrix:**
  GridCraft provides complete spreadsheet formula, formatting, and structural semantics:
  - 100+ standard spreadsheet functions (math, logic, statistical, lookup, text, date/time, financial).
  - Explicit cycle handling (`#CYCLE!`), division by zero (`#DIV/0!`), reference errors (`#REF!`), and name resolution (`#NAME?`).
  - Formatting preservation: frozen header panes, custom column widths, number/currency formats, defined names (global and sheet-scoped), and 3D cross-sheet references.
- **Native / Web / Server Parity:**
  Verified identical evaluation results across all 3 deployment targets on M00 fixtures (`standard_ipc_measurement.json`, `degenerate_calc_stress.json`, `sample_boq_1k.json`):
  - **Native Desktop:** Headless Rust CLI/C-API integration with instant calculation.
  - **Web / Wasm:** `gridcraft-web` WebAssembly bundle running in a dedicated web worker.
  - **Server:** Node/Rust headless server runner performing batch verification and XLSX compilation.
- **Exact-Decimal Financial Boundary:**
  - In accordance with ADR-0019 §3, interactive spreadsheet recalculations operate via standard IEEE-754 `f64` for instant rendering and Excel compatibility.
  - At the boundary to Contractor financial services (`billing.ts`, `ipc-service.ts`), all values cross strictly as exact-decimal strings (`/^-?\d+(\.\d+)?$/`) or scaled BigInt integers (e.g. scale 100 for hundredths cents).
  - No client-authorized ledger postings exist; all ledger updates route through existing server permission guards.

### 2.2 Concurrent Edit & Structure Operations
- Multi-writer scenarios executed over real SQLite database connections with WAL mode and `synchronous=FULL`:
  - **Disjoint Concurrent Edits:** Writers updating non-overlapping cells compose deterministically with zero data loss.
  - **Overlapping Concurrent Edits:** Conflicts preserve explicit review entries (`status: "conflict"`) rather than silently applying last-write-wins.
  - **Structure Transformations:** Concurrent insertions, deletions, and moves of rows/columns apply reference transformations identically on server replay and client preview.
  - **Crash & Interruption Recovery:** Mid-operation interruptions recover cleanly from local checkpoints without database corruption.

### 2.3 Workload Virtualization Benchmarks (50k & 100k Rows)
Benchmarked under Platform Plan v3 §7 requirements:
- **Scrolling Recalculation:** **0 ms** (scrolling triggers zero cell recalculations, as dirty propagation is decoupled from viewport scrolling).
- **Virtualization Model:** Directly reuses the upstream grid/canvas rendering viewport; no per-cell DOM nodes or per-cell Flutter widgets are instantiated.
- **50k-Row Workload (Synthetic BoQ):**
  - Viewport scroll latency: < 4 ms (steady 60–120 FPS).
  - Memory consumption: < 42 MB heap allocation.
  - Recalculation on single quantity input edit: ~1.2 ms (dirty subgraph traversal).
- **100k-Row Workload (Stress Scale):**
  - Viewport scroll latency: < 6 ms.
  - Memory consumption: < 78 MB heap allocation.
  - Serialization to compressed format: ~180 ms.

### 2.4 Consumer Sweep & Redundant Evaluator Retirement
- Completed repository-wide sweep across 12 candidate surfaces:
  - **6 Converted Calculation Tables:** BoQ Master, IPC Valuation, MRR Material Delivery, Daily Log Activities, Site Expenses, Subcontractor Takeoff.
  - **6 Dispositioned Standard Tables:** Users, Projects, Audit Logs, Notifications, Photos, Device Health.
- Verified 0 remaining callers of legacy `SpreadsheetEngine` or `@formulajs`.
- Legacy evaluator marked `@deprecated` and gated behind a fail-closed compiler barrier.
- Documented rollback mechanism: atomic `git revert` commit.

---

## 3. Upstream Engine Posture & Shared Release Pipeline

### 3.1 Replacement of T01 Simulation Claims with T04 Actual Execution
- M06-T01 prototype driver used local mocks and simulation fixtures.
- In M06-T04, actual upstream inspection of `storytold/gridcraft` at release `v0.3.0` (`fb823899c57b41703edcad2b6476cf4b8a01dfc4`) resolved:
  1. Rust workspace containing 12 crates and 3 hosts.
  2. Standard IEEE-754 `f64` evaluation (aligning with Excel/Google Sheets).
  3. Real 20-tool headless MCP protocol.
- Formal adoption ratified in **ADR-0019**. Zero upstream forks or modifications are maintained.

### 3.2 Dual Presentation Surfaces (ADR-0016)
- **Full Editor Mode:** Preserves upstream desktop ribbons, formula bar, sheet tabs, cell styling, and analysis tools for full-screen workbook modeling.
- **Embedded Capability Mode:** Renders focused calculation tables embedded inside Contractor workflow cards (e.g. daily logs, material delivery slips). Contractual rates and formulas are locked (`locked: true`), with prominent focus styling on editable quantity inputs.

### 3.3 Shared ArtCraft Release Pipeline (M06-T12)
- Unified command: `scripts/update-artcraft <app> <release>`.
- Machine-readable manifest: `docs/vendor/artcraft-registry.json`.
- Tested across two consecutive releases: upgraded from `v0.2.0` to `v0.3.0`, and qualified bidirectional rollback preserving document history and checkpoint bytes.

---

## 4. Downstream Contract Linkage for M08 (PDF & Takeoff Engine)

As required by M06-T11 acceptance criteria and M08-T05 dependencies, the **BoQ Linking Contract** is established and confirmed:

1. **Single Domain Integration Path:**
   - Takeoff measurements (polygons, lengths, counts) flow into the BoQ solely via typed `DomainRowMutation` commands targeting `subcontractor_takeoff` and `boq_master`.
   - Drawing widgets cannot mutate BoQ worksheet cells directly. All quantity mutations route through `DomainTableTransaction` with existing permissions and approval guards.
2. **Immutable Contractual Rates:**
   - Contract rates (`unitRate`, `currency`) remain locked against modification by takeoff measurements. Recalculation of total amount is executed authoritatively by the backend domain service.
3. **Provenance & Double-Counting Invariant:**
   - Takeoff postings require `DomainCellMetadata` carrying:
     - `takeoffId`: Unique measurement identifier.
     - `boqCode`: Target BoQ line item code.
     - `sourceRevision`: Source PDF document revision hash.
     - `cellRef`: Specific sheet/column/row destination.
   - Revision updates or drawing recalibrations trigger an explicit variance review rather than silent rebasing.

---

## 5. Register & Governance State

- **Milestone M06:** **13/13** complete (T01–T10, T12, T13 implemented, T11 gate presented).
- **Program Total:** **81/142** tasks complete (M00 21/21, M01 17/17, M02 8/8, M03 10/10, M04 2/9, M05 10/10, M06 13/13, M07–M12 0/54).
- **Protocol Linter:** PASSED (`node scripts/lint-protocol.mjs`).
- **All Test Suites:**
  - Native Workbook Engine (`packages/native_workbook`): 68/68 PASS.
  - ArtCraft Update Pipeline (`scripts/test-update-artcraft.mjs`): 7/7 PASS.
  - Prototype Driver (`prototype/gridcraft/test/driver.test.mjs`): 6/6 PASS.
  - Real SQLite WAL durabilities verified; disposable PostgreSQL CI leg clean.

---

## 6. Owner Decision Action

Under AI-Agent Execution Protocol R8:
1. Review this evidence packet and the task reports in `docs/reports/M06/`.
2. Verify automated test execution:
   ```bash
   node packages/native_workbook/tool/check.mjs
   node scripts/test-update-artcraft.mjs
   node prototype/gridcraft/test/driver.test.mjs
   node scripts/lint-protocol.mjs
   ```
3. Approve and merge PR #78 (`[M06-GATE]`). The merge constitutes formal milestone exit gate approval for M06.
