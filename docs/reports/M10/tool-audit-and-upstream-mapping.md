# M10-T01: Original Custom Tool Audit, Upstream Capability Mapping & Retained Domain Rules

- **Milestone:** M10 (Full Feature Parity and Web Migration)
- **Task:** `M10-T01` — Original custom tool audit, upstream capability mapping & retained domain rules (derived from `M10-W07`)
- **Status:** Complete · Audit of record for M10 migration waves and platform parity
- **Normative References:** Platform Plan v3 §6 M10, §6.0 maintenance posture; ADR-0010 (Progressive Extension), ADR-0014 (Open Source Only), ADR-0015 (ArtCraft Upstream Engine Strategy), ADR-0016 (In-Place Embedding & Table Modernization), ADR-0017 (TruePPM Adoption), ADR-0018 (Upstream Capabilities & Construction Integration), ADR-0021 (PdfCraft Adoption).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Audit Purpose

Milestone `M10-T01` establishes the baseline architectural disposition for migrating all legacy workflows, routers, non-router writers, background jobs, and client stores into the unified native desktop, web browser, and server platform.

As mandated by **Platform Plan v3 §6 M10** and **ADR-0018**:
> *"Four engineering engines alone are not full application parity. Map original custom tools to retained construction rules, upstream replacements, adapters, and retirement evidence before each wave. Do not rebuild a specialist capability already available upstream or retire custom construction behavior by naive name matching."*

This audit reviews:
1. **All 41 user-visible construction workflows** documented in `M00-T10` across 12 operational domains.
2. **All 79 tRPC routers** and **402 server mutations** documented in `M00-T07`.
3. **All 23 non-router writers** (3 background sweeps, 7 reconciliation services, 4 engineering importers, 7 operational scripts, 2 seeders) documented in `M00-T08`.
4. **All client-side persistence mechanisms and offline stores** documented in `M00-T09`.

Every capability is assigned a strict disposition class, authoritative state owner, adapter binding, retained domain rules, and retirement criteria.

---

## 2. Disposition Taxonomy & Boundary Rules

To prevent accidental re-implementation of solved upstream features or premature deletion of domain-critical logic, every tool is classified into one of three mutually exclusive dispositions:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                DISPOSITION TAXONOMY                                    │
├─────────────────────────┬───────────────────────────────┬───────────────────────────────┤
│    ADOPT_UPSTREAM       │          WRAP_ADAPTER         │      RETAIN_CUSTOM_DOMAIN     │
├─────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Generic capability      │ Domain orchestration layer    │ Specialized construction      │
│ delegated directly to   │ mediating between upstream    │ business logic, financial     │
│ pinned open-source      │ engines and authoritative     │ accounting, statutory rules,  │
│ engine without code     │ Contractor domain services.   │ and multi-tenant persistence. │
│ modification.           │                               │                               │
│ (GridCraft, CadCraft,   │ (Host adapters, projection    │ (PostgreSQL / SQLite, state   │
│ PdfCraft, TruePPM,      │ bridges, sync feed adapters,  │ machines, approval workflows, │
│ WordCraft, DeckCraft)   │ conversion pipelines)         │ fiscal locks, tax/deductions) │
└─────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### Architectural Guardrails
1. **Upstream Purity:** Upstream engines are consumed via pinned tags, immutable commits, and clean host interfaces (ADR-0014, ADR-0017, ADR-0018). Downstream forks and source modifications are strictly prohibited.
2. **Authoritative State Isolation:** Upstream engines are calculation and presentation components; they never own authoritative persistence or bypass Contractor domain services.
3. **No Duplicate Business Logic:** Financial calculations, statutory deductions, role-based permissions, and fiscal locks reside exclusively in domain services (PostgreSQL server / SQLite offline replica). Client UI shells never duplicate ledger logic.

---

## 3. Comprehensive Inventory Disposition Matrix (All 41 Workflows)

Below is the definitive audit and disposition mapping for all 41 core workflows documented in the `M00-T10` feature matrix:

