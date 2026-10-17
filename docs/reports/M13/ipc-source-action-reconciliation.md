# IPC source-action reconciliation

Status: **Source behavior reviewed; Contractor replacement is specified, implementation and runtime acceptance remain open.**

Source baseline: private `Nacrose/Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`. This record separates the legacy source behavior from the user-directed Contractor/GridCraft behavior. Source action IDs below are from [`original-action-component-index.json`](../../frontend/original-action-component-index.json); route-scoped JSX candidates remain in [`original-interaction-trigger-candidates.jsonl`](../../frontend/original-interaction-trigger-candidates.jsonl).

## Source routes and actions

| Route ID | Canonical route | Observed source behavior |
|---|---|---|
| `ROUTE-032` | `/projects/[id]/ipc` | IPC register, search/export, create dialog, delete draft. Hooks: `ACTION-5243EDEA0A82` `ipc.actionAccess`, `ACTION-7C49DAE3E737` `ipc.create`, `ACTION-AFD2E1CF6A12` `ipc.delete`, `ACTION-84BBB7B9F434` `ipc.list`, plus subcontractor and project-profile reads. 62 event-handler candidates reach this route. |
| `ROUTE-030` | `/projects/[id]/ipc/[ipcId]` | Summary/detail, BOQ item load, status transitions, scanned-bill/document actions, supporting detail and entry to the worksheet editor. Hooks: `ACTION-3CC9AC93F85E` `ipc.actionAccess`, `ACTION-050111F6F088` `ipc.delete`, `ACTION-FC14906C0521` `ipc.getPaymentSummary`, `ACTION-3BDA09EAED26` `ipc.listItems`, `ACTION-AF18E56F8D85` `ipc.loadBoq`, `ACTION-76C574C731AD` `ipc.update`; related document, VAT, BOQ-diff and subcontractor hooks are also indexed. 69 event-handler candidates reach this route. |
| `ROUTE-104` | `/projects/[id]/ipc/[ipcId]/worksheets` | Full-screen legacy measurement-book editor. Hooks: `ACTION-24682356A943` `ipc.actionAccess`, `ACTION-F617D101CF35` `ipc.getPaymentSummary`, `ACTION-DED449411FE4` `ipc.listItems`, `ACTION-E6BCDEA706BB` `ipc.syncQuantities`, `ACTION-589EE4DF16CF` `ipc.update`, `ACTION-03FF583E0081` `worksheet.get`, `ACTION-00E7966752C0` `worksheet.save`, plus project/VAT reads and writes. 598 event-handler candidates reach this route because it imports the worksheet editor component graph. |

## Reviewed service behavior

| Procedure | Source permission and validation behavior | Offline policy in the original client |
|---|---|---|
| `ipc.list` | Protected procedure; checks project membership and `project.ipc.view`. | Online query; not in the durable offline read whitelist. |
| `ipc.actionAccess` | Protected procedure; requires IPC view, then separately evaluates IPC edit, IPC delete and BOQ view, returning capability booleans. | Online query; not durably cached by the offline policy. |
| `ipc.create` | Protected mutation; checks writable organization, `project.ipc.edit`, period lock, duplicate project/number, and that optional subcontractor/BOQ version references belong to the project. Rechecks edit/reference scope in the tenant transaction and records a financial event and audit record. | Online-only mutation; no IPC outbox action exists. |
| `ipc.delete` | Protected mutation; checks `project.ipc.delete` and deletes only a draft, with a transaction and audit record. | Online-only mutation. |
| `ipc.getPaymentSummary` | Protected query; resolves IPC project scope and checks `project.ipc.view`; calculates previous/current/cumulative bill, price adjustment, VAT, advance, retention, TDS, contractor tax, material deductions, net payable and progress. | Online query; not durably cached by the offline policy. |
| `ipc.listItems` | Protected query; checks IPC view. A notable side effect: when an empty draft has BOQ rows and the user also has IPC edit and BOQ view, this query initializes IPC items and recalculates the IPC inside a transaction. | Online query; not durably cached. Its write-on-read behavior must not be carried into the new summary-only Contractor path. |
| `ipc.loadBoq` | Protected mutation; checks writable organization, IPC edit and BOQ view, blocks locked/posted states, replaces bill items from BOQ and recalculates totals transactionally. | Online-only mutation. |
| `ipc.update` | Protected mutation; checks IPC edit and applies status-specific validation and accounting behavior for finalize, revert and paid transitions. | Online-only mutation. |
| `worksheet.get` | Protected query; derives IPC scope from `ipc:<id>:mb`, checks IPC view, requires organization context, then reads the saved worksheet document. | Online query; no durable IPC worksheet read policy. |
| `worksheet.save` | Protected mutation; checks IPC edit, exact IPC document key/scope match, project/IPC existence and editable IPC status, organization context, workbook shape and expected version. It writes the worksheet document and synchronizes workbook quantities into IPC data. | Online-only mutation; no IPC workbook outbox exists. |
| `ipc.syncQuantities` | Protected mutation; checks writable organization and IPC edit, blocks certified/approved/paid and live-posted journal states, then updates quantities and recalculates under transaction/row lock. | Online-only mutation. |

Permission names above are verified against the procedure bodies in `src/server/routers/ipc.ts` and `src/server/routers/worksheet.ts`; they supersede the index's static “candidate” labels for these listed operations. This review does not establish deployed-backend compatibility, nor does it claim equivalent runtime behavior in Contractor.

## Contractor and GridCraft disposition

These target decisions come from the user and override only the corresponding legacy workbook behavior:

- Contractor creates the IPC record and provisions a **separate persistent GridCraft workbook per IPC**. The IPC-to-workbook link must survive app restarts and reopen the same workbook in the full GridCraft app.
- GridCraft owns all workbook and payment-calculation editing. Contractor does not call the legacy `worksheet.save`, `ipc.syncQuantities` or BOQ-to-IPC write path as a substitute for workbook editing.
- Contractor reads and displays only a validated **Summary of Payment** from the linked workbook. It does not independently recalculate bill payable figures from the old `ipc.getPaymentSummary` formula path. The Bill and price-adjustment calculation sheets remain inside GridCraft. An Abstract of Quantity sheet is not required for Contractor bill calculation.
- Workbook revision/freshness, parsing, validation, recovery and last-good display are acceptance requirements for T14–T16. A missing, stale, malformed or ambiguous Summary of Payment must not appear as current payment data.
- IPC lifecycle actions such as draft deletion, finalize/revert, mark paid, scanned bill and document history are separate from workbook editing. This source review records them for later task ownership; it does not silently remove or authorize those behaviors.

This closes the source service/permission and user-directed disposition review for the listed IPC endpoints. The 729 IPC-route event candidates (62 register, 69 detail and 598 worksheet-editor candidates) still need UI-level semantic review; the procedure links do not prove every handler path. Other workflows need the same source/permission/offline review before M13-T01 can close. T01 also retains the explicit T04 prerequisite to identify and verify the deployed API/schema revision.
