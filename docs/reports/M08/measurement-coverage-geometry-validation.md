# M08-T04: Measurement Coverage, Geometry Validation & Calibrated Unit Conversion Report

- **Task:** M08-T04 — Measurement coverage: area with holes, polyline length, perimeter, unit conversion, counts; invalid geometry rejected
- **Milestone:** M08 PDF and BoQ-linked takeoff engine
- **Package:** `@contractor/native-takeoff` (`packages/native_takeoff/`)
- **Status:** Complete (18/18 tests passing, clean compile)
- **Normative References:** Platform Plan v3 §8 Documents row, §6 M08; M07 Topology Contract (`packages/native_cad/src/topology.ts`); ADR-0013, ADR-0015.
- **Date:** 2026-10-12

---

## 1. Executive Summary & Scope

Task **M08-T04** delivers the complete measurement calculation engine and geometry validation subsystem in `@contractor/native-takeoff`.

Key architectural principles satisfied:
1. **Full Measurement Coverage:** Supports polygon gross and net area with arbitrary deduction holes, open polyline length, closed perimeter, Euclidean linear distance, and discrete count markers.
2. **Reuses M07 Geometry Primitives:** Integrates directly with the proven M07 topology algorithms (`validatePolygon`, `calculatePolygonAreaWithHoles`) to guarantee mathematical parity across CAD drafting and PDF takeoff workflows without duplicated topology kernels.
3. **Strict Fail-Closed Validation (Zero Coercion):** Malformed, self-intersecting, collinear zero-area, or overlapping hole geometries are rejected with explicit `InvalidGeometryError` exceptions rather than being coerced into inaccurate approximations.
4. **Calibrated Unit Conversion (No Ambient State):** Conversions across metric ($m, mm, cm, m²$) and imperial ($in, ft, ft², sqft$) units are strictly calibrated and versioned alongside the measurement. No ambient or mutable unit state exists.

---

## 2. Measurement Coverage & Calculation Matrix

Implemented in `packages/native_takeoff/src/measurement_engine.ts`:

| Measurement Type | Geometric Input | Raw Document Quantity | Calibrated Quantity Calculation | Expected Output Fields |
|---|---|---|---|---|
| **POLYGON_AREA** | Outer boundary + $N$ deduction holes | $pt²$ ($1/72\text{ in}$) | $\text{RawNet} \times (\text{scaleFactor})^2 \times \text{UnitFactor}$ | `grossQuantity`, `deductionsQuantity`, `calibratedQuantity` (net), `perimeter`, `holesCount` |
| **POLYLINE_PERIMETER** | Ordered vertex chain ($N \ge 2$) | $pt$ (1/72 in) | $\text{RawLength} \times \text{scaleFactor} \times \text{UnitFactor}$ | `calibratedQuantity`, `declaredUnit` |
| **LINEAR_DISTANCE** | Start and End point | $pt$ (1/72 in) | $\text{RawDist} \times \text{scaleFactor} \times \text{UnitFactor}$ | `calibratedQuantity`, `declaredUnit` |
| **COUNT_MARKER** | Point location + marker shape | $1$ | $1$ | `calibratedQuantity = 1`, `declaredUnit = 'ea'` |

---

## 3. Calibrated Unit Conversions (Zero Ambient State)

In accordance with Platform Plan v3 §8, unit conversion factors are determined strictly from calibration parameters versioned with the measurement.

### 3.1 Linear Conversion Ratios
- $1\text{ m} = 1000\text{ mm} = 100\text{ cm} = 39.3701\text{ in} = 3.28084\text{ ft}$
- Conversion factor is evaluated via `TakeoffMeasurementEngine.getLinearUnitConversionFactor(fromUnit, toUnit)`.

### 3.2 Area Conversion Ratios
- $1\text{ m²} = 10.7639\text{ sqft} = 1,000,000\text{ mm²} = 10,000\text{ cm²} = 1,550.003\text{ in²}$
- Conversion factor is evaluated via `TakeoffMeasurementEngine.getAreaUnitConversionFactor(fromUnit, toUnit)`.

---

## 4. Geometry Validation & Fail-Closed Policy

The engine enforces strict construction geometry validation. Any geometry violating physical topological constraints is rejected immediately:

| Fault Case Injected | Error Thrown | Handling Behavior |
|---|---|---|
| **Self-Intersecting Outer Boundary (Bow-tie)** | `InvalidGeometryError: Self-intersecting polygon boundary detected between edges [i] and [j]` | **Fail-closed.** Rejects self-intersection without fabricating polygon splits. |
| **Collinear / Zero-Area Degenerate Polygon** | `InvalidGeometryError: Collinear or zero-area degenerate polygon` | **Fail-closed.** Rejects flat 3-point lines submitted as polygons. |
| **Hole Boundary Outside Outer Boundary** | `InvalidGeometryError: Hole [i] vertex (x, y) falls outside outer polygon boundary` | **Fail-closed.** Rejects invalid deduction holes. |
| **Deduction Area Exceeding Gross Footprint** | `InvalidGeometryError: Deductions area exceeds gross area` | **Fail-closed.** Prevents negative net takeoff quantities. |
| **Coincident Linear Distance Points** | `InvalidGeometryError: Degenerate linear distance: start and end points are coincident` | **Fail-closed.** Prevents zero-length dimension tags. |
| **Degenerate Polyline (<2 vertices)** | `InvalidGeometryError: Degenerate polyline: must have at least 2 vertices` | **Fail-closed.** Rejects single-point or empty chains. |

---

## 5. Independent Expected Value Verification on Fixtures

Tested against independently calculated mathematical fixtures:
- **Suspended Slab with Two Holes:** Outer $400 \times 300\text{ pt}$ ($120,000\text{ pt²}$), Hole 1 $100 \times 100\text{ pt}$ ($10,000\text{ pt²}$), Hole 2 $50 \times 50\text{ pt}$ ($2,500\text{ pt²}$).
  - Expected Net Area: $107,500\text{ pt²} \times (0.05)^2 = 268.75\text{ m²}$.
  - Computed Net Area: **$268.75\text{ m²}$** (0.0000 delta).
- **Diagonal 3-4-5 Triangle Span:** $300\text{ pt} \times 400\text{ pt} \to 500\text{ pt}$.
  - Expected Calibrated Span: $500 \times 0.05 = 25.0\text{ m}$.
  - Computed Calibrated Span: **$25.0\text{ m}$** (0.0000 delta).
- **Metric to Imperial Conversion:** $100.0\text{ m²}$ converted to `sqft`:
  - Expected: $100 / 0.09290304 = 1076.3910\text{ sqft}$.
  - Computed: **$1076.391\text{ sqft}$** (0.0000 delta).

---

## 6. Conformance Suite Results

Automated verification in `packages/native_takeoff/tool/check.mjs`:

```
✔ document session never eagerly decodes all pages on initialization (1.0685ms)
✔ viewport tiling decomposes page into discrete tiles and culls non-visible regions (0.206459ms)
✔ bounded decoded-page cache enforces maxPages and maxMemory limits with LRU eviction (1.071042ms)
✔ cancellation aborts in-flight tile decode without leaking active jobs or memory (0.77ms)
✔ rapid viewport panning cancels superseded in-flight renders cleanly (9.841834ms)
✔ explicit disposal clears all cache, cancels pending renders, and rejects subsequent calls (11.744417ms)
✔ adapter asserts authority boundary and rejects domain property leakage (0.148167ms)
✔ session operates with PDF.js reference adapter and PdfCraft candidate adapter cleanly (20.599042ms)
✔ polygon area with nested deduction holes calculates gross, deductions, and net area (2.016083ms)
✔ polyline length and linear distance coverage (0.1455ms)
✔ count marker measurement returns integer quantity (0.077125ms)
✔ unit conversion is calibrated and versioned with measurement without ambient state (0.134209ms)
✔ strict rejection of invalid geometry: self-intersection, collinear zero area, hole outside boundary (0.448708ms)
✔ provenance recording: every measurement captures revision, page, crop, rotation, and calibration (1.718ms)
✔ geometry stored in unscaled document space points (1/72 in) with holes (0.118708ms)
✔ revision changes invalidate derived quantities rather than silently rebasing (v3 §5.4) (0.153ms)
✔ recalibration invalidates affected page measurements and requires review (0.197042ms)
✔ change-feed integration and Flutter-parity DTO mapping (Standing Constraint 3) (0.215625ms)

native_takeoff: all document session, renderer adapter, viewport tiling, bounded page cache, cancellation, disposal, provenance, invalidation, and measurement coverage tests PASSED (M08-T02/T03/T04)
```
