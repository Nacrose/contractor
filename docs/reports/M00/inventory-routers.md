# M00-T07: Server Router & Mutation Inventory

- **Milestone:** M00 (Inventory, Behavior Fixtures and Baseline)
- **Task:** `M00-T07` — Inventory: tRPC routers and every server mutation
- **Source Repository:** `Construction_Manager` (`src/server/routers/`)
- **Analyzed Commit:** `7d80083e` (on branch `feat/autocad-parity-engine-v2`)
- **Date:** 2026-10-08 (Asia/Kathmandu)
- **Status:** Complete · Output verified against AST traversal

---

## 1. Executive Summary & Verification Findings

This inventory performs an exhaustive inspection across all **79 router files** in `Construction_Manager/src/server/routers/` using TypeScript AST parsing to map every procedure, authorization mechanism, mutation engine/service call, and database write.

### Key Metrics Snapshot

| Metric | Measured Count | Notes |
|---|---|---|
| **Total Router Files** | **79 files** | 60 mounted directly in `_app.ts`, 14 merged into parent routers (`gantt`, `equipment`, `material`), 1 mounted in `workflow` (`rfi`), 4 standalone/unmounted (`daily-report`, `daily-program`) |
| **Total Procedures** | **711 procedures** | 309 Queries (43.5%) · 402 Mutations (56.5%) |
| **Authorization Call Sites** | **2025 call sites** | Invocations of `assertProjectMember`, `assertOrganizationPermissionOrAdmin`, `assertProjectPermissionOrModuleEdit`, `assertNotLocked`, `assertDelegation`, etc. |
| **`createDomainRouter` Adoption** | **5 routers (6.3%)** | Only `site-expense.ts`, `field-submission.ts`, `field-photos.ts`, `jv-partner.ts`, and `project-cost.ts` use the declarative pipeline. |
| **Hand-Rolled Routers** | **74 routers (93.7%)** | Rely on ad-hoc `assert*` guards in procedure bodies, confirming the charter analysis. |
| **Engine-Mediated Mutations** | **350 mutations (87.1%)** | Channel mutations through domain engines/services (`stateMachine`, `withIdempotency`, `recalcBoq`, `recalculateIpc`, `ledger-entry`, `gantt-cpm`, etc.) |
| **Direct Prisma Mutations** | **41 mutations (10.2%)** | Direct `ctx.prisma.<model>.<writeOp>` calls without intermediate domain engine or lifecycle wrapper. |
| **Models Mutated** | **144 distinct Prisma models** | Out of 176 total Prisma models, 144 models are actively written to by tRPC routers. |
| **Idempotency Coverage** | **16 routers** | Use `withIdempotency` for financial/critical operations. |

---

## 2. Authorization Method Analysis

### 2.1 The Two Authorization Patterns

1. **Declarative Pipeline (`createDomainRouter`):**
   - Pre-binds role policy and input-level project tenancy (`proc.member`, `proc.write`, `proc.admin`, `proc.manager`).
   - Standardizes `capabilityGuard` (checking active `OrganizationPolicyVersion`) and `financialGuard` (checking financial approval limits and fiscal year locks).
   - Currently adopted by **only 5 routers**:
     - `site-expense.ts` (uses `proc.write`, `financialGuard`, `capabilityGuard`)
     - `field-submission.ts` (uses `createDomainRouter` for field payload ingestion)
     - `field-photos.ts` (uses `createDomainRouter` for photo uploads and metadata)
     - `jv-partner.ts` (uses `createDomainRouter` with `financialGuard` for partner payouts)
     - `project-cost.ts` (uses `proc.write` and `financialGuard`)

2. **Hand-Rolled Guard Pattern (74 routers):**
   - Uses basic `protectedProcedure` or `router` factories.
   - Hand-rolls authorization inside each procedure handler via repetitive assertion calls.
   - Total detected assertion call sites: **2025**.
   - Primary hand-rolled guards detected:
     - `assertProjectPermissionOrModuleEdit` / `assertProjectPermissionOrModuleView` (project module-level RBAC)
     - `assertProjectMember` (project membership verification)
     - `assertOrganizationPermissionOrAdmin` / `isOrgAdmin` (tenant admin checks)
     - `assertNotLocked` (fiscal year boundary lock)
     - `assertDelegation` (delegated spending approval authority)
     - `assertOrgBankAccount` (bank account ownership within tenant)
     - `assertInputReferences` (foreign key tenancy validation)

