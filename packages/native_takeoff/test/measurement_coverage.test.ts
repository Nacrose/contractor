import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TakeoffMeasurementEngine,
  InvalidGeometryError,
  CalibrationRecord
} from "../src/index.js";

const testCalibrationM: CalibrationRecord = {
  calibrationId: "cal-m08-01",
  documentId: "doc-takeoff-01",
  revisionId: "REV-A",
  pageIndex: 0,
  version: 1,
  pointA: { x: 0, y: 0 },
  pointB: { x: 100, y: 0 },
  physicalDistance: 5.0, // 100 pt = 5.0 m -> 1 pt = 0.05 m
  unit: "m",
  scaleFactor: 0.05,
  createdAtUtc: "2026-10-12T12:00:00Z",
  createdBy: "Takeoff Engineer"
};

test("polygon area with nested deduction holes calculates gross, deductions, and net area", () => {
  // Outer slab: 400x300 pt = 120,000 pt²
  // Hole 1 (stairwell): 100x100 pt = 10,000 pt²
  // Hole 2 (elevator shaft): 50x50 pt = 2,500 pt²
  // Expected net area = 107,500 pt²
  // In m² at 0.05 m/pt: 107,500 * (0.05)^2 = 268.75 m²
  const res = TakeoffMeasurementEngine.computeMeasurement({
    id: "m-slab-takeoff",
    documentId: "doc-takeoff-01",
    revisionId: "REV-A",
    pageIndex: 0,
    calibration: testCalibrationM,
    type: "POLYGON_AREA",
    label: "Level 1 Suspended Slab",
    geometry: {
      type: "polygon",
      outerLoop: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 }
      ],
      holes: [
        [
          { x: 50, y: 50 },
          { x: 150, y: 50 },
          { x: 150, y: 150 },
          { x: 50, y: 150 }
        ],
        [
          { x: 250, y: 150 },
          { x: 300, y: 150 },
          { x: 300, y: 200 },
          { x: 250, y: 200 }
        ]
      ]
    }
  });

  assert.equal(res.rawDocumentQuantity, 107500);
  assert.equal(res.calibratedQuantity, 268.75);
  assert.equal(res.grossQuantity, 300.0); // 120,000 * 0.0025 = 300.0 m²
  assert.equal(res.deductionsQuantity, 31.25); // 12,500 * 0.0025 = 31.25 m²
  assert.equal(res.holesCount, 2);
  assert.equal(res.declaredUnit, "m²");
  assert.equal(res.record.provenance.status, "ACCEPTED");
});

test("polyline length and linear distance coverage", () => {
  // 1. Linear distance: 300 horizontal, 400 vertical -> hypot = 500 pt
  // 500 pt * 0.05 m/pt = 25.0 m
  const linRes = TakeoffMeasurementEngine.computeMeasurement({
    id: "m-span-01",
    documentId: "doc-takeoff-01",
    revisionId: "REV-A",
    pageIndex: 0,
    calibration: testCalibrationM,
    type: "LINEAR_DISTANCE",
    label: "Diagonal Span",
    geometry: {
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 300, y: 400 }
    }
  });

  assert.equal(linRes.rawDocumentQuantity, 500);
  assert.equal(linRes.calibratedQuantity, 25.0);
  assert.equal(linRes.declaredUnit, "m");

  // 2. Polyline: 3 segments: (0,0)->(100,0)->(100,100)->(0,100) = 300 pt
  // 300 pt * 0.05 m/pt = 15.0 m
  const polyRes = TakeoffMeasurementEngine.computeMeasurement({
    id: "m-wall-perimeter",
    documentId: "doc-takeoff-01",
    revisionId: "REV-A",
    pageIndex: 0,
    calibration: testCalibrationM,
    type: "POLYLINE_PERIMETER",
    label: "Retaining Wall Run",
    geometry: {
      type: "polyline",
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
    }
  });

  assert.equal(polyRes.rawDocumentQuantity, 300);
  assert.equal(polyRes.calibratedQuantity, 15.0);
  assert.equal(polyRes.declaredUnit, "m");
});

test("count marker measurement returns integer quantity", () => {
  const countRes = TakeoffMeasurementEngine.computeMeasurement({
    id: "m-count-column",
    documentId: "doc-takeoff-01",
    revisionId: "REV-A",
    pageIndex: 0,
    calibration: testCalibrationM,
    type: "COUNT_MARKER",
    label: "Column C1 Tag",
    geometry: {
      type: "count",
      location: { x: 120, y: 240 },
      markerShape: "circle"
    }
  });

  assert.equal(countRes.rawDocumentQuantity, 1);
  assert.equal(countRes.calibratedQuantity, 1);
  assert.equal(countRes.declaredUnit, "ea");
});

