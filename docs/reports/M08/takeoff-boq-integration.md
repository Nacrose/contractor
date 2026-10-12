# M08-T05: First-Class Takeoff-to-BoQ Integration & Single Domain Integration Path Report

- **Task:** M08-T05 — First-class takeoff-to-BoQ link via existing models and one domain integration path
- **Milestone:** M08 PDF and BoQ-linked takeoff engine
- **Package:** `@contractor/native-takeoff` (`packages/native_takeoff/`)
- **Status:** Complete (23/23 tests passing, clean compile)
- **Normative References:** Platform Plan v3 §5.1, §5.4, §6 M08; Standing Constraint 3 (v3 §10); M06 BoQ linking contract (`packages/native_workbook/src/boq_ipc_bridge.ts`); `packages/native_adapter/src/registry.ts` ("worksheet.update").
- **Date:** 2026-10-12

---

## 1. Executive Summary & Scope

Task **M08-T05** implements the first-class takeoff-to-BoQ integration layer connecting vector takeoff measurements directly into Bill of Quantities (BoQ) workbook line items via a single, strictly controlled domain integration path.

Key architectural requirements satisfied:
1. **Single Domain Integration Path:** Quantity postings flow exclusively through `TakeoffBoqLinkService`. No drawing canvas, viewer widget, or rendering adapter can mutate BoQ cells or workbook models directly.
2. **Reuses Existing Models & Exact-Decimal Boundary:** Operates over established models (`MeasurementRecord`, `DerivedQuantityLink`, `BoqLineItem`, `DomainCellMetadata`). Numeric values cross the service boundary strictly as exact-decimal strings (`"120.50"`, `"30.00"`), eliminating floating-point drift before reaching financial ledgers.
3. **Existing Service Calls with Permission Checks Intact:** All quantity updates route through the canonical `"worksheet.update"` registry operation, enforcing authentication (`identity`), tenant boundaries (`tenantScope`), project membership and permissions (`projectPermission`), and financial period locks (`fiscalLock`).
4. **Bidirectional Round-Trip Provenance:** Complete end-to-end trace from vector measurement $\to$ multiplier/formula $\to$ exact-decimal quantity $\to$ BoQ target cell $\to$ durable receipt $\to$ measurement derived quantities list.
5. **Change-Feed Integration & Flutter Parity (Standing Constraint 3):** Dispatches versioned `TAKEOFF_MEASUREMENT_UPDATED` / `TAKEOFF_BOQ_QUANTITY_POSTED` events to the central sync outbox and provides 1:1 `FlutterParityBoqLinkDto` representations for Flutter UI clients.

---

## 2. Architecture & Boundary Isolation

### 2.1 The Single Integration Path

```text
┌─────────────────────────────────┐
│     Takeoff Drawing Widget      │
│  (Canvas, Viewer, Annotations)  │
└────────────────┬────────────────┘
                 │
                 │ ❌ Direct Cell Mutation PROHIBITED (throws DirectMutationProhibitedError)
                 │
                 ▼ (Allowed: widget.requestQuantityPosting)
┌────────────────────────────────────────────────────────┐
│               TakeoffBoqLinkService                    │
│  - Guard validation (identity, tenant, roles, lock)     │
│  - Measurement status assertion (must be ACCEPTED)     │
│  - Multiplier & exact-decimal formatting ("120.50")    │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│     BoQ Target Cell     │  │  Central Change Feed    │
│  (ReflectedBoqCell,     │  │  (TakeoffChangeEvent,   │
│   "worksheet.update",   │  │   FlutterParityDto)      │
│   receiptId, serverSeq) │  └─────────────────────────┘
└─────────────────────────┘
```

### 2.2 Architectural Guard Against Direct Cell Mutation

Drawing widgets are explicitly forbidden from mutating spreadsheet cells directly:
```typescript
export class TakeoffDrawingWidget {
  directMutateBoqCell(cell: unknown, _newValue: unknown): never {
    throw new DirectMutationProhibitedError(
      `Drawing widget "${this.widgetId}" cannot mutate BoQ cells directly. ` +
      `All quantity changes must route through the single TakeoffBoqLinkService domain path.`
    );
  }
}
```

---

## 3. Permission Checks & Service Operation

Posting a takeoff quantity invokes the `"worksheet.update"` domain operation registered in `packages/native_adapter/src/registry.ts`:

