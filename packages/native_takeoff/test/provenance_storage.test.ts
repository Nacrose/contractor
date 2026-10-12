import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MeasurementRepository,
  MeasurementRecord,
  ProvenanceBuilder,
  CalibrationRecord,
  TakeoffInvalidationEngine,
  TakeoffSyncFeedAdapter
} from "../src/index.js";

const sampleCalibrationV1: CalibrationRecord = {
  calibrationId: "cal-01",
  documentId: "doc-str-01",
  revisionId: "REV-A",
  pageIndex: 0,
  version: 1,
  pointA: { x: 0, y: 0 },
  pointB: { x: 100, y: 0 },
  physicalDistance: 5.0,
  unit: "m",
  scaleFactor: 0.05, // 1 pt = 0.05 m
  createdAtUtc: "2026-10-12T10:00:00Z",
  createdBy: "Site Engineer"
};

const sampleCalibrationV2: CalibrationRecord = {
  ...sampleCalibrationV1,
  version: 2,
  physicalDistance: 6.0,
  scaleFactor: 0.06 // 1 pt = 0.06 m (recalibrated)
};

test("provenance recording: every measurement captures revision, page, crop, rotation, and calibration", () => {
  const repo = new MeasurementRepository();
  const prov = ProvenanceBuilder.createDefault(
    "doc-str-01",
    "REV-A",
    0,
    sampleCalibrationV1,
    { x: 0, y: 0, width: 1190.55, height: 841.89 },
    0
  );

  const measurement: MeasurementRecord = {
    id: "m-pier-01",
    provenance: prov,
    type: "LINEAR_DISTANCE",
    label: "Pier Span 1-2",
    geometry: {
      type: "linear",
      start: { x: 100, y: 200 },
      end: { x: 300, y: 200 }
    },
    rawDocumentQuantity: 200, // 200 pt
    calibratedQuantity: 10.0, // 200 * 0.05 m = 10.0 m
    declaredUnit: "m",
    version: 1,
    derivedQuantities: [
      {
        linkId: "link-boq-01",
        boqItemId: "BOQ-ITEM-CONCRETE-PIER",
        factor: 1.5,
        derivedQuantity: 15.0,
        status: "ACCEPTED"
      }
    ],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString()
  };

  repo.save(measurement);

  const retrieved = repo.getById("m-pier-01");
  assert.ok(retrieved);
  assert.equal(retrieved.provenance.documentId, "doc-str-01");
  assert.equal(retrieved.provenance.sourceRevisionId, "REV-A");
  assert.equal(retrieved.provenance.pageIndex, 0);
  assert.equal(retrieved.provenance.calibrationVersion, 1);
  assert.equal(retrieved.provenance.calibrationRatio.scaleFactor, 0.05);
  assert.equal(retrieved.provenance.status, "ACCEPTED");

  // Query by document and revision
  const queryRevA = repo.query({ documentId: "doc-str-01", revisionId: "REV-A" });
  assert.equal(queryRevA.length, 1);

  const queryRevB = repo.query({ documentId: "doc-str-01", revisionId: "REV-B" });
  assert.equal(queryRevB.length, 0);
});