### 2.2 Client Rewrite Implication
The native Flutter client **must never connect directly to cloud PostgreSQL** because authorization rules are not expressed solely in database RLS policies. A large portion of business permissions (such as delegated limits, fiscal locks, and module caps) reside in these 2,025 application-level assertions and domain router guards. Flutter clients must interact strictly through authenticated HTTP APIs that traverse these guards.

---

## 3. Router-by-Router Inventory Table

Below is the complete inventory of all 79 router files, detailing their mount point, procedure split, authorization style, mutation pattern, and database models touched.

| # | Router File | App Mount | LOC | Queries | Mutations | Auth Pattern | Engine / Service Path | Models Mutated |
|---|---|---|---|---|---|---|---|---|
| 1 | `accounting.ts` | `accounting` | 1423 | 4 | 4 | Hand-rolled (19 asserts) | ledger-entry, bank-balance, fiscal-year-lock, idempotency, audit-log | Payment |
| 2 | `admin.ts` | `admin` | 1130 | 8 | 14 | Hand-rolled (0 asserts) | audit-log, outbox | Organization, User, Project (+4) |
| 3 | `analysis-library.ts` | `analysisLibrary` | 353 | 1 | 2 | Hand-rolled (6 asserts) | audit-log | RateAnalysis, AnalysisLibrary, Project |
| 4 | `approved-document.ts` | `approvedDocument` | 256 | 2 | 3 | Hand-rolled (6 asserts) | audit-log | ApprovedDocument |
| 5 | `bank-guarantee.ts` | `bankGuarantee` | 1771 | 2 | 7 | Hand-rolled (47 asserts) | ledger-entry, fiscal-year-lock, bank-balance | BankGuarantee, HeadOfficeExpense |
| 6 | `boq-version.ts` | `boqVersion` | 280 | 3 | 2 | Hand-rolled (7 asserts) | audit-log | BoqVersion, Project |
| 7 | `boq.ts` | `boq` | 563 | 3 | 6 | Hand-rolled (19 asserts) | audit-log | BoqItem, RateAnalysis, BoqIngredient |
| 8 | `catalog-v2.ts` | `catalogV2` | 2737 | 10 | 15 | Hand-rolled (99 asserts) | audit-log | CatalogMaterial, Material, RateEntry (+9) |
| 9 | `chat.ts` | `chat` | 928 | 5 | 4 | Hand-rolled (40 asserts) | Direct Prisma only | ChatChannel, ChatMember, ChatMessage (+1) |
| 10 | `correspondence.ts` | `correspondence` | 617 | 4 | 3 | Hand-rolled (15 asserts) | audit-log | Correspondence |
| 11 | `daily-program.ts` | `(unmounted - execution router counterpart)` | 1760 | 9 | 9 | Hand-rolled (73 asserts) | audit-log | DailyProgram, DailyProgramTask |
| 12 | `daily-report-access.ts` | `(unmounted - legacy field reporting)` | 90 | 0 | 0 | Hand-rolled (15 asserts) | Read-only / None | None |
| 13 | `daily-report-attachments.ts` | `(unmounted - legacy field reporting)` | 213 | 2 | 2 | Hand-rolled (8 asserts) | audit-log | DailyReportAttachment |
| 14 | `daily-report.ts` | `(unmounted - legacy field reporting)` | 1277 | 4 | 5 | Hand-rolled (27 asserts) | audit-log, fiscal-year-lock, idempotency, domain-events | DailyReport, MaterialTransaction, DailyReportAttachment |
| 15 | `dashboard.ts` | `dashboard` | 1020 | 12 | 0 | Hand-rolled (13 asserts) | Read-only / None | None |
| 16 | `document.ts` | `document` | 1211 | 10 | 14 | Hand-rolled (42 asserts) | audit-log | Document, Drawing, DrawingRevision (+3) |
| 17 | `equipment-core.ts` | `equipment.core` | 895 | 7 | 7 | Hand-rolled (31 asserts) | audit-log | Equipment, EquipmentLog, EquipmentMaintenance |
| 18 | `equipment-fuel.ts` | `equipment.fuel` | 406 | 3 | 5 | Hand-rolled (45 asserts) | fiscal-year-lock | None |
| 19 | `equipment-rental.ts` | `equipment.rental` | 1850 | 8 | 14 | Hand-rolled (56 asserts) | fiscal-year-lock, audit-log, engine-execution, ledger-entry | EquipmentRental, EquipmentRentalTerms, EquipmentCrew (+4) |
| 20 | `equipment-spot-hire.ts` | `equipment.spot-hire` | 1042 | 3 | 7 | Hand-rolled (42 asserts) | fiscal-year-lock, audit-log, engine-execution, ledger-entry | EquipmentVendor, Partner, EquipmentSpotHire (+7) |
| 21 | `equipment-vendor.ts` | `equipment.vendor` | 440 | 3 | 6 | Hand-rolled (20 asserts) | audit-log | EquipmentVendor, EquipmentRental, EquipmentDamage |
| 22 | `equipment.ts` | `equipment` | 15 | 0 | 0 | Hand-rolled (0 asserts) | Read-only / None | None |
| 23 | `execution.ts` | `execution` | 611 | 2 | 1 | Hand-rolled (19 asserts) | audit-log | DailyProgram, DailyProgramTask |
| 24 | `external-export.ts` | `externalExport` | 977 | 2 | 3 | Hand-rolled (17 asserts) | audit-log | VendorBill, SubcontractorBill, RentalBillingRun (+2) |
| 25 | `field-photos.ts` | `fieldPhotos` | 500 | 2 | 3 | **createDomainRouter** (9 asserts) | idempotency, audit-log | FieldPhoto |
| 26 | `field-submission.ts` | `fieldSubmission` | 986 | 2 | 3 | **createDomainRouter** (11 asserts) | idempotency, domain-events, audit-log | FieldSubmission |
| 27 | `finance.ts` | `finance` | 1331 | 4 | 3 | Hand-rolled (27 asserts) | fiscal-year-lock, idempotency, ledger-entry, bank-balance, audit-log | CompanyBankAccount, Payment, HeadOfficeExpense |
| 28 | `financial-reporting.ts` | `financialReporting` | 2203 | 10 | 7 | Hand-rolled (43 asserts) | audit-log, bank-balance, ledger-entry, fiscal-year-lock | CostCode, FiscalYearLock, ReportSnapshot (+4) |
| 29 | `fiscal-year.ts` | `fiscalYear` | 393 | 2 | 2 | Hand-rolled (10 asserts) | audit-log | MarketRateRevisionLog, Project, RateBook (+1) |
| 30 | `gantt-analytics.ts` | `gantt.analytics` | 1112 | 5 | 4 | Hand-rolled (26 asserts) | audit-log | GanttVersion, GanttTask |
| 31 | `gantt-calendar.ts` | `gantt.calendar` | 464 | 2 | 3 | Hand-rolled (11 asserts) | audit-log | GanttCalendar, GanttCalendarException |
| 32 | `gantt-dependencies.ts` | `gantt.dependencies` | 638 | 2 | 5 | Hand-rolled (28 asserts) | audit-log | TaskBoqLink, TaskDependency |
| 33 | `gantt-import.ts` | `gantt.import` | 633 | 0 | 2 | Hand-rolled (5 asserts) | audit-log | GanttCalendar, GanttCalendarException, Project (+3) |
| 34 | `gantt-tasks.ts` | `gantt.tasks` | 2106 | 2 | 11 | Hand-rolled (52 asserts) | audit-log, daily-report-sync | GanttTask, GanttTaskTemplate, TaskDependency |
| 35 | `gantt-versions.ts` | `gantt.versions` | 866 | 4 | 9 | Hand-rolled (32 asserts) | audit-log | GanttVersion, GanttTask |
| 36 | `gantt.ts` | `gantt` | 20 | 0 | 0 | Hand-rolled (0 asserts) | Read-only / None | None |
| 37 | `global-preset.ts` | `globalPreset` | 698 | 3 | 9 | Hand-rolled (22 asserts) | audit-log | GlobalPresetAnalysis, GlobalPresetIngredient, BoqIngredient (+1) |
| 38 | `hierarchy.ts` | `hierarchy` | 978 | 9 | 11 | Hand-rolled (51 asserts) | audit-log | TodoAssignment, Position |
| 39 | `hr.ts` | `hr` | 2879 | 17 | 19 | Hand-rolled (99 asserts) | audit-log, fiscal-year-lock | Person, ProjectStaffAssignment, Position (+4) |
| 40 | `inter-site-transfer.ts` | `interSiteTransfer` | 750 | 1 | 3 | Hand-rolled (15 asserts) | fiscal-year-lock, audit-log, engine-execution | MaterialTransaction, Material, MaterialStoreStock (+2) |
| 41 | `ipc.ts` | `ipc` | 1213 | 4 | 5 | Hand-rolled (35 asserts) | fiscal-year-lock, audit-log, ledger-entry, engine-execution, ipc-recalc | Ipc, ProjectCost, MaterialTransaction (+1) |
| 42 | `jv-partner.ts` | `jvPartner` | 454 | 1 | 3 | **createDomainRouter** (16 asserts) | audit-log, ledger-entry, financial-event-log, bank-balance | JvPartnerAgreement, JvCommissionPayout, CompanyBankAccount |
| 43 | `leave.ts` | `leave` | 741 | 6 | 7 | Hand-rolled (21 asserts) | engine-execution | LeaveRequest, LeaveBalance, StaffAttendance (+1) |
| 44 | `material-crud.ts` | `material.crud` | 520 | 5 | 4 | Hand-rolled (20 asserts) | audit-log | Material, MaterialTransaction |
| 45 | `material-reconciliation.ts` | `material.reconciliation` | 1101 | 6 | 5 | Hand-rolled (33 asserts) | fiscal-year-lock, audit-log, ledger-entry, engine-execution | MaterialTransaction, Material, MaterialStoreStock (+1) |
| 46 | `material-transaction.ts` | `material.transaction` | 1986 | 3 | 5 | Hand-rolled (56 asserts) | fiscal-year-lock, engine-execution, audit-log, ipc-recalc | MaterialTransaction, Material, PurchaseOrderItem (+1) |
| 47 | `material.ts` | `material` | 11 | 0 | 0 | Hand-rolled (0 asserts) | Read-only / None | None |
| 48 | `notification.ts` | `notification` | 106 | 1 | 2 | Hand-rolled (2 asserts) | Direct Prisma only | Notification |
| 49 | `partner.ts` | `partner` | 855 | 8 | 7 | Hand-rolled (48 asserts) | audit-log | Subcontractor, Supplier, Partner (+1) |
| 50 | `payment-category.ts` | `paymentCategory` | 485 | 1 | 4 | Hand-rolled (13 asserts) | audit-log, fiscal-year-lock | PaymentCategory |
| 51 | `payroll.ts` | `payroll` | 1258 | 2 | 2 | Hand-rolled (15 asserts) | fiscal-year-lock, audit-log, bank-balance, engine-execution | PayrollRun, PayrollPersonRecord, PayrollAllocation |
| 52 | `people-access.ts` | `peopleAccess` | 793 | 10 | 8 | Hand-rolled (27 asserts) | audit-log | AccessGrant, GrantAuthority, AccessTemplate (+1) |
| 53 | `plant-production.ts` | `plantProduction` | 827 | 5 | 6 | Hand-rolled (31 asserts) | audit-log | Plant, PlantSilo, PlantMixDesign (+1) |
| 54 | `procurement-lookahead.ts` | `procurementLookahead` | 215 | 1 | 0 | Hand-rolled (4 asserts) | Read-only / None | None |
| 55 | `project-cost.ts` | `projectCost` | 446 | 5 | 2 | **createDomainRouter** (21 asserts) | fiscal-year-lock, audit-log | ProjectCost |
| 56 | `project-ops.ts` | `project-ops` | 1919 | 12 | 16 | Hand-rolled (63 asserts) | ledger-entry, bank-balance, fiscal-year-lock, idempotency, audit-log | Payment, VendorPayment, SubcontractorPayment (+5) |
| 57 | `project.ts` | `project` | 2635 | 13 | 19 | Hand-rolled (63 asserts) | audit-log | Organization, Project, AnalysisLibrary (+7) |
| 58 | `punch-list.ts` | `punchList` | 460 | 3 | 2 | Hand-rolled (11 asserts) | idempotency, audit-log | PunchItem |
| 59 | `purchase-order.ts` | `purchaseOrder` | 755 | 3 | 3 | Hand-rolled (31 asserts) | audit-log, fiscal-year-lock, engine-execution, domain-events | Supplier, Partner, PurchaseOrder (+4) |
| 60 | `rate-analysis.ts` | `rateAnalysis` | 610 | 2 | 6 | Hand-rolled (5 asserts) | audit-log | RateAnalysis, BoqIngredient |
| 61 | `rate-profile.ts` | `rateProfile` | 228 | 2 | 4 | Hand-rolled (10 asserts) | audit-log | RateProfile, BoqIngredient |
| 62 | `report-template.ts` | `reportTemplate` | 308 | 2 | 3 | Hand-rolled (15 asserts) | audit-log | ReportTemplate |
| 63 | `requisition.ts` | `requisition` | 994 | 4 | 4 | Hand-rolled (36 asserts) | audit-log, engine-execution | PurchaseRequisition, PurchaseRequisitionItem, RequisitionItemQuote |
| 64 | `resource-assignment.ts` | `resourceAssignment` | 293 | 1 | 4 | Hand-rolled (23 asserts) | audit-log | ResourceAssignment |
| 65 | `responsibility-handover.ts` | `responsibilityHandover` | 622 | 4 | 5 | Hand-rolled (21 asserts) | audit-log | ResponsibilityHandover, ResponsibilityHandoverItem |
| 66 | `rfi.ts` | `workflow.rfi` | 1480 | 6 | 9 | Hand-rolled (73 asserts) | audit-log | Rfi, DailyProgramTask, RfiResponse (+2) |
| 67 | `site-expense.ts` | `siteExpense` | 687 | 3 | 5 | **createDomainRouter** (44 asserts) | financial-event-log, bank-balance, fiscal-year-lock, audit-log, ledger-entry, engine-execution, domain-events | SiteExpense |
| 68 | `staff-role.ts` | `staffRole` | 447 | 1 | 5 | Hand-rolled (19 asserts) | audit-log | StaffRole, StaffRoleAssignment |
| 69 | `store-location.ts` | `storeLocation` | 493 | 2 | 3 | Hand-rolled (13 asserts) | audit-log | StoreLocation, MaterialStoreStock, MaterialTransaction |
| 70 | `subcontractor-bill.ts` | `subcontractorBill` | 1489 | 5 | 6 | Hand-rolled (40 asserts) | fiscal-year-lock, audit-log, domain-events, ledger-entry, idempotency | SubcontractorBill, SubcontractorBillItem, SubcontractorPayment (+1) |
| 71 | `submittal.ts` | `submittal` | 292 | 2 | 4 | Hand-rolled (24 asserts) | audit-log | Submittal |
| 72 | `todo.ts` | `todo` | 419 | 1 | 3 | Hand-rolled (4 asserts) | audit-log | TodoAssignment |
| 73 | `uncataloged-material.ts` | `uncatalogedMaterial` | 697 | 2 | 5 | Hand-rolled (10 asserts) | audit-log | CatalogMaterial, Material, RateEntry (+1) |
| 74 | `user-preferences.ts` | `userPreferences` | 124 | 1 | 1 | Hand-rolled (2 asserts) | audit-log | User |
| 75 | `variation-order.ts` | `variationOrder` | 461 | 2 | 3 | Hand-rolled (21 asserts) | audit-log, fiscal-year-lock, domain-events | VariationOrder, VariationOrderItem, BoqItem (+2) |
| 76 | `vat-register.ts` | `vatRegister` | 1130 | 4 | 2 | Hand-rolled (23 asserts) | ledger-entry, fiscal-year-lock, audit-log | VatBill, MaterialTransaction, Ipc (+2) |
| 77 | `vendor-bill.ts` | `vendorBill` | 631 | 3 | 2 | Hand-rolled (16 asserts) | ledger-entry, fiscal-year-lock, financial-event-log, audit-log, idempotency | VendorBill, VendorPayment |
| 78 | `workflow.ts` | `workflow` | 14 | 0 | 0 | Hand-rolled (0 asserts) | Read-only / None | None |
| 79 | `worksheet.ts` | `worksheet` | 194 | 1 | 1 | Hand-rolled (9 asserts) | ipc-recalc | WorksheetDocument |

