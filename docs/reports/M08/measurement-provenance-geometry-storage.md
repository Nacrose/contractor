# M08-T03: Measurement Provenance, Vector Geometry Storage & Invalidation Report

- **Task:** M08-T03 — Persist revision/page/crop/rotation/calibration provenance and vector measurement geometry
- **Milestone:** M08 PDF and BoQ-linked takeoff engine
- **Package:** `@contractor/native-takeoff` (`packages/native_takeoff/`)
- **Status:** Complete (13/13 tests passing, clean compile)
- **Normative References:** Platform Plan v3 §5.4 Takeoff/calibration row, §6 M08, §10 Standing Constraint 3; ADR-0013, ADR-0015.
- **Date:** 2026-10-12

---

## 1. Executive Summary & Architecture Scope

Task **M08-T03** delivers the versioned vector measurement storage, strict provenance model, and revision/recalibration invalidation engine in `@contractor/native-takeoff`.

Key architectural invariants enforced:
1. **Full Provenance Envelope:** Every measurement captures its source revision, page index, crop bounding box, rotation angle, and calibration version. Provenance is strictly queryable.
2. **Document Space Coordinate Isolation:** Vector geometry is stored strictly in unscaled document points ($1/72\text{ inch}$, ISO 32000-2 standard) with declared units ($m, m², ft, ea$). Viewport display zoom and DPI scaling are purely view-layer rendering concerns.
3. **No Silent Rebase (Platform Plan v3 §5.4):** Revision increments (`REV-A` $\to$ `REV-B`), recalibration, or crop/rotation shifts automatically flag affected measurements and downstream BoQ quantities as `NEEDS_REVIEW`. Derived quantities are **never silently rebased** onto new revisions without explicit human review.
4. **Change-Feed & Flutter-Parity (Standing Constraint 3):** Fully typed sync feed payloads with 1:1 mapping to Flutter's native `Offset(dx, dy)` and `CustomPainter`.

---

## 2. Provenance Data Model

Implemented in `packages/native_takeoff/src/provenance.ts`:

```typescript
export interface MeasurementProvenance {
  readonly documentId: string;
  readonly sourceRevisionId: string;
  readonly pageIndex: number;
  readonly cropBox: CropBox;
  readonly rotationDegrees: RotationDegrees;
  readonly calibrationId: string;
  readonly calibrationVersion: number;
  readonly calibrationRatio: CalibrationRatio;
  status: 'ACCEPTED' | 'NEEDS_REVIEW' | 'INVALIDATED';
  invalidationReason: InvalidationReason | null;
  invalidatedAtUtc: string | null;
  reviewedAtUtc: string | null;
  reviewedBy: string | null;
}
```

### Invalidation Reasons Supported:
- `SOURCE_REVISION_BUMPED`: When a drawing revision increments from `REV-A` to `REV-B`.
- `PAGE_RECALIBRATED`: When a page calibration is updated (scale factor modified).
- `CROP_OR_ROTATION_CHANGED`: When blueprint viewport crop box or sheet orientation rotates.
- `MANUAL_REVIEW_REQUESTED`: When an auditor requests manual engineering verification.

---

## 3. Vector Geometry Storage & Supported Types

Implemented in `packages/native_takeoff/src/geometry_storage.ts`:

| Geometry Type | Stored Representation | Document Units | Calibrated Units |
|---|---|---|---|
| **LINEAR_DISTANCE** | `{ start: Point2D, end: Point2D }` | $pt$ (1/72 in) | $m, cm, ft$ |
| **POLYLINE_PERIMETER** | `{ vertices: Point2D[] }` | $pt$ (1/72 in) | $m, ft$ |
| **POLYGON_AREA** | `{ outerLoop: Point2D[], holes: Point2D[][] }` | $pt²$ | $m², ft²$ |
| **COUNT_MARKER** | `{ location: Point2D, markerShape: 'circle' | 'square' | ... }` | Point | $ea$ |

