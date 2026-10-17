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