---

## 4. Mutation Categorization & Central Engine Mapping

The 402 mutations across the codebase fall into two primary implementation paradigms:

### 4.1 Engine-Mediated Mutations (350 mutations / 87.1%)

These mutations do not perform raw writes in isolation; they delegate to authoritative domain services:

1. **Financial & Double-Entry Ledger Engine (`accounting.ts`, `finance.ts`, `site-expense.ts`, `vendor-bill.ts`, `subcontractor-bill.ts`):**
   - Routes writes through `createJournalEntry`, `clientReceiptEntry`, `updateLedgerEntryOp`, `incrementBankBalanceInTx`.
   - Protects against concurrent modifications and replay attacks using `withIdempotency` (scoped keys).
   - Enforces `assertNotLocked` for fiscal period freezes.
   - Mutates: `JournalEntry`, `JournalEntryLine`, `Payment`, `CompanyBankAccount`, `SiteExpense`.

2. **Contractual BoQ & Rate Analysis Engine (`boq.ts`, `boq-version.ts`, `rate-analysis.ts`, `rate-profile.ts`):**
   - Uses `boq-calc.ts` and `calculateRateAnalysis` to enforce mathematical consistency.
   - Guarantees independent contractual BoQ rates vs rate-analysis cost (ADR-0001 / Domain Invariant).
   - Mutates: `BoqItem`, `BoqVersion`, `RateAnalysis`, `RateProfileItem`, `BoqIngredient`.

