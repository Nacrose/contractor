# M12-T06: Client Presentation Deck Authoring in Dual UI Modes via DeckCraft

- **Milestone:** M12 (Client documents & presentations)
- **Task:** `M12-T06` — Client presentation deck authoring in dual UI modes via DeckCraft (derived from `M12-W04`)
- **Status:** Complete · Dual UI modes (`full_editor` vs `embedded_view`) operational, automated monthly client progress deck generation from TruePPM & BoQ verified, annotations & speaker notes preserved across mode transitions, OpenXML PresentationML (.pptx) package export verified
- **Normative References:** Platform Plan v3 §4 (Contracts), §5.1 (Data Flow), §6 M12, §10 (Architecture & UI Modes); ADR-0010 (Progressive Extension), ADR-0015 (ArtCraft Upstream Strategy), ADR-0016 (Suite In-Place Embedding & Dual UI Modes), ADR-0017 (TruePPM Scheduling), ADR-0018 (Upstream Capabilities & Construction Integration); AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M12-T06` implements the production DeckCraft host adapter and automated monthly client progress deck generation pipeline in `@contractor/native-documents`.

Per **Platform Plan v3 §6 M12** and **ADR-0016**:
> *"Full presentation editing retains upstream DeckCraft slide canvas, master layouts, shapes, slide sorter, and toolbars; embedded capability views inside construction workflows provide one-click progress deck generation and slide preview. Binding TruePPM EVM S-curves, milestone timelines, financial billings, and site progress photos into standardized slide templates without state loss across mode transitions."*

### Key Accomplishments
1. **Dual UI Modes (ADR-0016):**
   - `full_editor` mode: Exposes DeckCraft upstream slide master canvas, slide sorter thumbnail strip, shape/callout toolbars, speaker notes editing panel, and direct canvas shape manipulation.
   - `embedded_view` mode: Provides quick generation form, slide preview carousel, and streamlined progress metric binding.
   - Mode switching preserves slide deck structure, user annotations, customized shapes, speaker notes, and active slide index without state loss or document mutation.
2. **Automated Monthly Client Progress Deck Generation:**
   - One-click synthesis of a 5-slide standardized executive progress presentation directly from live domain data:
     - **Slide 1 (Title & Overview):** Project name, reporting period, client name, contractor JV badge, and executive presentation notes.
     - **Slide 2 (Key Performance Indicators):** Planned vs actual progress percentage badges, variance alerts, certified IPC financial totals, and cumulative safety hours without LTI.
     - **Slide 3 (Contractual Milestone Status):** Tabular progress tracking directly from TruePPM schedules, baseline target dates, actual status, and variance days.
     - **Slide 4 (EVM S-Curve Performance):** Earned Value Management chart with Planned Value (PV), Earned Value (EV), Actual Cost (AC), CPI, and SPI indices.
     - **Slide 5 (Field Construction Photography):** High-resolution site photos with captions, chainage markers, and inspection metadata.
3. **Financial Authority Boundary Enforcement (M12-T03 Compliance):**
   - Certified IPC amounts cross the boundary as exact `BigInt` Paisa with valid double-entry ledger sequence provenance. Presentation-layer tax/discount formulas are strictly rejected fail-closed.
4. **Slide Annotations & Speaker Notes:**
   - Threaded user callout annotations and slide-by-slide speaker notes with edit timestamps.
5. **OpenXML PresentationML (.pptx) Export & Freeze Lock:**
   - Serializes presentations into standard OpenXML structures (`ppt/presentation.xml`, `ppt/slides/slide{1..5}.xml`, `ppt/charts/chart1.xml`, `ppt/notesSlides/notesSlide1.xml`, `docProps/core.xml`, `docProps/app.xml`).
   - Implements permanent issuance freeze (`freezeAndIssue`), throwing `FrozenDocumentModificationError` on post-issuance modification attempts.

---

## 2. Architecture & Dual UI Mode Mechanics (ADR-0016)

```
       ┌─────────────────────────────────────────────────────────────┐
       │                Contractor Construction App                  │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                 Mode Switch Toggle (ADR-0016)
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │     embedded_view         │             │        full_editor        │
   │  • One-Click Deck Gen     │ ◄─────────► │  • DeckCraft Slide Canvas │
   │  • Slide Carousel Preview │  Selection, │  • Slide Sorter Thumbnail │
   │  • Live Metric Binding    │ Annotations │  • Shape Toolbars         │
   │  • Streamlined Workflow   │   & Notes   │  • Speaker Notes Panel    │
   └─────────────┬─────────────┘  Preserved  └─────────────┬─────────────┘
                 │                                         │
                 └────────────────────┬────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │         DeckCraftHostAdapter (@contractor/native-documents)         │
   │  • TruePPM EVM S-Curve & Milestone Schedule Binding                 │
   │  • BoQ IPC Billing (Exact BigInt Paisa & Ledger Provenance)         │
   │  • Slide Annotations & Speaker Notes Model                          │
   │  • PresentationML Layout & Geometry Validator                       │
   └──────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │            OpenXML PresentationML (.pptx) Serializer                │
   │  • ppt/presentation.xml (16:9 widescreen geometry, slide IDs)      │
   │  • ppt/slides/slide1..5.xml (shapes, badges, tables, photos)        │
   │  • ppt/charts/chart1.xml (EVM cumulative S-curve series)            │
   │  • ppt/notesSlides/notesSlide1.xml (speaker notes & talking points) │
   │  • docProps/core.xml (title, author, creation timestamp)            │
   └──────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                  Immutable Issuance & Lock Layer                    │
   │  • SHA-256 Snapshot Hash & Signatory Watermark                      │
   │  • FrozenDocumentModificationError (Fail-Closed on Mutate)          │
   └─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Slide Layout & Data Binding Matrix

