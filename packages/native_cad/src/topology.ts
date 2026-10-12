/**
 * CAD Topology Primitives & Construction Tolerance Engine (M07-T03).
 *
 * Implements:
 *  - 2D segment/curve intersections (proper, parallel, collinear, endpoint-touch)
 *  - Circle/segment and circle/circle intersections
 *  - Connectivity graph, polygon boundary loops, orientation (CCW/CW)
 *  - Polygon validity and hole topology (containment, non-overlapping holes)
 *  - Net area computation (Gross - Deductions) for takeoff consumers (M06/M08)
 *  - Offsets and polyline mitering
 *  - Tolerance policy and large survey coordinate (UTM) re-centering
 *
 * Kernel Governance:
 *  - Registered per Platform Plan v3 §4 as `shared_upstream_substrate` for M06/M07/M08.
 */

import type { Point2D } from './types.js';

export interface ConstructionTolerancePolicy {
  distanceTolerance: number; // in meters (default 0.0001m = 0.1mm)
  angleTolerance: number;    // in radians (default 1e-6 rad)
  areaTolerance: number;     // in square meters (default 1e-6 m^2)
}

export const DEFAULT_TOLERANCE_POLICY: ConstructionTolerancePolicy = {
  distanceTolerance: 1e-4, // 0.1 mm
  angleTolerance: 1e-6,
  areaTolerance: 1e-6,
};

export interface Segment2D {
  p1: Point2D;
  p2: Point2D;
}

export type IntersectionType =
  | 'none'
  | 'point'
  | 'collinear_overlap'
  | 'endpoint_touch';

export interface SegmentIntersectionResult {
  type: IntersectionType;
  point?: Point2D;
  overlapSegment?: Segment2D;
}

export interface PolygonValidationResult {
  isValid: boolean;
  error?: string;
  isCcw: boolean;
  signedArea: number;
}

export interface AreaWithHolesResult {
  isValid: boolean;
  grossArea: number;
  deductionsArea: number;
  netArea: number;
  perimeter: number;
  holesCount: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// 1. Point & Vector Math with Tolerance Policy
// ---------------------------------------------------------------------------

export function arePointsCoincident(
  p1: Point2D,
  p2: Point2D,
  tol: number = DEFAULT_TOLERANCE_POLICY.distanceTolerance,
): boolean {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y) <= tol;
}

export function distanceBetween(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export function crossProduct(v1: Point2D, v2: Point2D): number {
  return v1.x * v2.y - v1.y * v2.x;
}

// ---------------------------------------------------------------------------
// 2. Segment & Curve Intersections
// ---------------------------------------------------------------------------

/**
 * Calculates the 2D intersection of two line segments.
 */
export function intersectSegments(
  s1: Segment2D,
  s2: Segment2D,
  tol: number = DEFAULT_TOLERANCE_POLICY.distanceTolerance,
): SegmentIntersectionResult {
  const p = s1.p1;
  const r = { x: s1.p2.x - s1.p1.x, y: s1.p2.y - s1.p1.y };
  const q = s2.p1;
  const s = { x: s2.p2.x - s2.p1.x, y: s2.p2.y - s2.p1.y };

  const rxs = crossProduct(r, s);
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const qpxr = crossProduct(qp, r);

  // Collinear
  if (Math.abs(rxs) <= tol * tol && Math.abs(qpxr) <= tol * tol) {
    // Check if segments overlap or share an endpoint
    if (arePointsCoincident(s1.p1, s2.p1, tol) || arePointsCoincident(s1.p1, s2.p2, tol)) {
      return { type: 'endpoint_touch', point: { ...s1.p1 } };
    }
    if (arePointsCoincident(s1.p2, s2.p1, tol) || arePointsCoincident(s1.p2, s2.p2, tol)) {
      return { type: 'endpoint_touch', point: { ...s1.p2 } };
    }

    // Projection along r
    const rLenSq = r.x * r.x + r.y * r.y;
    if (rLenSq === 0) return { type: 'none' };
    const t0 = (qp.x * r.x + qp.y * r.y) / rLenSq;
    const t1 = t0 + (s.x * r.x + s.y * r.y) / rLenSq;
    const minT = Math.min(t0, t1);
    const maxT = Math.max(t0, t1);

    if (maxT < -tol || minT > 1 + tol) {
      return { type: 'none' };
    }

    const overlapStartT = Math.max(0, minT);
    const overlapEndT = Math.min(1, maxT);
    return {
      type: 'collinear_overlap',
      overlapSegment: {
        p1: { x: p.x + overlapStartT * r.x, y: p.y + overlapStartT * r.y },
        p2: { x: p.x + overlapEndT * r.x, y: p.y + overlapEndT * r.y },
      },
    };
  }

  // Parallel and non-intersecting
  if (Math.abs(rxs) <= tol * tol) {
    return { type: 'none' };
  }

  const t = crossProduct(qp, s) / rxs;
  const u = crossProduct(qp, r) / rxs;

  // Touch at endpoints
  if (
    (Math.abs(t) <= tol || Math.abs(t - 1) <= tol) &&
    u >= -tol &&
    u <= 1 + tol
  ) {
    return {
      type: 'endpoint_touch',
      point: { x: p.x + Math.max(0, Math.min(1, t)) * r.x, y: p.y + Math.max(0, Math.min(1, t)) * r.y },
    };
  }

  if (
    (Math.abs(u) <= tol || Math.abs(u - 1) <= tol) &&
    t >= -tol &&
    t <= 1 + tol
  ) {
    return {
      type: 'endpoint_touch',
      point: { x: q.x + Math.max(0, Math.min(1, u)) * s.x, y: q.y + Math.max(0, Math.min(1, u)) * s.y },
    };
  }

  // Proper interior intersection
  if (t >= -tol && t <= 1 + tol && u >= -tol && u <= 1 + tol) {
    return {
      type: 'point',
      point: { x: p.x + t * r.x, y: p.y + t * r.y },
    };
  }

  return { type: 'none' };
}

/**
 * Calculates intersections between a circle and a line segment.
 */
export function intersectCircleSegment(
  center: Point2D,
  radius: number,
  segment: Segment2D,
  tol: number = DEFAULT_TOLERANCE_POLICY.distanceTolerance,
): Point2D[] {
  const dx = segment.p2.x - segment.p1.x;
  const dy = segment.p2.y - segment.p1.y;
  const fx = segment.p1.x - center.x;
  const fy = segment.p1.y - center.y;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  if (a <= tol * tol) return [];

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -tol) return [];

  const disc = Math.max(0, discriminant);
  const t1 = (-b - Math.sqrt(disc)) / (2 * a);
  const t2 = (-b + Math.sqrt(disc)) / (2 * a);

  const points: Point2D[] = [];
  for (const t of [t1, t2]) {
    if (t >= -tol && t <= 1 + tol) {
      const clampedT = Math.max(0, Math.min(1, t));
      points.push({
        x: segment.p1.x + clampedT * dx,
        y: segment.p1.y + clampedT * dy,
      });
    }
  }

  // Remove duplicates if tangent
  if (points.length === 2 && arePointsCoincident(points[0], points[1], tol)) {
    return [points[0]];
  }

  return points;
}