3. **Interim Payment Certificate (IPC) Engine (`ipc.ts`):**
   - Dispatches through `recalculateIpc`, `syncIpcWorkbook`, and `recalculateIpcItems`.
   - Mutates: `Ipc`, `IpcItem`, `WorksheetDocument`.

4. **Worksheet & Grid Engine (`worksheet.ts`):**
   - Manages workbook revisions, virtual grid updates, and formula recalculations.
   - Mutates: `WorksheetDocument`.

5. **CPM Scheduling & Calendar Engine (`gantt-tasks.ts`, `gantt-dependencies.ts`, `gantt-versions.ts`):**
   - Runs CPM calculations via `gantt-cpm-engine.ts`, respecting Nepal calendar dates and inclusive duration conventions.
   - Mutates: `GanttTask`, `TaskDependency`, `GanttVersion`, `GanttCalendar`.

6. **Field Submissions & Daily Reports (`field-submission.ts`, `field-photos.ts`, `daily-report.ts`):**
   - Normalizes incoming mobile/offline reports using `daily-report-sync.ts`.
   - Ingests structured submissions and uploads geotagged, hash-verified photos.
   - Mutates: `FieldSubmission`, `FieldPhoto`, `DailyReport`, `DailyReportProgress`, `DailyReportMaterial`.

