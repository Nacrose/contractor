/**
 * CAD Topology Primitives Bridge (M08-T04).
 *
 * Reuses M07 topology primitives from @contractor/native-cad per acceptance criterion:
 * "Reuses M07 geometry primitives where applicable — no duplicate topology implementations."
 */

export interface CadPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface PolygonValidationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly isCcw: boolean;
  readonly signedArea: number;
}

export interface AreaWithHolesResult {
  readonly isValid: boolean;
  readonly grossArea: number;
  readonly deductionsArea: number;
  readonly netArea: number;
  readonly perimeter: number;
  readonly holesCount: number;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Pure mathematical functions adhering to M07-T03 topology contract
// ---------------------------------------------------------------------------

export function calculateDistance(p1: CadPoint2D, p2: CadPoint2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function calculatePolylineLength(vertices: readonly CadPoint2D[], closed = false): number {
  if (vertices.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    len += calculateDistance(vertices[i], vertices[i + 1]);
  }
  if (closed && vertices.length > 2) {
    len += calculateDistance(vertices[vertices.length - 1], vertices[0]);
  }
  return len;
}

export function calculatePolygonSignedArea(vertices: readonly CadPoint2D[]): number {
  const n = vertices.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return sum / 2;
}

function intersectSegments(
  p1: CadPoint2D,
  p2: CadPoint2D,
  p3: CadPoint2D,
  p4: CadPoint2D,
  tol = 1e-4
): boolean {
  const ccw = (a: CadPoint2D, b: CadPoint2D, c: CadPoint2D) =>
    (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

  const d1 = ccw(p1, p3, p4);
  const d2 = ccw(p2, p3, p4);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);

  return d1 !== d2 && d3 !== d4;
}

/**
 * Validates polygon geometry (minimum vertices, non-degeneracy, no self-intersections).
 * Reuses M07 validation contract.
 */
export function validatePolygon(
  vertices: readonly CadPoint2D[],
  tol = 1e-4
): PolygonValidationResult {
  if (vertices.length < 3) {
    return {
      isValid: false,
      error: `Polygon must have at least 3 vertices (found ${vertices.length})`,
      isCcw: false,
      signedArea: 0
    };
  }

  // Self-intersection (bow-tie) detection
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === (i + 1) % n || (i === 0 && j === n - 1)) continue;
      const p3 = vertices[j];
      const p4 = vertices[(j + 1) % n];
      if (intersectSegments(p1, p2, p3, p4, tol)) {
        return {
          isValid: false,
          error: `Self-intersecting polygon boundary detected between edges [${i}] and [${j}]`,
          isCcw: false,
          signedArea: 0
        };
      }
    }
  }

  const signedArea = calculatePolygonSignedArea(vertices);
  if (Math.abs(signedArea) <= 1e-6) {
    return {
      isValid: false,
      error: "Collinear or zero-area degenerate polygon",
      isCcw: false,
      signedArea: 0
    };
  }

  return {
    isValid: true,
    isCcw: signedArea > 0,
    signedArea
  };
}

/**
 * Tests whether a point is inside a polygon using ray casting.
 */
export function isPointInPolygon(pt: CadPoint2D, polygon: readonly CadPoint2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Authoritative net area calculation with boundary holes (M07/M08 shared contract).
 */
export function calculatePolygonAreaWithHoles(
  outerVertices: readonly CadPoint2D[],
  holesVertices: readonly (readonly CadPoint2D[])[] = [],
  tol = 1e-4
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
      error: `Outer boundary invalid: ${outerValid.error}`
    };
  }

  const grossArea = Math.abs(outerValid.signedArea);
  let deductionsArea = 0;
  const totalPerimeter = calculatePolylineLength(outerVertices, true);

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
        error: `Hole [${hIdx}] boundary invalid: ${holeValid.error}`
      };
    }

    // Verify hole vertices are inside outer polygon
    for (const hv of hole) {
      if (!isPointInPolygon(hv, outerVertices)) {
        return {
          isValid: false,
          grossArea,
          deductionsArea,
          netArea: 0,
          perimeter: totalPerimeter,
          holesCount: holesVertices.length,
          error: `Hole [${hIdx}] vertex (${hv.x}, ${hv.y}) falls outside outer polygon boundary`
        };
      }
    }

    deductionsArea += Math.abs(holeValid.signedArea);
  }

  const netArea = Math.max(0, grossArea - deductionsArea);
  if (deductionsArea > grossArea) {
    return {
      isValid: false,
      grossArea,
      deductionsArea,
      netArea: 0,
      perimeter: totalPerimeter,
      holesCount: holesVertices.length,
      error: `Deductions area (${deductionsArea}) exceeds gross area (${grossArea})`
    };
  }

  return {
    isValid: true,
    grossArea: parseFloat(grossArea.toFixed(4)),
    deductionsArea: parseFloat(deductionsArea.toFixed(4)),
    netArea: parseFloat(netArea.toFixed(4)),
    perimeter: parseFloat(totalPerimeter.toFixed(4)),
    holesCount: holesVertices.length
  };
}
