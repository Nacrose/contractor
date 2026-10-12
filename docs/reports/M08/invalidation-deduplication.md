# M08-T06: Recalibration/Revision Invalidation & Double-Counting Prevention Report

- **Task:** M08-T06 — Recalibration/revision invalidation and double-counting prevention
- **Milestone:** M08 PDF and BoQ-linked takeoff engine
- **Package:** `@contractor/native-takeoff` (`packages/native_takeoff/`)
- **Status:** Complete (27/27 tests passing, clean compile)
- **Normative References:** Platform Plan v3 §5.4, §6 M08; M02-T05 Save/Sync Model (`SaveSyncState`); ADR-0013, ADR-0015.
- **Date:** 2026-10-12

---

## 1. Executive Summary & Scope

Task **M08-T06** implements robust invalidation cascades and double-counting prevention for the PDF takeoff and BoQ integration engine.

Key architectural requirements satisfied:
1. **No Silent Persistence (v3 §5.4):** When a drawing revision is bumped (e.g., `REV-A` $\to$ `REV-B`), a page is recalibrated, or crop/rotation changes, affected measurements and downstream linked BoQ cells are flagged as `NEEDS_REVIEW`. Accepted quantities cannot silently persist without review.
2. **Double-Counting Prevention & Replay Idempotency:** Repeated links, client retries, and replayed change-feed messages (M03 feed replay) cannot double-count quantities. Distinct-link aggregation ensures that multi-measurement totals aggregate correctly ($100.00 + 50.00 = 150.00$) while replays of any single measurement update in-place idempotently ($100.00 + 50.00 = 150.00$, never multiplying by replay iterations).
3. **M02-T05 Save/Sync Model Visibility:** Review states are first-class citizens in `SaveSyncState`. An unresolved review sets `pendingWorkRetained = true` and `nextUserAction = 'review_server_rejection'`, preventing unreviewed data from being treated as clean/synchronized.
4. **Resolution Exclusively via Domain Path:** Review states cannot be cleared by arbitrary UI toggles; they clear only through canonical domain resolution methods (`CONFIRM_AS_IS`, `RECALCULATE_QUANTITY`, `DISCARD`) in `TakeoffBoqLinkService` and `TakeoffInvalidationEngine`.

---

## 2. Invalidation & Downstream Propagation

```text
Drawing Revision Bump / Page Recalibration
                 │
                 ▼
┌─────────────────────────────────────────┐
│       TakeoffInvalidationEngine         │
│  - Sets measurement status:             │
│    NEEDS_REVIEW                         │
│  - Records invalidation reason & time   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         TakeoffBoqLinkService           │
│  - invalidates downstream links         │
│  - marks ReflectedBoqCell:              │
│    needsReview = true,                  │
│    status = 'NEEDS_REVIEW'              │
│  - ❌ Accepted quantities CANNOT        │
│    silently persist                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      TakeoffSaveSyncTracker             │
│  - pendingWorkRetained = true           │
│  - serverAcceptance = 'rejected'        │
│  - nextUserAction =                     │
│    'review_server_rejection'            │
└─────────────────────────────────────────┘
```

When an invalidation occurs:
- Measurements and their derived links move to `'NEEDS_REVIEW'`.
- All affected BoQ cells have their `needsReview` flag set to `true` and status changed to `'NEEDS_REVIEW'`.
- Posting new quantities against unreviewed measurements fails-closed with `INVALID_MEASUREMENT_STATUS`.

---

## 3. Double-Counting Prevention & Idempotency Fixture Evidence

### 3.1 Idempotency Key & In-Place Link Updates
- Each link has a deterministic identity: `link-${measurementId}-${boqCode}-${cellRef}`.
- Replaying the same measurement posting request (with or without `idempotencyKey`) updates the existing link in-place rather than appending a duplicate entry.
- When an `idempotencyKey` is provided, cached receipts are returned with `isIdempotentReplay: true`.

### 3.2 Distinct-Link Multi-Measurement Aggregation
Where multiple distinct measurements contribute to a single BoQ cell (e.g., Room A floor area $100.00\text{ m}²$ and Room B floor area $50.00\text{ m}²$):
- Cell `sheet-finishes:colQty:row25` aggregates both: $100.00 + 50.00 = 150.00\text{ m}²$.
- Replaying Room A 10 times and Room B 10 times results in the same cell total: $150.00\text{ m}²$, proving zero accumulation drift.

---

## 4. Shared Save/Sync Model Visibility & Resolution Paths

### 4.1 M02-T05 SaveSyncState Integration
- While review items remain unresolved:
  ```json
  {
    "localPersistence": "saved",
    "serverAcceptance": "rejected",
    "attachmentCompletion": "not_required",
    "backup": "current",
    "pendingWorkRetained": true,
    "nextUserAction": "review_server_rejection"
  }
  ```
- Direct UI bypass is strictly prohibited: calling `directClearReviewState()` throws an explicit error.

### 4.2 Canonical Domain Review Resolution Paths

| Action | Domain Behavior | BoQ Cell Effect |
|---|---|---|
| **CONFIRM_AS_IS** | Re-accepts existing quantity and geometry at new revision. | Restores cell status to `ACCEPTED`, clears `needsReview`. |
| **RECALCULATE_QUANTITY** | Recalculates calibrated quantity with new scale factor/calibration ratio. | Recalculates exact-decimal cell sum with updated quantity, restores cell status to `ACCEPTED`. |
| **DISCARD** | Marks measurement and link as `INVALIDATED`. | Removes link from cell's active sum and recalculates cell quantity without the discarded contribution. |

Once all pending review items are resolved, `SaveSyncState` automatically resets:
- `pendingWorkRetained: false`
- `serverAcceptance: 'accepted'`
- `nextUserAction: 'none'`

---

## 5. Verification & Test Suite Summary

Executed via `node packages/native_takeoff/tool/check.mjs`:
- `test/document_session.test.ts` (8/8 passing)
- `test/measurement_coverage.test.ts` (5/5 passing)
- `test/provenance_storage.test.ts` (5/5 passing)
- `test/takeoff_boq_link.test.ts` (5/5 passing)
- `test/invalidation_deduplication.test.ts` (4/4 passing):
  - `✔ recalibration and revision invalidation: downstream BoQ quantities marked for review (no silent persistence)`
  - `✔ double-counting prevention: repeated links and replayed measurements are idempotent`
  - `✔ review state visibility in shared save/sync model (M02-T05) and domain resolution`
  - `✔ review resolution with DISCARD removes quantity contribution cleanly`

**Total: 27/27 tests passing across 5 suites.**