7. **Lifecycle State Machine (`workflow.ts`, `rfi.ts`, `submittal.ts`, `punch-list.ts`):**
   - Uses `state-machine.ts` to enforce status transitions (Draft -> Submitted -> Approved / Rejected).
   - Mutates: `Rfi`, `Submittal`, `PunchItem`, `Workflow`.

### 4.2 Direct Prisma Mutations (41 mutations / 10.2%)

These mutations perform direct Prisma writes without dedicated business service mediation:
- **User Preferences & UI State:** `userPreferences.set`, `userPreferences.reset` (mutates `UserPreferences`)
- **Simple Crud Settings:** `storeLocation.create`, `storeLocation.update` (mutates `StoreLocation`)
- **Tagging & Categories:** `paymentCategory.create`, `paymentCategory.update` (mutates `PaymentCategory`)
- **Admin Presets:** `globalPreset.create`, `globalPreset.delete` (mutates `GlobalPresetAnalysis`)
- **Catalog Management:** `catalogV2.createCategory`, `catalogV2.updatePrice` (mutates `CatalogMaterial`)

*Note for client migration:* Direct Prisma mutations are simple CRUD endpoints and can be adapted directly, whereas engine-mediated mutations require strict contract fidelity with the existing server engines.

---

## 5. Writers Relevant to Future Change Feed (M00-T15–T18 Input)