test("unit conversion is calibrated and versioned with measurement without ambient state", () => {
  // Test converting linear measurement from calibration unit 'm' to 'mm' and 'ft'
  const mmRes = TakeoffMeasurementEngine.computeMeasurement({
    id: "m-beam-mm",
    documentId: "doc-takeoff-01",
    revisionId: "REV-A",
    pageIndex: 0,
    calibration: testCalibrationM,
    type: "LINEAR_DISTANCE",
    label: "Tie Beam in mm",
    geometry: {
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    },
    targetUnit: "mm"
  });
  // 100 pt * 0.05 m/pt = 5.0 m = 5000 mm
  assert.equal(mmRes.calibratedQuantity, 5000);
  assert.equal(mmRes.declaredUnit, "mm");

  const ftRes = TakeoffMeasurementEngine.computeMeasurement({
    id: "m-beam-ft",
    documentId: "doc-takeoff-01",
    revisionId: "REV-A",
    pageIndex: 0,
    calibration: testCalibrationM,
    type: "LINEAR_DISTANCE",
    label: "Tie Beam in ft",
    geometry: {
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    },
    targetUnit: "ft"
  });
  // 5.0 m / 0.3048 = 16.4042 ft
  assert.equal(ftRes.calibratedQuantity, 16.4042);
  assert.equal(ftRes.declaredUnit, "ft");

  // Test converting area measurement to sqft
  const sqftRes = TakeoffMeasurementEngine.computeMeasurement({
    id: "m-slab-sqft",
    documentId: "doc-takeoff-01",
    revisionId: "REV-A",
    pageIndex: 0,
    calibration: testCalibrationM,
    type: "POLYGON_AREA",
    label: "Slab in sqft",
    geometry: {
      type: "polygon",
      outerLoop: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 }
      ],
      holes: []
    },
    targetUnit: "sqft"
  });
  // 40,000 pt² * (0.05)^2 = 100.0 m² / 0.09290304 = 1076.3910 sqft
  assert.equal(sqftRes.calibratedQuantity, 1076.391);
  assert.equal(sqftRes.declaredUnit, "sqft");
});

test("strict rejection of invalid geometry: self-intersection, collinear zero area, hole outside boundary", () => {
  // 1. Self-intersecting outer boundary (bow-tie polygon)
  assert.throws(
    () => {
      TakeoffMeasurementEngine.computeMeasurement({
        id: "m-bowtie-fail",
        documentId: "doc-takeoff-01",
        revisionId: "REV-A",
        pageIndex: 0,
        calibration: testCalibrationM,
        type: "POLYGON_AREA",
        label: "Bowtie Polygon",
        geometry: {
          type: "polygon",
          outerLoop: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
            { x: 100, y: 0 },
            { x: 0, y: 100 }
          ],
          holes: []
        }
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InvalidGeometryError);
      assert.match((err as Error).message, /Self-intersecting polygon boundary detected/);
      return true;
    }
  );

  // 2. Collinear degenerate polygon (zero area)
  assert.throws(
    () => {
      TakeoffMeasurementEngine.computeMeasurement({
        id: "m-collinear-fail",
        documentId: "doc-takeoff-01",
        revisionId: "REV-A",
        pageIndex: 0,
        calibration: testCalibrationM,
        type: "POLYGON_AREA",
        label: "Collinear Polygon",
        geometry: {
          type: "polygon",
          outerLoop: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 100, y: 0 }
          ],
          holes: []
        }
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InvalidGeometryError);
      assert.match((err as Error).message, /Collinear or zero-area degenerate polygon/);
      return true;
    }
  );

  // 3. Hole vertex outside outer polygon
  assert.throws(
    () => {
      TakeoffMeasurementEngine.computeMeasurement({
        id: "m-hole-outside-fail",
        documentId: "doc-takeoff-01",
        revisionId: "REV-A",
        pageIndex: 0,
        calibration: testCalibrationM,
        type: "POLYGON_AREA",
        label: "Hole Outside Polygon",
        geometry: {
          type: "polygon",
          outerLoop: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 }
          ],
          holes: [
            [
              { x: 150, y: 150 },
              { x: 200, y: 150 },
              { x: 200, y: 200 },
              { x: 150, y: 200 }
            ]
          ]
        }
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InvalidGeometryError);
      assert.match((err as Error).message, /falls outside outer polygon boundary/);
      return true;
    }
  );

  // 4. Coincident start and end point in linear measurement
  assert.throws(
    () => {
      TakeoffMeasurementEngine.computeMeasurement({
        id: "m-zero-distance-fail",
        documentId: "doc-takeoff-01",
        revisionId: "REV-A",
        pageIndex: 0,
        calibration: testCalibrationM,
        type: "LINEAR_DISTANCE",
        label: "Zero Distance",
        geometry: {
          type: "linear",
          start: { x: 50, y: 50 },
          end: { x: 50, y: 50 }
        }
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InvalidGeometryError);
      assert.match((err as Error).message, /Degenerate linear distance: start and end points are coincident/);
      return true;
    }
  );

  // 5. Open polyline with fewer than 2 vertices
  assert.throws(
    () => {
      TakeoffMeasurementEngine.computeMeasurement({
        id: "m-single-vertex-fail",
        documentId: "doc-takeoff-01",
        revisionId: "REV-A",
        pageIndex: 0,
        calibration: testCalibrationM,
        type: "POLYLINE_PERIMETER",
        label: "Single Vertex Polyline",
        geometry: {
          type: "polyline",
          vertices: [{ x: 50, y: 50 }]
        }
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof InvalidGeometryError);
      assert.match((err as Error).message, /Degenerate polyline: must have at least 2 vertices/);
      return true;
    }
  );
});
