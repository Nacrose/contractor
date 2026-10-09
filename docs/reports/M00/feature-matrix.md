# M00-T10: Feature Matrix As Implemented

- **Milestone:** M00 (Inventory, Behavior Fixtures and Baseline)
- **Task:** `M00-T10` — Feature matrix as implemented (implemented / partial / missing / unverified)
- **Source Repository:** `Construction_Manager` (Source inspection across all routers, pages, engines, and tests)
- **Analyzed Commit:** `7d80083e` (on branch `feat/autocad-parity-engine-v2`)
- **Date:** 2026-10-08 (Asia/Kathmandu)
- **Status:** Complete · Baseline for Parity Gates & Milestone Scoping

---

## 1. Executive Summary & Verification Findings

This document synthesizes findings from `M00-T07` (tRPC Routers), `M00-T08` (Non-Router Writers & Jobs), and `M00-T09` (Client Persistence & Offline Stores) into a definitive, ground-truth **Feature Matrix As Implemented**.

### Key Metrics Snapshot

| Status Class | Workflow Count | Percentage | Definition |
|---|---|---|---|
| **Implemented** | **39 workflows** | **95.1%** | Code complete, operational in web/mobile app, backed by automated test suites. |
| **Partial** | **2 workflows** | **4.9%** | Functional core exists but requires manual input, lacks full automation, or intentionally deferred (Dashboard). |
| **Missing** | **0 workflows** | **0.0%** | Desired capability not present in existing codebase. |
| **Unverified** | **0 workflows** | **0.0%** | All 41 core workflows verified against source code and test suites. |
| **Total Core Workflows** | **41 workflows** | **100.0%** | Spans all 12 operational construction engineering domains. |

---

## 2. Resolution of the README-vs-Reality Discrepancy (Plan v3 §3)

A key mandate of `M00-T10` is resolving the fundamental discrepancy between the upstream repository README and the actual codebase implementation:

### 2.1 The Stated README Claim
> *"Desktop Office-First Web Application: Engineered for head-office and site-office desktop browsers with a stable connection. It is **online-first by design** (no mobile app builds, no offline write replay). Authenticated state rides on secure, encrypted httpOnly session cookies and is never cached in unencrypted browser storage."* (`Construction_Manager/README.md:L7`)

### 2.2 The Ground-Truth Reality
Inspection of the actual codebase reveals extensive, sophisticated mobile and offline engineering:
1. **Dedicated Mobile PWA (`src/app/m/`):** A fully operational mobile application tailored for site engineers with dedicated routes for Today (`/m`), Site Logs (`/m/log`), Photos (`/m/photos`), Tasks (`/m/tasks`), Chat (`/m/chat`), and Outbox Sync (`/m/sync`).
2. **Offline Outbox Engine (`src/lib/field-outbox.ts`):** Complete offline mutation queueing in IndexedDB with device-generated UUIDv4 `clientUuid`, exponential backoff retry, and server-side deduplication.
3. **Offline Form Drafts (`src/lib/field-drafts.ts`):** "Saved on phone first" local persistence in IndexedDB store `drafts` allowing site engineers to review/edit entries before sending.
4. **Offline Read Query Cache (`src/lib/field-query-persist.ts`):** Whitelisted query results (`project.list`, `fieldSubmission.mySubmissions`, `punchList.list`, etc.) cached in IndexedDB store `queries` and hydrated on app launch.
5. **Service Worker Background Sync (`public/sw.js`):** Service worker registering background sync event `cm-field-sync` for background replay on Android Chrome.

### 2.3 Verdict & Migration Stance
- **The README claim is obsolete:** The README describes an earlier prototype philosophy before the mobile field engine was built.
- **The code is authoritative:** The offline-capable field architecture exists in production, but currently relies on fragile browser IndexedDB/LocalStorage. The native Flutter evolution ([ADR-0010](../../adr/0010-progressive-extension-over-greenfield-rewrite.md)) fulfills this exact need by replacing browser IndexedDB with durable, ACID-compliant **native SQLite**.

---

## 3. Comprehensive Feature Matrix As Implemented

Below is the complete matrix of all 41 user-visible workflows across the 12 construction domains.