### Repository Query Capabilities:
The `MeasurementRepository` enables indexed querying across:
- `documentId` and `revisionId`
- `pageIndex`
- `calibrationId`
- `status` (`ACCEPTED`, `NEEDS_REVIEW`, `INVALIDATED`)

---

## 4. Revision & Recalibration Invalidation Engine

Implemented in `packages/native_takeoff/src/invalidation_engine.ts`:

### 4.1 Invalidation Workflow
1. When a new document revision is registered, `invalidateForDocumentRevisionBump(docId, oldRev, newRev)` scans all measurements associated with `oldRev`.
2. Each measurement is flagged as `NEEDS_REVIEW` with `invalidationReason = 'SOURCE_REVISION_BUMPED'`.
3. Downstream financial linkages (`derivedQuantities`) are marked `NEEDS_REVIEW`, preventing unverified quantities from leaking into active payment certificates or billings.
4. Coordinates and calibrated quantities remain frozen—silent rebase is completely prevented.

### 4.2 Human Review Decisions
Engineers can review invalidated measurements using `applyHumanReview()`:
- `CONFIRM_AS_IS`: Confirms that the geometry remains valid on the new revision without modification; restores `ACCEPTED` status.
- `RECALCULATE_QUANTITY`: Recalculates quantities using updated calibration ratios; cascades updates to downstream BoQ links and restores `ACCEPTED`.
- `DISCARD`: Marks the measurement and downstream links as `INVALIDATED`.

---

## 5. Change-Feed & Flutter-Parity Path (Standing Constraint 3)

Implemented in `packages/native_takeoff/src/sync_feed_adapter.ts`:

### 5.1 Outbox Change Feed Events
- `TAKEOFF_MEASUREMENT_CREATED`
- `TAKEOFF_MEASUREMENT_UPDATED`
- `TAKEOFF_MEASUREMENT_INVALIDATED`
- `TAKEOFF_MEASUREMENT_REVIEWED`
- `TAKEOFF_CALIBRATION_ESTABLISHED`

Events are formatted with tenant isolation headers, document revision IDs, and complete vector geometry payloads.

### 5.2 Flutter Client Parity
`TakeoffSyncFeedAdapter.toFlutterDto()` maps document space coordinates to `pointsDocumentSpace: Array<{ dx, dy }>`. In Flutter:
- Points map 1:1 to `Offset(dx, dy)` in `CustomPainter`.
- No coordinate system conversion discrepancies occur between web canvas and Flutter native mobile viewports.

---

## 6. Conformance Suite Results

Automated verification in `packages/native_takeoff/tool/check.mjs`:

```
✔ document session never eagerly decodes all pages on initialization (1.02375ms)
✔ viewport tiling decomposes page into discrete tiles and culls non-visible regions (0.202333ms)
✔ bounded decoded-page cache enforces maxPages and maxMemory limits with LRU eviction (1.13875ms)
✔ cancellation aborts in-flight tile decode without leaking active jobs or memory (0.759542ms)
✔ rapid viewport panning cancels superseded in-flight renders cleanly (9.479333ms)
✔ explicit disposal clears all cache, cancels pending renders, and rejects subsequent calls (11.629834ms)
✔ adapter asserts authority boundary and rejects domain property leakage (0.137167ms)
✔ session operates with PDF.js reference adapter and PdfCraft candidate adapter cleanly (20.453083ms)
✔ provenance recording: every measurement captures revision, page, crop, rotation, and calibration (1.72525ms)
✔ geometry stored in unscaled document space points (1/72 in) with holes (0.117042ms)
✔ revision changes invalidate derived quantities rather than silently rebasing (v3 §5.4) (0.147583ms)
✔ recalibration invalidates affected page measurements and requires review (0.191333ms)
✔ change-feed integration and Flutter-parity DTO mapping (Standing Constraint 3) (0.226333ms)

native_takeoff: all document session, renderer adapter, viewport tiling, bounded page cache, cancellation, disposal, provenance, and invalidation tests PASSED (M08-T02/T03)
```
