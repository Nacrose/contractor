# M05-T01: Expansion Substrate — Shared Repositories, Typed Commands, and Sync Status

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T01` — Expansion substrate: shared repositories, typed commands, and sync status for the workflow family
- **Dependencies:** `M04-T02` (Flutter mount wiring), `M04-T03` (vertical workflow substrate)
- **Date:** 2026-10-11
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T01` extends the M04 engine substrate across the field workflow family (**Attendance**, **Site Expense / Petty Cash**, **MRR / Material Delivery**, and **Field Photos**). Rather than introducing per-workflow transports, custom network layers, or ad-hoc health surfaces, every expansion domain runs through the **exact same pipeline**:

```text
Domain Input
   │
   ▼
[Domain Local Store] ──(atomic transaction)──► [Domain Table (SQLite)]
   │                                         └──► [pending_op Table]
   ▼
[Native Outbox] ──► [Sync Orchestrator] ──► [Native Sync Transport] ──► [Server Adapter]
                                                                                │
                                                                   [M03-T01 Guard Pipeline]
                                                                                │
                                                                       [PostgreSQL DB]
```

Sync status for all workflows renders strictly from the central `M03-T08` device health read model (`pending count`, `oldest age`, `per-scope cursors`, honest `synced` flag).

---

## 2. Operation Registry Mappings (M00 Router Inventory)

Every expansion operation is registered in `@contractor/native-adapter` (`packages/native_adapter/src/registry.ts`) and proven against its M00 router-inventory row (`docs/reports/M00/inventory-routers.md`):

| Operation ID | Inventory Row | AUTHORITATIVE Server Engine | Guard Chain (Strict `GUARD_ORDER`) |
|---|---|---|---|
| `attendance.record` | Row 43 (`leave.ts`), Row 39 (`hr.ts`), Row 26 (`field-submission.ts`) | `attendance submission engine (field-submission ingestion / daily-report-sync normalization, idempotency, audit-log)` | `["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "inputReferences", "idempotency"]` |
| `attendance.update` | Row 43 (`leave.ts`), Row 26 (`field-submission.ts`) | `attendance update engine (field-submission ingestion / daily-report-sync normalization, idempotency, audit-log)` | `["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "inputReferences", "idempotency"]` |
| `siteExpense.create` | Row 67 (`site-expense.ts`) | `site-expense engine (financial-event-log, bank-balance, fiscal-year-lock, ledger-entry)` | `["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "capability", "delegation", "financial", "fiscalLock", "idempotency"]` |
| `material.delivery` | Row 26 (`field-submission.ts`), Rows 44–46 (`material` routers) | `material delivery ingestion (field-submission ingestion / daily-report-sync normalization, idempotency, audit-log)` | `["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "capability", "inputReferences", "idempotency"]` |
| `fieldPhotos.upload` | Row 25 (`field-photos.ts`) | `field-photos engine (resumable chunks, sharp digest verification, StoredFile / FieldPhoto registration)` | `["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "inputReferences", "idempotency"]` |

---

## 3. Substrate Implementation Artifacts

1. **Adapter Registry Extension**:
   - [`packages/native_adapter/src/registry.ts`](file:///Users/aakashdhakal/contractor/packages/native_adapter/src/registry.ts): Added constants and registered operations for attendance, site expenses, material delivery, and photo uploads with inventory mappings and guard pipelines.
   - [`packages/native_adapter/test/contract.test.ts`](file:///Users/aakashdhakal/contractor/packages/native_adapter/test/contract.test.ts): Added test assertions verifying each new operation binding follows fixed pipeline order.

2. **Client Domain Models & Store**:
   - [`prototype/construction_client/lib/workflows/field_expansion_substrate.dart`](file:///Users/aakashdhakal/contractor/prototype/construction_client/lib/workflows/field_expansion_substrate.dart):
     - `kFieldExpansionLocalMigration`: Migration v5 creating local tables `attendance_local`, `site_expense_local`, and `material_delivery_local` with date-indexed lookups.
     - `AttendanceSubmissionDraft`, `AttendanceRecordItem`
     - `SiteExpenseSubmissionDraft`
     - `MaterialDeliverySubmissionDraft`, `MaterialDeliveryItem`
     - `FieldExpansionWorkflowStore` & `FieldExpansionLocalStore`: Atomic commits of domain records and outbox `pending_op` in a single SQLite transaction.
     - `syncHealth`: Directly wraps `buildDeviceSyncHealth` from `mount.healthSource` (zero custom health code).
     - `syncNow`: Dispatches through `mount.drainTriggers.manual()` and the shared `DailyLogSyncOrchestrator`.

3. **Command & Route Registrations**:
   - `kFieldExpansionCommands`: Provides `attendance.save-local`, `attendance.sync-now`, `site-expense.save-local`, `site-expense.sync-now`, `material-delivery.save-local`, `material-delivery.sync-now`.
   - `kFieldExpansionRoutes`: Declares `/attendance/new`, `/expenses/new`, `/deliveries/new` with capability bindings.

---

## 4. Verification & Test Evidence

### 4.1 Native Adapter Contract Tests
```text
> @contractor/native-adapter@0.1.0 check
✔ M05 expansion: attendance.record declares guards in fixed pipeline order
✔ M05 expansion: siteExpense.create enforces full financial guard chain in pipeline order
✔ M05 expansion: material.delivery declares capability and idempotency guards
✔ M05 expansion: fieldPhotos.upload declares input references and idempotency guards
ℹ tests 23 | pass 23 | fail 0
native_adapter: contract tests PASSED
```

### 4.2 Field Expansion Substrate Suite (`field_expansion_substrate_test.dart`)
```text
00:00 +0: Field Expansion Substrate: Atomic Persistence & Reopen
00:00 +1: Field Expansion Substrate: Atomic Edits & Immutability
00:00 +2: Field Expansion Substrate: Dispatched operations cannot be edited locally
00:00 +3: Field Expansion Substrate: Recovery Copies
00:00 +4: Field Expansion Substrate: Orchestrator Drain & Shared Pipeline syncNow()
00:00 +5: Field Expansion Substrate: Commands & Routes
00:00 +6: Field Expansion Substrate: Navigation Routes
00:00 +7: Field Expansion Substrate: Validation Constraints
00:00 +8: All tests passed!
```

### 4.3 Full Flutter Client Suite & Analyzer
- `flutter analyze`: Clean (0 issues found).
- `flutter test`: **229 / 229 tests passing** across the entire application suite.
- `packages/platform_contracts`: `npm run check:all` PASSED (Buf format/lint/breaking, TypeScript/Dart roundtrip).
- `scripts/lint-protocol.mjs`: PASSED (13 milestone files, 132 task definitions).