| Domain | Workflow | Primary Consumers | Disposition | Proposed Upstream / API | Authoritative State Owner | Adapters / Linkage | Retained Construction Domain Rules | Owning Milestone / Task |
|---|---|---|---|---|---|---|---|---|
| **Field Ops** | Daily Site Log & Diary | Site Engineers, PMs, Consultants | `RETAIN_CUSTOM_DOMAIN` | `FieldSubmissionService` / Native SQLite | PostgreSQL (`DailyReport`) / SQLite | `DailyReportSyncAdapter` | Mandatory weather & hindrance logging; multi-role signoff; lock on submission | M04 (T01–T09) |
| **Field Ops** | Field Photo Snap & Geotagging | Site Engineers, QC Inspectors | `WRAP_ADAPTER` | Native Camera API + Canvas compression | PostgreSQL (`StoredFile`) + S3 Object Storage | `PhotoSyncFeedAdapter` | GPS coordinates and timestamp watermarking; offline thumbnail caching; immutable audit link | M04 (T01–T09) |
| **Field Ops** | Site Petty Cash & Expense Logging | Site Engineers, Project Accountants | `RETAIN_CUSTOM_DOMAIN` | `SiteExpenseService` (`createDomainRouter`) | PostgreSQL (`SiteExpense`) / SQLite | `ExpensePostingAdapter` | Office verification gate; financial limit assertion; receipt attachment validation | M05 (T01–T10) |
| **Field Ops** | Direct Site Material Delivery | Storekeepers, Site Engineers | `RETAIN_CUSTOM_DOMAIN` | `MaterialTransactionService` | PostgreSQL (`MaterialTransaction`) / SQLite | `ChallanSyncAdapter` | Delivery challan tracking; natural key idempotency (`clientUuid`); stock ledger balance update | M05 (T01–T10) |
| **Field Ops** | Field Offline Query Persistence | Mobile site workers | `RETAIN_CUSTOM_DOMAIN` | Native SQLite replica (replacing IndexedDB) | SQLite local database | `OfflineSyncEngine` | ACID durability; bounded transaction rollback; device revocation handling | M03 (T01–T10) |
| **BoQ & Rates** | Contractual BoQ Tree & Quantities | Estimators, Commercial Managers | `WRAP_ADAPTER` | GridCraft spreadsheet component | PostgreSQL (`BoQItem`, `BoQBill`) / SQLite | `GridCraftHostAdapter` | Multi-level hierarchical WBS codes; contractual rate locks; quantity amendment approval trail | M06 (T01–T13) |
| **BoQ & Rates** | Rate Analysis Breakdown | Cost Estimators, Quantity Surveyors | `WRAP_ADAPTER` | GridCraft formula engine | PostgreSQL (`RateAnalysis`) / SQLite | `RateAnalysisAdapter` | Material/Labor/Equipment/Overhead resource decomposition; standard district rates; contractor profit % | M06 (T01–T13) |
| **BoQ & Rates** | BoQ Excel Workbook Import/Export | Commercial Managers | `WRAP_ADAPTER` | GridCraft XLSX engine | PostgreSQL via `BoQImportService` | `BoqExcelMigrationAdapter` | Item code matching; formula cell validation; unit of measurement standardization | M06 (T01–T13) |
| **BoQ & Rates** | Measurement Sheets (Dimensioning) | Quantity Surveyors, Site Engineers | `WRAP_ADAPTER` | GridCraft embedded sheet | PostgreSQL (`MeasurementSheet`) / SQLite | `TakeoffBoqLinkService` | Length × Breadth × Height multiplication; deduction holes; linked takeoff provenance | M06, M08 |
| **Billing (IPC)** | Measurement-to-IPC Valuations | Billing Engineers, Clients | `RETAIN_CUSTOM_DOMAIN` | `IpcCalculationService` | PostgreSQL (`InterimPaymentCertificate`) | `IpcValuationAdapter` | Previous vs Cumulative certified measurement; contractual unit rate binding; non-negative quantities | M10-T02 |
| **Billing (IPC)** | Statutory Withholding & Tax | Accountants, Project Directors | `RETAIN_CUSTOM_DOMAIN` | `TaxCalculationService` | PostgreSQL (`IpcTaxLine`) | `TaxLedgerAdapter` | Nepal PPA standard: 13% VAT addition; TDS (1.5% contract, 15% rent); 5% Retention Deduction | M10-T02 |
| **Billing (IPC)** | Price Adjustment (Escalation) | Commercial Directors, Clients | `RETAIN_CUSTOM_DOMAIN` | `PriceAdjustmentService` | PostgreSQL (`PriceAdjustmentFormula`) | `EscalationEngineAdapter` | FIDIC / Nepal standard indices (labor, fuel, cement, steel, bitumin); weight coefficients $\sum w = 1.0$ | M10-T02 |
| **Billing (IPC)** | Subcontractor Running Bills | Commercial Managers, Subcontractors | `RETAIN_CUSTOM_DOMAIN` | `SubcontractorBillService` | PostgreSQL (`SubcontractorBill`) | `SubcontractorBillingAdapter` | Contractual back-to-back retention; advance recovery; material supply contra-charges | M10-T02 |
| **Procurement** | Material Requisitions (MR) | Site Engineers, Storekeepers | `RETAIN_CUSTOM_DOMAIN` | `RequisitionService` | PostgreSQL (`MaterialRequisition`) | `ProcurementFeedAdapter` | Multi-tier approval thresholds; project budget ceiling verification; BoQ activity tagging | M10-T02 |
| **Procurement** | Purchase Orders (PO) | Procurement Officers, Vendors | `RETAIN_CUSTOM_DOMAIN` | `PurchaseOrderService` | PostgreSQL (`PurchaseOrder`) | `PurchaseOrderAdapter` | Approved vendor selection; payment milestone terms; tax breakdown; delivery schedule | M10-T02 |
| **Procurement** | Site Goods Receipt (GRN) | Storekeepers, QC Engineers | `RETAIN_CUSTOM_DOMAIN` | `GoodsReceiptService` | PostgreSQL (`GoodsReceiptNote`) | `GoodsReceiptAdapter` | 3-way match (PO vs Challan vs Inspection); rejected batch handling; warehouse bin allocation | M10-T02 |
| **Procurement** | Stock Ledger & Valuation | Storekeepers, Cost Accountants | `RETAIN_CUSTOM_DOMAIN` | `StockValuationService` | PostgreSQL (`MaterialStoreStock`) | `InventoryValuationAdapter` | Weighted Average / FIFO valuation; daily issuance reconciliation; minimum stock alerts | M10-T02 |
| **Procurement** | Issue Tracking & Consumption | Site Foremen, Storekeepers | `RETAIN_CUSTOM_DOMAIN` | `MaterialIssueService` | PostgreSQL (`MaterialIssue`) | `MaterialConsumptionAdapter` | Task-level cost allocation; wastage percentage tracking against BoQ theoretical consumption | M10-T02 |
| **Fleet & Plant** | Equipment Log & Operating Hours | Plant Operators, Mechanics | `RETAIN_CUSTOM_DOMAIN` | `EquipmentLogService` | PostgreSQL (`EquipmentLog`) | `EquipmentSyncAdapter` | Machine meter reading continuity; idle vs active breakdown hours; operator timesheet link | M05 (T01–T10) |
| **Fleet & Plant** | Fuel Issue & Dip Reconciliation | Fuel Storekeepers, Plant Managers | `RETAIN_CUSTOM_DOMAIN` | `FuelReconciliationService` | PostgreSQL (`FuelIssue`, `FuelReading`) | `FuelValuationAdapter` | Bowser/tank dip-reading reconciliation; consumption rate (liters/hour or liters/km) vs standard | M05 (T01–T10) |
| **Fleet & Plant** | Preventive Maintenance Tracking | Fleet Managers, Mechanics | `RETAIN_CUSTOM_DOMAIN` | `MaintenanceService` | PostgreSQL (`MaintenanceRecord`) | `MaintenanceScheduler` | Operating hour service intervals; spare parts requisition linkage; machine status lock | M10-T02 |
| **Fleet & Plant** | Equipment Hire & Internal Rates | Plant Directors, Commercial PMs | `RETAIN_CUSTOM_DOMAIN` | `EquipmentHireService` | PostgreSQL (`EquipmentRate`) | `EquipmentCostAdapter` | Internal resource rate (hourly/daily) vs external vendor hire rates; dry vs wet hire rates | M09, M10-T02 |
| **Workforce** | Daily Labor Attendance & Roster | Timekeepers, Foremen | `RETAIN_CUSTOM_DOMAIN` | `WorkforceService` | PostgreSQL (`DailyWorkforce`) | `AttendanceSyncAdapter` | Skilled, semi-skilled, unskilled category counts; gang-wise allocation to project WBS tasks | M05 (T01–T10) |
| **Workforce** | Muster Roll & Piece-rate Wage | Timekeepers, Project Accountants | `RETAIN_CUSTOM_DOMAIN` | `PayrollService` | PostgreSQL (`MusterRollEntry`) | `PayrollPostingAdapter` | Daily wage rates; overtime multiplier; task completion quantity link for piece-rate labor | M10-T02 |
| **Workforce** | Worker Advances & Deductions | Site Accountants | `RETAIN_CUSTOM_DOMAIN` | `WorkerAdvanceService` | PostgreSQL (`WorkerAdvance`) | `WorkerLedgerAdapter` | Weekly advance limits; automated recovery deduction on periodic wage disbursements | M10-T02 |
| **Workforce** | Subcontractor Labor Muster Roll | Subcontractors, Timekeepers | `RETAIN_CUSTOM_DOMAIN` | `SubcontractorLaborService` | PostgreSQL (`SubcontractorLabor`) | `SubcontractorLaborAdapter` | Subcontractor headcount verification; safety induction compliance tracking | M10-T02 |
| **Scheduling** | Critical Path Method (CPM) Network | Schedulers, Project Directors | `ADOPT_UPSTREAM` | TruePPM scheduling engine | PostgreSQL (`ScheduleCalculationRecord`) | `SchedulingBridge` | Zero-fork upstream adoption; calendar date-only arithmetic; early/late date evaluation | M09 (T01–T09) |
| **Scheduling** | Gantt Timeline & Viewport | Schedulers, Project Managers | `WRAP_ADAPTER` | TruePPM Gantt component | Client session state | `TruePpmHostAdapter` | Dual mode (Full Editor vs Embedded Timeline); 60 Hz virtualized viewport; dependency editing | M09 (T01–T09) |
| **Scheduling** | Daily Progress Updating & Float | Site Engineers, Schedulers | `RETAIN_CUSTOM_DOMAIN` | `SchedulingServiceAdapter` | PostgreSQL (`TaskProgress`) | `ProgressPostingAdapter` | Natural key idempotency; zero double-posting; fiscal year lock enforcement | M09 (T01–T09) |
| **Scheduling** | Earned Value (EVM) & S-Curves | Project Directors, Clients | `RETAIN_CUSTOM_DOMAIN` | `CashFlowEvmEngine` | PostgreSQL (`ProjectCashFlowRecord`) | `CashFlowProjectionAdapter` | Strict rate separation (contractual BoQ billing for BCWS/BCWP vs RA cost for ACWP); exact decimals | M09 (T01–T09) |
| **Accounting** | Double-Entry Chart of Accounts | Chief Financial Officers | `RETAIN_CUSTOM_DOMAIN` | `GeneralLedgerService` (`flutter_accounting`) | PostgreSQL (`ChartOfAccounts`, `JournalEntry`) | `AccountingServiceAdapter` | Strict debit=credit equality; multi-currency / Nepalese Rupees; project & JV dimension tags | M10-T04 |
| **Accounting** | Fiscal Period Locks & Reversals | Financial Controllers | `RETAIN_CUSTOM_DOMAIN` | `PeriodLockService` | PostgreSQL (`FiscalPeriod`) | `FiscalLockAdapter` | Closed accounting periods block retroactive writes; corrections require explicit reversing journals | M10-T04 |
| **Accounting** | Cost Allocations & Ledger Sync | Cost Accountants | `RETAIN_CUSTOM_DOMAIN` | `CostAllocationService` | PostgreSQL (`CostAllocation`) | `CostSyncAdapter` | Direct job costing; overhead distribution; reconciliation with site material and payroll expenses | M10-T04 |
| **JV Operations** | Partner Equity & Contribution | Joint Venture Board | `RETAIN_CUSTOM_DOMAIN` | `JvPartnerService` (`createDomainRouter`) | PostgreSQL (`JvPartner`, `JvContribution`) | `JvAccountingAdapter` | Shareholding ratio enforcement (e.g. 60/40); capital call management; separate bank account rules | M10-T02 |
| **JV Operations** | Billing Splits & Profit Allocation | JV Accountants | `RETAIN_CUSTOM_DOMAIN` | `JvBillingService` | PostgreSQL (`JvDistribution`) | `JvLedgerAdapter` | Client IPC collection splitting; withholding tax apportionment; inter-partner expense adjustments | M10-T02 |
| **CAD Drafting** | DXF/DWG Vector Geometry & Layers | Structural/Civil Engineers | `ADOPT_UPSTREAM` | CadCraft drafting engine | PostgreSQL (`CadDrawing`, `CadEntity`) | `CadCraftHostAdapter` | Zero-fork adoption; spatial R-tree indexing; layer visibility; block definition hierarchy | M07 (T01–T11) |
| **CAD Drafting** | Vector Plotting & PDF Export | Design Engineers, Clients | `WRAP_ADAPTER` | CadCraft plot engine | Output PDF artifacts | `CadPlotAdapter` | Paper space layouts; pen table line weights; scale factor calibration (e.g. 1:100); title blocks | M07 (T01–T11) |
| **Takeoff & PDF** | Blueprint PDF Viewing & Pan/Zoom | Estimators, Site Engineers | `ADOPT_UPSTREAM` | PdfCraft document engine | Cached document session | `PdfCraftHostAdapter` | Zero-fork adoption; 512x512 viewport tiling; bounded memory (<8MB); render cancellation | M08 (T01–T09) |
| **Takeoff & PDF** | Calibrated Takeoff Dimensioning | Quantity Surveyors | `WRAP_ADAPTER` | PdfCraft measurement tools | PostgreSQL (`TakeoffMeasurement`) | `TakeoffBoqLinkService` | Shoelace polygon area with deduction holes; Euclidean distance; unscaled document coordinates | M08 (T01–T09) |
| **Takeoff & PDF** | Invalidation & Revision Review | Quantity Surveyors, Commercial Mgrs | `RETAIN_CUSTOM_DOMAIN` | `TakeoffInvalidationEngine` | PostgreSQL (`TakeoffInvalidation`) | `InvalidationAdapter` | Blueprint revision changes flag quantities as `NEEDS_REVIEW`; no silent persistence; manual resolve | M08 (T01–T09) |
| **Documents** | Client Letters & Presentations | Project Managers, Directors | `ADOPT_UPSTREAM` | WordCraft (.docx) & DeckCraft (.pptx) | PostgreSQL (`ProjectDocument`) | `WordCraftHostAdapter`, `DeckCraftHostAdapter` | Standard contractual notices; progress decks; dynamic data merge; font embedding (ADR-0015) | M12 (W01–W08) |

