# 0019. GridCraft Calculation Adoption and Shared Binding

Date: 2026-10-12  
Status: Accepted  
Deciders: Owner (via chat guidance), AI Agent  
Consulted: ADR-0013 (Platform Stack Decision), ADR-0014 (Open Source Only), ADR-0015 (ArtCraft Upstream Engine Strategy), ADR-0016 (In-Place Embedding & Table Modernization), ADR-0018 (Upstream Capabilities & Construction Integration)  

---

## Context

Platform Plan v3 §6 M06 and ADR-0015 establish an evidence-gated strategy for adopting candidate calculation engines. Under ADR-0016, the project committed to adopting the open-source **ArtCraft** family without forks or upstream code modifications, reusing complete application interfaces with ribbons/tools in Full Editor Mode alongside focused components in Embedded Capability Mode (e.g. calculation tables with locked formula cells and editable quantity inputs).

M06-T01 produced an initial prototype comparison, but its report relied on a local simulation driver. In M06-T04, actual upstream inspection of `storytold/gridcraft` at release tag `v0.3.0` (immutable commit `fb823899c57b41703edcad2b6476cf4b8a01dfc4`) resolved:
1. **Actual Architecture:** A modular Rust workspace with 12 crates (`calc`, `engine`, `formula`, `functions`, `model`, `mcp`, `numfmt`, `xlsx`, `pdf`, `chart`, `core`, `ui-egui`) and 3 application hosts (`gridcraft` desktop, `gridcraft-cli`, `gridcraft-web`).
2. **Numeric Representation:** GridCraft utilizes IEEE-754 standard floating point (`f64` with `float_roundtrip` serialization), identical to Microsoft Excel and Google Sheets. The earlier claim that GridCraft used `rust_decimal` was an artifact of the local simulator.
3. **Headless Automation:** The native MCP server in `crates/mcp` provides 20 real tools (including `execute_command`, `read_range`, `write_range`, `set_cell`, `get_cell`, `evaluate_formula`, `format_range`, `create_table`, `open_workbook`, `save_workbook`, `undo`, `redo`).

Contractor requires a verified calculation adoption decision that defines the host surfaces, server authority boundary, numeric representations, and governed temporary duplicate status.

---

## Decision

1. **Adopt GridCraft as the Calculation & Spreadsheet Engine:**
   - **Pinned Upstream Version:** Release tag `v0.3.0`, immutable commit `fb823899c57b41703edcad2b6476cf4b8a01dfc4`.
   - **Repository:** `https://github.com/storytold/gridcraft`.
   - **Licenses:** Dual MIT OR Apache-2.0 (ADR-0014 compliant).

2. **Dual Presentation Surfaces (per ADR-0016):**
   - **Full Editor Mode:** Preserves upstream application chrome (ribbon, formula bar, sheet tabs, cell formatting, chart and table tools) for dedicated document workflows (e.g. full IPC compilation, complex BoQ modeling, rate breakdown workbooks).
   - **Embedded Capability Mode:** Renders focused calculation tables without desktop ribbons inside existing Contractor forms (e.g. measurement book entries, daily logs, material deliveries). Contractual rates and derived formulas are locked against accidental modification (`locked: true`), with active blue focus rings on editable quantity inputs.

3. **Authoritative Calculation & Financial Boundary:**
   - **Spreadsheet Domain (`f64`):** GridCraft manages interactive spreadsheet evaluation, dynamic arrays, cell dependency graphs, Excel function compatibility, and instant UI recalculation previews.
   - **Financial Ledger Authority (`ExactDecimal`):** Client-side calculations are strictly local proposals. Centralized backend financial services (`billing.ts`, `ipc-service.ts`) retain exclusive authority over certified payment certificates, VAT calculations, ledger postings, and fiscal locks. Exact decimal arithmetic and scaled integers are enforced at the service boundary via platform contracts (`ExactDecimalSchema`). No client UI can authorize financial ledger mutations.

4. **Target Host Bindings:**
   - **Web:** Hosted via `gridcraft-web` WebAssembly bundle and headless MCP web worker.
   - **Desktop / Native:** Embedded via native library bindings / subprocess CLI (`apps/gridcraft-cli`) with shared memory / IPC transport.
   - **Server:** Headless Node/Rust server execution binding for authoritative batch re-evaluation and XLSX import/export pipelines.

5. **Governed Duplication Status:**
   - GridCraft calculation is registered as a **governed temporary duplicate** during M06 transition.
   - The legacy TypeScript spreadsheet engine baseline (`src/lib/worksheet/spreadsheet-engine.ts`, `formula-engine.ts`) is retained solely for differential verification until all consumers are inventoried, migrated, and verified in M06-T10 and M06-T13.
   - Cutover is strictly gated on complete consumer retirement; no permanent parallel engines will remain.

6. **Extension Points & Upstream Contribution Path:**
   - Supported hooks (commands, cell styles, MCP JSON-RPC tools, formula registry) are consumed through documented upstream interfaces.
   - Missing hooks (such as granular cell protection callbacks or custom Flutter canvas integration) are tracked in `docs/vendor/ARTCRAFT.md` and proposed upstream; Contractor maintains zero downstream forks.

---

## Consequences

### Positive
- Reuses 100% of an active, community-maintained, professional spreadsheet engine with full Excel/XLSX compatibility, rich formula coverage (100+ functions), and ribbon/table interfaces.
- Eliminates the need to develop, maintain, or debug an inferior custom spreadsheet engine in Flutter or TypeScript.
- Enables seamless upstream upgrades via the M06-T12 update tooling (`scripts/update-artcraft gridcraft <release>`).
- Guarantees financial security: client UI locking prevents data entry mistakes, while server authority ensures financial integrity.

### Negative / Trade-Offs
- GridCraft uses `f64` floating point for cell evaluation rather than arbitrary-precision decimal; Contractor adapters must format and scale boundary numbers when passing values to authoritative financial services.
- Requires maintaining the governed temporary duplicate TS evaluator until M06-T10 consumer retirement.
- Requires building platform adapters for WebAssembly and native subprocess integration.