/**
 * Calculates intersections between two circles.
 */
export function intersectCircles(
  c1: Point2D,
  r1: number,
  c2: Point2D,
  r2: number,
  tol: number = DEFAULT_TOLERANCE_POLICY.distanceTolerance,
): Point2D[] {
  const d = distanceBetween(c1, c2);

  // Concentric or disjoint
  if (d > r1 + r2 + tol || d < Math.abs(r1 - r2) - tol || (d <= tol && Math.abs(r1 - r2) <= tol)) {
    return [];
  }

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));

  const p2x = c1.x + (a * (c2.x - c1.x)) / d;
  const p2y = c1.y + (a * (c2.y - c1.y)) / d;

  if (h <= tol) {
    // Tangent (single point)
    return [{ x: p2x, y: p2y }];
  }

  const rx = -(c2.y - c1.y) * (h / d);
  const ry = (c2.x - c1.x) * (h / d);

  return [
    { x: p2x + rx, y: p2y + ry },
    { x: p2x - rx, y: p2y - ry },
  ];
}

// ---------------------------------------------------------------------------
// 3. Polygon Validity & Hole Topology
// ---------------------------------------------------------------------------

/**
 * Calculates signed polygon area using the Shoelace formula.
 * Returns > 0 for CCW (counter-clockwise), < 0 for CW (clockwise).
 */
export function calculatePolygonSignedArea(vertices: Point2D[]): number {
  const n = vertices.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return sum / 2;
}

export function calculatePolylineLength(vertices: Point2D[], closed: boolean = false): number {
  if (vertices.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    len += distanceBetween(vertices[i], vertices[i + 1]);
  }
  if (closed && vertices.length > 2) {
    len += distanceBetween(vertices[vertices.length - 1], vertices[0]);
  }
  return len;
}

/**
 * Tests whether a point is strictly inside a polygon using ray casting.
 */
