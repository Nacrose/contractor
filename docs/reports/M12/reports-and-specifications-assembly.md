# M12-T05: Reports & Technical Specifications Assembly from Live Project Records

- **Milestone:** M12 (Client documents & presentations)
- **Task:** `M12-T05` — Reports & technical specifications assembly from live project records (derived from `M12-W03`)
- **Status:** Complete · Multi-source report assembly pipeline active, cryptographic provenance chain verified, automated staleness change detection operational, OpenXML (.docx) report package export verified
- **Normative References:** Platform Plan v3 §4 (Contracts), §5.1 (Data Flow), §6 M12, §9 (Ledger Invariants); ADR-0010 (Progressive Extension), ADR-0015 (ArtCraft Upstream Strategy), ADR-0016 (Suite In-Place Embedding), ADR-0017 (TruePPM Scheduling), ADR-0018 (Upstream Capabilities & Construction Integration); AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M12-T05` implements the multi-source report assembly pipeline in `@contractor/native-documents`.

As defined by **Platform Plan v3 §6 M12** and **M12-W03**:
> *"Assemble multi-section engineering reports and contract specifications from disparate project subsystems: daily site logs (M04), BoQ/IPC measurements (M06), material delivery receipts (M05), and TruePPM milestone schedules (M09). Ensure every embedded tabular figure, date, and progress metric traces cryptographically to an immutable source record revision."*

### Key Accomplishments
1. **Multi-Source Pipeline (`MultiSourceReportAssemblyPipeline`):**
   - Ingests structured live data records from 4 core subsystems:
     - **Daily Site Logs (M04):** Weather, active operations, manpower headcount, plant and equipment deployment.
     - **Bill of Quantities / IPC Measurements (M06):** Item numbers, descriptions, previous/current/cumulative quantities, unit rates, and certified amounts in exact `BigInt` Paisa.
     - **Material Delivery Receipts (M05):** Inward delivery challans, quantities, suppliers, and testing quality certificates.
     - **TruePPM Schedules (M09):** Critical path milestones, baseline dates, forecast dates, schedule variance days, and physical progress percentages.
2. **Cryptographic Provenance Chain:**
   - Every table row and embedded project figure is bound to its source entity ID, entity type, and revision number.
   - Computes individual SHA-256 entity digests and a master composite provenance digest.
   - Renders an automated *Cryptographic Record Provenance Appendix* inside generated documents.
3. **Automated Staleness Change Detection & Refresh Prompting:**
   - Compares cached report snapshot entity watermarks against live subsystem revisions.
   - Flags staleness with precision: identifies exact stale subsystems and changed entity IDs.
   - Prompts regeneration to prevent stale data from appearing in client submissions.
4. **Authoritative Financial Boundaries (M12-T03 Compliance):**
   - Verifies all BoQ amounts and certified IPC figures cross the boundary as exact `BigInt` Paisa with valid double-entry ledger sequence provenance. Client-side math is strictly rejected.
5. **OpenXML (.docx) Report Packaging:**
   - Assembles multi-section documents via `WordCraftHostAdapter` and exports compliant OpenXML packages with tables, headings, and metadata.

---

## 2. Multi-Source Assembly Architecture

```
 ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
 │   Daily Site Logs    │  │   BoQ Measurements   │  │   Material Receipts  │  │   TruePPM Schedule   │
 │        (M04)         │  │        (M06)         │  │        (M05)         │  │        (M09)         │
 └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘
            │                         │                         │                         │
            ▼                         ▼                         ▼                         ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                  MultiSourceReportAssemblyPipeline (@contractor/native-documents)                  │
 │                                                                                                    │
 │   1. Validates BigInt Paisa and Ledger Provenance (DocumentAuthorityGuard)                         │
 │   2. Computes SHA-256 Entity Digests & Source Entity Watermarks                                    │
 │   3. Audits Staleness against live database revisions (StalenessAuditResult)                       │
 │   4. Renders Multi-Section Tables (BoQ Progress, Schedule, Material Intake, Site Operations)      │
 │   5. Appends Cryptographic Provenance Integrity Appendix                                           │
 └──────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                    │
                                                    ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                WordCraft Host Adapter (DOCX Engine)                                │
 │  • word/document.xml: Multi-section tables, formatted paragraphs, captions                         │
 │  • word/settings.xml: Track changes and OpenXML conformance                                        │
 │  • docProps/core.xml: Author, project title, and creation timestamp                                │
 └──────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                    │
                                                    ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                           Validated OpenXML (.docx) Engineering Report                             │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Source Entities & Watermarks

| Subsystem | Source Entity Interface | Key Fields Captured | Provenance Watermark |
| :--- | :--- | :--- | :--- |
| **Site Operations (M04)** | `DailySiteLogRecord` | `logId`, `date`, `weather`, `workActivities`, `manpowerTotal`, `equipmentActive`, `revision` | `SITE_LOG:logId:revision:SHA256` |
| **Billing & BoQ (M06)** | `BoQMeasurementRecord` | `sheetId`, `itemNumber`, `unit`, `cumulativeQty`, `ratePaisa`, `amountPaisa`, `sourceLedgerSeq`, `boqRevision` | `BOQ_MEASUREMENT:sheetId:boqRevision:SHA256` |
| **Materials Intake (M05)** | `MaterialDeliveryReceiptRecord` | `receiptId`, `challanNumber`, `materialName`, `quantityDelivered`, `supplier`, `qualityCertificateRef`, `revision` | `MATERIAL_RECEIPT:receiptId:revision:SHA256` |
| **Schedule (M09)** | `ScheduleMilestoneRecord` | `milestoneId`, `name`, `baselineDate`, `forecastDate`, `varianceDays`, `completionPercent`, `criticalPath`, `scheduleRevision` | `SCHEDULE_MILESTONE:milestoneId:scheduleRevision:SHA256` |

---

## 4. Test Battery & Verification Evidence

All test cases in `packages/native_documents/test/report_assembly.test.ts` pass cleanly:

```
✔ MultiSourceReportAssemblyPipeline: multi-source report assembly & WordCraft OpenXML DOCX export (29.5925ms)
✔ MultiSourceReportAssemblyPipeline: cryptographic provenance chain across all subsystems (0.199ms)
✔ MultiSourceReportAssemblyPipeline: staleness detection and change alert prompt (0.336083ms)
✔ MultiSourceReportAssemblyPipeline: rejects client-calculated financial math or invalid ledger provenance (0.28525ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
```

Total test suite across `@contractor/native-documents` is **12/12 passing**:
- Authority contracts & boundaries: 4 tests
- Multi-source report assembly pipeline: 4 tests
- WordCraft host adapter & dual UI modes: 4 tests

### Acceptance Criteria Checklist
- [x] **Multi-source report generation produces complete, validated DOCX document:** Verified. `exportReportDocx()` produces complete OpenXML packages containing 5 structured sections and tables across all subsystems.
- [x] **Cryptographic provenance chain verifies every table entry and figure back to source entity:** Verified. Every record has an immutable `SourceEntityWatermark` with revision tracking and SHA-256 digest.
- [x] **Stale data alerts prompt regeneration when underlying project records change:** Verified. `auditStaleness()` detects revision increments in underlying site logs, BoQ sheets, material receipts, or schedule milestones, outputting actionable warning prompts.
- [x] **Strict zero-fork upstream posture:** Maintained. Assembly operates via external host adapter and clean TypeScript domain interfaces.
