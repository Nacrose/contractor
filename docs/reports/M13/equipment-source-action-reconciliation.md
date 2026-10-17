# Equipment source-action reconciliation

Status: **Core source composition, selected UI entry points, permissions and transaction boundaries reviewed for WF-018–020. Full control-by-control lifecycle and runtime acceptance remain open.**

Source baseline: private `Nacrose/Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Stable routes, action IDs and trigger candidates are in the [41-workflow crosswalk](../../frontend/original-workflow-source-crosswalk.json) and [canonical action index](../../frontend/original-action-component-index.json).

## Reviewed workflows

| Workflow | Route IDs and source behavior |
|---|---|
| WF-018 Fleet Registry & Rental Contracts | `ROUTE-025` equipment register and `ROUTE-098` utilization. The public `equipment` tRPC router composes `equipment-core`, `equipment-rental`, `equipment-vendor`, `equipment-spot-hire` and `equipment-fuel`; the older monolithic router is an aggregator, not the implementation unit. Fleet logs, status and maintenance are in core; rental terms, intervals, crew, billing runs and vendor/damage records are separate. |
| WF-019 Daily Fuel Dispensing & Dip-Reading Reconciliation | Same shared routes, with `equipment-fuel` procedures and `services/equipment-fuel.ts`. The equipment page has an explicit fuel tab and dip-reading dialog. Fuel issues can be drafts or auto-posted; posting values and decrements store stock, records a material transaction, and creates accounting/recovery entries according to responsibility. A dip reading only records measured-versus-book variance; a separate reconciliation adjusts stock valuation and may post a journal entry. |
| WF-020 Spot-Hire Equipment Work Orders | Same shared routes, with a Spot Hire tab and dialogs for ticket creation and bill consolidation. Tickets move through draft, submitted, approved, rejected or void states. Approved, unbilled tickets can be consolidated into a vendor bill; the transaction locks selected rows, checks same-vendor grouping and prevents duplicate billing. |

## Permission and transaction contracts

- Fleet reads require `project.equipment.view`; changes require `project.equipment.edit`; deletion has a separate delete grant. Financial rate fields are returned only when `project.equipment.financials.view` is allowed. Equipment status changes use the state-transition helper. Maintenance creation and resolution update equipment status in the same tenant transaction as the maintenance record.
- Rental changes have financial-edit guards. Billing run generation also requires accounting edit; approval/reversal use their specific equipment billing action grants plus accounting edit and a non-locked fiscal period. Crew changes can require HR identity and compensation grants in addition to rental authority.
- Fuel issue creation requires materials edit; linking to equipment or spot hire also requires equipment edit; auto-posting requires accounting edit. The business date must not be in a locked fiscal period, and references are checked against the project. Posting is idempotent for already-posted issues, accepts only draft/submitted states, and performs stock valuation/decrement, material transaction, and accounting/recovery work transactionally. Reversal only accepts posted issues and is blocked when downstream vendor recovery has already been applied.
- Dip readings require materials edit. Tank reconciliation additionally requires accounting edit, equipment financial edit and an unlocked reading period. It updates stock valuation and records shortage/surplus accounting consequences; it is a distinct, consequential action from recording the observation.
- Spot-hire creation/submission/voiding require equipment edit; approval/rejection require the billing-approval grant. Submission, approval and rejection run through the shared entity-action engine and audit the transition. Consolidation requires billing approval, accounting edit and equipment financial edit, plus an unlocked bill date. The transaction locks tickets, accepts only approved and unbilled tickets from one vendor, and records the vendor bill and fuel contra.

## UI mapping limits and Contractor implications

The shared equipment route includes fleet, logs, maintenance, rentals, fuel and spot hire components, while utilization is a separate report page. Static route hook candidates therefore overlap substantially across WF-018–020. The reviewed UI confirms entry points for fuel dip readings and spot-hire tickets/consolidation, but this packet does not yet map every button, form field, error path, background calculation or rental billing action to its stable trigger ID. The crosswalk retains the broader route/service overlap as a candidate rather than claiming complete parity.

Contractor implementations should preserve separate permissions for operational edits, financial visibility, accounting postings, approvals and reversals. Fuel issuance and physical tank reconciliation must keep inventory and ledger consequences atomic. Spot-hire approval must remain distinct from bill consolidation, and billed tickets must not be editable or voidable through a bypass. None of these operations appears in the documented field outbox; do not assume offline mutation support.

M00 marks all three source workflows implemented, but that status and source-file presence do not establish runtime acceptance. Full UI-trigger mapping, transaction tests and deployed-backend compatibility remain open under T01/T04.
