# Quality and safety source-action reconciliation

Status: **Source pass complete for the mobile punch-list register route; other quality/safety routes and target runtime remain open.** This is an M13-T01 source audit of the pinned original checkout, not an implementation-completion claim.

Source baseline: private `Nacrose/Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Route and trigger records are in the [canonical action index](../../frontend/original-action-component-index.json), [trigger-candidate sidecar](../../frontend/original-interaction-trigger-candidates.jsonl), and [coverage appendix](../../frontend/full-product-coverage.md).

## `/m/tasks` ownership

The page header and data source identify `/m/tasks` as the mobile punch-list register. It reads `project.list` and `punchList.list`, persists the chosen site in the shared field-site cache, filters already-loaded punch records locally, and offers punch status actions. It does not implement responsibility reassignment or an inbox of generic approval tasks. The route is therefore assigned to M13-T26 Quality & Safety, not M13-T18 or M00 WF-040. `/m/tasks/new` is the linked defect-capture route and is also owned by T26.

## Indexed control review

The route has eight reachable browser event controls, one callback-prop candidate, and one false-positive module candidate. `TRIGGER-441511855595` is the callback passed into `PunchCard`, not a separate user control; the rendered button is `TRIGGER-0A4026F76B06`. `TRIGGER-61C501A7D070` is `QuickTile.onClick` from another export in the shared `field-ui.tsx` module; `/m/tasks` does not render `QuickTile`, so it is explicitly dispositioned as unreachable from this route.

| Trigger ID | Control | Source behavior and policy |
|---|---|---|
| `TRIGGER-9EF5CBEE8F25` | Pull to refresh | Refetches the current punch list and project list. Read only; query persistence allows a clearly marked saved result while offline. |
| `TRIGGER-1EC8949DBF6A` | Site picker | Updates selected site and the shared saved field-site value. The site list comes from `project.list`; punch reads are scoped by the selected project ID. |
| `TRIGGER-3ED791A1CB73` | Status filter chips | Changes local filter state over the loaded punch rows. It does not alter server data. |
| `TRIGGER-7B541D8E9756` | Retry failed queued change | Requeues the current user's IndexedDB outbox item and requests a flush. It reuses the item's `clientUuid`, so server idempotency protects a response-loss replay. |
| `TRIGGER-A53603262118` | Discard failed queued change | Deletes that local outbox item. This does not send a server mutation or reverse a posted transition. Only items with `failed` status expose these controls. |
| `TRIGGER-2862BDA405DA` | Empty-state “Log a defect” CTA | Navigates to `/m/tasks/new`; capture and its attachment/outbox behavior belong to the new-item route. |
| `TRIGGER-DC4B644BCDF3` | Floating “Log a defect” action | Navigates to `/m/tasks/new`; capture and its attachment/outbox behavior belong to the new-item route. |
| `TRIGGER-0A4026F76B06` | Punch-card next-state button | Calls the handler passed through `PunchCard` (`TRIGGER-441511855595`), queues the status progression `open → in_progress → resolved → verified`, requests flush, then checks the outbox receipt to distinguish synced from locally queued. The app leaves `verified → closed` to office QA. |
| `TRIGGER-441511855595` | `PunchCard.onAction` callback binding | Parent-to-child callback binding for the button above; not an additional control. |
| `TRIGGER-61C501A7D070` | Shared `QuickTile` click handler | Not reachable here: this page imports `EmptyState`, `FieldSkeleton`, `SeverityChip`, and `StatusChip` from the module, but does not render `QuickTile`. Keep the sidecar candidate separate from the page's actual controls. |

`punchList.list` requires `project.punchList.view`. `punchList.updateStatus` requires `project.punchList.edit`, applies the server state machine and writes an audit record. Mobile queued writes carry an outbox-generated `clientUuid`; the procedure checks the idempotency result before re-fetching/guarding and treats an already-reached status as an idempotent no-op. `punchList.list` is in the persisted-query whitelist; photo bytes are stripped from its persisted payload. These policies are established by source and tests, but current deployed behavior, permission configuration and end-to-end offline recovery remain unverified.

The mobile status actions are durably queued and replayable; site selection and filters are local UI state. Retry/discard operate only on the current user's local outbox. A discard cannot be presented as a server-side reversal. This review does not claim that local save equals server acceptance.

## `/m/tasks/new` capture route

The capture page is also owned by T26. It reads the shared saved-site selection, requires title and description client-side, and queues `punchList.create` directly into the durable field outbox with an idempotency UUID. It awaits the flush and checks that queue item: a server acknowledgment shows success, a definitive failure keeps the form and its photo, and a still-pending write is described as saved locally before returning to the punch list. This is local queue acceptance, not proof of a posted server record.

| Trigger IDs | Controls | Source behavior and server boundary |
|---|---|---|
| `TRIGGER-AFB664DE7BFA` | Back | Returns through browser history; no write. |
| `TRIGGER-6145D3B0710A`, `TRIGGER-32F49D2F1CE2`, `TRIGGER-D20E37FB4509`, `TRIGGER-1EEC0AFC3180`, `TRIGGER-9A86053AE6C9` | Site, title, description, location, severity | Local form state. Changing site clears the selected assignee. Only title and description are required by the client form. |
| `TRIGGER-6F0E4A4D0FE5`, `TRIGGER-49C3F0F0312C`, `TRIGGER-74A1D391E823`, `TRIGGER-877802CEC40D`, `TRIGGER-7DC1D82F4EDD` | Assignee search, assignee selection, more assignees, due date, category | `eligibleAssignees` reads active accounts with project Punch List access and requires `project.punchList.view`; the create procedure revalidates selected assignee eligibility and requires `project.punchList.edit`. Search/pagination are online query operations. |
| `TRIGGER-C57164893283`, `TRIGGER-B450E52B1096`, `TRIGGER-E119F9F78B43`, `TRIGGER-87F812F7918A`, `TRIGGER-E9DFC0B4E8F8`, `TRIGGER-1F4615E499F2`, `TRIGGER-545E73F0CD48`, `TRIGGER-BC0357BAFA10`, `TRIGGER-143503FFF22F`, `TRIGGER-7E61A21BF800` | Remove photo, image/file drop, reject, camera/file input, drag/drop/paste and attachment removal | File paths converge on client photo compression and a single queued photo payload. Rejection is surfaced to the user; remove actions clear the in-memory photo or remove the selected image. Server creation validates image MIME and size limits. Photo data remains in the user-scoped local outbox until sync or discard. |
| `TRIGGER-F9BFA99AFB3D`, `TRIGGER-B95613BC8659` | SaveBar save callback and shared save button | One save control calls `handleSend`; the shared button candidate is its UI binding. The payload includes the selected project and only non-empty optional fields. The server assigns a project-scoped sequence number, checks linked references/assignee and records an audit event; the outbox UUID makes replay idempotent. |
| `TRIGGER-A41647819330`, `TRIGGER-160BA4C2A3E2`, `TRIGGER-814583EDE6DD` | Shared text, select and segmented field bindings | Generic field component callbacks that update the named form state above; they are not additional business actions. |

The create endpoint is online-only as a server mutation, while the mobile UI's durable outbox makes this specific create command replayable offline. There is no permission bypass: a queued item is not accepted until the server applies the same project edit and reference checks. The route has source tests for offline idempotency and supported image validation; target runtime, media persistence across process restart, and server compatibility still need verification.
