# Workforce and finance source-action reconciliation

Status: **Selected source services, UI entry points, permission boundaries, financial transitions and the expiry job reviewed for WF-021–026. Full control-level mapping and runtime acceptance remain open.**

Source baseline: private `Nacrose/Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Stable routes, action IDs and trigger candidates are in the [41-workflow crosswalk](../../frontend/original-workflow-source-crosswalk.json) and [canonical action index](../../frontend/original-action-component-index.json).

## Reviewed workflows

| Workflow | Routes and source behavior |
|---|---|
| WF-021 Person-Grain Identity & Employment Contracts | Organization roster (`ROUTE-075`), project HR/team/hierarchy routes (`ROUTE-029`, `ROUTE-103`, `ROUTE-102`); `ROUTE-060` is archive-only with no canonical source page. `hr.ts` and `services/workforce.ts` maintain person identity separately from login users, with project assignments carrying employment scope and dates. Identity, compensation and organization roster permissions are split. |
| WF-022 Staff Attendance & Leave Management | Project HR/team and field log routes (`ROUTE-029`, `ROUTE-103`, `ROUTE-080`). Attendance and muster-roll actions live in `hr.ts`; leave requests, approvals, rejections and balances live in `leave.ts`. Leave approval/rejection use action-specific grants; organization leave policies and balances have organization-level permissions. |
| WF-023 Payroll Calculation & Person Allocations | Project HR/team and expenses routes (`ROUTE-029`, `ROUTE-103`, `ROUTE-099`) are the crosswalk candidates. Payroll preview is organization-wide and counts each person once across active assignments and attendance. Payroll runs support manual allocation splits with reasons and cent-level balancing. The expenses route overlap is a broad candidate and does not establish payroll controls on that page. |
| WF-024 Day Book & Project Ledgers | Project accounting, payments and organization finance (`ROUTE-096`, `ROUTE-037`, `ROUTE-074`). Accounting reads the day book and ledger; entries can be added, edited, reversed or attached through separate actions, with project or organization accounting grants according to scope. |
| WF-025 Bank Guarantee Expiration & Release | Organization finance (`ROUTE-074`) and project accounting (`ROUTE-096`). Guarantees can be organization-owned or project-linked. The background job expires only active/extended guarantees past expiry; release, linking and reversal are explicit user actions. |
| WF-026 Fiscal Year Boundary Locks | Organization finance and project accounting (`ROUTE-074`, `ROUTE-096`). Lock checks are shared across financial mutation services; switching a project fiscal year is separately permissioned and revisioned. |

## Permission and transaction contracts

- Person records are distinct from credentials. Project staff creation/assignment checks identity and compensation grants; user linking/unlinking checks identity authority. Moving a worker between projects checks compensation edit on both source and destination and writes the change transactionally. Organization roster management uses organization HR permissions.
- Attendance is project-scoped and date-sensitive; bulk attendance checks the target date against fiscal locks and persists its batch in a tenant transaction. Leave actions distinguish self-service application, roster editing and action grants for approval/rejection. Leave balances and policy maintenance operate at organization scope.
- Payroll is an organization-level capability, not a project-level run. Preview computes one organization roster across projects. Run creation requires payroll edit and an unlocked payroll period; approved/disbursed runs are immutable through create. The typed lifecycle is draft → approved → disbursed, with reopen only for approved runs. Approval posts the liability, disbursement moves cash and may atomically decrement the selected organization bank account, and delegation thresholds apply to money movement. A disbursed run is terminal in this endpoint.
- Day-book reads require project accounting view or organization accounting view depending on scope. Posting requires accounting authority and an unlocked date; journal entries use the shared journal helper. Reversal has distinct behavior and must preserve the original entry trail.
- Guarantee operations enforce organization ownership or project grant checks. Project linking verifies the linked project's organization matches the guarantee. Release and journal/bank-balance effects are guarded by fiscal locks and state transitions. The periodic `bank-guarantee.auto-expire` job changes only active or extended rows with expiry dates before its run time.
- Fiscal-year switch preview requires source data visibility; execution requires the dedicated materials fiscal-year switch permission plus BOQ view, rechecks authority in the transaction and records revisions. Shared `assertNotLocked` guards prevent date-backed postings into locked periods; the lock is a server-side invariant and not just a disabled UI control.

## Mapping limits and Contractor implications

These workflows share HR, finance and accounting pages, so their crosswalk hook sets overlap. The inspected UI confirms concrete entry points for attendance, leave decisions, payroll runs, guarantee actions and day-book actions. This review does not yet map each control, input, lifecycle exception, notification or scheduled-job effect to a reviewed trigger ID. The bank-guarantee sweep is server background behavior and is not a user route action.

Contractor should keep person identity, login access and project employment as separate records; aggregate payroll at the person level across projects; and make attendance, approval, liability posting and cash disbursement distinct steps. Keep closed-period enforcement in every server mutation path, and preserve exact ledger reversals rather than silently editing posted financial history. No reviewed workflow here is covered by the documented field mutation outbox.

M00 marks these workflows implemented, but file presence and source behavior do not prove current deployed behavior. Full action/trigger mapping, payroll and ledger fixture reconciliation, and deployed-backend compatibility remain open under T01/T04.
