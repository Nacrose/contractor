# M05-T04: Material Delivery & MRR Submissions — Office Review Reuse, Server Reconciliation Parity, and Workflow UI

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T04` — MRR / delivery submissions (office review flows reused)
- **Dependencies:** `M05-T01` (Expansion substrate)
- **Date:** 2026-10-12
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T04` extends the verified outbox and sync engine across material deliveries and Material Receipt Reports (MRR):
1. **Existing Office Review Flows Reused**: MRR submissions land in the `"pending"` review state without premature inventory or ledger impact. Review actions (`accept`, `reject`, `adjust`) are server-authoritative office operations.
2. **Anti-Self-Review Boundary**: Field submitters cannot authorize or review their own material deliveries. Office reviews are restricted to manager, engineer, and store roles.
3. **Server-Side Material Reconciliation Parity**: Reconciliation of delivered quantities against purchase orders, challans, and stock accounts executes server-side with identical inputs (`supplierName`, `challanNumber`, `items: [{materialCode, materialName, quantity, unit}]`), pinning exact mathematical parity.
4. **Original Delivery Audit Invariance**: When office reviewers adjust accepted quantities (e.g., deducting damaged/rejected materials), the original field delivery snapshot (`originalDelivery`) remains completely intact, and granular diffs are recorded in the durable audit log.
5. **Material Delivery Client Workflow**: A complete Flutter client screen ([`MaterialDeliveryScreen`](file:///Users/aakashdhakal/contractor/prototype/construction_client/lib/workflows/material_delivery_screen.dart)) providing dynamic item row management, material catalog lookup, outbox persistence (`material_delivery_local` + `pending_op`), manual sync trigger, and recovery copy support.

---

## 2. Invariants & Office Review Architecture

### 2.1 Ingestion & Normalization Boundary
* Incoming client deliveries dispatch through the typed mutation envelope `material.delivery`.
* Server ingestion registers the submission with status `"pending"` and `reconciledInventory: false`.
* `daily-report-sync` normalization processes the delivery into relational structures without client-side state mutation.

### 2.2 Server-Authoritative Office Review Actions
Office reviews are executed via `reviewMaterialDeliveryByOffice()` in `packages/native_adapter/src/material_delivery.ts`:
* **Accept (`accept`)**:
  * Marks `reviewStatus: 'accepted'` and `reconciledInventory: true`.
  * Computes material reconciliation balance with zero discrepancies.
  * Emits inventory stock additions and links to the project's material ledger.
* **Reject (`reject`)**:
  * Marks `reviewStatus: 'rejected'` and `reconciledInventory: false`.
  * Preserves the submission record with reviewer notes for accounting dispute tracking.
  * No inventory stock is modified.
* **Adjust (`adjust`)**:
  * Used when delivered materials arrive with partial damages, moisture degradation, or quantity discrepancies (e.g., 500 bags dispatched by supplier, but only 480 bags accepted by site storekeeper).
  * Preserves `originalDelivery.items` (500 bags) permanently intact.
  * Records `adjustedItems` (480 bags) as active quantities.
  * Computes reconciliation discrepancy record noting `-20 bags difference`.
  * Records full `changes` diff in the audit trail.

### 2.3 Anti-Self-Review Protection
* A field engineer or site supervisor who submitted an MRR cannot act as the reviewer.
* Attempted self-review is rejected fail-closed with `Permission denied: submitter cannot self-review their own material delivery`.

---

## 3. M00 Router-Inventory Writer Audit & Disposition

Per the M00 router inventory (`docs/reports/M00/inventory-routers.md`), material and delivery writes are dispositioned as follows:

| Inventory Row | Source Router | Touched Models | Disposition | CDC / Feed Path | Flutter-Parity Path |
|---|---|---|---|---|---|
| **Row 26** | `field-submission.ts` | `FieldSubmission` | **Migrated Writer** | Atomic commit with `serverSeq` to sync feed table | Dispatches through `material.delivery` outbox mutation envelope |
| **Row 44** | `material-grn.ts` | `MaterialReceipt`, `MaterialReceiptItem` | **Office Retained** | Emits goods receipt note change events | Office ERP views; inventory reconciliation links to MRR |
| **Row 45** | `material-stock.ts` | `MaterialStock`, `StockMovement` | **Office Normalization** | Emitted by `daily-report-sync` upon office review | Background inventory ledger updates |
| **Row 46** | `inventory.ts` | `InventoryItem`, `Warehouse` | **Office Retained** | Warehouse balance updates emit change-feed entries | Native client reads stock levels via snapshot query |

---

## 4. Client Screen Implementation

* **Component**: [`prototype/construction_client/lib/workflows/material_delivery_screen.dart`](file:///Users/aakashdhakal/contractor/prototype/construction_client/lib/workflows/material_delivery_screen.dart)
* **Capabilities**:
  * Project selector, ISO delivery date picker, vehicle/truck number.
  * Supplier / vendor name and challan/waybill number.
  * Dynamic material item manager:
    * Catalog selector (OPC Cement, PPC Cement, Rebar 12/16/20mm, River Sand, Aggregate 20mm, Clay Bricks, Diesel).
    * Quantity input with unit auto-fill (`bags`, `tons`, `cum`, `liters`, `pcs`).
    * Per-item condition remarks.
    * Add and remove material rows dynamically.
  * General unloading remarks and site gate inspection notes.
  * Explanatory office review notice explaining submission status and reconciliation behavior.
  * Atomic local save into `material_delivery_local` + `pending_op`.
  * Manual sync trigger dispatching through `DailyLogSyncOrchestrator`.
  * Saved deliveries list with status badge (`pending`, `accepted`, `rejected`, `adjusted`), and reload / recovery copy support.

---

## 5. Automated Verification Results

### 5.1 Central Material Delivery & Reconciliation Tests (`packages/native_adapter/test/material_delivery.test.ts`)
```text
✔ MRR ingestion: lands in 'pending' review status without premature inventory reconciliation
✔ MRR office review: 'accept' marks delivery accepted and reconciles inventory server-side
✔ anti-self-review: field submitter cannot approve/review their own MRR delivery
✔ MRR office review: 'adjust' preserves original submission and calculates reconciliation discrepancies
✔ validation: non-positive item quantity or invalid date format is rejected fail-closed
ℹ tests 5 | pass 5 | fail 0
native_adapter: contract, attendance, site expense, and material delivery tests PASSED (38 total tests passing)
```

### 5.2 Material Delivery Screen Widget Tests (`material_delivery_screen_test.dart`)
```text
00:00 +0: renders material delivery screen with form fields and review notice
00:00 +1: validates required fields before local save
00:00 +2: adding and removing material items dynamically updates item count
00:01 +3: saving delivery writes to local domain table and creates pending outbox op
00:01 +4: syncing outbox transmits delivery via transport and marks health synced
00:01 +5: All tests passed!
```

### 5.3 Quality & Protocol Compliance
* Full Flutter test suite: **242 / 242 tests passing** (0 regressions).
* Flutter analyzer: **Clean, 0 errors, 0 warnings**.
* Protocol linter (`scripts/lint-protocol.mjs`): **All checks passed**.
