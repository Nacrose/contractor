/**
 * Takeoff-to-BoQ Domain Integration Tests (M08-T05).
 *
 * Verifies the single domain integration path between takeoff measurements and BoQ items:
 *  1. Uses existing models (MeasurementRecord, DerivedQuantityLink, BoqLineItem semantics).
 *  2. Architectural enforcement: drawing widgets CANNOT mutate BoQ cells directly.
 *  3. Quantity postings are existing service calls ("worksheet.update") with permission checks intact.
 *  4. Change-feed integration and Flutter-parity DTO generation (Standing Constraint 3).
 *  5. Full round-trip verification: measurement -> quantity -> BoQ cell -> measurement.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MeasurementRepository,
  MeasurementRecord,
  ProvenanceBuilder,
  CalibrationRecord,
  TakeoffBoqLinkService,
  TakeoffDrawingWidget,
  CallerContext,
  DirectMutationProhibitedError,
  TakeoffPermissionError,
  TakeoffFiscalLockError,
  formatExactDecimal,
  TakeoffChangeEvent,
  FlutterParityBoqLinkDto
} from '../src/index.js';

function createMockCalibration(scaleFactor = 0.05): CalibrationRecord {
  return {
    calibrationId: 'cal-mock-01',
    documentId: 'doc-blueprint-01',
    revisionId: 'REV-A',
    pageIndex: 0,
    version: 1,
    pointA: { x: 0, y: 0 },
    pointB: { x: 100, y: 0 },
    physicalDistance: 5.0,
    unit: 'm',
    scaleFactor,
    createdAtUtc: new Date().toISOString(),
    createdBy: 'estimator-1'
  };
}

function createMockPolygonMeasurement(
  id: string,
  rawQuantity: number,
  calibratedQuantity: number,
  status: 'ACCEPTED' | 'NEEDS_REVIEW' | 'INVALIDATED' = 'ACCEPTED'
): MeasurementRecord {
  const cal = createMockCalibration();
  const prov = ProvenanceBuilder.createDefault('doc-blueprint-01', 'REV-A', 0, cal);
  prov.status = status;
  return {
    id,
    provenance: prov,
    type: 'POLYGON_AREA',
    label: 'Ground Floor Slab Slab-A1',
    geometry: {
      type: 'polygon',
      outerLoop: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 150 },
        { x: 0, y: 150 }
      ],
      holes: []
    },
    rawDocumentQuantity: rawQuantity,
    calibratedQuantity: calibratedQuantity,
    declaredUnit: 'sqm',
    version: 1,
    derivedQuantities: [],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString()
  };
}

test('drawing widget cannot mutate BoQ cells directly (architectural guard)', async () => {
  const repo = new MeasurementRepository();
  const service = new TakeoffBoqLinkService(repo);
  const widget = new TakeoffDrawingWidget('canvas-widget-01', service);

  const mockCell = { cellRef: 'sheet1:col3:row5', value: '10.00' };

  assert.throws(
    () => {
      widget.directMutateBoqCell(mockCell, '50.00');
    },
    (err: unknown) => {
      assert.ok(err instanceof DirectMutationProhibitedError);
      assert.match(err.message, /cannot mutate BoQ cells directly/i);
      assert.match(err.message, /TakeoffBoqLinkService/);
      return true;
    }
  );
});

test('quantity posting enforces permission checks and fiscal lock on "worksheet.update"', async () => {
  const repo = new MeasurementRepository();
  const m1 = createMockPolygonMeasurement('meas-01', 30000, 75.0);
  repo.save(m1);

  const service = new TakeoffBoqLinkService(repo);

  // 1. Anonymous caller fails identity guard
  const anonymousCaller: CallerContext = {
    userId: '',
    tenantId: 'tenant-acme',
    projectId: 'proj-kathmandu-01',
    roles: [],
    permissions: []
  };

  await assert.rejects(
    async () => {
      await service.postQuantityUpdate(anonymousCaller, {
        measurementId: 'meas-01',
        boqCode: 'BOQ-CONC-01',
        cellRef: 'sheet1:colQty:row10'
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TakeoffPermissionError);
      assert.match(err.message, /identity guard failed/i);
      return true;
    }
  );

  // 2. Caller without required role/permission fails projectPermission guard
  const unauthorizedCaller: CallerContext = {
    userId: 'user-guest',
    tenantId: 'tenant-acme',
    projectId: 'proj-kathmandu-01',
    roles: ['viewer'],
    permissions: ['document.read']
  };

  await assert.rejects(
    async () => {
      await service.postQuantityUpdate(unauthorizedCaller, {
        measurementId: 'meas-01',
        boqCode: 'BOQ-CONC-01',
        cellRef: 'sheet1:colQty:row10'
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TakeoffPermissionError);
      assert.match(err.message, /lacks required permission/i);
      return true;
    }
  );

  // 3. Project under fiscal lock fails fiscalLock guard
  const fiscalLockedCaller: CallerContext = {
    userId: 'user-estimator',
    tenantId: 'tenant-acme',
    projectId: 'proj-kathmandu-01',
    roles: ['estimator'],
    permissions: ['worksheet.write'],
    isFiscalLocked: true
  };

  await assert.rejects(
    async () => {
      await service.postQuantityUpdate(fiscalLockedCaller, {
        measurementId: 'meas-01',
        boqCode: 'BOQ-CONC-01',
        cellRef: 'sheet1:colQty:row10'
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TakeoffFiscalLockError);
      assert.match(err.message, /under fiscal year lock/i);
      return true;
    }
  );

  // 4. Authorized caller succeeds and returns durable receipt
  const authorizedCaller: CallerContext = {
    userId: 'user-estimator-valid',
    tenantId: 'tenant-acme',
    projectId: 'proj-kathmandu-01',
    roles: ['estimator'],
    permissions: ['worksheet.write']
  };

  const receipt = await service.postQuantityUpdate(authorizedCaller, {
    measurementId: 'meas-01',
    boqCode: 'BOQ-CONC-01',
    cellRef: 'sheet1:colQty:row10',
    multiplier: 1.0
  });

  assert.equal(receipt.operation, 'worksheet.update');
  assert.equal(receipt.boqCode, 'BOQ-CONC-01');
  assert.equal(receipt.cellRef, 'sheet1:colQty:row10');
  assert.equal(receipt.exactDecimalQuantity, '75.00');
  assert.ok(receipt.receiptId.startsWith('rcpt-boq-'));
  assert.ok(receipt.serverSeq > 0);
});

test('measurement in NEEDS_REVIEW or INVALIDATED status rejects quantity posting', async () => {
  const repo = new MeasurementRepository();
  const mReview = createMockPolygonMeasurement('meas-review', 30000, 75.0, 'NEEDS_REVIEW');
  repo.save(mReview);

  const service = new TakeoffBoqLinkService(repo);
  const authorizedCaller: CallerContext = {
    userId: 'user-estimator',
    tenantId: 'tenant-acme',
    projectId: 'proj-kathmandu-01',
    roles: ['estimator'],
    permissions: ['worksheet.write']
  };

  await assert.rejects(
    async () => {
      await service.postQuantityUpdate(authorizedCaller, {
        measurementId: 'meas-review',
        boqCode: 'BOQ-CONC-01',
        cellRef: 'sheet1:colQty:row10'
      });
    },
    /Cannot post quantities for measurement in "NEEDS_REVIEW" status/i
  );
});

test('change-feed integration and Flutter-parity DTO generation (Standing Constraint 3)', async () => {
  const repo = new MeasurementRepository();
  const m1 = createMockPolygonMeasurement('meas-slab-01', 40000, 100.0);
  repo.save(m1);

  const emittedEvents: TakeoffChangeEvent[] = [];
  const service = new TakeoffBoqLinkService(repo, (evt) => emittedEvents.push(evt));

  const authorizedCaller: CallerContext = {
    userId: 'user-estimator-valid',
    tenantId: 'tenant-acme',
    projectId: 'proj-kathmandu-01',
    roles: ['estimator'],
    permissions: ['worksheet.write']
  };

  const receipt = await service.postQuantityUpdate(authorizedCaller, {
    measurementId: 'meas-slab-01',
    boqCode: 'BOQ-CONC-SLAB',
    cellRef: 'sheet-ground:colC:row15',
    multiplier: 0.15 // 100 m2 * 0.15 m thickness = 15.00 m3
  });

  // Verify change-feed event
  assert.equal(emittedEvents.length, 1);
  const evt = emittedEvents[0];
  assert.equal(evt.changeKind, 'TAKEOFF_MEASUREMENT_UPDATED');
  assert.equal(evt.tenantId, 'tenant-acme');
  assert.equal(evt.payload.exactDecimalQuantity, '15.00');
  assert.equal(evt.payload.receiptId, receipt.receiptId);

  // Verify Flutter-parity DTO mapping
  const links = service.getLinksForMeasurement('meas-slab-01');
  assert.equal(links.length, 1);
  const link = links[0];

  const flutterDto: FlutterParityBoqLinkDto = {
    linkId: link.linkId,
    measurementId: link.measurementId,
    documentId: link.documentId,
    revisionId: link.revisionId,
    boqCode: link.boqCode,
    cellRef: link.cellRef,
    multiplier: link.multiplier,
    derivedQuantity: link.derivedQuantity,
    exactDecimalQuantity: link.exactDecimalQuantity,
    targetUnit: link.targetUnit,
    status: link.status,
    receiptId: link.lastReceiptId,
    serverSeq: link.lastServerSeq
  };

  assert.equal(flutterDto.boqCode, 'BOQ-CONC-SLAB');
  assert.equal(flutterDto.cellRef, 'sheet-ground:colC:row15');
  assert.equal(flutterDto.multiplier, 0.15);
  assert.equal(flutterDto.exactDecimalQuantity, '15.00');
  assert.equal(flutterDto.receiptId, receipt.receiptId);
});

test('round-trip evidence links measurement -> quantity -> BoQ -> measurement', async () => {
  const repo = new MeasurementRepository();
  // Calibrated area: 120.5 sqm
  const m1 = createMockPolygonMeasurement('meas-concrete-02', 48200, 120.5);
  repo.save(m1);

  const service = new TakeoffBoqLinkService(repo);
  const widget = new TakeoffDrawingWidget('drawing-canvas-01', service);

  const caller: CallerContext = {
    userId: 'engineer-01',
    tenantId: 'tenant-acme',
    projectId: 'proj-highway-09',
    roles: ['project_manager'],
    permissions: ['worksheet.write']
  };

  // Route posting through drawing widget helper (safe single domain path)
  const receipt = await widget.requestQuantityPosting(caller, {
    measurementId: 'meas-concrete-02',
    boqCode: 'BOQ-PAVEMENT-01',
    cellRef: 'sheet-highway:colQty:row42',
    multiplier: 1.0,
    targetUnit: 'sqm'
  });

  assert.equal(receipt.exactDecimalQuantity, '120.50');

  // Verify reflected cell in BoQ table
  const reflectedCell = service.getReflectedCell('sheet-highway:colQty:row42');
  assert.ok(reflectedCell);
  assert.equal(reflectedCell.value, '120.50');
  assert.equal(reflectedCell.lastTakeoffMeasurementId, 'meas-concrete-02');
  assert.equal(reflectedCell.lastReceiptId, receipt.receiptId);
  assert.equal(reflectedCell.lastServerSeq, receipt.serverSeq);

  // Verify measurement derived quantities list
  const updatedMeasurement = repo.getById('meas-concrete-02')!;
  assert.equal(updatedMeasurement.derivedQuantities.length, 1);
  assert.equal(updatedMeasurement.derivedQuantities[0].derivedQuantity, 120.5);
  assert.equal(updatedMeasurement.derivedQuantities[0].boqItemId, 'BOQ-PAVEMENT-01');

  // Verify full round-trip verification helper
  const roundTrip = service.verifyRoundTrip('meas-concrete-02', 'sheet-highway:colQty:row42');
  assert.ok(roundTrip.cellValueMatches);
  assert.equal(roundTrip.measurementId, 'meas-concrete-02');
  assert.equal(roundTrip.boqCode, 'BOQ-PAVEMENT-01');
  assert.equal(roundTrip.cellRef, 'sheet-highway:colQty:row42');
  assert.equal(roundTrip.postedExactDecimalQuantity, '120.50');
  assert.equal(roundTrip.receiptId, receipt.receiptId);
  assert.equal(roundTrip.serverSeq, receipt.serverSeq);
});
