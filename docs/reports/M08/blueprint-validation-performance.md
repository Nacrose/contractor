# M08-T07: Multi-Page, Rotated, Mixed-Size & Scanned Blueprint Validation & Large-PDF Performance Report

- **Task:** M08-T07 — Multi-page, rotated, mixed-size and scanned blueprint validation + large-PDF performance evidence
- **Milestone:** M08 PDF and BoQ-linked takeoff engine
- **Package:** `@contractor/native-takeoff` (`packages/native_takeoff/`)
- **Status:** Complete (31/31 tests passing, clean compile)
- **Normative References:** Platform Plan v3 §6 M08, §7 Performance, §8 Documents row; M00 PDF Fixture Generators (`fixtures/platform-parity/pdf_canvas/generators/generate-multipage-pdf-spec.mjs`).
- **Date:** 2026-10-12

---

## 1. Executive Summary & Scope

Task **M08-T07** delivers the blueprint validation subsystem and large-document performance verification for the Contractor native/web takeoff engine.

Key architectural requirements satisfied:
1. **Comprehensive Blueprint Validation Matrix:** Validates high-page-count construction document bundles (120+ pages) featuring mixed standard paper sizes (A4, A3, Letter, Legal, Tabloid), orthogonal page rotations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$), and scanned raster submittals without crash or coordinate drift.
2. **Strict Fail-Closed Malformed Blueprint Rejection:** Rejects corrupt page geometries, negative dimensions, non-orthogonal rotations, discontinuous page sequences, and out-of-bounds crop boxes with explicit errors (`MalformedBlueprintError`, `InvalidRotationError`), preventing silent mis-measurement.
3. **Enforcement of Vector Overlay Policy (v3 §6 M08):**
   > *"Vector overlays do not imply automatic extraction of all PDF geometry (v3 §6 M08)."*
   The takeoff engine enforces that vector takeoff markups are calibrated, user-drawn or imported vector layers in document space. Automatic extraction of unstructured raw PDF geometry streams is explicitly rejected (`AutomaticExtractionNotSupportedError`), avoiding brittle heuristic parser assumptions.
4. **Large-PDF Performance Evidence:** Proven performance across multi-page document sessions: memory remains strictly bounded within budget ($< 8\text{ MB}$ / configured limit) via LRU page cache eviction; 512x512 tiled viewport with frustum culling prevents eager full-page rasterization; and rapid panning/navigation actively cancels in-flight decodes via `AbortSignal`.

---

## 2. Blueprint Validation Matrix

Exercised on a synthetic 120-page blueprint submittal package (parity with `fixtures/platform-parity/pdf_canvas/generators/generate-multipage-pdf-spec.mjs`):

| Page Category | Format / Sizes | Rotations | Raster / Vector Mode | Validation Behavior |
|---|---|---|---|---|
| **Architectural / Site Plans** | A3 Landscape ($1190.55 \times 841.89\text{ pt}$) | $0^\circ, 90^\circ$ | Vector drawing | Identified as A3; viewport area mapped cleanly. |
| **Engineering Details** | A4 Portrait ($595.28 \times 841.89\text{ pt}$) | $0^\circ, 180^\circ$ | Vector drawing | Identified as A4; orientation normalized. |
| **Specifications & Notes** | Letter ($612 \times 792\text{ pt}$) | $0^\circ$ | Tabular schedule | Identified as Letter; tabular metadata preserved. |
| **Legal Agreements** | Legal ($612 \times 1008\text{ pt}$) | $0^\circ, 270^\circ$ | Tabular schedule | Identified as Legal; rotated bounds evaluated. |
| **Scanned Submittals** | Mixed (300 DPI raster scans) | Any orthogonal | Scanned raster | Flagged `isScannedRaster: true`; raster background with vector takeoff overlay layer. |

---

## 3. Malformed Blueprint Handling (Fail-Closed, Zero Silent Mis-Measurement)

Any malformed or physically impossible drawing definition fails immediately with typed exceptions:

| Injected Fault Condition | Exception Thrown | Behavior |
|---|---|---|
| **Negative / Zero Page Dimensions** | `BlueprintValidationError('INVALID_PAGE_DIMENSIONS')` | **Fail-closed.** Rejects corrupted dimensions like $-500\text{ pt}$. |
| **Non-Orthogonal Rotation ($45^\circ$)** | `InvalidRotationError('INVALID_ROTATION_ANGLE')` | **Fail-closed.** Rejects skewed non-orthogonal rotations. |
| **Discontinuous Page Sequence** | `MalformedBlueprintError('MALFORMED_BLUEPRINT')` | **Fail-closed.** Rejects documents with missing or non-sequential page indices. |
| **Out-of-Bounds Crop Box** | `BlueprintValidationError('CROP_OUTSIDE_PAGE_BOUNDS')` | **Fail-closed.** Rejects crops extending beyond the page canvas. |

---

## 4. Vector Overlay Policy Enforcement (Platform Plan v3 §6 M08)

Platform Plan v3 §6 M08 explicitly mandates that vector overlays do not imply automatic extraction of all PDF geometry.

In `BlueprintValidator`:
```typescript
static assertVectorOverlayPolicy(attemptedMode: 'CALIBRATED_USER_OVERLAY' | 'AUTOMATIC_EXTRACTION_REQUEST'): void {
  if (attemptedMode === 'AUTOMATIC_EXTRACTION_REQUEST') {
    throw new AutomaticExtractionNotSupportedError(
      'Automatic extraction of arbitrary raw PDF geometry streams is not supported. ' +
      'Takeoff operates strictly via calibrated user-drawn or imported vector overlays per Platform Plan v3 §6 M08.'
    );
  }
}
```
This architectural guard guarantees that Contractor never relies on fragile heuristic PDF stream tokenization, ensuring deterministic, user-audited quantities.

---

## 5. Large-PDF Performance Evidence

Tested with `DocumentSession`, `PdfJsReferenceRendererAdapter`, and `BoundedDecodedPageCache`:

| Performance Metric | Configured Limit | Observed In Test Suite | Compliance Status |
|---|---|---|---|
| **Memory Ceiling** | $8\text{ MB}$ max cache memory | Never exceeded limit throughout 120-page traversal | **PASS** |
| **Page Concurrency** | Max 4 cached decoded pages | Older pages evicted via LRU when moving past 4 pages | **PASS** |
| **Viewport Tiling** | $512\times 512\text{ pt}$ discrete tiles | Rendered only frustum-visible tiles; zero eager full-page decodes | **PASS** |
| **Active Cancellation** | Immediate abort on rapid pan | Aborted in-flight render promises cleanly without leaking memory or throwing unhandled errors | **PASS** |
| **Session Disposal** | Clean cleanup | Cleared all tile buffers, dropped caches, rejected post-dispose calls | **PASS** |

---

## 6. Verification Summary

Executed via `node packages/native_takeoff/tool/check.mjs`:
- `test/blueprint_validation_performance.test.ts` (4/4 passing)
- `test/document_session.test.ts` (8/8 passing)
- `test/invalidation_deduplication.test.ts` (4/4 passing)
- `test/measurement_coverage.test.ts` (5/5 passing)
- `test/provenance_storage.test.ts` (5/5 passing)
- `test/takeoff_boq_link.test.ts` (5/5 passing)

**Total: 31/31 tests passing across 6 suites.**
