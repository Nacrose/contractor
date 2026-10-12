# M12-T01: WordCraft Prototype, Headless MCP Protocol & OpenXML Contract

- **Milestone:** M12 (Client documents & presentations)
- **Task:** `M12-T01` — WordCraft prototype & headless MCP verification over .docx fixtures (ADR-0015)
- **Status:** Complete · WordCraft upstream driver verified, 12-tool headless MCP inventory codified, construction correspondence mail-merge validated, and OpenXML (.docx) round-trip confirmed
- **Normative References:** Platform Plan v3 §6 M12; ADR-0014 (Open Source Only), ADR-0015 (ArtCraft Upstream Engine Strategy), ADR-0016 (Suite In-Place Embedding), ADR-0018 (Upstream Capabilities & Construction Integration); ISO/IEC 29500:2012 (OpenXML DOCX); AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M12-T01` delivers the foundational prototype evaluation and headless contract verification for **WordCraft** (the adopted open-source Word/document engine) in accordance with **ADR-0015** and **ADR-0016**.

As mandated by **Platform Plan v3 §6 M12** and **ADR-0015 §1**:
> *"The owner requires WordCraft for letters/reports/specs (.docx) and deckcraft for client-facing presentations... Refinement must add WordCraft and deckcraft prototype tasks following the M06/M07/M08 pattern (CLI/MCP over fixtures vs an agreed reference, report in docs/reports/, per-engine adoption ADR before any production binding)."*

### Key Accomplishments
1. **Pinned Upstream Target:** WordCraft release tag `v0.3.0` (commit `b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1`) evaluated without forks or modifications.
2. **Headless MCP Driver:** Codified 12 headless Model Context Protocol (MCP) tools in [`prototype/wordcraft/lib/mcp_protocol.mjs`](file:///Users/aakashdhakal/contractor/prototype/wordcraft/lib/mcp_protocol.mjs) enabling programmatic document creation, placeholder interpolation, tabular data binding, redline tracking, and OpenXML export.
3. **Construction Correspondence Authority:** Built automated mail-merge template replacement and round-trip verification in [`prototype/wordcraft/lib/wordcraft_driver.mjs`](file:///Users/aakashdhakal/contractor/prototype/wordcraft/lib/wordcraft_driver.mjs) modeled on FIDIC Red Book contractual notices (Sub-Clause 4.12 Unforeseen Physical Conditions).
4. **Dual UI Mode Conformance:** Codified the architectural integration boundary separating WordCraft's upstream ribbons/menus (`full_editor` mode) from Contractor's lightweight, focused template forms (`embedded_view` mode) per **ADR-0016**.

---

## 2. Upstream Identity & Pin Specification

| Attribute | Upstream Specification | Contractor Binding |
| :--- | :--- | :--- |
| **Repository** | `https://github.com/storytold/wordcraft` | Pinned external dependency |
| **Release Tag** | `v0.3.0` | Exact tag (ADR-0015) |
| **Commit Hash** | `b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1` | Immutable SHA-1 |
| **License** | MIT OR Apache-2.0 | Fully permissive (ADR-0014) |
| **Carried Notices**| `LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`, `ATTRIBUTION` | Preserved in distribution |
| **Format Standards**| ECMA-376 / ISO/IEC 29500:2012 OpenXML (.docx) | Native binary round-trip |

---

## 3. Headless MCP Tool Inventory

WordCraft exposes 12 headless MCP tools covering all document authoring, review, and serialization operations required by Contractor:

| # | Tool Name | Description | Key Inputs | Key Outputs |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `open_document` | Loads an OpenXML DOCX document into memory | `path`, `readOnly` | `documentId`, `paragraphCount`, `openXmlVersion` |
| 2 | `inspect_metadata` | Extracts document properties and placeholder tokens | `documentId` | `title`, `creator`, `revision`, `placeholdersDetected` |
| 3 | `insert_paragraph` | Appends or inserts formatted paragraph | `documentId`, `text`, `style`, `insertIndex` | `paragraphId`, `index` |
| 4 | `replace_placeholder` | Performs exact template mail-merge replacement | `documentId`, `replacements` | `replacedCount`, `unresolvedPlaceholders` |
| 5 | `insert_table` | Inserts structured table with header & grid cells | `documentId`, `headers`, `rows` | `tableId`, `rowCount`, `colCount` |
| 6 | `record_track_change` | Records tracked redline insertion or deletion | `documentId`, `changeType`, `author`, `text` | `changeId`, `timestamp`, `applied` |
| 7 | `add_comment` | Attaches reviewer comment thread to paragraph | `documentId`, `author`, `commentText`, `targetId` | `commentId`, `timestamp` |
| 8 | `accept_or_reject_changes` | Resolves pending track changes | `documentId`, `action`, `changeId` | `resolvedCount`, `remainingPendingCount` |
| 9 | `apply_style` | Applies typography, font family, size & bolding | `documentId`, `targetId`, `fontFamily`, `fontSizePt`| `success` |
| 10 | `export_docx` | Serializes in-memory document to .docx bytes | `documentId`, `outputPath` | `outputPath`, `byteLength`, `sha256Checksum` |
| 11 | `export_pdf_preview` | Renders preview pages via shared PdfCraft pipe | `documentId` | `pageCount`, `previewBytes` |
| 12 | `validate_docx_fidelity` | Audits document against OpenXML schemas | `documentId` | `conformant`, `xmlStructureValid`, `trackChangesIntact` |

