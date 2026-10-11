# Master Integration Plan: ArtCraft Suite Seamless In-Place Embedding

**Status:** Plan & Architectural Directive  
**Date:** 2026-10-12  
**Scope:** Universal adoption across GridCraft, CADCraft, PdfCraft, WordCraft, DeckCraft, and craft-fonts  
**Governing ADRs:** ADR-0014 (Open-Source-Only Posture), ADR-0015 (ArtCraft Upstream Strategy), ADR-0016 (In-Place Embedding & Table Modernization)  

---

## 1. Executive Vision & Core Philosophy

Instead of building inferior, custom spreadsheet grids, CAD viewports, PDF markup tools, and text editors from scratch, **the Contractor platform will embed the full open-source ArtCraft suite directly in-place**.

### The 4 Non-Negotiable Rules
1. **Seamless In-Place Embedding (Zero Desktop Ribbons):**
   - Each Craft app is mounted directly inside our application layout (under our navigation headers, flanked by our project tree).
   - **No desktop ribbons, no bloated office toolbars, no separate pop-up windows.** To the user, it feels like a native, cohesive part of our app.
2. **Formula & Contractual Protection (Tamper-Proof):**
   - Critical contractual rates, calculated totals, and engineering formulas are **strictly locked** (`locked: true`).
   - Only authorized editable columns (e.g. *Measured Quantity*) accept user inputs. Users can view formulas, but cannot overwrite them.
3. **Unified Document & Sync Lifecycle (Auto-Saved & Offline-First):**
   - All files (`.xlsx`, `.dwg`/`.dxf`, `.pdf`, `.docx`) are stored locally in our SQLite attachment store (WAL mode).
   - Auto-save runs continuously in the background; our M03/M05 sync engine synchronizes changes to the cloud without manual file pickers.
4. **Zero-Fork Upstream Upgrades:**
   - We **never fork or modify upstream ArtCraft code**.
   - All components are consumed as release tag pins in `docs/vendor/ARTCRAFT.md`. Upgrades happen via simple version bumps that instantly deliver new upstream community features to our users.

---

## 2. Capability Area Mapping Across the Platform

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CONTRACTOR APPLICATION SHELL                           │
│     (Unified Auth · Design Tokens · SQLite WAL Outbox · Change Feed Sync)       │
└────────┬───────────────────┬───────────────────┬───────────────────┬────────────┘
         │                   │                   │                   │
         ▼                   ▼                   ▼                   ▼
   ┌───────────┐       ┌───────────┐       ┌───────────┐       ┌───────────┐
   │ GridCraft │       │  CADCraft │       │  PdfCraft │       │ WordCraft │
   │ (Sheets)  │       │   (CAD)   │       │   (PDF)   │       │  & Decks  │
   └─────┬─────┘       └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
         │                   │                   │                   │
         ▼                   ▼                   ▼                   ▼
   • BoQ / IPC         • 2D DWG / DXF      • Calibrated        • Contracts
   • Measurement       • Site Layouts        Takeoff           • Submittals
   • Expense Tables    • Redline markup    • Drawing Review    • Progress Decks
   • Qty Deliveries    • Plot to PDF       • Photo markup      • Client Reports
