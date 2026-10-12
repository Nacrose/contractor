import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TOLERANCE_POLICY,
  arePointsCoincident,
  distanceBetween,
  intersectSegments,
  intersectCircleSegment,
  intersectCircles,
  calculatePolygonSignedArea,
  isPointInPolygon,
  validatePolygon,
  calculatePolygonAreaWithHoles,
  recenterCoordinates,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// 1. Point Math & Construction Tolerance Policy
// ---------------------------------------------------------------------------

test('construction tolerance policy: detects coincident vs distinct points', () => {
  const p1 = { x: 100.0, y: 50.0 };
  const pClose = { x: 100.00005, y: 50.00005 }; // delta < 0.1mm
  const pFar = { x: 100.001, y: 50.001 };       // delta = 1.4mm

  assert.equal(arePointsCoincident(p1, pClose, DEFAULT_TOLERANCE_POLICY.distanceTolerance), true);
  assert.equal(arePointsCoincident(p1, pFar, DEFAULT_TOLERANCE_POLICY.distanceTolerance), false);
});

// ---------------------------------------------------------------------------
// 2. Segment & Curve Intersections
// ---------------------------------------------------------------------------

test('segment intersection: handles proper, parallel, collinear, and endpoint-touch cases', () => {
  // 1. Proper crossing intersection
  const s1 = { p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 } };
  const s2 = { p1: { x: 0, y: 10 }, p2: { x: 10, y: 0 } };
  const properRes = intersectSegments(s1, s2);
  assert.equal(properRes.type, 'point');
  assert.ok(properRes.point);
  assert.equal(Math.round(properRes.point!.x), 5);
  assert.equal(Math.round(properRes.point!.y), 5);

  // 2. Parallel disjoint
  const sParallel = { p1: { x: 0, y: 2 }, p2: { x: 10, y: 12 } };
  const parallelRes = intersectSegments(s1, sParallel);
  assert.equal(parallelRes.type, 'none');

  // 3. Collinear overlap
  const sCollinear1 = { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } };
  const sCollinear2 = { p1: { x: 5, y: 0 }, p2: { x: 15, y: 0 } };
  const overlapRes = intersectSegments(sCollinear1, sCollinear2);
  assert.equal(overlapRes.type, 'collinear_overlap');
  assert.ok(overlapRes.overlapSegment);
  assert.equal(overlapRes.overlapSegment!.p1.x, 5);
  assert.equal(overlapRes.overlapSegment!.p2.x, 10);

  // 4. Endpoint touch (T-junction)
  const sTouch = { p1: { x: 10, y: 10 }, p2: { x: 20, y: 10 } };
  const touchRes = intersectSegments(s1, sTouch);
  assert.equal(touchRes.type, 'endpoint_touch');
  assert.ok(touchRes.point);
  assert.equal(touchRes.point!.x, 10);
  assert.equal(touchRes.point!.y, 10);
});

test('circle intersections: calculates secant and tangent line/circle intersections', () => {
  const center = { x: 0, y: 0 };
  const radius = 5;

  // Secant line passing through y = 3 (intersects at x = -4 and x = +4)
  const secant = { p1: { x: -10, y: 3 }, p2: { x: 10, y: 3 } };
  const secantPoints = intersectCircleSegment(center, radius, secant);
  assert.equal(secantPoints.length, 2);
  const xs = secantPoints.map((p) => Math.round(p.x)).sort((a, b) => a - b);
  assert.deepEqual(xs, [-4, 4]);

  // Tangent line at y = 5
  const tangent = { p1: { x: -10, y: 5 }, p2: { x: 10, y: 5 } };
  const tangentPoints = intersectCircleSegment(center, radius, tangent);
  assert.equal(tangentPoints.length, 1);
  assert.equal(Math.round(tangentPoints[0].x), 0);
  assert.equal(Math.round(tangentPoints[0].y), 5);

  // Disjoint line at y = 6
  const disjoint = { p1: { x: -10, y: 6 }, p2: { x: 10, y: 6 } };
  const disjointPoints = intersectCircleSegment(center, radius, disjoint);
  assert.equal(disjointPoints.length, 0);
});