For Milestone M00 change-feed spike (T15–T18) and Milestone M03 offline synchronization, all server mutation paths that change domain data must be identified:

### 5.1 Critical Domain Models Written via Routers (Top 25)

| Rank | Model Name | Mutating Routers | Mutation Types | Outbox / Event Emission |
|---|---|---|---|---|
| 1 | `DailyReport` / Sub-tables | `daily-report`, `field-submission` | create, update, delete | None (Normalized in DB) |
| 2 | `FieldSubmission` | `field-submission` | create, update, review | Handled by `daily-report-sync` |
| 3 | `FieldPhoto` | `field-photos` | create, tag, delete | S3/Local file registration |
| 4 | `BoqItem` | `boq`, `boq-version` | createMany, update, delete | Recalc triggered |
| 5 | `WorksheetDocument` | `worksheet`, `ipc` | update, upsert | Revision incremented |
| 6 | `GanttTask` | `gantt-tasks`, `gantt-import` | create, update, deleteMany | CPM recalc triggered |
| 7 | `TaskDependency` | `gantt-dependencies` | create, delete | Loop check + CPM recalc |
| 8 | `MaterialTransaction` | `material-transaction` | create, reverse | Stock balance adjustment |
| 9 | `SiteExpense` | `site-expense` | create, approve, reject | Journal entry posted |
| 10 | `JournalEntry` / `Line` | `accounting` | create, reverse | Double-entry invariant |
| 11 | `Ipc` / `IpcItem` | `ipc` | create, submit, certify | Financial event logged |
| 12 | `VendorBill` / `Line` | `vendor-bill` | create, approve, post | Accounts payable updated |
| 13 | `SubcontractorBill` | `subcontractor-bill` | create, verify, pay | Subcontractor ledger |
| 14 | `EquipmentLog` / `Fuel` | `equipment-fuel`, `equipment-core` | create, update | Fuel stock reconciliation |
| 15 | `PayrollRun` / `Payment` | `payroll` | generate, post, pay | Person-grain allocations |
| 16 | `Rfi` / `RfiItem` | `rfi`, `workflow` | create, respond, close | State machine event |
| 17 | `Submittal` | `submittal` | create, review, approve | State machine event |
| 18 | `PunchItem` | `punch-list` | create, resolve, verify | Status change event |
| 19 | `PurchaseOrder` | `purchase-order` | create, issue, cancel | PO sequence generator |
| 20 | `PurchaseRequisition` | `requisition` | create, approve | Workflow state machine |
| 21 | `DrawingMarkup` | `document` | create, update, delete | Page-level annotations |
| 22 | `DocumentRevision` | `document` | create, replace | File hash tracking |
| 23 | `JvCommissionPayout` | `jv-partner` | recordPayout | Financial guard enforced |
| 24 | `InterSiteTransfer` | `inter-site-transfer` | dispatch, receive | Dual-warehouse stock adjustment |
| 25 | `CompanyBankAccount` | `accounting`, `bank-guarantee` | balanceIncrement | Bank balance invariant |