```

| Craft App | Platform Domain | Replaces | Primary User Experience | Target Milestone |
|---|---|---|---|---|
| **GridCraft** | Worksheets, BoQ & Tables | Custom React/Flutter virtual grids | Instant 60fps Excel spreadsheets and locked construction tables with full formula support | **M06** |
| **CADCraft** | 2D CAD & Drawings | Read-only image exports and LibreDWG scripts | In-place AutoCAD DWG/DXF drafting, layer control, dimensioning, and vector plan review | **M07** |
| **PdfCraft** | PDF Takeoff & Markup | Basic PDF canvas viewers and ad-hoc annotations | Calibrated engineering takeoff (distance, area, perimeter), threaded drawing comments, and site photo PDFs | **M08** |
| **WordCraft** | Site Documents & Letters | Static HTML textareas and markdown editors | In-place `.docx` drafting for contractual notices, RFI letters, change orders, and specifications | **M12** |
| **DeckCraft** | Presentations & Slides | Manual PPTX exports and static reports | In-place slide deck builder for monthly owner progress presentations and site reviews | **M12** |
| **craft-fonts** | Universal Typography | Browser fallback system fonts | Unified font bundle (CAD line fonts, engineering symbols, mathematical notation) | **M06–M12** |

---

## 3. Detailed Component Architecture

### 3.1 GridCraft: Worksheets & Construction Table Replacement (M06)
- **Role 1 (Full Worksheets):** Master Bill of Quantities (100k rows), Interim Payment Certificates (IPCs), rate analysis, structural calculation workbooks.
- **Role 2 (Dynamic Construction Tables):** Replacing brittle web tables inside Daily Logs, Material Receipts, and Petty Cash Expenses.
- **Embedding Specs:**
  - `showRibbon: false`: Ribbon bars stripped away; clean modern table headers only.
  - `lockedColumns`: Contract rates and formulas locked; inputs highlighted with focus rings.
  - `exactDecimal`: Backed by `rust_decimal` to prevent IEEE 754 financial rounding drift.
  - `autoSaveIntervalMs: 500`: Transparent debounced flush to local SQLite outbox.

### 3.2 CADCraft: 2D DWG/DXF Architectural & Structural Plans (M07)
- **Role:** Direct opening and markup of construction blueprints (`.dwg` AC1015–AC1032 and `.dxf`).
- **Embedding Specs:**
  - In-place GPU canvas with smooth pan/zoom/orbit.
  - Layer toggling (e.g. hide electrical, show structural) directly in a clean sidebar panel.
  - Redline overlay: site engineers add revision clouds, dimensions, and text notes without altering base architectural layers.
  - Seamless export: 1-click vector PDF generation for site printing.

### 3.3 PdfCraft: Calibrated Takeoff & Quantity Extraction (M08)
- **Role:** Measuring quantities directly from PDF plan sheets to feed into GridCraft BoQ items.
- **Embedding Specs:**
  - Engineering calibration tool: user clicks two points on a scale bar (e.g., `1:100` or `10m`), calibrating the canvas.
  - Instant area/perimeter/length measurements that automatically export into GridCraft cells.
  - Photo packaging: transforms site inspection photos into standardized audit PDFs with EXIF geotags and contractor stamps.

### 3.4 WordCraft & DeckCraft: Contracts, Specs & Presentation Decks (M12)
- **Role:** Official contractual letters, site notices, variation orders, and monthly client progress decks.
- **Embedding Specs:**
  - WordCraft provides native `.docx` editing with track changes and comment bubbles.
  - DeckCraft allows site teams to generate high-polish executive slide decks populated directly with live BoQ numbers from GridCraft and photos from PdfCraft.

---

## 4. Upstream Upgrade & Maintenance Protocol

To guarantee that upgrading never causes code breakage or manual merge headaches:

```
[Upstream Release] ──► [docs/vendor/ARTCRAFT.md] ──► [Build Artifacts] ──► [Test Matrix]
  storytold/gridcraft        Update tag: v0.3.0            npm / cargo         node:test &
     (Release Tag)              to v0.4.0                 refresh build       flutter test
```

1. **Tag Pinned Registry:**
   - Every Craft dependency is pinned to an exact release tag in `docs/vendor/ARTCRAFT.md`.
2. **Standard Internal Packages:**
   - Packages live cleanly under our monorepo:
     - `packages/embedded_gridcraft`
     - `packages/embedded_cadcraft`
     - `packages/embedded_pdfcraft`
     - `packages/embedded_wordcraft`
3. **The Overlay Pattern for Customizations:**
   - If our app requires custom theme colors or specific keyboard shortcuts, we write a **wrapper overlay** outside the upstream repository. Upstream code remains untouched.
4. **Upgrade Cadence:**
   - Monthly check against upstream tags. Bumping a tag in `ARTCRAFT.md` and re-running the test suite automatically applies all community fixes and optimizations.

---

## 5. Implementation Roadmap (Sequencing)

### Phase 1: GridCraft Full Integration (Milestone M06)
- **M06-T01** (Complete): Headless prototype & fixture comparison against TS authority.
- **M06-T02**: Workbook & Table model evolution: `.xlsx` file schema + locked-cell schema.
- **M06-T03**: MCP & CLI automated integration with our native outbox sync.
- **M06-T04**: ADR-0016 formalization (adopting all Craft apps and table replacement).
- **M06-T05**: Direct in-place GridCraft embedding: ribbon-free view, cell locking, and BoQ data bridge.
- **M06-T06–T10**: 100k-row stress tests, IPC export pipeline, and financial approval gates.

### Phase 2: CADCraft 2D DWG/DXF Integration (Milestone M07)
- **M07-T01**: CADCraft prototype over M00 CAD fixtures (DWG AC1015–AC1032 via `acadrust`).
- **M07-T02–T05**: In-place CAD canvas embedding with layer manager and measurement tools.
- **M07-T06–T09**: Plot-to-PDF export and site redline synchronization.

### Phase 3: PdfCraft Takeoff & Annotation (Milestone M08)
- **M08-T01**: PdfCraft prototype over M00 PDF takeoff fixtures.
- **M08-T02–T05**: Calibrated scale tool and measurement extraction bridge into GridCraft BoQ items.
- **M08-T06–T08**: Multi-page drawing revision comparison and site photo stamping.

### Phase 4: WordCraft & DeckCraft Executive Suite (Milestone M12)
- **M12-T01–T04**: WordCraft `.docx` contract notice and RFI letter editor embedding.
- **M12-T05–T08**: DeckCraft monthly client progress slide deck builder.
