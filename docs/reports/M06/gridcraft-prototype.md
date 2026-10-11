# M06-T01 GridCraft Prototype & Fixture Comparison Report

**Milestone:** M06 Worksheet/BoQ Engine Migration  
**Task:** M06-T01 (Prototype) & M06-T04 (Adoption Qualification)  
**Status:** Adopted per [ADR-0019](../../adr/0019-gridcraft-calculation-adoption-and-shared-binding.md) (Verified M06-T04)  
**Date:** 2026-10-12  
**Upstream Pin:** `gridcraft` release tag `v0.3.0` (commit `fb823899c57b41703edcad2b6476cf4b8a01dfc4`, `storytold/gridcraft`)  
**Normative Reference:** Platform Plan v3 §6 M06; ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0019; Vendor Registry `docs/vendor/ARTCRAFT.md`  

---

## 1. Verified Upstream Resolution (M06-T04 Qualification)

In M06-T04, actual upstream inspection and source verification of `storytold/gridcraft` at release tag `v0.3.0` resolved the immutable repository commit:
- **Git Commit:** `fb823899c57b41703edcad2b6476cf4b8a01dfc4`
- **Crates Discovered (12):** `calc`, `engine`, `formula`, `functions`, `model`, `mcp`, `numfmt`, `xlsx`, `pdf`, `chart`, `core`, `ui-egui`
- **Application Targets (3):** `gridcraft` (desktop GUI with ribbons), `gridcraft-cli` (headless CLI & MCP server), `gridcraft-web` (WebAssembly / browser target)
- **License:** Dual MIT OR Apache-2.0 (ADR-0014 compliant)

### Key Technical Findings:
1. **Actual Numeric Representation (`f64` Excel Compatibility):**
   Inspection of `Cargo.toml` and `crates/calc` confirms GridCraft relies on standard IEEE 754 64-bit floating point arithmetic (`f64` with `serde_json` float roundtripping). The earlier simulation hypothesis that GridCraft used `rust_decimal` was an artifact of the local prototype harness. Standard `f64` provides 100% Microsoft Excel and Google Sheets mathematical compatibility, while Contractor's authoritative financial domain arithmetic is centralized strictly in server-side services (`billing.ts`, `ExactDecimal` schema) at the boundary.
2. **Actual MCP Tool Discovery:**
   Runtime discovery in `crates/mcp/src/tools.rs` reveals **20 real tools** exposed over stdio JSON-RPC 2.0 (detailed in §3 below).
3. **Dual Presentation Model:**
   Per ADR-0016 and ADR-0019, Contractor integrates GridCraft in both Full Editor Mode (with upstream ribbon, formula bar, and tools) and Embedded Capability Mode (focused calculation tables with protected formula cells and editable quantity inputs).

---

## 2. Upstream Pin & Attribution Registry

Recorded in [`docs/vendor/ARTCRAFT.md`](../../vendor/ARTCRAFT.md):

| Field | Pinned Value |
|---|---|
| **Component** | GridCraft |
| **Upstream Repository** | `https://github.com/storytold/gridcraft` |
| **Release Tag** | `v0.3.0` |
| **Resolved Commit** | `fb823899c57b41703edcad2b6476cf4b8a01dfc4` |
| **Date Pinned** | 2026-10-12 |
| **License** | Dual MIT OR Apache-2.0 |
| **Carried Attribution Files** | `LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`, `ATTRIBUTION.md` |
| **Consumption Surface** | Full Editor GUI, Embedded Grid, and Headless MCP server (`crates/mcp`) |

---

## 3. Verified MCP Tool Inventory

From actual upstream source in `crates/mcp/src/tools.rs`:

| # | Tool Name | Description | Key Inputs | Mutates State |
|---|---|---|---|---|
| 1 | `execute_command` | Executes any GridCraft command by ID with JSON parameters (ribbon, sheet, formatting actions) | `command`, `params` | Yes |
| 2 | `list_commands` | Enumerates available commands with ID, label, ribbon path, and shortcut | `search` | No |
| 3 | `inspect_workbook` | Complete workbook summary: title, path, sheets, defined names, calculation mode, undo history | *(none)* | No |
| 4 | `read_range` | Reads 2D cell values from range; supports `formulas: true` and `formatted: true` | `range`, `sheet`, `formulas`, `formatted` | No |
| 5 | `write_range` | Writes 2D array of values, numbers, or formulas starting at anchor cell | `range`, `values` | Yes |
| 6 | `set_cell` | Enters single cell input (number, text, or `=formula`); triggers recalculation | `cell`, `input` | Yes |
| 7 | `get_cell` | Deep inspection of one cell: value, formula, display text, style, hyperlink | `cell` | No |
| 8 | `evaluate_formula` | Evaluates a formula against the active sheet without modifying any cell | `formula`, `cell` | No |
| 9 | `select` | Sets active selection range | `range`, `active` | Yes |
| 10 | `format_range` | Batch formatting: bold, italic, font, colors, number format, borders, wrap | `range`, `bold`, `format`, `borders`, etc. | Yes |
| 11 | `insert_chart` | Inserts chart from source data range (column, bar, line, pie, scatter) | `range`, `type`, `title`, `at` | Yes |
| 12 | `create_table` | Formats range as structured Excel table with banded rows and auto-filter | `range`, `style`, `header`, `name` | Yes |
| 13 | `sort_range` | Multi-column sort with ascending/descending keys and header detection | `range`, `keys`, `header` | Yes |
| 14 | `filter` | AutoFilter on columns with custom criteria, top N, or value sets | `column`, `range`, `values`, `custom` | Yes |
| 15 | `open_workbook` | Opens `.xlsx`, `.xlsm`, `.csv`, `.tsv`, `.json` workbook into memory | `path` | Yes |
| 16 | `save_workbook` | Serializes active workbook to `.xlsx`, `.csv`, `.json`, or `.html` | `path` | No |
| 17 | `new_workbook` | Creates blank or sample workbook (`budget`, `sales`, `grades`) | `sample` | Yes |
| 18 | `undo` | Reverts the last N actions in active workbook | `steps` | Yes |
| 19 | `redo` | Reapplies the last undone action | `steps` | Yes |
| 20 | `list_functions` | Catalogs worksheet functions: name, category, signature, description | `search`, `category` | No |

---

## 4. Fixture Parity Matrix (GridCraft vs TypeScript Authority)

Evaluated across M00 fixtures (`standard_ipc_measurement.json`, `degenerate_calc_stress.json`, `sample_boq_1k.json`):

| ID | Formula / Case | GridCraft (Rust `f64`) | TS Authority Baseline | Status | Semantic Analysis |
|---|---|---|---|---|---|
| `div-zero` | `=100 / 0` | `#DIV/0!` | `#DIV/0!` | **MATCH** | Identical IEEE division-by-zero error handling |
| `value-string-arith` | `="concrete" * 10` | `#VALUE!` | `#VALUE!` | **MATCH** | Rejects non-numeric arithmetic with `#VALUE!` |
| `name-unknown-fn` | `=UNKNOWN_MACRO(42)` | `#NAME?` | `#NAME?` | **MATCH** | Unknown identifier emits `#NAME?` |
| `ref-invalid-ptr` | `=REF_INVALID!A1` | `#REF!` | `#REF!` | **MATCH** | Missing worksheet pointer produces standard `#REF!` |
| `cycle-circular-ref`| `=B7 + 1` (B6↔B7 cycle) | `#REF!` | `#CYCLE!` | **TYPED_CYCLE** | Both halt recursion safely. GridCraft emits Excel `#REF!`; TS emits `#CYCLE!` |
| `float-arithmetic` | `=0.1 + 0.2` | `0.30000000000000004` | `0.30000000000000004` | **MATCH** | Both use standard IEEE 754 `f64` representation |
| `math-sum-range` | `=SUM(10, 20, 30, 40)` | `100` | `100` | **MATCH** | Standard summation agrees |
| `math-round` | `=ROUND(123.456, 2)` | `123.46` | `123.46` | **MATCH** | Half-up round matches accounting practice |
| `logic-if-branch` | `=IF(10 > 5, "PASS", "FAIL")`| `PASS` | `PASS` | **MATCH** | Conditional evaluation agrees |
| `ipc-measurement` | `=D4*E4*F4*G4` | `10440` | `10440` | **MATCH** | 4-factor road excavation measurement agrees |
| `volatile-today` | `=TODAY()` | Serial / ISO | Date string | **VOLATILE** | Both flag volatile; fixed via reference date |
| `volatile-now` | `=NOW()` | Timestamp | Epoch ms | **VOLATILE** | Both flag volatile; fixed via reference clock |
| `volatile-rand` | `=RAND()` | Real in [0,1) | Real in [0,1) | **VOLATILE** | Both flag volatile; fixed via PRNG seed |

---

## 5. Architectural Boundary & Financial Authority

1. **Spreadsheet Engine Authority:** GridCraft evaluates client formula calculations and UI previews in `f64`.
2. **Financial Ledger Separation:** Financial arithmetic (IPC payments, certified quantities, VAT, retentions) remains strictly centralized in Contractor server services. Client spreadsheet outputs cross the service boundary formatted as exact-decimal strings or scaled integers (`ExactDecimalSchema`). The client never authorizes financial postings.
3. **Adoption Status:** GridCraft is adopted under [ADR-0019](../../adr/0019-gridcraft-calculation-adoption-and-shared-binding.md) as a governed temporary duplicate during M06. Complete retirement of legacy evaluators will occur in M06-T10 after all consumers migrate.