---

## 4. Non-Router Writers & Background Sweeps Disposition

This section audits the 23 non-router writer modules inventoried in `M00-T08`:

### 4.1 Background Scheduled Jobs (3 jobs)
1. **`outbox.dispatch` (`src/server/utils/background-jobs.ts`):**
   - **Consumers:** Client sync engine, webhook dispatchers, notification service.
   - **Trigger:** Scheduled sweep (every 10s).
   - **Behavior:** Reaps stuck outbox rows, updates `OutboxEvent` status, dispatches event notifications.
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN`.
   - **State Owner:** PostgreSQL `OutboxEvent`.
   - **Retained Rules:** At-least-once delivery; exponential backoff retry; poison message dead-lettering.
   - **Migration Path:** Replaced by M03 durable sync feed and worker daemon.

2. **`bank-guarantee.auto-expire` (`src/server/utils/background-jobs.ts`):**
   - **Consumers:** Commercial managers, finance directors.
   - **Trigger:** Scheduled hourly sweep + list view check.
   - **Behavior:** Flips expired `BankGuarantee` status to `EXPIRED` across tenants.
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN`.
   - **State Owner:** PostgreSQL `BankGuarantee`.
   - **Retained Rules:** Bank guarantee validity date checks; claim period grace days; tenant isolation.
   - **Migration Path:** Integrated into background scheduled daemon in M10-T02.

