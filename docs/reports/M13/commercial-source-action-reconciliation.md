# BOQ, rate-analysis and version source-action reconciliation

Status: **Core service and permission boundaries reviewed for WF-006–009. Detailed form controls, the full catalog lifecycle and runtime behavior remain unverified.**

Source baseline: private `Nacrose/Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Stable route, hook-action and event-candidate IDs are in the [workflow crosswalk](../../frontend/original-workflow-source-crosswalk.json) and [canonical action index](../../frontend/original-action-component-index.json).

## Route reconciliation

| Workflow | Source route(s) | Source evidence |
|---|---|---|
| WF-006 BoQ Item Hierarchy & Quantities | `ROUTE-012` `/projects/[id]/boq` | `boq.list/create/update/delete/duplicate/compare/actionAccess`, plus lock, import/export, rate-inspector, presets and project-cost coverage actions. M00 engine `src/server/routers/boq.ts`, `src/server/utils/boq-calc.ts`; BOQ router test file exists. |
| WF-007 Government Rate Analysis | `ROUTE-012` `/projects/[id]/boq`; `ROUTE-111` `/projects/[id]/rate-library` | Rate-analysis ingredient and purpose operations plus catalog/profile application. M00 engine `rate-analysis.ts` and `boq-calc.ts`; rate-analysis test file exists. |
| WF-008 Rate Profiles & Market Rate Revisions | `ROUTE-117` `/rate-catalogs`; `ROUTE-111` `/projects/[id]/rate-library`; `ROUTE-070` `/admin/rate-catalogs`, with shared BOQ/rate-analysis actions | Global, organization and project rate-catalog paths and project rate-profile preview/apply. M00 engine `rate-profile.ts` and `rate-profile-refresh.ts`; rate-profile test file exists. |
| WF-009 BoQ Versioning & Change Comparison | `ROUTE-048` `/projects/[id]/variations`, `ROUTE-047` `/projects/[id]/variations/[voId]` and `ROUTE-030` `/projects/[id]/ipc/[ipcId]` | The Variations register contains the Snapshots tab and Variation Order register; VO detail edits and transitions the change that may create the next BOQ snapshot. IPC detail requests a selected BOQ version diff. M00 engine `boq-version.ts` and `boq-snapshot.ts`; version test file exists. |

The first WF-009 crosswalk incorrectly linked `/projects/[id]/planning/revision/[versionId]`. Source inspection showed that route uses `gantt.getRevisionDocument`; the BOQ snapshot UI is in Variation Orders. The workflow map now points to the actual Variations snapshot tab and the IPC detail diff. `boq-versions-tab.tsx` was not missing from the source scanner; the initial route-to-workflow association was wrong.

## Reviewed service behavior

- BOQ reads and comparisons require `project.boq.view`. Create and inline update require `project.boq.edit`; delete uses `project.boq.delete`; locking uses `project.boq.lock`. Create/update/delete/duplicate honor the project BOQ lock and individual item lock where applicable. Codes are project-unique; edits recheck the row inside a transaction, and amounts are recalculated as quantity × contractual rate.
- Duplicating a BOQ item assigns a non-colliding code and copies its direct ingredients, rate analyses, ingredients, and provenance into the same project. Listing includes execution totals derived from daily-program actual quantities; comparison calculates a selected rate analysis and reports missing/incomplete/complete status and contract margin.
- Contractual BOQ rates remain explicit values. Engineering rate analysis is separate: fixed ingredient costs are grouped by material/labor/equipment/overhead; percentage provisions are calculated in saved order against their selected base; batch size determines the unit rate. Resource-demand calculation excludes percentage provisions and overhead and scales batch ingredients to BOQ quantity.
- Project rate profiles require BOQ view/edit permission. Applying a profile is edit-only, requires a preview fingerprint, verifies the profile and analysis belong to the same project, rejects a locked BOQ/item, and commits serializably. This prevents applying rates from a stale preview or a guessed cross-project analysis ID.
- Rate catalogs have three distinct scopes. Global create/edit is superadmin-only; organization scope requires `org.inventory.edit` (or org admin); project scope requires `project.materials.edit`. Reads use the matching view grants. Catalog materials and rates must share scope, and a new org/project catalog can only inherit from its permitted parent scope. This is separate from project rate-analysis editing, which uses the BOQ grant.
- BOQ version creation snapshots a non-empty current BOQ with its rate-analysis ingredients/calculation version and retries numbering conflicts. Approval is a compare-and-swap from draft, requires `project.boq.lock`, and locks the project BOQ in the same transaction. Version diffs compare a snapshot with live BOQ or another version and verify both versions belong to the project. A separate project lock action can lock or unlock under the same permission; the Contractor workflow must evidence the intended approved-baseline policy explicitly.

No BOQ, rate-analysis, profile or catalog operation appears in the field outbox whitelist. These are online server actions; none is durably cached as an offline read by the exact query whitelist. Tests named by M00 are present in the pinned source tree, but this inventory does not claim they ran or passed.

## Contractor implementation implications

T10–T12 need to preserve the distinction between contract quantities/rates, engineering analysis, scoped material/rate catalogs, and immutable BOQ snapshots. Verify project isolation, lock behavior, snapshot versions, concurrent changes, stale rate-profile preview rejection and exact financial calculations against the compatible backend. The user’s IPC direction remains separate: the Contractor BOQ module can own its authorized BOQ actions, while IPC calculation sheets stay in GridCraft and Contractor consumes only the validated Summary of Payment.

This review covers the core service and permission contracts only. It does not verify every BOQ/rate/catalog button, import/export validation, error/cancel path or full browser journey, and it does not close M13-T01.

## BOQ snapshot lifecycle trigger review

The snapshot tab mounted in `ROUTE-048` was followed through the imported `BoqVersionsTab` and `src/server/routers/boq-version.ts`. This is a focused review of the baseline lifecycle, not the full BOQ hierarchy or rate-catalog control inventory.

| Trigger ID | Source behavior | Contractor acceptance consequence |
|---|---|---|
| `TRIGGER-F14D6523985F`, `TRIGGER-71B0E7A01082` | An editor opens “Create Snapshot” and creates a draft snapshot of the current BOQ. The server requires `project.boq.edit`, rejects an empty BOQ, snapshots current rows and retries serializable/version-number conflicts. | Preserve the explicit snapshot boundary and ensure no partial snapshot appears when version allocation conflicts. |
| `TRIGGER-36F13A858CDC`, `TRIGGER-017A47B74357` | A draft version opens a confirmation; confirmation calls `boqVersion.approve`. The source server requires `project.boq.lock`, applies a compare-and-swap transition and locks the project BOQ in the same transaction. | Model the lock grant separately from general BOQ edit capability. The legacy tab's `canWrite` UI gate is based on edit access, so the server remains the effective authority when the distinct lock grant is absent. |
| `TRIGGER-138F80DC4953`, `TRIGGER-6D216F1E99C9` | Selects a saved version and optionally chooses a comparison version/current BOQ for the displayed diff. These are reads; they do not mutate either snapshot. | Keep selected baseline identity and comparison target explicit; viewing a diff must never change the approved baseline. |

These snapshot trigger IDs are marked source-reviewed for WF-009 in the generated crosswalk. Inline BOQ edits, imports/exports, rate-analysis controls and remaining VO controls stay unreviewed candidates.

## Variation-order lifecycle trigger review

Route reconciliation showed that the route used for BOQ snapshots also owns Variation Orders, while each VO's detail route had not been included in the WF-009 route list. M00 describes snapshots such as a “Variation Order” version; the canonical change route is `ROUTE-047`. It is now included explicitly, with its T12 owner preserved in the route coverage appendix.

| Trigger ID | Source behavior and permission | Contractor acceptance consequence |
|---|---|---|
| `TRIGGER-628518F1BB88` | Creates a draft VO through `variationOrder.create`; server requires `project.variations.edit`, a unique project/number pair and tenant-scoped creation/audit. | Keep VO creation in its own project-scoped lifecycle and surface numbering conflicts without silently changing identity. |
| `TRIGGER-98B8F794AA82` | Saves VO items through `variationOrder.update`; draft-only, requires variations edit, and requires BOQ view when linking existing items. Linked BOQ IDs are rechecked against the same project inside the transaction. | Validate linked rows and stale draft status at save time; an extra item and an edit to an existing contract item must remain distinguishable. |
| `TRIGGER-0B74FB1AD490`, `TRIGGER-A6C23BC29477`, `TRIGGER-791450CABBB6` | Submit, reject and reopen transitions call `variationOrder.updateStatus`; server requires the matching edit/reject decision permissions and checks the allowed state transition. | Keep submit, rejection and reopen as distinct guarded actions with their own audit outcomes. |
| `TRIGGER-DF05F79A9F31`, `TRIGGER-C6A6DA29D436` | Opens and confirms “Approve & Merge.” Approval requires both `project.variations.approve` and BOQ edit, plus an unlocked accounting period. In one serializable transaction it transitions the VO, merges items into the project BOQ and creates an approved linked BOQ version snapshot. It intentionally creates no revenue journal entry; revenue is recognized by later IPC billing. | Treat approval as a consequential contract baseline change. Preserve atomic merge+snapshot, cross-project rejection and no double-counted approval revenue. Do not expose it as an ordinary status edit. |

The generator records these reviewed IDs on WF-009 and includes `ROUTE-047` in its canonical route list. Other VO controls, attachment/export behavior and the complete post-approval downstream projection remain open for T01/T12 acceptance.