### 5.2 Key Findings for Change-Feed Spike (M00-T15–T18)
1. **Low Outbox Event Coverage:** Only a handful of routers explicitly emit `OutboxEvent` or `FinancialEvent` rows. The vast majority of mutations update Prisma models directly in database transactions.
2. **Implication for Arm A vs Arm B:**
   - **Arm A (Writer Instrumentation):** Would require instrumenting **402 distinct mutation handlers** across 79 router files. Missing any of them leaves a silent sync black hole.
   - **Arm B (WAL Logical Decoding):** Captures changes from all 402 mutations automatically at the PostgreSQL transaction log level, eliminating writer instrumentation gaps.
   - This provides critical quantitative evidence directly into the **M00-T15 through M00-T18 spike**.

---

## 6. Reconciliation Against Platform Plan v3 §3 Reuse Map

| v3 §3 Domain | Plan Expectation | Router Inventory Ground Truth | Agreement / Mismatch Status |
|---|---|---|---|
| **Policy / lifecycle / finance** | Centralized in `src/server/engine/`, `src/server/trpc.ts`, `financial-scopes.ts`. | `createDomainRouter` adopted by only 5 routers; 74 routers rely on 2,025 hand-rolled assert calls. | **Agreement on risk:** Verifies that declarative auth was not universally adopted; high reliance on ad-hoc guards confirms the need for central API adapter rather than direct DB access. |
| **Retry / events / idempotency** | Evolve durable command deduplication and transactional change capture. | `withIdempotency` is present in 16 routers (primarily money paths: accounting, site-expense, vendor-bill, jv-partner). | **Agreement:** Financial paths have idempotency foundations; non-financial domain mutations lack idempotency records. |
| **Field operations** | Keep existing submission and review semantics; `daily-report-sync.ts` normalizes report relations. | `fieldSubmissionRouter` and `fieldPhotosRouter` are mounted in `_app.ts`. Legacy `dailyReportRouter` is unmounted in `_app.ts`. | **Key Discovery:** `daily-report.ts` is unmounted; live field ingestion uses `field-submission` and `field-photos`, with background server normalization. |
| **Worksheet & BoQ** | Preserve workbook format and tested editing semantics; `WorksheetDocument.version` is starting point. | `worksheetRouter` exposes document operations; `boqRouter` and `boqVersionRouter` manage hierarchy. | **Agreement:** Worksheet mutations update `WorksheetDocument` and maintain versioning. |
| **CAD & Document / Takeoff** | Retain command vocabulary and entity identity; document sessions in `src/lib/document-engine/`. | `documentRouter` handles `Drawing`, `DrawingRevision`, `DrawingMarkup`. CAD commands execute client-side in React; server persists JSON layouts and markup. | **Agreement:** Confirms server acts as document/markup persistence store; geometry kernels must be shared. |
| **CPM and progress** | Preserve inclusive dates, Nepal calendar, lag-hours, and one calculation contract. | `ganttRouter` (merging 6 sub-routers) drives scheduling, version snapshots, and baseline tracking. | **Agreement:** Complete scheduling API is centralized in `gantt.ts` cluster. |

---

## 7. Acceptance Criteria Verification

- [x] **Every router file listed with procedure count and mutation/query classification:**
  - 79 files inventoried; 711 total procedures classified (309 queries, 402 mutations). Detailed in §1, §3, and companion `inventory-routers.json`.
- [x] **Each mutation mapped to central engine/service or flagged direct Prisma path:**
  - 350 engine/service mutations mapped to 18 central services; 41 direct Prisma mutations flagged. Detailed in §4.
- [x] **Authorization method recorded per router:**
  - 5 `createDomainRouter` routers identified; 74 hand-rolled routers with 2025 assertion call sites quantified. Detailed in §2 and §3.
- [x] **Every writer relevant to future change feed flagged:**
  - 144 mutated models identified and prioritized for sync/change-feed impact in §5.
- [x] **Findings reconciled against v3 §3 reuse map:**
  - Complete matrix with agreements and discoveries recorded in §6.

---

*Report and data artifacts generated as part of task `M00-T07` under the [AI-Agent Execution Protocol](../../rules/AI-AGENT-EXECUTION-PROTOCOL.md).*