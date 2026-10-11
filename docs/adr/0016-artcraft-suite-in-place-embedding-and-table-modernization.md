# ADR-0016: ArtCraft Suite In-Place Embedding and Construction Table Modernization

- **Status:** Accepted (owner directive, 2026-10-12)
- **Deciders:** Repository owner (chat directive; recorded under protocol R8)
- **Related:** 
  - [ADR-0014: Open-Source-Only Dependency Posture](0014-open-source-only-dependency-posture.md)
  - [ADR-0015: ArtCraft Upstream Engine Strategy](0015-artcraft-upstream-engine-strategy.md)
  - [Master Integration Plan](../plans/artcraft-suite-master-integration-plan.md)
  - Milestones M06 (GridCraft), M07 (CADCraft), M08 (PdfCraft), M12 (WordCraft & DeckCraft)

---

## 1. Context

In Milestone M06 exploration, prototype evaluation demonstrated that building custom spreadsheet grids, CAD viewers, PDF takeoff engines, and document editors from scratch in Flutter/React yields inherently inferior tools compared to active, specialized open-source engines.

The owner directed a strategic platform policy:
1. **Adopt all Craft apps** across the ArtCraft family (`GridCraft`, `CADCraft`, `PdfCraft`, `WordCraft`, `DeckCraft`).
2. **Embed them seamlessly in-place**: the apps must render directly within our application layouts with zero external popup windows, zero bloated desktop ribbons, and zero office menu clutter.
3. **Replace construction calculation tables with embedded GridCraft**: construction item tables (BoQs, measurement sheets, petty cash ledgers, material deliveries) will leverage GridCraft's high-performance calculation engine, supporting locked formula cells, exact decimal financial math, and Excel copy-paste.
4. **Maintain effortless upstream upgrades**: maintain a zero-fork policy, consuming upstream release tags via `docs/vendor/ARTCRAFT.md`.

---

## 2. Decision

### 2.1 Universal In-Place Embedding (No Office Ribbons)
- All Craft tools will be embedded directly inside the Contractor application container as native canvas/WASM components.
- Standalone desktop chrome (ribbons, menu bars, "File/Edit" menus) is stripped in embedded mode (`showRibbon: false`).
- Components render with clean, modern styling adhering to the platform's design tokens and dark/light modes.

### 2.2 Construction Table Modernization (Locked Cell Formula Protection)
- Interactive construction data tables (BoQ lines, interim payments, material items, site expenses) will be powered by embedded GridCraft tables.
- **Cell Protection Contract:**
  - **Locked Columns (`locked: true`):** Contract rates, item codes, and calculated totals cannot be manually overwritten.
  - **Editable Columns:** Quantity measurements, receipt descriptions, and site inputs remain editable with active focus indicators.
  - **Formulas:** Financial and volumetric formulas (e.g. `=Qty * Rate`, `=SUM()`, VAT additions) evaluate dynamically; clicking displays the formula, but keyboard overwrite is prevented.
- **Exact Decimal Math:** Evaluated using `rust_decimal` to prevent IEEE 754 floating-point penny drift across large BoQ item trees.

### 2.3 Document Storage & Auto-Sync
- All workbooks and documents are persisted as standard open files (`.xlsx`, `.dwg`/`.dxf`, `.pdf`, `.docx`) in the local SQLite attachment store.
- Edits auto-save continuously in the background (debounced 500ms) to the local SQLite outbox.
- The unified sync engine (M03/M05) handles cloud replication, offline caching, and conflict resolution without manual user intervention.

### 2.4 Zero-Fork Upstream Pinned Upgrades
- The repository will **never fork or edit upstream ArtCraft code**.
- Each component is pinned to release tags in `docs/vendor/ARTCRAFT.md`.
- Platform-specific customizations (theme integration, custom data bindings) live in application wrapper overlays (`packages/embedded_*`), ensuring upstream community improvements flow into Contractor via simple tag bumps.

---

## 3. Consequences

### Positive
- **World-Class Feature Depth:** Instant access to comprehensive Excel formulas, AutoCAD drafting, and Acrobat takeoff measurements out-of-the-box.
- **Development Velocity:** Eliminates hundreds of agent-hours spent building fragile custom grid widgets and CAD viewers from scratch.
- **Community Acceleration:** Contractor automatically inherits every performance boost and bug fix shipped by the ArtCraft open-source community.
- **Audit-Proof Calculations:** Eliminates floating-point rounding errors in construction billing.

### Considerations & Mitigations
- **Data Binding Hygiene:** A clean JSON/schema bridge must extract structured row data from GridCraft workbooks to synchronize with PostgreSQL database records and enforce backend validation guards.
- **Initial WASM Cache:** Client browsers must download the ~2MB compiled WASM bundle on first load; mitigated by aggressive HTTP caching and service worker pre-caching.