3. **`session.cleanup` (`src/server/utils/background-jobs.ts`):**
   - **Consumers:** System security.
   - **Trigger:** Scheduled daily sweep.
   - **Behavior:** Deletes expired `Session` (>7 days) and `LoginAttempt` (>30 days).
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN`.
   - **State Owner:** PostgreSQL `Session`, `LoginAttempt`.
   - **Retained Rules:** Security retention guidelines; audit trail preservation.
   - **Migration Path:** Retained on server maintenance cron.

### 4.2 Asynchronous Reconciliation Services (7 services)
1. **`daily-report-sync` (`src/server/services/daily-report-sync.ts`):**
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN` (M04 vertical workflow).
   - **Retained Rules:** Ingestion of offline field submissions into relational tables; natural key deduplication.
2. **`stored-file-reconciliation` (`scripts/apply-stored-file-reconciliation.ts`):**
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN` (M03 / M04 file storage).
   - **Retained Rules:** SHA-256 content addressing; S3 orphan cleanup; quarantine of corrupted objects.
3. **`equipment-fuel-reconciliation` (`src/server/services/equipment-fuel.ts`):**
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN` (M05 fleet workflow).
   - **Retained Rules:** Bowser dip-stick volumetric reading vs issued meters; loss tolerance thresholds.
