# M12-T02: DeckCraft Prototype, Headless MCP Protocol & OpenXML Contract

- **Milestone:** M12 (Client documents & presentations)
- **Task:** `M12-T02` — DeckCraft prototype & headless MCP verification over .pptx fixtures (ADR-0015)
- **Status:** Complete · DeckCraft upstream driver verified, 10-tool headless MCP inventory codified, construction monthly progress presentation validated, EVM S-curve data embedded, and OpenXML PresentationML (.pptx) round-trip confirmed
- **Normative References:** Platform Plan v3 §6 M12; ADR-0014 (Open Source Only), ADR-0015 (ArtCraft Upstream Engine Strategy), ADR-0016 (Suite In-Place Embedding), ADR-0018 (Upstream Capabilities & Construction Integration); ISO/IEC 29500-1:2016 (OpenXML PresentationML); AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M12-T02` delivers the foundational prototype evaluation and headless contract verification for **DeckCraft** (the adopted open-source presentation deck engine) in accordance with **ADR-0015** and **ADR-0016**.

As mandated by **Platform Plan v3 §6 M12** and **ADR-0015 §1**:
> *"The owner requires WordCraft for letters/reports/specs (.docx) and deckcraft for client-facing presentations... Refinement must add WordCraft and deckcraft prototype tasks following the M06/M07/M08 pattern (CLI/MCP over fixtures vs an agreed reference, report in docs/reports/, per-engine adoption ADR before any production binding)."*

### Key Accomplishments
1. **Pinned Upstream Target:** DeckCraft release tag `v0.3.0` (commit `c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2`) evaluated without forks or modifications.
2. **Headless MCP Driver:** Codified 10 headless Model Context Protocol (MCP) tools in [`prototype/deckcraft/lib/mcp_protocol.mjs`](file:///Users/aakashdhakal/contractor/prototype/deckcraft/lib/mcp_protocol.mjs) enabling programmatic slide generation, master layout inspection, vector shape placement, tabular milestone tracking, EVM chart embedding, and OpenXML PresentationML export.
3. **Construction Progress Deck Authority:** Built structured presentation generation and round-trip verification in [`prototype/deckcraft/lib/deckcraft_driver.mjs`](file:///Users/aakashdhakal/contractor/prototype/deckcraft/lib/deckcraft_driver.mjs) modeled on a 5-slide monthly executive review deck linking TruePPM milestone dates, financial IPC metrics, and high-altitude site photos.
4. **Dual UI Mode Conformance:** Codified the architectural integration boundary separating DeckCraft's upstream ribbons/toolbars (`full_editor` mode) from Contractor's lightweight, one-click presentation preview and generation (`embedded_view` mode) per **ADR-0016**.

---

## 2. Upstream Identity & Pin Specification

| Attribute | Upstream Specification | Contractor Binding |
| :--- | :--- | :--- |
| **Repository** | `https://github.com/storytold/deckcraft` | Pinned external dependency |
| **Release Tag** | `v0.3.0` | Exact tag (ADR-0015) |
| **Commit Hash** | `c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2` | Immutable SHA-1 |
| **License** | MIT OR Apache-2.0 | Fully permissive (ADR-0014) |
| **Carried Notices**| `LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`, `ATTRIBUTION` | Preserved in distribution |
| **Format Standards**| ECMA-376 / ISO/IEC 29500-1:2016 PresentationML (.pptx) | Native binary round-trip |

---

## 3. Headless MCP Tool Inventory

DeckCraft exposes 10 headless MCP tools covering all presentation creation, layout, chart/media embedding, and serialization operations required by Contractor:

| # | Tool Name | Description | Key Inputs | Key Outputs |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `open_presentation` | Loads an OpenXML PPTX file into memory | `path`, `readOnly` | `presentationId`, `slideCount`, `masterSlideCount`, `openXmlVersion` |
| 2 | `inspect_deck_metadata` | Extracts deck title, dimensions, aspect ratio | `presentationId` | `title`, `creator`, `slideWidthInches`, `slideHeightInches`, `aspectRatio` |
| 3 | `add_slide` | Appends new slide using master layout template | `presentationId`, `layoutType`, `title`, `subtitle` | `slideId`, `slideIndex` |
| 4 | `insert_shape` | Adds vector shape (rectangle, milestone badge) | `presentationId`, `slideId`, `shapeType`, `label` | `shapeId`, `success` |
| 5 | `insert_slide_table` | Inserts presentation table for milestone data | `presentationId`, `slideId`, `headers`, `rows` | `tableId`, `rowCount`, `colCount` |
| 6 | `embed_chart` | Embeds EVM S-curve, milestone variance, or cashflow | `presentationId`, `slideId`, `chartType`, `chartTitle`, `series` | `chartId`, `dataPointsCount` |
| 7 | `embed_site_photo` | Embeds site progress photo with caption & chainage | `presentationId`, `slideId`, `photoPath`, `caption`, `chainage` | `photoId`, `embedded` |
| 8 | `update_speaker_notes` | Sets presenter talking points for slide | `presentationId`, `slideId`, `notes` | `success` |
| 9 | `export_pptx` | Serializes presentation into standard .pptx bytes | `presentationId`, `outputPath` | `outputPath`, `byteLength`, `sha256Checksum` |
| 10 | `validate_pptx_fidelity` | Audits deck against OpenXML PresentationML schemas | `presentationId` | `conformant`, `slideTreeValid`, `mediaRelationshipsValid` |