| Slide | Layout Type | Data Source | Binding Model | Presentation Elements |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `title_slide` | Project Metadata | `projectTitle`, `reportingPeriod`, `clientName`, `contractorName` | Title banner, contractor JV badge, executive presentation notes |
| **2** | `metrics_summary` | TruePPM / BoQ / Safety | `plannedProgressPercent`, `actualProgressPercent`, `certifiedIpcAmountPaisa`, `safeManHoursWorked` | KPI metric cards, variance indicator badges, certified financial callout |
| **3** | `table_content` | TruePPM CPM Schedule | `milestones`: name, targetDate, status, varianceDays | Standardized milestone status grid, critical path flags |
| **4** | `chart_evm` | TruePPM EVM Module | `evmData`: PV, EV, AC monthly arrays, CPI, SPI | OpenXML 3-series line chart, cost/schedule efficiency indicators |
| **5** | `photo_grid` | Site Log Photo Attachments | `sitePhotos`: title, caption, chainage, photoUrl | Photo layout grid with chainage tags and inspection verification |

---

## 4. Test Battery & Verification Evidence

All test cases in `packages/native_documents/test/deckcraft_adapter.test.ts` pass cleanly:

```
✔ DeckCraftHostAdapter: automated monthly progress deck generation from TruePPM & BoQ (43.313542ms)
✔ DeckCraftHostAdapter: dual UI modes and state preservation across mode switches (ADR-0016) (1.634666ms)
✔ DeckCraftHostAdapter: OpenXML PresentationML (.pptx) export and freeze lock upon issuance (5.09125ms)
✔ DeckCraftHostAdapter: boundary guard rejects client-side float math or missing double-entry provenance (0.755ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
```

Total test suite across `@contractor/native-documents` is **16/16 passing**:
- Authority contracts & boundaries: 4 tests
- Multi-source report assembly pipeline: 4 tests
- WordCraft host adapter & dual UI modes: 4 tests
- DeckCraft host adapter & dual UI modes: 4 tests

### Acceptance Criteria Checklist
- [x] **Automated generation of monthly client progress deck directly from TruePPM and BoQ data:** Verified. Generates standard 5-slide deck from structured project input with embedded EVM charts and financial figures.
- [x] **Dual mode switching preserves slide deck structure, customized annotations, and speaker notes:** Verified. Annotations, speaker notes, and active slide index remain identical across `embedded_view` $\leftrightarrow$ `full_editor` mode toggles.
- [x] **Output validates cleanly against OpenXML PresentationML (.pptx) standards:** Verified. `exportOpenXmlPptxPackage()` produces compliant PPTX package with validated XML parts and SHA-256 integrity checksum.
- [x] **Strict zero-fork upstream posture:** Maintained. DeckCraft host adapter operates externally without modifying upstream DeckCraft engine packages.