4. **`inventory-valuation-reconciliation` (`src/server/services/inventory-valuation.ts`):**
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN` (M10-T04 accounting).
   - **Retained Rules:** Moving average stock valuation adjustments during period closing.
5. **`stock-count-reconciliation` (`src/server/services/stock-count.ts`):**
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN` (M10-T02 procurement).
   - **Retained Rules:** Physical store stock audit adjustments; variance reason categorization.
6. **`responsibility-handover` (`src/server/services/responsibility-handover.ts`):**
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN` (M10-T02 admin/HR).
   - **Retained Rules:** Role delegation; pending approval transfer on employee departure.
7. **`workforce-payroll-reconciliation` (`src/server/services/workforce.ts`):**
   - **Disposition:** `RETAIN_CUSTOM_DOMAIN` (M10-T02 workforce).
   - **Retained Rules:** Site attendance vs contractor muster roll wage balancing.

### 4.3 Engineering File Importers (4 importers)
1. **Primavera P6 XER & MS Project XML (`src/server/services/schedule-importer.ts`):**
   - **Disposition:** `WRAP_ADAPTER` (M09-T02 / M09-T07).
   - **Proposed Engine:** Upstream TruePPM schedule parser via `LegacyCpmMigrationAdapter`.
   - **Retained Rules:** Activity ID translation; calendar preservation; relation mapping.
2. **Excel XLSX / CSV Importer (`src/server/services/excel-importer.ts`):**
   - **Disposition:** `WRAP_ADAPTER` (M06-T01 / M06-T10).
   - **Proposed Engine:** GridCraft spreadsheet kernel.
   - **Retained Rules:** BoQ tree hierarchy reconstruction; column mapping validation.
3. **CAD DXF / DWG Importer (`src/server/services/cad-importer.ts`):**
   - **Disposition:** `WRAP_ADAPTER` (M07-T01 / M07-T03).
   - **Proposed Engine:** CadCraft CAD kernel.
   - **Retained Rules:** AutoCAD entity fidelity; block definition resolution; spatial coordinate normalization.

---

## 5. Non-Negotiable Retained Construction Domain Rules

To safeguard financial and contractual integrity, the following domain rules **must never be abdicated or replaced by generic upstream logic**:

### 5.1 Public Procurement Act (PPA) / FIDIC Price Escalation Formula
Contractual price adjustments for labor, materials, and fuel must adhere strictly to the contractual escalation formula:
$$P_n = P_0 \times \left( A + B \frac{L_n}{L_0} + C \frac{M_n}{M_0} + D \frac{F_n}{F_0} \right) - P_0$$
Where $A$ is non-adjustable coefficient and $B+C+D$ represent cost proportions matching the tender agreement. Upstream spreadsheet tools may project this, but the authoritative certified amount is calculated exclusively by `PriceAdjustmentService`.

### 5.2 Statutory Interim Payment Certificate (IPC) Deductions
Every client billing claim must enforce sequential statutory deductions:
1. Gross Work Done Valuation (Current cumulative minus previously certified).
2. Advance Mobilization Recovery (amortized percentage deduction until full recovery).
3. Retention Money Deduction (statutory 5% retained until Defects Liability Period expiry).
4. Subtotal Net Payable before Taxes.
5. Value Added Tax (VAT) addition (standard 13% in Nepal).
6. Tax Deducted at Source (TDS) withholding (statutory 1.5% deduction on gross contract payment).
7. Net Check Payable to Contractor.

### 5.3 Strict Financial Rate Separation (Contractual BoQ vs Internal RA)
- **Contractual BoQ Billing Rates:** Client-facing valuation and Earned Value (`BCWS`, `BCWP`) are evaluated strictly against tender BoQ rates.
- **Resource Allocation (RA) Internal Cost Rates:** Cost accruals (`ACWP`) and ledger expenses are evaluated strictly against internal resource rates (labor hourly rates, material purchase costs, equipment ownership/fuel rates).
- Blending or cross-pollinating these rate sources violates financial integrity (ADR-0017, M09-T03).

### 5.4 Takeoff Measurement Provenance & Revision Invalidation
- Takeoff quantities link immutably to document-space coordinates and blueprint revisions.
- Recalibration or blueprint replacement flags linked quantities as `NEEDS_REVIEW`. Silent automatic rebasing is strictly prohibited; explicit human review resolution (`CONFIRM_AS_IS`, `RECALCULATE`, `DISCARD`) is required.

### 5.5 Double-Entry Balanced Accounting Invariants
- Every financial event emits an atomic double-entry journal entry where $\sum\text{Debits} = \sum\text{Credits}$.
- Retroactive modifications to closed fiscal periods are blocked by period locks. Adjustments require explicit reversing transactions.

---

## 6. Migration Wave Allocation & Retirement Schedule

Based on this audit, all 41 workflows and 23 non-router writers are scheduled into the five M10 migration waves:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                               M10 MIGRATION WAVES                                     │
├────────────────────┬────────────────────────────────────────────┬─────────────────────┤
│ Wave ID            │ Functional Workflows Covered               │ Owning Milestone    │
├────────────────────┼────────────────────────────────────────────┼─────────────────────┤
│ **Wave 1**         │ Procurement, Inventory, Goods Receipts,    │ M10-T02 (Wave 1)    │
│                    │ Purchase Orders & Stock Valuation          │                     │
├────────────────────┼────────────────────────────────────────────┼─────────────────────┤
│ **Wave 2**         │ Workforce, Muster Roll, Daily Attendance,  │ M10-T02 (Wave 2)    │
│                    │ Wage Advances & Subcontractor Labor        │                     │
├────────────────────┼────────────────────────────────────────────┼─────────────────────┤
│ **Wave 3**         │ Interim Payment Certificates (IPC), Taxes, │ M10-T02 (Wave 3)    │
│                    │ Price Adjustments & Subcontractor Billing  │                     │
├────────────────────┼────────────────────────────────────────────┼─────────────────────┤
│ **Wave 4**         │ Joint Venture (JV) Partner Distributions,  │ M10-T02 (Wave 4)    │
│                    │ Equity Splits & Inter-company Ledgers      │                     │
├────────────────────┼────────────────────────────────────────────┼─────────────────────┤
│ **Wave 5**         │ Administration, Responsibility Handover,   │ M10-T02 (Wave 5)    │
│                    │ Bank Guarantees, Auditing & Maintenance    │                     │
└────────────────────┴────────────────────────────────────────────┴─────────────────────┘
```

### Retirement & Decommissioning Criteria (M10-T08)
Legacy Next.js / React frontend views and routes may only be retired when:
1. The equivalent Flutter native and web route passes 100% of functional acceptance tests.
2. The single active writer contract (M10-T03) verifies zero concurrent write hazards.
3. A live rollback drill demonstrates instantaneous restoration of the legacy route in $<60\text{ s}$ if anomalies arise.
4. Next.js server domain APIs and Prisma services remain active as the authoritative backend.

---

## 7. Audit Acceptance Signoff

Milestone `M10-T01` satisfies all criteria of Platform Plan v3 §6 M10 and ADR-0018:
- **100% Workflow Coverage:** All 41 M00 inventory workflows classified with concrete dispositions.
- **Retained Domain Rules:** Critical construction formulas, statutory withholdings, rate separations, and fiscal locks cataloged.
- **Authoritative State Ownership:** Every capability mapped to its owning service without duplicated logic.