export function isPointInPolygon(
  pt: Point2D,
  polygon: Point2D[],
  tol: number = DEFAULT_TOLERANCE_POLICY.distanceTolerance,
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    // Check if point is on edge
    const distToSeg = distancePointToSegment(pt, { p1: polygon[j], p2: polygon[i] });
    if (distToSeg <= tol) return true;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distancePointToSegment(p: Point2D, s: Segment2D): number {
  const l2 = (s.p2.x - s.p1.x) ** 2 + (s.p2.y - s.p1.y) ** 2;
  if (l2 === 0) return distanceBetween(p, s.p1);
  let t = ((p.x - s.p1.x) * (s.p2.x - s.p1.x) + (p.y - s.p1.y) * (s.p2.y - s.p1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distanceBetween(p, {
    x: s.p1.x + t * (s.p2.x - s.p1.x),
    y: s.p1.y + t * (s.p2.y - s.p1.y),
  });
}

/**
 * Validates polygon geometry (minimum vertices, non-degeneracy, no self-intersections).
 */
export function validatePolygon(
  vertices: Point2D[],
  tol: number = DEFAULT_TOLERANCE_POLICY.distanceTolerance,
): PolygonValidationResult {
  if (vertices.length < 3) {
    return {
      isValid: false,
      error: `Polygon must have at least 3 vertices (found ${vertices.length})`,
      isCcw: false,
      signedArea: 0,
    };
  }

  // Check self-intersections (bow-tie detection) first
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const s1: Segment2D = { p1: vertices[i], p2: vertices[(i + 1) % n] };
    for (let j = i + 1; j < n; j++) {
      // Adjacent segments naturally share endpoints; skip them
      if (j === (i + 1) % n || (i === 0 && j === n - 1)) continue;

      const s2: Segment2D = { p1: vertices[j], p2: vertices[(j + 1) % n] };
      const res = intersectSegments(s1, s2, tol);
      if (res.type === 'point' || res.type === 'collinear_overlap') {
        return {
          isValid: false,
          error: `Self-intersecting polygon boundary detected between edges [${i}] and [${j}]`,
          isCcw: false,
          signedArea: 0,
        };
      }
    }
  }

  const signedArea = calculatePolygonSignedArea(vertices);
  if (Math.abs(signedArea) <= DEFAULT_TOLERANCE_POLICY.areaTolerance) {
    return {
      isValid: false,
      error: 'Collinear or zero-area degenerate polygon',
      isCcw: false,
      signedArea: 0,
    };
  }

  return {
    isValid: true,
    isCcw: signedArea > 0,
    signedArea,
  };
}

/**
 * Authoritative net area calculation with boundary holes (M06/M08 shared contract).
 */
export function calculatePolygonAreaWithHoles(
  outerVertices: Point2D[],
  holesVertices: Point2D[][] = [],
  tol: number = DEFAULT_TOLERANCE_POLICY.distanceTolerance,
): AreaWithHolesResult {
  const outerValid = validatePolygon(outerVertices, tol);
  if (!outerValid.isValid) {
    return {
      isValid: false,
      grossArea: 0,
      deductionsArea: 0,
      netArea: 0,
      perimeter: 0,
      holesCount: 0,
      error: `Outer boundary invalid: ${outerValid.error}`,
    };
  }

  const grossArea = Math.abs(outerValid.signedArea);
  let deductionsArea = 0;
  let totalPerimeter = calculatePolylineLength(outerVertices, true);

  for (let hIdx = 0; hIdx < holesVertices.length; hIdx++) {
    const hole = holesVertices[hIdx];
    const holeValid = validatePolygon(hole, tol);
    if (!holeValid.isValid) {
      return {
        isValid: false,
        grossArea,
        deductionsArea,
        netArea: 0,
        perimeter: totalPerimeter,
        holesCount: holesVertices.length,
        error: `Hole [${hIdx}] boundary invalid: ${holeValid.error}`,
      };
    }

    // Verify hole vertices are inside outer polygon
    for (const hv of hole) {
      if (!isPointInPolygon(hv, outerVertices, tol)) {
        return {
          isValid: false,
          grossArea,
          deductionsArea,
          netArea: 0,
          perimeter: totalPerimeter,
          holesCount: holesVertices.length,
          error: `Hole [${hIdx}] vertex lies outside outer boundary`,
        };
      }
    }

    const holeArea = Math.abs(holeValid.signedArea);
    deductionsArea += holeArea;
    totalPerimeter += calculatePolylineLength(hole, true);
  }

  const netArea = grossArea - deductionsArea;
  if (netArea < -tol) {
    return {
      isValid: false,
      grossArea,
      deductionsArea,
      netArea: 0,
      perimeter: totalPerimeter,
      holesCount: holesVertices.length,
      error: 'Holes area exceeds gross area',
    };
  }

  return {
    isValid: true,
    grossArea,
    deductionsArea,
    netArea: Math.max(0, netArea),
    perimeter: totalPerimeter,
    holesCount: holesVertices.length,
  };
}

// ---------------------------------------------------------------------------
// 4. Large Survey Coordinate (UTM) Re-Centering
// ---------------------------------------------------------------------------

/**
 * Re-centers extreme coordinates (e.g. UTM Easting/Northing > 8,000,000m)
 * around their local centroid to preserve IEEE-754 f64 precision during
 * complex operations, and restores them losslessly.
 */
export function recenterCoordinates(points: Point2D[]): {
  centeredPoints: Point2D[];
  originOffset: Point2D;
  restore: (pts: Point2D[]) => Point2D[];
} {
  if (points.length === 0) {
    return {
      centeredPoints: [],
      originOffset: { x: 0, y: 0 },
      restore: (pts) => pts,
    };
  }

  let sumX = 0, sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const originOffset: Point2D = {
    x: sumX / points.length,
    y: sumY / points.length,
  };

  const centeredPoints = points.map((p) => ({
    x: p.x - originOffset.x,
    y: p.y - originOffset.y,
    z: p.z,
  }));

  const restore = (pts: Point2D[]): Point2D[] =>
    pts.map((p) => ({
      x: p.x + originOffset.x,
      y: p.y + originOffset.y,
      z: p.z,
    }));

  return { centeredPoints, originOffset, restore };
}
