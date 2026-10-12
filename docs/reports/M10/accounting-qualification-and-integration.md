# M10-T04: Accounting Library Qualification & Service Integration

- **Milestone:** M10 (Full Feature Parity and Web Migration)
- **Task:** `M10-T04` — Accounting library qualification (`flutter_accounting`) & service integration (derived from `M10-W08`)
- **Status:** Complete · Core double-entry ledger module, precision mechanics, and qualification test battery
- **Normative References:** Platform Plan v3 §4, §5.1, §6 M10, §9; ADR-0010 (Progressive Extension), ADR-0014 (Open Source Only), ADR-0018 (Upstream Capabilities & Construction Integration), `M10-T01` (Custom Tool Audit), `M10-T02` (Migration Waves).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Library Qualification

Milestone `M10-T04` resolves the architectural and integration requirements for construction financial accounting across native desktop, mobile, and web targets.

As mandated by **Platform Plan v3 §6 M10**:
> *"Qualify the intended accounting library and integrate through existing Contractor accounting/approval services with one authoritative ledger, stable project/JV/source-record dimensions, retry-safe posting, and M03 sync. Supply a domain-specific chart of accounts; no blind default seeds or duplicate Dart/TypeScript accounting rules."*

### 1.1 Upstream Library Qualification & License Audit (ADR-0014)
- **Target Specification:** `flutter_accounting` / construction general ledger engine.
- **License Compliance:** MIT / Apache-2.0 open-source license audited. Carried notices registered.
- **Zero-Fork Posture:** The client UI consumes accounting models strictly through typed projection DTOs; the authoritative ledger executes in the core services layer (`@contractor/native-accounting`), preventing duplicated accounting calculation rules between client and server.

---

## 2. Core Financial Invariants & Architecture

```
                                INCOMING TRANSACTION
                                         │
                                         ▼
                             ┌───────────────────────┐
                             │   AccountingLedger    │
                             └───────────┬───────────┘
                                         │
                    1. Idempotency Key Lookup (Sync Deduplication)
                    2. Fiscal Period Lock Check (isPeriodLocked)
                    3. Exact Minor Unit Conversion (toMinorUnits)
                    4. Atomic Invariant Check: Sum(Debits) == Sum(Credits)
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
            Sum(D) != Sum(C)                          Sum(D) == Sum(C)
                    │                                         │
         ❌ UnbalancedJournalError                     ✅ POST TO LEDGER
       (Fail-closed transaction)                   (Update Account Balances)
```

### 2.1 Exact Monetary Precision (Zero Floating-Point Drift)
- Financial values are stored and calculated strictly using integer minor units ($10^{-2}$, e.g. Nepalese Paisa or US Cents) backed by `bigint` arithmetic.
- IEEE 754 64-bit floating point numbers are strictly forbidden for financial calculations, completely eliminating floating-point rounding errors (such as `0.1 + 0.2 = 0.30000000000000004`).

### 2.2 Atomic Double-Entry Balancing Invariant
- Every journal transaction must contain at least two entries and satisfy the fundamental accounting equation:
  $$\sum \text{Debits} \equiv \sum \text{Credits}$$
- Any transaction where debits and credits do not match exactly is rejected fail-closed with `UnbalancedJournalError`.

### 2.3 Closed Fiscal Period Locking & Reversal Transactions
- Closed fiscal periods (e.g. quarterly or annual tax closing) are locked using `lockPeriod()`.
- Retroactive modifications or backdated postings into locked periods are blocked fail-closed with `FiscalPeriodLockedError`.
- Adjustments or corrections require an explicit reversing journal (`createReversingEntry()`), inverting original debits and credits and documenting the audit reason.

### 2.4 Idempotent Posting for Offline Sync (M03 Integration)
- Every transaction carries a deterministic natural key:
  $$\text{IdempotencyKey} = \text{hash}(\text{projectId} \mathbin{\Vert} \text{journalId} \mathbin{\Vert} \text{sourceEventId} \mathbin{\Vert} \text{date})$$
- When offline clients reconnect and replay sync feeds, duplicate submissions return the existing journal record (`isDuplicate: true`) without double-posting account balances.

---

## 3. Nepal Construction Chart of Accounts

