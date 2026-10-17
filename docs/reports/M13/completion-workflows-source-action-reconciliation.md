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

## WF-040 handover manager trigger review

The `ResponsibilityHandoverManager` imported by `ROUTE-102` was followed from each indexed control handler to its client query/mutation and the corresponding `responsibilityHandover` procedure. The crosswalk marks these 18 trigger IDs as source-reviewed; this is a source trace, not a runtime acceptance claim:

| Control group | Trigger IDs | Source behavior and server boundary |
|---|---|---|
| Search, participant selection, assignment kind, date, reason, and item selection | `TRIGGER-82C3A2BAF5AE`, `TRIGGER-5F8A8B03C6DC`, `TRIGGER-7F3173223ADF`, `TRIGGER-BD0B4703148B`, `TRIGGER-7FF82FBC88F8`, `TRIGGER-16D21EDDDF6B`, `TRIGGER-E91808C24762` | Local form state. Account lookup uses `accountOptions`; project-scoped lookup requires project access-management authority, while organization lookup requires `org.team.accounts.manage`. The handler clears selected work when either participant changes. The server validates same-organization active recipients and typed, bounded inputs. |
| Load more accounts and responsibilities | `TRIGGER-9656A043C87D`, `TRIGGER-01FAD93F5D39`, `TRIGGER-F22901221A11` | Paginated `accountOptions` and `discoverAssignments` reads. Discovery filters work by organization and open state, then returns only work the actor may manage; it labels recipient eligibility and does not make inaccessible work selectable. |
| Create, apply and resume | `TRIGGER-B38B26A28EA4`, `TRIGGER-AD4A7F89916F`, `TRIGGER-EFA2D8B3C464`, `TRIGGER-8F962CA7BF0B` | Create calls `begin` with an idempotency key and selected items, then applies in batches of at most 100. A failed apply keeps the persisted plan available for retry. Resume selects a plan from `listPlans`; `pendingItems` and `applyBatch` are scoped to its organization and initiator or an organization account manager. Batch processing locks plan and participants, checks recipient authority, and is retry-safe for completed items. |
| Skip blocked item | `TRIGGER-81923AAD264F` | The handler requires a non-empty prompt reason and calls `skipItem`. The server only cancels an item still pending in an in-progress plan and retains the actor and reason; cancelling the prompt makes no mutation. |
| Offboard account | `TRIGGER-357F0099599C`, `TRIGGER-FE6475A54A29`, `TRIGGER-7E1D4FC80E3F` | The button opens a confirmation dialog; confirmation calls `offboardAccount`. The server requires `org.team.accounts.manage`, rejects self-offboarding and organization owners, rechecks there is no open tracked responsibility, and deactivates/revokes access transactionally with audit. Employment termination remains separate. |

One visible control combines `begin` and the first `applyBatch`; the plan may therefore be persisted even if a later batch fails. The UI preserves the plan ID and reloads pending items for recovery. All reviewed handlers are online-only tRPC operations or local form state; none is a durable offline mutation. Query-backed form availability and effective permission behavior still need target-runtime verification. The update does not close WF-040 or T01.

Route ownership correction: `/m/tasks` is a punch-list register with durable field status updates, not a responsibility-handover screen. It is assigned to M13-T26 and removed from WF-040's route crosswalk; `/m/tasks/new` already belongs to T26. The full source trace is in [quality and safety reconciliation](quality-safety-source-action-reconciliation.md).

Contractor should keep JV payout and IPC payment-summary semantics aligned with the user-approved IPC contract, preserve RFI/submittal cross-record validation, and make handover a recipient-authorized, auditable batch process. Dashboard visibility should be composed from per-metric grants. Do not treat M00's implemented/partial labels as runtime acceptance.
