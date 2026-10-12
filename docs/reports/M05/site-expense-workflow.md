# M05-T03: Petty Cash / Site Expense Submissions — Approval Distinctness, Audit History, and Workflow UI

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T03` — Petty cash / site expense submissions (approval distinctness + audit history)
- **Dependencies:** `M05-T01` (Expansion substrate)
- **Date:** 2026-10-11
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T03` implements the site expense and petty cash workflow across native and web, satisfying all requirements of v3 plan §6 M05 bullet 2:
1. **Initial Submission State**: Expenses land strictly in `"submitted"` state with `postedToLedger = false`. Financial ledger posting occurs exclusively upon office authorization.
2. **Server-Side Financial Guard Chain**: Full financial pipeline verification (`delegationLimit`, `fiscalYearLocked`, `financial` integrity, `idempotency`) executes server-side on every dispatch. No financial policy relies on client trust.
3. **Audit History & Submitter Invariance**: Office edits preserve `originalSubmitterId` and snapshot initial submission fields (`originalSubmission`), appending change audit entries with granular diffs (`from` $\rightarrow$ `to`).
4. **Durable Receipts**: Financial command receipts follow M03-T04 §7 durable-receipt discipline (never expired or deleted, compacting fail-closed).
5. **Site Expense Client Workflow**: Flutter UI (`SiteExpenseScreen`) providing categorized expense logging, form validations, outbox persistence (`site_expense_local` + `pending_op`), manual sync trigger, and recovery duplication.

---

## 2. Financial Invariants & Audit Architecture

### 2.1 The Submission vs. Ledger Posting Boundary
In accordance with the M00 local-stores inventory ("Site Expense & Petty Cash Logging"):
* Field submissions land in `"submitted"` status.
* The field client **never** creates `LedgerEntry` or alters accounting ledgers.
* Ledger posting happens exclusively when an authorized office manager or accountant approves the expense via `approveSiteExpense()`:
  * Creates an immutable `LedgerEntry` linked to the expense.
  * Transitions state to `"approved"`.
  * Sets `postedToLedger: true` and records `postedAt` timestamp.

### 2.2 Server-Side Financial Guard Chain
`packages/native_adapter/src/site_expense.ts` enforces all financial invariants server-side in the established `GUARD_ORDER`:
* **Fiscal Year Lock (`fiscalYearLocked`)**: Checks whether the expense date falls in a closed financial accounting period. If locked, rejection is returned immediately.
* **Delegation Limit (`delegationLimit`)**: Validates that the submitter's spending delegation covers the requested amount. Amounts exceeding the delegation limit are rejected before posting.
* **Idempotency**: Requests carry durable `requestId` / `clientUuid` keys to ensure duplicate submissions are deduplicated without duplicate ledger impact.

### 2.3 Original Submitter Audit Invariance
When an office user reviews and modifies an expense prior to ledger posting (e.g. adjusts amount, reclassifies category, or corrects payee):
* `originalSubmitterId` is immutable and never overwritten.
* `originalSubmission` snapshots the initial `amount`, `category`, `payee`, `memo`, and `timestamp`.
* `auditTrail` records every modification with:
  * `timestamp`
  * `actorId`
  * `action` (`"created"`, `"edited_by_office"`, `"approved_to_ledger"`)
  * `changes` list detailing field name, previous value, and new value.
* Once posted to the ledger, further edits to financial fields are strictly forbidden.

---

## 3. M00 Router-Inventory Writer Audit & Disposition

Per the M00 router inventory (`docs/reports/M00/inventory-routers.md`), site expense and petty cash writes are dispositioned as follows:

| Inventory Row | Source Router | Touched Models | Disposition | CDC / Feed Path | Flutter-Parity Path |
|---|---|---|---|---|---|
| **Row 67** | `site-expense.ts` | `SiteExpense`, `ExpenseAttachment`, `LedgerEntry` | **Migrated Writer** | Atomic commit with `serverSeq` to sync feed table | Dispatches through `siteExpense.create` outbox mutation envelope |
| **Row 14** | `accounting.ts` | `LedgerEntry`, `FiscalYear`, `Account` | **Office Retained** | Emits accounting ledger change events | Office ERP views; fiscal year locks verified during sync |
| **Row 26** | `field-submission.ts` | `FieldSubmission` | **Office Review Retained** | Review outcomes emit change-feed entries | Native client tracks review disposition via sync pull |

---

## 4. Client Screen Implementation

* **Component**: [`prototype/construction_client/lib/workflows/site_expense_screen.dart`](file:///Users/aakashdhakal/contractor/prototype/construction_client/lib/workflows/site_expense_screen.dart)
* **Capabilities**:
  * Project selector and date input (`YYYY-MM-DD`).
  * Categorization dropdown:
    * Fuel & Diesel
    * Local Cash Materials
    * Site Food & Refreshments
    * Local Site Travel
    * Spot Equipment Hire
    * Small Tools & Consumables
    * Miscellaneous Petty Cash
  * Amount input with currency indicator (`NPR`) and merchant/payee field.
  * Form validation preventing non-positive amounts or missing payees.
  * Explanatory financial guard notice explaining submission state and audit durability.
  * Atomic local save into `site_expense_local` + `pending_op`.
  * Manual sync trigger dispatching through `DailyLogSyncOrchestrator`.
  * Saved submissions list displaying sync/approval state, with reload and recovery copy support.

---

## 5. Automated Verification Results

### 5.1 Central Financial Rules & Audit Tests (`packages/native_adapter/test/site_expense.test.ts`)
```text
✔ site expense: lands in submitted state and does NOT post to financial ledger initially
✔ site expense: office edit preserves original submitter and initial submission audit history
✔ financial guard chain: fiscal year lock rejects ledger posting
✔ financial guard chain: delegation limit is enforced server-side
✔ office edit: cannot edit after an expense is posted to the ledger
ℹ tests 5 | pass 5 | fail 0
native_adapter: contract, attendance, and site expense tests PASSED (33 total tests passing)
```

### 5.2 Site Expense Screen Widget Tests (`site_expense_screen_test.dart`)
```text
00:00 +0: renders site expense screen with form fields and financial notice
00:00 +1: validates required fields before local save
00:01 +2: saving site expense writes to local domain table and creates pending outbox op
00:01 +3: syncing outbox transmits site expense via transport and marks health synced
00:01 +4: All tests passed!
```

### 5.3 Quality & Protocol Compliance
* Full Flutter test suite: **237 / 237 tests passing** (0 regressions).
* Flutter analyzer: **Clean, 0 errors, 0 warnings**.
* Protocol linter (`scripts/lint-protocol.mjs`): **All checks passed**.