| Guard | Verification Check | Failure Behavior |
|---|---|---|
| **identity** | `caller.userId` non-empty | Throws `TakeoffPermissionError` ("identity guard failed") |
| **tenantScope** | `caller.tenantId === targetTenantId` | Throws `TakeoffPermissionError` ("tenant mismatch") |
| **projectPermission** | Caller has role (`estimator`, `project_manager`, `admin`) or permission (`worksheet.write`, `takeoff.post_quantity`) | Throws `TakeoffPermissionError` ("lacks required permission") |
| **fiscalLock** | `!caller.isFiscalLocked` | Throws `TakeoffFiscalLockError` ("project is under fiscal year lock") |
| **statusCheck** | Measurement provenance status must be `ACCEPTED` | Throws `TakeoffBoqLinkError` ("cannot post quantities for measurement in NEEDS_REVIEW status") |

---

## 4. Round-Trip Provenance & Exact-Decimal Serialization

### 4.1 Traceability Flow

1. **Measurement Definition:**
   - Measurement `meas-concrete-02`: Ground Floor Pavement, net calibrated area $120.50\text{ m}²$.
2. **Posting Request:**
   - Target BoQ Item: `BOQ-PAVEMENT-01`, Cell Reference: `sheet-highway:colQty:row42`, Multiplier: $1.0$.
3. **Execution & Reflection:**
   - Quantity computed as $120.50$ and formatted to exact-decimal string `"120.50"`.
   - Durable receipt generated: `rcpt-boq-1791748123-1001`, `serverSeq: 1001`.
   - Target cell reflects value `"120.50"` and stores `lastTakeoffMeasurementId: 'meas-concrete-02'`.
   - Measurement record updates `derivedQuantities` with link ID, factor, and accepted status.
4. **Round-Trip Verification:**
   - Invoking `service.verifyRoundTrip('meas-concrete-02', 'sheet-highway:colQty:row42')` confirms `cellValueMatches: true` with identical receipt IDs and matching exact-decimal strings.

---

## 5. Change-Feed Integration & Flutter-Parity Path (Standing Constraint 3)

### 5.1 Outbox Event Structure
When a takeoff quantity posting is accepted, an event is emitted to the sync feed:
```json
{
  "eventId": "feed-evt-1791748123-abcde",
  "changeKind": "TAKEOFF_MEASUREMENT_UPDATED",
  "entityId": "link-meas-slab-01-BOQ-CONC-SLAB-sheet-ground_colC_row15",
  "tenantId": "tenant-acme",
  "documentId": "doc-blueprint-01",
  "revisionId": "REV-A",
  "payload": {
    "operation": "worksheet.update",
    "linkId": "link-meas-slab-01-BOQ-CONC-SLAB-sheet-ground_colC_row15",
    "measurementId": "meas-slab-01",
    "boqCode": "BOQ-CONC-SLAB",
    "cellRef": "sheet-ground:colC:row15",
    "exactDecimalQuantity": "15.00",
    "receiptId": "rcpt-boq-1791748123-1001",
    "serverSeq": 1001
  }
}
```

### 5.2 Flutter Parity DTO (`FlutterParityBoqLinkDto`)
```typescript
export interface FlutterParityBoqLinkDto {
  readonly linkId: string;
  readonly measurementId: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly boqCode: string;
  readonly cellRef: string;
  readonly multiplier: number;
  readonly derivedQuantity: number;
  readonly exactDecimalQuantity: string;
  readonly targetUnit: string;
  readonly status: string;
  readonly receiptId: string | null;
  readonly serverSeq: number | null;
}
```
Flutter clients consume this DTO directly from local SQLite / sync feeds to render interactive visual links between drawings and BoQ tables without platform divergence.

---

## 6. Verification & Test Evidence

Test suite executed via `node packages/native_takeoff/tool/check.mjs`:
- `test/document_session.test.ts` (8/8 passing)
- `test/measurement_coverage.test.ts` (5/5 passing)
- `test/provenance_storage.test.ts` (5/5 passing)
- `test/takeoff_boq_link.test.ts` (5/5 passing):
  - `✔ drawing widget cannot mutate BoQ cells directly (architectural guard)`
  - `✔ quantity posting enforces permission checks and fiscal lock on "worksheet.update"`
  - `✔ measurement in NEEDS_REVIEW or INVALIDATED status rejects quantity posting`
  - `✔ change-feed integration and Flutter-parity DTO generation (Standing Constraint 3)`
  - `✔ round-trip evidence links measurement -> quantity -> BoQ -> measurement`

**Total: 23/23 tests passing.**