| Domain | Workflow | Status | Central Engine | Current Tests | Current Web / Target Platforms | Parity Notes & Discrepancies |
|---|---|---|---|---|---|---|
| **Field Operations** | **Daily Site Log & Diary**<br>_Capture daily site logs, weather conditions, hindrances, site notes, and general site progress from mobile/tablet._ | **Implemented** | `src/lib/field-entry-builders.ts, daily-report-sync.ts, field-submission.ts` | `src/server/routers/__tests__/field-submission.test.ts, daily-report.test.ts, field-entry-builders.test.ts` | Web: Partial (Office review)<br>Mobile: Implemented (/m/log)<br>Native Target: Target (M04) | README claims "online-first by design (no mobile app builds, no offline write replay)". Reality: full offline mobile PWA (/m) with IndexedDB drafts, outbox queue, and server daily-report-sync exists and is heavily tested. |
| **Field Operations** | **Field Photo Snap & Geotagging**<br>_Site photo capture via device camera, automatic canvas compression (<=1280px JPEG q0.75), GPS stamping, and outbox sync._ | **Implemented** | `src/lib/field-photo.ts, src/server/routers/field-photos.ts, StoredFile` | `src/server/routers/__tests__/field-photos.test.ts` | Web: Implemented<br>Mobile: Implemented (/m/photos)<br>Native Target: Target (M04) | README omits mobile photo compression and GPS tagging capability. |
| **Field Operations** | **Site Petty Cash & Expense Logging**<br>_Site engineer petty cash expense logging, receipt photo attachment, office verification gate._ | **Implemented** | `src/server/routers/site-expense.ts (createDomainRouter, financialGuard), field-submission.ts` | `src/server/routers/__tests__/site-expense.test.ts` | Web: Implemented<br>Mobile: Implemented (/m/log)<br>Native Target: Target (M05) | Aligned with office review rule: expenses require office verification before financial posting. |
| **Field Operations** | **Direct Site Material Delivery**<br>_Receive materials directly at jobsite, record delivery note/challan, update site stock ledger with clientUuid idempotency._ | **Implemented** | `src/server/routers/material-transaction.ts (logDirectDelivery), field-outbox.ts` | `src/server/routers/__tests__/material-transaction.test.ts` | Web: Implemented<br>Mobile: Implemented (/m/log)<br>Native Target: Target (M05) | Works offline via field-outbox despite README claiming no offline write replay. |
| **Field Operations** | **Field Offline Query Persistence & Sync**<br>_Read query caching in IndexedDB for offline viewing of projects, tasks, daily reports, and chat channels._ | **Implemented** | `src/lib/field-query-persist.ts, field-db.ts (store queries), public/sw.js` | `src/lib/__tests__/field-query-persist.test.ts, offline-resilience.test.ts` | Web: Not applicable<br>Mobile: Implemented (/m)<br>Native Target: Target (M03 SQLite) | Contradicts README statement that authenticated state is never stored in browser storage. |
| **Contractual BoQ & Rate Analysis** | **BoQ Item Hierarchy & Quantities**<br>_Multi-level contractual BoQ tree structure (Bill, Sub-bill, Item) with contract rates, quantities, and amounts._ | **Implemented** | `src/server/routers/boq.ts, src/server/utils/boq-calc.ts` | `src/server/routers/__tests__/boq.test.ts, boq-calc.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target (M06) | None — core desktop engine as documented in README. |
| **Contractual BoQ & Rate Analysis** | **Government Rate Analysis (DoR/DUDBC Norms)**<br>_Detailed unit rate breakdown into labor, material, equipment, and contractor overhead/profit per Nepal public procurement standards._ | **Implemented** | `src/server/routers/rate-analysis.ts, src/server/utils/boq-calc.ts` | `src/server/routers/__tests__/rate-analysis.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target (M06) | None. |
| **Contractual BoQ & Rate Analysis** | **Rate Profiles & Market Rate Revisions**<br>_Tenant-wide and project-specific material/labor rate profiles with market rate adjustment logs._ | **Implemented** | `src/server/routers/rate-profile.ts, rate-profile-refresh.ts` | `src/server/routers/__tests__/rate-profile.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Contractual BoQ & Rate Analysis** | **BoQ Versioning & Change Comparison**<br>_Snapshot contractual BoQ versions (As-Awarded, Revision 1, Variation Order) and compare delta._ | **Implemented** | `src/server/routers/boq-version.ts, boq-snapshot.ts` | `src/server/routers/__tests__/boq-version.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Billing, IPC & Invoicing** | **Interim Payment Certificate (IPC) Preparation**<br>_Running bill generation from BoQ items, previous/this bill cumulative quantities, and deduction schedules._ | **Implemented** | `src/server/routers/ipc.ts, recalculate-ipc.ts, sync-ipc-workbook.ts` | `src/server/routers/__tests__/ipc.test.ts, recalculate-ipc.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target | None. |
| **Billing, IPC & Invoicing** | **Contract Deductions & Advance Recovery**<br>_Automated retention money deduction (typically 5%), mobilization advance recovery amortized across bills, and tax withholding._ | **Implemented** | `src/server/routers/ipc.ts, src/server/utils/retention.ts` | `src/server/routers/__tests__/ipc.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Billing, IPC & Invoicing** | **Price Escalation Billing (FIDIC / Standard Formula)**<br>_Labor, fuel, and material price index adjustment formula calculations for public infrastructure contracts._ | *PARTIAL* | `src/server/routers/ipc.ts (formula helpers in lib/money)` | `src/server/routers/__tests__/ipc.test.ts` | Web: Partial<br>Mobile: None<br>Native Target: Target | Index formula entry is partially implemented; manual input required for monthly published DoR price indices. |
| **Billing, IPC & Invoicing** | **VAT Register & Tax Invoicing**<br>_Annex-5/Annex-7 standard sales & purchase VAT register for Nepal Inland Revenue Department (IRD)._ | **Implemented** | `src/server/routers/vat-register.ts, src/server/utils/vat-registers.ts` | `src/server/routers/__tests__/vat-register.test.ts, vat-registers.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Procurement & Supply Chain** | **Site Purchase Requisitions & Approval**<br>_Site engineer material demand requisition, multi-level capability approval, item quote comparison._ | **Implemented** | `src/server/routers/requisition.ts, state-machine.ts` | `src/server/routers/__tests__/requisition.test.ts` | Web: Implemented<br>Mobile: Implemented (/m)<br>Native Target: Target (M05) | None. |
| **Procurement & Supply Chain** | **Purchase Orders (PO) Generation & Tracking**<br>_Official PO generation with sequence numbering, delivery schedules, payment terms, and vendor dispatch._ | **Implemented** | `src/server/routers/purchase-order.ts, sequence-generator.ts` | `src/server/routers/__tests__/purchase-order.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target | None. |
| **Procurement & Supply Chain** | **Warehouse Inventory & Stock Ledgers**<br>_Multi-store material receipt, stock issues, bin cards, moving average valuation, and physical reconciliation._ | **Implemented** | `src/server/routers/material.ts, inventory-valuation.ts, stock-count.ts` | `src/server/routers/__tests__/material.test.ts, inventory-valuation.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target | None. |
| **Procurement & Supply Chain** | **Inter-Site Material Transfers**<br>_Transfer material between projects/stores with dispatch challan, transit tracking, and gate receipt acknowledgment._ | **Implemented** | `src/server/routers/inter-site-transfer.ts` | `src/server/routers/__tests__/inter-site-transfer.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Equipment Management & Fuel** | **Fleet Registry & Rental Contracts**<br>_Internal & vendor equipment asset tracking, hourly/monthly rental contracts, billing runs, and maintenance logs._ | **Implemented** | `src/server/routers/equipment.ts, equipment-rental.ts, equipment-core.ts` | `src/server/routers/__tests__/equipment.test.ts, equipment-rental.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Equipment Management & Fuel** | **Daily Fuel Dispensing & Dip-Reading Reconciliation**<br>_Fuel bowser / storage tank dip-readings, per-machine fuel issue logs, operating hours, and loss variance audit._ | **Implemented** | `src/server/routers/equipment-fuel.ts, src/server/services/equipment-fuel.ts` | `src/server/routers/__tests__/equipment-fuel.test.ts` | Web: Implemented<br>Mobile: Implemented (/m/log)<br>Native Target: Target (M05) | None. |
| **Equipment Management & Fuel** | **Spot-Hire Equipment Work Orders**<br>_Emergency local machine spot-hire with automated verification and hourly rate reconciliation._ | **Implemented** | `src/server/routers/equipment-spot-hire.ts, src/server/utils/equipment-spot-hire.test.ts` | `src/server/routers/__tests__/equipment-spot-hire.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Workforce, HR & Payroll** | **Person-Grain Identity & Employment Contracts**<br>_Physical person identity separated from login accounts (ADR-0005); multi-project staff assignments._ | **Implemented** | `src/server/services/workforce.ts, src/server/routers/hr.ts, people-access.ts` | `src/server/routers/__tests__/hr.test.ts, people-access.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target | None. |
| **Workforce, HR & Payroll** | **Staff Attendance & Leave Management**<br>_Daily muster roll attendance, leave balance tracking, public holiday calendar integration (Nepal BS calendar)._ | **Implemented** | `src/server/routers/leave.ts, src/server/utils/holiday-db.ts` | `src/server/routers/__tests__/leave.test.ts` | Web: Implemented<br>Mobile: Implemented (/m)<br>Native Target: Target (M05) | None. |
| **Workforce, HR & Payroll** | **Payroll Calculation & Person Allocations (ADR-0007)**<br>_Monthly payroll runs, gross salary, tax withholding, provident fund / citizen investment trust deductions, and project cost allocations._ | **Implemented** | `src/server/routers/payroll.ts, src/server/utils/payroll-calc.ts, payroll-allocation.ts` | `src/server/routers/__tests__/payroll.test.ts, payroll-calc.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Accounting & Bahi Khata** | **Day Book (Bahi Khata) & Project Ledgers**<br>_Lightweight Tally / Swastik-compatible single and double-entry day book statements, cash/bank accounts, and journal vouchers._ | **Implemented** | `src/server/routers/accounting.ts, src/lib/journal-entry.ts, ledger-entry.ts` | `src/server/routers/__tests__/accounting.test.ts, ledger-entry.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target | None. |
| **Accounting & Bahi Khata** | **Bank Guarantee Expiration & Release**<br>_Performance bonds, bid bonds, and advance payment guarantees with bank tracking, counter-guarantees, and automated expiry sweeps._ | **Implemented** | `src/server/routers/bank-guarantee.ts, background-jobs.ts (sweepExpiredBankGuarantees)` | `src/server/routers/__tests__/bank-guarantee.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Accounting & Bahi Khata** | **Fiscal Year Boundary Locks (ADR-0001)**<br>_Strict fiscal period freezing preventing back-dated postings or edits to financial records in closed periods._ | **Implemented** | `src/server/routers/fiscal-year.ts, src/lib/fiscal-year-lock.ts` | `src/server/routers/__tests__/fiscal-year.test.ts` | Web: Implemented<br>Mobile: Enforced by API<br>Native Target: Enforced by API | None. |
| **CAD Drawings & Geometry** | **AutoCAD DXF / DWG Viewer**<br>_Vector CAD viewer supporting AutoCAD DXF and binary DWG files, layer toggling, zoom/pan, coordinate display._ | **Implemented** | `src/lib/dxf/dxf-parser.ts, dxf-render.ts, src/lib/dwg/dwg-native.ts, src/components/cad/` | `src/lib/dxf/dxf-parser.test.ts, dxf-render.test.ts, src/lib/dwg/dwg-native.test.ts` | Web: Implemented (WebGL/Canvas)<br>Mobile: Partial (View only)<br>Native Target: Target (M07) | CAD engine recently expanded in PR #162 (feat/autocad-parity-engine-v2). Web performance limited on 100k+ entity models. |
| **CAD Drawings & Geometry** | **Interactive CAD Command Engine**<br>_AutoCAD-style command bar (LINE, PLINE, CIRCLE, ARC, DIST, AREA, ERASE, UNDO/REDO) and entity snapping._ | **Implemented** | `src/lib/cad/command-registry.ts, entity-ops.ts, geom.ts` | `src/lib/cad/__tests__/command-registry.test.ts` | Web: Implemented<br>Mobile: Not feasible (touch)<br>Native Target: Tablet only | None. |
| **CAD Drawings & Geometry** | **CAD Plotting & Vector Export**<br>_Export CAD viewport and layouts to vector PDF and SVG with scale bar, north arrow, and border templates._ | **Implemented** | `src/lib/cad/plot-engine.ts, src/lib/dxf/dxf-to-svg.ts` | `src/lib/cad/__tests__/plot-engine.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Takeoff & Document Engine** | **PDF Blueprint Viewer & Calibration**<br>_Multi-page PDF drawing viewer with arbitrary line scale calibration (known dimension setting) in metric/imperial._ | **Implemented** | `src/lib/document-engine/measurement.ts, pdfjs-dist, src/components/pdf-canvas/` | `src/lib/document-engine/__tests__/measurement.test.ts` | Web: Implemented<br>Mobile: Partial<br>Native Target: Target (M08) | None. |
| **Takeoff & Document Engine** | **Measurement Takeoff & BoQ Linking**<br>_Polygon area takeoff, linear polyline measurement, and count stamps linked to specific BoQ item quantities._ | **Implemented** | `src/lib/pdf-canvas/, src/server/routers/document.ts (saveMarkups)` | `src/components/pdf-canvas/__tests__/storage-db.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target (M08) | Markup persistence uses 1-based page indices while PDF document APIs use 0-based index. Documented as risk in v3 §3. |
| **CPM Scheduling & Gantt** | **Interactive Gantt Chart Timeline**<br>_Interactive task bar dragging, progress tracking, milestone rendering, and WBS outline levels._ | **Implemented** | `src/server/routers/gantt.ts, src/server/services/scheduler/progress.ts` | `src/server/routers/__tests__/gantt.test.ts` | Web: Implemented<br>Mobile: Read-only<br>Native Target: Target (M09) | None. |
| **CPM Scheduling & Gantt** | **Critical Path Method (CPM) Engine**<br>_Forward pass / backward pass early/late date calculation, total float, free float, and critical path identification._ | **Implemented** | `src/lib/cpm-engine.ts, src/server/utils/gantt-cpm-engine.ts` | `src/server/utils/__tests__/gantt-cpm.test.ts, cpm-engine.test.ts` | Web: Implemented<br>Mobile: Server-side<br>Native Target: Target (M09 Shared Kernel) | Calculation currently duplicated across TypeScript client and server. Plan v3 §3 targets a single portable core. |
| **CPM Scheduling & Gantt** | **Bikram Sambat (BS) & Working Calendar**<br>_Official Nepal Bikram Sambat calendar conversions, Saturday weekend rules, and government holiday schedules._ | **Implemented** | `src/lib/nepali-calendar.ts, date-miti.ts, src/lib/calendar-snapshot.ts` | `src/lib/__tests__/nepal-calendar.test.ts, date-miti.test.ts` | Web: Implemented<br>Mobile: Implemented<br>Native Target: Target (M09) | None. |
| **CPM Scheduling & Gantt** | **Primavera P6 & MS Project Schedule Import**<br>_Import enterprise Primavera .xer and Microsoft Project .xml schedules into native Gantt task hierarchy._ | **Implemented** | `src/server/utils/xer-import.ts, msp-import.ts, msp-export.ts` | `src/server/utils/__tests__/xer-import.test.ts, msp-import-security.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Worksheets & Virtual Grid** | **Excel-Compatible Virtual Grid Spreadsheet**<br>_High-performance virtual scrolling grid with formula evaluation, cell formatting, merging, and formulas._ | **Implemented** | `src/lib/worksheet/spreadsheet-engine.ts, virtual-grid.ts, formula-engine.ts` | `src/lib/worksheet/__tests__/spreadsheet-engine.test.ts, formula-engine.test.ts` | Web: Implemented<br>Mobile: Not feasible (touch grid)<br>Native Target: Tablet only | Recalculation currently re-scans workbook cells without an incremental dependency DAG. Target M06 optimizes this. |
| **Worksheets & Virtual Grid** | **Excel (.xlsx) Round-Trip Import / Export**<br>_Import and export complex multi-sheet Excel files preserving formula text, numbers, and basic formatting._ | **Implemented** | `src/lib/worksheet/workbook-excel.ts (@e965/xlsx)` | `src/lib/worksheet/__tests__/workbook-excel.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Joint Ventures & Governance** | **Joint Venture (JV) Partner Agreements & Profit Sharing**<br>_Multi-party contractor JV agreements, equity share ratios, capital contributions, and dividend payouts._ | **Implemented** | `src/server/routers/jv-partner.ts (createDomainRouter, financialGuard)` | `src/server/routers/__tests__/jv-partner.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Joint Ventures & Governance** | **RFI & Submittal Workflow Lifecycles**<br>_Formal Request for Information (RFI) and Material Submittal workflows with PDF export and approval states._ | **Implemented** | `src/server/routers/workflow.ts, rfi.ts, submittal.ts, state-machine.ts` | `src/server/routers/__tests__/rfi.test.ts, submittal.test.ts` | Web: Implemented<br>Mobile: Implemented (/m)<br>Native Target: Target | None. |
| **Joint Ventures & Governance** | **Responsibility Handover & Delegation Rules**<br>_Formal site handover protocol reassigning pending approvals and role scopes upon engineer transfer._ | **Implemented** | `src/server/routers/responsibility-handover.ts, src/server/services/responsibility-handover.ts` | `src/server/routers/__tests__/responsibility-handover.test.ts` | Web: Implemented<br>Mobile: None<br>Native Target: Target | None. |
| **Joint Ventures & Governance** | **Analytical Dashboard & Management KPIs**<br>_Executive project summaries, cash flow graphs, and cross-project performance gauges._ | *PARTIAL* | `src/server/routers/dashboard.ts, financial-reporting.ts` | `src/server/routers/__tests__/dashboard.test.ts` | Web: Partial (Deferred Policy)<br>Mobile: None<br>Native Target: Deferred | README explicitly mandates "Dashboard Deferred Policy: analytical dashboard is built last". Maintenance posture confirms Defer / Do Not Start. |

---

## 4. Separation of Existing Parity vs Requested Additions (Plan v3 §6 M00)

To maintain strict release gates, the platform program separates **Existing-Product Parity** from **Requested Additions** and **Third-Party Compatibility**:

### 4.1 Existing-Product Parity (Release Gate Baseline)
The Flutter application must achieve complete behavioral equivalence with the 39 implemented workflows above:
- Full BoQ hierarchy, calculation, and government rate analysis breakdown.
- Complete IPC billing, retention money, advance recovery, and VAT registers.
- Procurement supply chain: requisitions, POs, store stock ledgers, inter-site transfers.
- Workforce identity separation, muster roll attendance, and person-grain payroll.
- Double-entry Bahi Khata day books, bank guarantee sweeps, and fiscal year locks.
- Field daily reports, photo capture, GPS tagging, and durable outbox replay.
- CAD DXF/DWG rendering and basic entity manipulation.
- CPM forward/backward pass scheduling with Nepal Bikram Sambat calendar.

### 4.2 Requested Additions (Milestone-Scoped Evolution)
These capabilities are new architectural additions introduced by the Flutter rewrite:
- **Durable SQLite Local Storage (M03):** Replacing browser IndexedDB with native SQLite and explicit transaction commit guarantees.
- **Multi-Platform Installers (M11):** Native signed packages for Android APK/AAB, iOS IPA, macOS DMG, Windows MSIX, and Linux AppImage.
- **Portable Rust Calculation Core (M06, M07, M09):** Evaluating shared Rust kernels for geometry/worksheet/CPM where justified by profiling.
- **Offline PDF Takeoff Calibration (M08):** Hardware-accelerated native PDF takeoff canvas replacing PDF.js DOM overhead.

### 4.3 Third-Party Compatibility Boundary
- **AutoCAD Parity:** Full AutoCAD format parity is bounded to supported entity subsets (Lines, Polylines, Circles, Arcs, Text, Hatches). It does not claim 100% support for complex proprietary 3D ACIS solids or dynamic blocks.
- **Excel Parity:** Formula parity is bounded to the supported 150+ financial and engineering functions. Dynamic array spills and VBA macro execution are explicitly out of scope.
- **Primavera / MSP:** Schedule import/export covers tasks, dependencies, calendars, and float; custom proprietary resource curves are mapped to standard linear distributions.

---

## 5. Acceptance Criteria Verification

- [x] **Each workflow row carries: status class, central engine, current tests, target platforms, README discrepancy:**
  - All 41 workflows documented in §3 with exact engines, test suite paths, platform coverage, and discrepancy notes.
- [x] **README-vs-reality discrepancy on offline behavior resolved explicitly:**
  - Detailed in §2: quotes the obsolete online-first claim from README:L7 and contrasts it with the 5 implemented mobile/offline subsystems in the codebase.
- [x] **Existing-product parity kept separate from requested additions and third-party compatibility claims:**
  - Explicit boundaries established in §4 separating the 39 baseline workflows from new platform features and third-party format limits.

---

*Report and data artifacts generated as part of task `M00-T10` under the [AI-Agent Execution Protocol](../../rules/AI-AGENT-EXECUTION-PROTOCOL.md).*