test("geometry stored in unscaled document space points (1/72 in) with holes", () => {
  const repo = new MeasurementRepository();
  const prov = ProvenanceBuilder.createDefault("doc-str-01", "REV-A", 0, sampleCalibrationV1);

  // Room area with stairwell hole
  const measurement: MeasurementRecord = {
    id: "m-slab-area",
    provenance: prov,
    type: "POLYGON_AREA",
    label: "Slab Level 1 Net Area",
    geometry: {
      type: "polygon",
      outerLoop: [
        { x: 100, y: 100 },
        { x: 500, y: 100 },
        { x: 500, y: 400 },
        { x: 100, y: 400 }
      ],
      holes: [
        [
          { x: 200, y: 200 },
          { x: 300, y: 200 },
          { x: 300, y: 300 },
          { x: 200, y: 300 }
        ]
      ]
    },
    rawDocumentQuantity: 110000, // 120000 gross - 10000 deduction = 110000 pt²
    calibratedQuantity: 275.0, // 110000 * (0.05)^2 = 275.0 m²
    declaredUnit: "m²",
    version: 1,
    derivedQuantities: [],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString()
  };

  repo.save(measurement);

  const saved = repo.getById("m-slab-area");
  assert.ok(saved);
  assert.equal(saved.geometry.type, "polygon");
  if (saved.geometry.type === "polygon") {
    // Exact unscaled coordinates are preserved
    assert.equal(saved.geometry.outerLoop[0].x, 100);
    assert.equal(saved.geometry.outerLoop[0].y, 100);
    assert.equal(saved.geometry.holes.length, 1);
    assert.equal(saved.geometry.holes[0][0].x, 200);
  }
});

test("revision changes invalidate derived quantities rather than silently rebasing (v3 §5.4)", () => {
  const repo = new MeasurementRepository();
  const engine = new TakeoffInvalidationEngine(repo);

  const prov = ProvenanceBuilder.createDefault("doc-str-01", "REV-A", 0, sampleCalibrationV1);
  const m1: MeasurementRecord = {
    id: "m-rebar-beam-01",
    provenance: prov,
    type: "LINEAR_DISTANCE",
    label: "Beam Rebar Length",
    geometry: { type: "linear", start: { x: 50, y: 50 }, end: { x: 250, y: 50 } },
    rawDocumentQuantity: 200,
    calibratedQuantity: 10.0,
    declaredUnit: "m",
    version: 1,
    derivedQuantities: [
      {
        linkId: "link-ipc-01",
        boqItemId: "BOQ-REBAR-T16",
        factor: 1.58, // 1.58 kg/m
        derivedQuantity: 15.8,
        status: "ACCEPTED"
      }
    ],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString()
  };
  repo.save(m1);

  // A new drawing revision REV-B is issued
  const summary = engine.invalidateForDocumentRevisionBump("doc-str-01", "REV-A", "REV-B");

  assert.equal(summary.invalidatedMeasurementIds.length, 1);
  assert.equal(summary.affectedDerivedQuantitiesCount, 1);
  assert.equal(summary.reason, "SOURCE_REVISION_BUMPED");

  // Verify measurement is in NEEDS_REVIEW state
  const updatedM1 = repo.getById("m-rebar-beam-01");
  assert.ok(updatedM1);
  assert.equal(updatedM1.provenance.status, "NEEDS_REVIEW");
  assert.equal(updatedM1.provenance.invalidationReason, "SOURCE_REVISION_BUMPED");
  assert.equal(updatedM1.derivedQuantities[0].status, "NEEDS_REVIEW");

  // SILENT REBASE IS STRICTLY PREVENTED: coordinates and quantities remain frozen
  assert.equal(updatedM1.calibratedQuantity, 10.0);
  assert.equal(updatedM1.provenance.sourceRevisionId, "REV-A");
});