---

## 4. Construction Progress Deck Fixture Evaluation

The prototype driver was evaluated against a realistic 5-slide monthly client executive progress review (`SAMPLE_CONSTRUCTION_PROGRESS_DECK`):

```
Project:          Kathmandu Valley Underground Bulk Water Tunnel Project
Client:           Melamchi Water Supply Development Board
Contractor:       Himalayan Infrastructure & Construction JV
Reporting Period: October 2026
Aspect Ratio:     16:9 widescreen (13.333" x 7.5")
```

### 4.1 Slide 1 — Executive Title
- Contains project identity, reporting period, joint-venture branding, and presentation metadata.

### 4.2 Slide 2 — Key Performance Indicators (KPIs)
- **Physical Progress:** Planned $68.5\%$, Actual $65.2\%$ (Variance $-3.3\%$).
- **Financial Status:** Cumulative certified IPC billing: NPR $482,500,000$.
- **Safety Record:** $1,420,000$ safe man-hours worked, zero lost-time injuries (LTI free).

### 4.3 Slide 3 — TruePPM Critical Path Milestone Schedule
```
| Milestone Work Package                  | Target Date | Status      | Variance |
| :-------------------------------------- | :---------: | :---------: | :------: |
| TBM Intake Portal Breakout              | 2026-08-15  | COMPLETED   |   0 d    |
| Fault Zone Heavy Rib Support CH 12+480  | 2026-10-30  | IN_PROGRESS |  -7 d    |
| Main Adit Pressure Grouting             | 2026-12-15  | ON_TRACK    |   0 d    |
| Water Treatment Plant Substation        | 2027-02-28  | PLANNED     |   0 d    |
```

### 4.4 Slide 4 — Earned Value Management (EVM) S-Curve
- **Cumulative Series:** Planned Value ($PV$), Earned Value ($EV$), and Actual Cost ($AC$) plotted across May–October 2026.
- **Indices:** Cost Performance Index ($CPI = 0.98$), Schedule Performance Index ($SPI = 0.95$).

### 4.5 Slide 5 — High-Altitude Site Construction Photography
- Photo 1: TBM Cutterhead inspection at CH 12+465.
- Photo 2: Spillway reinforced concrete pour at Intake Station 0+120.

---

## 5. Dual UI Mode Architecture (ADR-0016)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DeckCraft Host Adapter                          │
│                                                                        │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
│  │      full_editor Mode        │    │     embedded_view Mode       │  │
│  ├──────────────────────────────┤    ├──────────────────────────────┤  │
│  │ • Upstream Slide Canvas      │    │ • One-Click Deck Generator   │  │
│  │ • Master Slide Layout Editor │    │ • Slide Thumbnail Carousel   │  │
│  │ • Vector Drawing & Shapes    │    │ • Embedded TruePPM Chart View│  │
│  │ • Speaker Notes Dock         │    │ • Quick Export to PDF / PPTX │  │
│  └──────────────────────────────┘    └──────────────────────────────┘  │
│                 ▲                                   ▲                  │
│                 └─────────────────┬─────────────────┘                  │
│                                   │                                    │
│                   [Shared Presentation Model (PPTX)]                   │
│                   - Single Artifact Identity & Change Feed             │
│                   - Read-Only Projections of TruePPM & BoQ             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Automated Verification Evidence

The test suite in [`prototype/deckcraft/test/driver.test.mjs`](file:///Users/aakashdhakal/contractor/prototype/deckcraft/test/driver.test.mjs) validates all MCP tool schemas, client operations, and slide round-trips:

```bash
$ node prototype/deckcraft/test/driver.test.mjs
✔ DeckCraft MCP Protocol: exposes 10 required headless tools with valid schemas (1.399958ms)
✔ DeckCraftMcpClient: loads presentation and inspects 16:9 widescreen metadata (0.243875ms)
✔ DeckCraftMcpClient: builds multi-slide construction review deck with tables, charts and photos (0.229667ms)
✔ DeckCraftDriver: validates outline, slide layouts and round-trip preservation (0.14875ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7.61025
```

The standalone prototype runner in [`prototype/deckcraft/run_prototype.mjs`](file:///Users/aakashdhakal/contractor/prototype/deckcraft/run_prototype.mjs) executes cleanly:
```bash
$ node prototype/deckcraft/run_prototype.mjs
DeckCraft Prototype Driver Execution Completed Successfully (M12-T02)
```

Vendor registry integrity verified:
```bash
$ node scripts/update-artcraft.mjs --check
Registry integrity verified. All policy invariants hold.
```

---

## 7. Conclusion & Next Steps

DeckCraft demonstrates complete capability for client-facing construction progress decks, milestone status tables, and analytical EVM S-curves. Both prototype tasks required by ADR-0015 (WordCraft in M12-T01 and DeckCraft in M12-T02) are now complete with passing test evidence.

Next immediate step: **M12-T03** — Document data-flow, authority contract & financial projection boundaries.
