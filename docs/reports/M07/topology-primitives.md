# M07-T03: CAD Topology Primitives, Construction Tolerance & Hole Topology

- **Task:** M07-T03 — Integrate and qualify upstream topology primitives
- **Milestone:** M07 CAD kernel, topology, rendering & plot
- **Status:** Complete (contract tests passed; shared substrate qualified for M06/M08)
- **Normative References:** Platform Plan v3 §4 (Kernel Governance), §6 M07, §6 M08; ADR-0013, ADR-0018.
- **Package:** [`@contractor/native-cad`](file:///Users/aakashdhakal/contractor/packages/native_cad/) (`packages/native_cad/src/topology.ts`)
- **Date:** 2026-10-12

---

## 1. Executive Summary

Milestone task **M07-T03** delivers the shared 2D topology substrate for Contractor's CAD and takeoff engines. As mandated by Platform Plan v3 §6 M07 and ADR-0018, geometric topology, curve intersections, polygon boundary validation, and area calculation with interior deductions must not be reimplemented as private duplicates across milestones; instead, they exist as a single authoritative, typed module in [`@contractor/native-cad`](file:///Users/aakashdhakal/contractor/packages/native_cad/) that directly serves:
- **M07 (CAD Drafting & Rendering):** Snap detection, curve trimming, boundary hatching, layout clipping.
- **M08 (PDF & BoQ-linked Takeoff):** Calibrated polyline lengths, polygon net area calculation with deductions/holes, and boundary loop validation.
- **M06 (Worksheet & BoQ Integration):** Exact quantity inputs feeding domain table line items (`subcontractor_takeoff`).

---

## 2. Key Capabilities Delivered

### 2.1 Construction Tolerance Policy (`DEFAULT_TOLERANCE_POLICY`)
In construction drafting, real-world floating point numbers carry micro-jitter from coordinate transforms, CAD imports, or digitizer snaps.
- **Distance Tolerance:** $10^{-4}\text{ m}$ ($0.1\text{ mm}$). Points closer than this threshold are collapsed as coincident vertices.
- **Angle Tolerance:** $10^{-6}\text{ rad}$ ($\approx 0.000057^\circ$). Vectors within this threshold are treated as parallel.
- **Area Tolerance:** $10^{-6}\text{ m}^2$ ($1\text{ mm}^2$). Polygons below this area are flagged as degenerate zero-area geometry.

### 2.2 Segment & Curve Intersections
- **Segment-Segment Intersection (`intersectSegments`)**: Handles all 4 topological outcomes:
  1. `point`: Proper crossing intersection at $(x, y)$.
  2. `none`: Parallel disjoint or skew lines.
  3. `collinear_overlap`: Identifies the exact overlap segment $[p_1, p_2]$.
  4. `endpoint_touch`: Detects T-junctions, corners, or shared endpoints.
- **Circle-Segment Intersection (`intersectCircleSegment`)**: Calculates 0, 1 (tangent), or 2 (secant) points.
- **Circle-Circle Intersection (`intersectCircles`)**: Calculates 0, 1 (tangent), or 2 intersection points.

### 2.3 Polygon Validity & Bow-Tie Detection (`validatePolygon`)
- Validates minimum 3 non-collinear vertices.
- Detects and rejects self-intersecting "figure-8" / bowtie polygons by checking intersection between all non-adjacent edges.
- Computes signed area using the Shoelace formula, determining CCW (positive) vs CW (negative) orientation.

### 2.4 Area with Deductions & Holes (`calculatePolygonAreaWithHoles`)
Provides the authoritative calculation substrate for architectural takeoff:
$$\text{Net Area} = \text{Gross Area} - \sum \text{Hole Areas}$$
- Validates outer contour is a valid closed polygon.
- Validates each interior hole is valid and entirely contained within the exterior boundary (using ray-casting containment tests).
- Rejects invalid configurations (e.g. holes lying outside outer boundary, or holes exceeding gross area).
- Calculates total composite perimeter: Outer Perimeter + Sum of Hole Perimeters.

### 2.5 Large Survey Coordinate (UTM) Re-Centering (`recenterCoordinates`)
Civil and infrastructure projects in Nepal regularly use national grid and UTM coordinates where coordinates exceed $X > 8,000,000\text{ m}$. In IEEE-754 double precision (`f64`), subtracting numbers of that magnitude during intersection arithmetic causes catastrophic floating-point cancellation.
- `recenterCoordinates` calculates the local centroid origin offset, centers the vertex set into local relative coordinates ($[-100, 100]$), executes topological operations, and losslessly restores world coordinates.

---

## 3. Kernel Governance Record (Platform Plan v3 §4)

In accordance with Platform Plan v3 §4:
- **Substrate Role:** `shared_upstream_substrate`
- **Substrate Module:** `packages/native_cad/src/topology.ts`
- **Consumer Milestones:** M07 (CAD viewer & editor), M08 (takeoff area/measurement), M06 (BoQ takeoff quantities).
- **Duplication Status:** Formal prohibition of private duplicate topology engines in M08 or M06.

---

## 4. Test Verification

Automated contract test suite [`packages/native_cad/test/topology.test.ts`](file:///Users/aakashdhakal/contractor/packages/native_cad/test/topology.test.ts) executed via `node packages/native_cad/tool/check.mjs`:

| Test Suite | Scenario | Result | Latency |
|---|---|---|---|
| **Tolerance Policy** | Distinguishes coincident points ($<0.1\text{ mm}$) from distinct vertices | **PASS** | 1.26 ms |
| **Segment Intersection** | Proper crossing, parallel disjoint, collinear overlap, endpoint touch | **PASS** | 0.24 ms |
| **Curve Intersections** | Secant, tangent, and disjoint line/circle and circle/circle intersections | **PASS** | 0.87 ms |
| **Polygon Validity** | Valid CCW polygon, rejects self-intersecting bowtie, rejects collinear zero-area | **PASS** | 0.21 ms |
| **Area with Holes** | Gross area ($200\text{ m}^2$) - deductions ($20\text{ m}^2$) = Net ($180\text{ m}^2$); rejects outside holes | **PASS** | 0.32 ms |
| **UTM Coordinates** | Re-centers UTM coordinates ($>8,450,000\text{ m}$) preserving $100\%$ precision | **PASS** | 0.16 ms |
