# Remaining workflow source-action reconciliation

Status: **Core JV, RFI/submittal, responsibility-handover and dashboard source boundaries reviewed for WF-038–041. Full trigger-level mapping and runtime acceptance remain open.**

Source baseline: private `Nacrose/Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Stable route IDs and candidate operations are in the [41-workflow crosswalk](../../frontend/original-workflow-source-crosswalk.json) and [canonical action index](../../frontend/original-action-component-index.json).

## Reviewed workflows

| Workflow | Routes and source behavior |
|---|---|
| WF-038 Joint Venture Partner Agreements & Profit Sharing | Organization finance and project accounting (`ROUTE-074`, `ROUTE-096`). Agreement reads require JV permission plus IPC and payments view. Certified IPC turnover is used to calculate commission. Payout mutation uses `financialGuard` for fiscal lock, delegation and bank-account isolation, then journals and audits the payment. The product is a single-firm managed JV commission model, not a general multi-party equity/capital-contribution ledger despite the broader M00 label. |
| WF-039 RFI & Submittal Workflow Lifecycles | RFI alias/RFI, Submittals and workflow RFI routes (`ROUTE-042`, `ROUTE-045`, `ROUTE-057`). RFI and submittal services are separate. Their create/submit/respond/review paths use typed state transitions and distinct view/edit/respond/decision permissions. Linked BOQ, Gantt and drawing references are checked for same-project ownership and corresponding view permissions. |
| WF-040 Responsibility Handover & Delegation Rules | Access status, project tasks, mobile tasks and the HR hierarchy page (`ROUTE-095`, `ROUTE-115`, `ROUTE-092`, `ROUTE-102`). The handover manager is embedded in `projects/[id]/hr/hierarchy/page.tsx`; this route was missing from the original WF-040 crosswalk and is added here. The service discovers eligible assignments and applies batches only after checking the receiving user has the required project or organization permissions. |
| WF-041 Analytical Dashboard & Management KPIs | Existing global/project dashboards and planning overview (`ROUTE-010`, `ROUTE-021`, `ROUTE-038`). Dashboard queries are read-only and each metric checks its required project view grant; financial summary and roster visibility use dedicated grants. M00 labels this workflow partial, which remains the source status pending acceptance evidence. |

## Permission, lifecycle and implementation boundaries

- JV agreement view is separately authorized from IPC and payment visibility. Payouts must pass fiscal period and delegation checks, use a bank account belonging to the organization, update its balance with the journal posting, and retain the JV payout audit trail. Commission is based on qualifying finalized/certified client IPCs in the legacy implementation; Contractor's user-directed Summary of Payment boundary will need an explicit adaptation before reusing this calculation.
- RFI edit, respond and delete permissions are distinct. Some RFI changes synchronize to the daily program and therefore require daily-program edit plus relevant BOQ/HR view authority. Submittal creation validates linked records and cross-domain view grants; submit/review are typed transitions. Attachment MIME types are allowlisted to avoid serving active content.
- Responsibility handover uses an idempotency key, sorted/deduplicated assignment selections and organization/participant locks. It verifies both actor and receiver rights for each assignment before applying a batch, and does not allow cancelling a partially applied handover in a way that would split its audit trail. This is a multi-domain action and cannot be implemented as a simple assignee field edit.
- Dashboard aggregations are permission-filtered read paths. A visible card does not grant access to its underlying financial, roster, drawing, RFI or schedule data. Cross-project activity uses a separate readable-project resolver.

## Mapping limits and Contractor implications

These routes contain many metrics and state transitions, and the dashboard M00 status remains partial. Source review has not verified every UI trigger, notification, report export, sample commission calculation, handover exception or deployed permission configuration. The added WF-040 hierarchy route makes the component's known handover hooks discoverable in the crosswalk; their full trigger records still need human-reviewed semantics.

Contractor should keep JV payout and IPC payment-summary semantics aligned with the user-approved IPC contract, preserve RFI/submittal cross-record validation, and make handover a recipient-authorized, auditable batch process. Dashboard visibility should be composed from per-metric grants. Do not treat M00's implemented/partial labels as runtime acceptance.
