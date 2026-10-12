# M10-T07: Connected Original-App Cross-Tool Journeys Verification

- **Milestone:** M10 (Full Feature Parity and Web Migration)
- **Task:** `M10-T07` — Connected original-app cross-tool journeys across adopted upstream engines (derived from `M10-W09`)
- **Status:** Complete · Full multi-tool workflows, offline replay, and engine upgrade verification passing
- **Normative References:** Platform Plan v3 §6 M10, §6.0; ADR-0010 (Progressive Extension), ADR-0018 (Upstream Capabilities & Construction Integration), `M10-T01` (Custom Tool Audit), `M10-T02` (Migration Waves), `M10-T03` (Cutover Gateway), `M10-T04` (Accounting Ledger Integration), `M10-T06` (Cross-Cutting Verification Matrix).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M10-T07` verifies the three foundational cross-tool civil engineering journeys connecting adopted upstream engines (GridCraft, CadCraft, PdfCraft, TruePPM) with Contractor's authoritative domain rules and accounting ledger.

As mandated by **Platform Plan v3 §6 M10**:
> *"Verify complete end-to-end journeys linking adopted engines and retained domain workflows: (1) Takeoff measurement $\rightarrow$ BoQ item $\rightarrow$ Procurement requisition $\rightarrow$ Client IPC billing; (2) Material delivery $\rightarrow$ Goods receipt $\rightarrow$ Inventory stock ledger $\rightarrow$ Journal entry $\rightarrow$ Financial report; (3) Daily site progress $\rightarrow$ TruePPM schedule recalculation $\rightarrow$ EVM S-curve $\rightarrow$ Client progress report/deck. Validate stable entity context, offline queueing, conflict resolution, and cross-component upgrade/restore."*

### Key Journey Invariants Verified
1. **Journey 1 (Commercial/Billing Cycle):** Takeoff polygon calculations flow into BoQ quantities, derive procurement mix requisitions, and calculate client IPC billing with 5% retention and 13% VAT without floating-point precision loss.
2. **Journey 2 (Supply Chain to Financial Ledger Cycle):** Material deliveries on site produce inspected Goods Receipt Notes (GRN), adjust inventory balances, and generate atomic double-entry journal entries ($\sum \text{Debit} \equiv \sum \text{Credit}$) in the general ledger.
3. **Journey 3 (Field Progress to Project Controls Cycle):** Daily site inspection logs feed TruePPM's Critical Path Method (CPM) calculation, updating Early/Late dates, total float, and generating Earned Value Management metrics ($PV, EV, AC, CV, SV, CPI, SPI$) for client reporting.
4. **Offline Resilience:** Actions performed in remote Himalayan project zones queue locally without data loss and replay deterministically upon reconnecting.
5. **Zero-Loss Engine Upgrades:** When underlying engines (GridCraft, TruePPM, etc.) bump versions, Contractor's multi-tool journey context remains 100% preserved.

---

## 2. Journey 1: Takeoff $\rightarrow$ BoQ $\rightarrow$ Requisition $\rightarrow$ IPC Billing

```
   [PdfCraft Blueprint Takeoff]
   Polygon: poly-col-c1-c8 (45.5 m3 concrete)
                 │
                 ▼
     [GridCraft BoQ Item Sync]
     Rate: Rs 14,000.00 / m3 (1,400,000 Paisa)
                 │
                 ├───────────────────────────────┐
                 ▼                               ▼
     [Material Requisition]             [Client IPC Billing #1]
     - 364 bags OPC Cement              - Gross: Rs 637,000.00
     - 38.68 m3 20mm Aggregate          - Retention (5%): Rs 31,850.00
     - 19.11 m3 Washed Sand             - Net Pre-Tax: Rs 605,150.00
                                        - VAT (13%): Rs 78,669.50
                                        - Total Payable: Rs 683,819.50
```

### Verified Arithmetic:
- **Gross Amount:** $45.5\text{ m}^3 \times \text{Rs } 14,000.00 = \text{Rs } 637,000.00$ ($63,700,000\text{ Paisa}$).
- **Contractual Retention (5%):** $\text{Rs } 637,000.00 \times 0.05 = \text{Rs } 31,850.00$ ($3,185,000\text{ Paisa}$).
- **Net Pre-Tax Payable:** $\text{Rs } 637,000.00 - 31,850.00 = \text{Rs } 605,150.00$ ($60,515,000\text{ Paisa}$).
- **Nepal Value Added Tax (13%):** $\text{Rs } 605,150.00 \times 0.13 = \text{Rs } 78,669.50$ ($7,866,950\text{ Paisa}$).
- **Total IPC Payable:** $\text{Rs } 605,150.00 + 78,669.50 = \text{Rs } 683,819.50$ ($68,381,950\text{ Paisa}$).

---

## 3. Journey 2: Material Delivery $\rightarrow$ GRN $\rightarrow$ Inventory $\rightarrow$ General Ledger

```
   [Site Gate Truck Arrival]
   500 bags OPC Cement @ Rs 750.00 / bag
                 │
                 ▼
   [Goods Receipt Note: GRN-DT-2026-0089]
   Quality Passed: 500 bags accepted = Rs 375,000.00
                 │
                 ▼
   [Double-Entry General Ledger Journal]
   DR  1300_INVENTORY_MATERIALS      Rs 375,000.00  (37,500,000 Paisa)
   CR  2100_ACCOUNTS_PAYABLE         Rs 375,000.00  (37,500,000 Paisa)
   Balance Invariant: Sum(Debit) == Sum(Credit) [PASSED]
```

### Verified Ledger Integration:
- Invariant $\sum \text{Debit} - \sum \text{Credit} \equiv 0$ strictly maintained.
- Prevents uninspected site deliveries from posting directly to payable liabilities.
- Links inventory asset accumulation directly to supplier ledger statements.

---

## 4. Journey 3: Daily Site Progress $\rightarrow$ TruePPM Schedule $\rightarrow$ EVM S-Curves

```
   [Daily Site Progress Log: LOG-2026-10-12-01]
   Pier Foundation: 60% actual progress | Actual Cost = Rs 550,000.00
                 │
                 ▼
   [TruePPM CPM Engine Recalculation]
   Planned Budget: Rs 1,000,000.00 | Scheduled Progress: 50%
                 │
                 ▼
   [Earned Value Management (EVM) S-Curve Calculation]
   - Planned Value (PV = BCWS): Rs 500,000.00 (50,000,000 Paisa)
   - Earned Value (EV = BCWP):  Rs 600,000.00 (60,000,000 Paisa)
   - Actual Cost (AC = ACWP):   Rs 550,000.00 (55,000,000 Paisa)
   - Cost Variance (CV = EV - AC):  +Rs 50,000.00 (Favorable / Under Budget)
   - Schedule Variance (SV = EV - PV): +Rs 100,000.00 (Favorable / Ahead of Schedule)
   - CPI = EV / AC = 1.091
   - SPI = EV / PV = 1.200
```

Both performance indices ($CPI > 1.0$, $SPI > 1.0$) indicate a healthy project status ahead of schedule and under budget, ready for immediate inclusion in executive progress reports.

---

## 5. Offline Queueing & Replay Reconciliation

In rugged field environments without cellular connectivity:
- The `OfflineJourneyQueue` buffers cross-tool actions (`COMMERCIAL`, `SUPPLY_CHAIN`, `PROJECT_CONTROLS`) locally with millisecond timestamps and unique action IDs.
- Attempts to flush while disconnected retain all queued items safely (`processed: 0, remaining: N`).
- When network connectivity is established, `replayAll(true)` flushes all actions deterministically in order without race conditions.

---

## 6. Cross-Engine Upgrade Continuity

When underlying upstream engines release updates (e.g. `GridCraft v0.2.0 -> v0.3.0` or `CadCraft v0.2.0 -> v0.3.0`):
- The `CrossEngineUpgradeGuard` verifies document and journey state continuity.
- Attaches migration provenance (`_migratedFrom`, `_migratedTo`, `_migrationTimestamp`) without mutating user data fields or corrupting active journey sequences.

---

## 7. Automated Test Execution Evidence

All cross-tool journeys are verified by automated tests in `packages/native_runtime/test/connected_journeys.test.ts`:

```bash
$ node packages/native_runtime/tool/check.mjs
✔ Journey 1: Takeoff measurement -> BoQ item -> Procurement requisition -> Client IPC billing (0.925ms)
✔ Journey 2: Material delivery -> GRN -> Stock ledger -> General Ledger Journal (0.148ms)
✔ Journey 3: Daily site progress -> TruePPM schedule recalculation -> EVM S-curves (0.524ms)
✔ OfflineJourneyQueue: safely buffers actions offline and replays when connected (0.154ms)
✔ CrossEngineUpgradeGuard: preserves state schema across tool engine version bumps (0.101ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
ℹ duration_ms 6.14ms
...
native_runtime: all single active writer, cutover gateway, and concurrency guard tests PASSED (M10-T03)
```

The package maintains 22/22 passing automated tests across all cutover, concurrency, deep link, cross-cutting, and connected journey components.