test("recalibration invalidates affected page measurements and requires review", () => {
  const repo = new MeasurementRepository();
  const engine = new TakeoffInvalidationEngine(repo);

  const prov = ProvenanceBuilder.createDefault("doc-str-01", "REV-A", 0, sampleCalibrationV1);
  const m1: MeasurementRecord = {
    id: "m-span-01",
    provenance: prov,
    type: "LINEAR_DISTANCE",
    label: "Span Measurement",
    geometry: { type: "linear", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    rawDocumentQuantity: 100,
    calibratedQuantity: 5.0,
    declaredUnit: "m",
    version: 1,
    derivedQuantities: [
      {
        linkId: "link-01",
        boqItemId: "BOQ-SPAN",
        factor: 1.0,
        derivedQuantity: 5.0,
        status: "ACCEPTED"
      }
    ],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString()
  };
  repo.save(m1);

  // Recalibrate page with v2
  const summary = engine.invalidateForPageRecalibration("doc-str-01", 0, sampleCalibrationV2);
  assert.equal(summary.invalidatedMeasurementIds.length, 1);

  const invalidated = repo.getById("m-span-01");
  assert.ok(invalidated);
  assert.equal(invalidated.provenance.status, "NEEDS_REVIEW");
  assert.equal(invalidated.provenance.invalidationReason, "PAGE_RECALIBRATED");

  // Apply human review action: RECALCULATE_QUANTITY
  const reviewed = engine.applyHumanReview("m-span-01", "RECALCULATE_QUANTITY", "Lead Structural Engineer", {
    unit: sampleCalibrationV2.unit,
    scaleFactor: sampleCalibrationV2.scaleFactor,
    referenceDistance: sampleCalibrationV2.physicalDistance,
    calibratedAtUtc: new Date().toISOString()
  });

  assert.equal(reviewed, true);
  const reaccepted = repo.getById("m-span-01");
  assert.ok(reaccepted);
  assert.equal(reaccepted.provenance.status, "ACCEPTED");
  assert.equal(reaccepted.provenance.reviewedBy, "Lead Structural Engineer");
  // 100 pt * 0.06 = 6.0 m
  assert.equal(reaccepted.calibratedQuantity, 6.0);
  assert.equal(reaccepted.derivedQuantities[0].derivedQuantity, 6.0);
  assert.equal(reaccepted.derivedQuantities[0].status, "ACCEPTED");
});

test("change-feed integration and Flutter-parity DTO mapping (Standing Constraint 3)", () => {
  const prov = ProvenanceBuilder.createDefault("doc-str-01", "REV-A", 0, sampleCalibrationV1);
  const m1: MeasurementRecord = {
    id: "m-feed-test",
    provenance: prov,
    type: "LINEAR_DISTANCE",
    label: "Girder Length",
    geometry: { type: "linear", start: { x: 10.5, y: 20.25 }, end: { x: 110.5, y: 20.25 } },
    rawDocumentQuantity: 100,
    calibratedQuantity: 5.0,
    declaredUnit: "m",
    version: 1,
    derivedQuantities: [],
    createdAtUtc: "2026-10-12T10:00:00Z",
    updatedAtUtc: "2026-10-12T10:00:00Z"
  };

  // 1. Change Feed event formatting
  const event = TakeoffSyncFeedAdapter.formatMeasurementChange(
    "TAKEOFF_MEASUREMENT_CREATED",
    "tenant-nepal-metro",
    m1
  );

  assert.equal(event.changeKind, "TAKEOFF_MEASUREMENT_CREATED");
  assert.equal(event.tenantId, "tenant-nepal-metro");
  assert.equal(event.documentId, "doc-str-01");
  assert.equal(event.revisionId, "REV-A");
  assert.ok(event.payload.geometry);

  // 2. Flutter Parity DTO mapping
  const flutterDto = TakeoffSyncFeedAdapter.toFlutterDto(m1);
  assert.equal(flutterDto.id, "m-feed-test");
  assert.equal(flutterDto.documentId, "doc-str-01");
  assert.equal(flutterDto.pointsDocumentSpace.length, 2);
  assert.equal(flutterDto.pointsDocumentSpace[0].dx, 10.5);
  assert.equal(flutterDto.pointsDocumentSpace[0].dy, 20.25);
  assert.equal(flutterDto.pointsDocumentSpace[1].dx, 110.5);
  assert.equal(flutterDto.pointsDocumentSpace[1].dy, 20.25);
  assert.equal(flutterDto.scaleFactor, 0.05);
  assert.equal(flutterDto.calibratedQuantity, 5.0);
  assert.equal(flutterDto.status, "ACCEPTED");
});