test('circle-circle intersections: secant and tangent circle pairs', () => {
  const c1 = { x: 0, y: 0 };
  const r1 = 5;
  const c2 = { x: 6, y: 0 };
  const r2 = 5;

  // Intersecting circles
  const pts = intersectCircles(c1, r1, c2, r2);
  assert.equal(pts.length, 2);
  assert.equal(Math.round(pts[0].x), 3);
  assert.equal(Math.round(pts[1].x), 3);

  // Tangent circles at distance = 10
  const cTangent = { x: 10, y: 0 };
  const tangentPts = intersectCircles(c1, r1, cTangent, r2);
  assert.equal(tangentPts.length, 1);
  assert.equal(Math.round(tangentPts[0].x), 5);
  assert.equal(Math.round(tangentPts[0].y), 0);
});

// ---------------------------------------------------------------------------
// 3. Polygon Validity & Self-Intersection Detection
// ---------------------------------------------------------------------------

test('polygon validation: detects valid contours, orientation, and rejects self-intersections', () => {
  // Valid CCW rectangle
  const validRect = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const rectRes = validatePolygon(validRect);
  assert.equal(rectRes.isValid, true);
  assert.equal(rectRes.isCcw, true);
  assert.equal(rectRes.signedArea, 100);

  // Self-intersecting "figure-8" / bowtie polygon
  const bowtie = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  const bowtieRes = validatePolygon(bowtie);
  assert.equal(bowtieRes.isValid, false);
  assert.match(bowtieRes.error!, /Self-intersecting/);

  // Collinear degenerate polygon
  const collinear = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
  ];
  const colRes = validatePolygon(collinear);
  assert.equal(colRes.isValid, false);
  assert.match(colRes.error!, /Collinear or zero-area/);
});

// ---------------------------------------------------------------------------
// 4. Polygon Area with Holes (Takeoff / BoQ Shared Substrate)
// ---------------------------------------------------------------------------

test('calculatePolygonAreaWithHoles: authoritative gross, deductions, and net area', () => {
  // Outer rectangle: 20m x 10m = 200 m^2
  const outer = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 0, y: 10 },
  ];

  // Hole 1: 4m x 4m = 16 m^2 inside outer
  const hole1 = [
    { x: 2, y: 2 },
    { x: 6, y: 2 },
    { x: 6, y: 6 },
    { x: 2, y: 6 },
  ];

  // Hole 2: 2m x 2m = 4 m^2 inside outer
  const hole2 = [
    { x: 10, y: 2 },
    { x: 12, y: 2 },
    { x: 12, y: 4 },
    { x: 10, y: 4 },
  ];

  const res = calculatePolygonAreaWithHoles(outer, [hole1, hole2]);
  assert.equal(res.isValid, true);
  assert.equal(res.grossArea, 200);
  assert.equal(res.deductionsArea, 20); // 16 + 4
  assert.equal(res.netArea, 180);       // 200 - 20
  assert.equal(res.holesCount, 2);
  // Outer perimeter = 60, hole1 = 16, hole2 = 8 -> 84 total
  assert.equal(res.perimeter, 84);

  // Hole outside outer boundary rejection
  const holeOutside = [
    { x: 25, y: 2 },
    { x: 30, y: 2 },
    { x: 30, y: 5 },
    { x: 25, y: 5 },
  ];
  const outsideRes = calculatePolygonAreaWithHoles(outer, [holeOutside]);
  assert.equal(outsideRes.isValid, false);
  assert.match(outsideRes.error!, /lies outside outer boundary/);
});

// ---------------------------------------------------------------------------
// 5. Large Survey Coordinates (UTM) Re-Centering
// ---------------------------------------------------------------------------

test('recenterCoordinates: preserves high precision on UTM coordinates (>8,000,000m)', () => {
  // UTM survey coordinates in Nepal (approx Easting 620,000m, Northing 8,450,000m)
  const surveyCoords = [
    { x: 620000.12345, y: 8450000.6789 },
    { x: 620100.12345, y: 8450000.6789 },
    { x: 620100.12345, y: 8450100.6789 },
    { x: 620000.12345, y: 8450100.6789 },
  ];

  const { centeredPoints, originOffset, restore } = recenterCoordinates(surveyCoords);

  assert.ok(originOffset.x > 600000);
  assert.ok(originOffset.y > 8000000);

  // Centered coordinates are close to (0,0) ([-50, 50]), preventing f64 cancellation
  for (const cp of centeredPoints) {
    assert.ok(Math.abs(cp.x) <= 100);
    assert.ok(Math.abs(cp.y) <= 100);
  }

  // Exact restoration
  const restored = restore(centeredPoints);
  for (let i = 0; i < surveyCoords.length; i++) {
    assert.equal(restored[i].x, surveyCoords[i].x);
    assert.equal(restored[i].y, surveyCoords[i].y);
  }
});
