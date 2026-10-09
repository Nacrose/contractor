# construction_ui

Shared presentation components for the Flutter client. Components use the
canonical design-system rule IDs from `Construction_Manager/docs/DESIGN_SYSTEM.md`:

| Component | Rule IDs | Contract |
|---|---|---|
| `ActionBar` | PAGE-03/04/05, ACT-01, BTN-06 | One clipped row; bounded search; filters in a menu; compact secondary actions collapse into overflow; one labeled primary action. |
| `ConstructionTable` | §11, PAGE-03, STATE-01/02 | Headless rows and columns; search, filters, exports, selection commands, and domain summaries stay in the owning view/service. |
| `StatusBadge` | STATUS-01/04 | One presentation tone map; sentence-case labels; unknown status values use neutral styling. |
| `formatNpr` | MONEY-01 | Decimal-string display formatting with South Asian digit grouping and the in-product `Rs.` prefix; no amount arithmetic. |
| Dialogs | DLG-01/02/03 | Named width scale; scrolling body; explicit cancel followed by primary action; busy dialogs cannot pop. |
| Query and view states | STATE-01/02, BP-01 | Loading, error, empty, and data branches; empty state distinguishes filtered results and uses a decorative shared grid. |
| `ConstructionActionCoordinator` | BLOCK-01/02 | Coordinates one foreground user action and exposes its label; background sync and attachment transfers use the passive `SaveSyncStatusPanel` instead. |
| `SaveSyncStatusPanel` | SYNC-STATUS-01 | Presents local save, server acceptance, attachment completion, backup state, retained work, and the next recommended action without blocking unrelated app interaction. |

Colors, spacing, typography sizes, and radii are generated from the canonical
source in `packages/design_tokens/tokens.json`. `ConstructionSemanticColors`
uses the generated light or dark semantic palette based on the host theme's
brightness. `ConstructionTokens` exposes the generated spacing and type ramp.
No production route or screen consumes this package in M02-T03.

## Save and background sync

`SaveSyncStatusPanel` consumes the generated `SaveSyncStatus` contract. It
reports state but does not implement persistence, retry, rejection, or backup
behavior. Retryable failures and server rejections retain pending work in the
local outbox and expose the next user action through the contract. Background
sync and attachment transfers must not run through
`ConstructionActionCoordinator`.

## Checks

```sh
flutter pub get
flutter analyze
flutter test
```