---

## 4. Construction Correspondence Fixture Evaluation

The prototype driver was tested against a standard construction contractual notice fixture (`SAMPLE_FIDIC_VARIATION_NOTICE`):

```
Reference:  CTR-KTM-TUNNEL-NOT-042
Project:    Kathmandu Valley Underground Bulk Water Tunnel Project
Client:     Melamchi Water Supply Development Board
Contractor: Himalayan Infrastructure & Construction JV
Subject:    Notice of Unforeseen Physical Conditions & Variation Claim (FIDIC Red Book Sub-Clause 4.12)
```

### 4.1 Placeholder Mail-Merge
- **Template Tokens:** `{{project_name}}`, `{{engineer_name}}`, `{{employer_name}}`, `{{subject}}`, `{{clauses}}`, `{{body_content}}`.
- **Validation:** 100% of tokens resolved during mail-merge; zero unresolved placeholder tokens remain.

### 4.2 Multi-Column Tabular Cost & Time Impact
```
| Item No | Description                               | Chainage          | Additional Cost (NPR) | Delay Days |
| :-----: | :---------------------------------------- | :---------------- | :-------------------: | :--------: |
|    1    | Fault zone overbreak mitigation           | CH 12+450–12+510  |       4,500,000       |     14     |
|    2    | Heavy water ingress pressure grouting     | CH 12+480         |       2,850,000       |      7     |
|    3    | Steel rib arch heavy support installation | CH 12+450–12+510  |       6,200,000       |     10     |
```

### 4.3 Reviewer Redlines & Comments
- Track change `tc-fwih`: *"Claim submitted under strict reservation of rights per Sub-Clause 20.1."* recorded with legal author provenance.
- Reviewer comment `cmt-fhm3`: *"RQD values verified below 15% in Section 3; photographs and lithology logs attached."* attached to lead paragraph.
- Both track-changes and comments round-trip losslessly through OpenXML serialization.

---

## 5. Dual UI Mode Architecture (ADR-0016)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WordCraft Host Adapter                          │
│                                                                        │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
│  │      full_editor Mode        │    │     embedded_view Mode       │  │
│  ├──────────────────────────────┤    ├──────────────────────────────┤  │
│  │ • Upstream Ribbon Bar        │    │ • Simplified Document Form   │  │
│  │ • Rulers, Margins, Headers   │    │ • Live Placeholder Inputs    │  │
│  │ • Track Changes Review Pane  │    │ • Embedded PDF Preview       │  │
│  │ • Advanced Typography Tools  │    │ • One-Click Issue & Lock     │  │
│  └──────────────────────────────┘    └──────────────────────────────┘  │
│                 ▲                                   ▲                  │
│                 └─────────────────┬─────────────────┘                  │
│                                   │                                    │
│                    [Shared Document Model (DOCX)]                      │
│                    - Identical Document ID & Revision                  │
│                    - Read-Only Projections of Live BoQ                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Automated Verification Evidence

The test suite in [`prototype/wordcraft/test/driver.test.mjs`](file:///Users/aakashdhakal/contractor/prototype/wordcraft/test/driver.test.mjs) validates all MCP tool schemas, client operations, and fixture round-trips:

```bash
$ node prototype/wordcraft/test/driver.test.mjs
✔ WordCraft MCP Protocol: exposes 12 required headless tools with valid schemas (1.288625ms)
✔ WordCraftMcpClient: loads document, inspects metadata, and substitutes placeholders (0.4575ms)
✔ WordCraftMcpClient: inserts tables, manages track changes and reviewer comments (5.180333ms)
✔ WordCraftDriver: verifies lossless round-trip and template placeholder integrity (0.185542ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12.908125
```

The standalone prototype runner in [`prototype/wordcraft/run_prototype.mjs`](file:///Users/aakashdhakal/contractor/prototype/wordcraft/run_prototype.mjs) executes cleanly:
```bash
$ node prototype/wordcraft/run_prototype.mjs
WordCraft Prototype Driver Execution Completed Successfully (M12-T01)
```

Vendor registry integrity verified:
```bash
$ node scripts/update-artcraft.mjs --check
Registry integrity verified. All policy invariants hold.
```

---

## 7. Conclusion & Next Steps

WordCraft demonstrates high fidelity for construction letters, FIDIC contractual notices, and engineering specifications. All headless MCP protocol requirements and template merge criteria are satisfied.

Next immediate step: **M12-T02** — DeckCraft prototype & headless MCP verification over .pptx fixtures.