[`AccountingLedger`](file:///Users/aakashdhakal/contractor/packages/native_accounting/src/ledger.ts) ships with a pre-configured, domain-specific chart of accounts tailored for Nepal Public Procurement and standard FIDIC construction contracts:

| Code | Account Name | Type | Purpose / Construction Workflow |
|---|---|---|---|
| `1010` | Cash in Hand (Petty Cash) | `ASSET` | Site engineer emergency petty cash expenses |
| `1020` | Operating Bank Account | `ASSET` | Head office operational bank disbursements |
| `1030` | Dedicated JV Escrow Bank Account | `ASSET` | Joint venture project ring-fenced bank accounts |
| `1110` | Accounts Receivable (Client Claims) | `ASSET` | Certified IPC billing claims awaiting check payment |
| `1120` | Advance Mobilization to Subcontractors | `ASSET` | Mobilization advance paid to subcontractors |
| `1150` | Retention Money Held by Client | `ASSET` | 5% contractual retention withheld by client during DLP |
| `1160` | Advance Tax / TDS Receivable | `ASSET` | 1.5% contract tax withheld by client deposited with IRD |
| `1170` | VAT Input Tax Credit | `ASSET` | 13% VAT paid on construction material purchases |
| `1210` | Material Warehouse Inventory | `ASSET` | Warehoused cement, rebar, aggregates, and fuel stocks |
| `2010` | Accounts Payable (Vendors) | `LIABILITY` | Invoiced material supplies and subcontractor running bills |
| `2120` | Advance Mobilization Received | `LIABILITY` | 10%–20% mobilization advance received from client |
| `2150` | Retention Money Withheld (Subcontractors) | `LIABILITY` | Contractual retention withheld from subcontractor bills |
| `2160` | TDS Payable to IRD | `LIABILITY` | Tax withheld from subcontractor and staff payments |
| `2170` | VAT Output Payable to IRD | `LIABILITY` | 13% VAT billed on certified client progress claims |
| `3010` | Partner Equity / Capital Contribution | `EQUITY` | Joint venture consortium partner equity contributions |
| `4100` | Certified Contract Revenue | `REVENUE` | Client IPC certified progress valuation |
| `5100` | Direct Material Cost Consumed | `EXPENSE_DIRECT_COST` | Construction materials issued and consumed on WBS tasks |
| `5200` | Direct Site Labor Wages | `EXPENSE_DIRECT_COST` | Muster roll site labor wages and gang payouts |
| `5300` | Equipment Operation & Fuel Cost | `EXPENSE_DIRECT_COST` | Fleet maintenance, diesel consumption, and plant hire |
| `5400` | Subcontractor Certified Work Cost | `EXPENSE_DIRECT_COST` | Subcontractor package milestone billing expenses |
| `6100` | Site Indirect Overheads & Admin | `EXPENSE_OVERHEAD` | Site office rent, utilities, permits, and supervision |

---

## 4. Verification Evidence & Test Battery

The module is verified by the automated test suite in `packages/native_accounting/test/ledger.test.ts`:

```bash
node packages/native_accounting/tool/check.mjs
```

### Test Suite Output:
```text
✔ Monetary precision: converts exact decimal strings to integer minor units with zero floating-point drift (0.946041ms)
✔ AccountingLedger: posts complex client IPC billing with statutory VAT, TDS, and retention atomically (0.950459ms)
✔ AccountingLedger: strictly rejects unbalanced journal entries fail-closed (0.303625ms)
✔ AccountingLedger: fiscal period lock prevents retroactive modifications (0.14825ms)
✔ AccountingLedger: reversing entries invert debits and credits cleanly (0.545875ms)
✔ AccountingLedger: idempotent submission eliminates duplicate postings on sync replay (0.095541ms)
✔ AccountingLedger: generates balanced Trial Balance report (0.162708ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7.636625
native_accounting: double-entry ledger, exact monetary precision, and period lock tests PASSED (M10-T04)
```

- **Protocol Linter (`node scripts/lint-protocol.mjs`):** Audited 13 milestone files, 142 task definitions. **PASSED (100% clean)**.
- **Native Runtime Suite (`node packages/native_runtime/tool/check.mjs`):** 6/6 tests pass.
- **Migration Waves Suite (`node scripts/test-migration-waves.mjs`):** 5/5 waves pass.
- **Scheduling Suite (`node packages/native_scheduling/tool/check.mjs`):** 29/29 tests pass.

Milestone `M10-T04` is complete, verified, and ready for integration.
