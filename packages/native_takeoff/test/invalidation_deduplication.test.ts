/**
 * Recalibration/Revision Invalidation & Double-Counting Prevention Tests (M08-T06).
 *
 * Acceptance criteria verified:
 *  1. Affected measurements + downstream quantities are marked for review on recalibration/revision;
 *     accepted quantities cannot silently persist.
 *  2. Repeated links and replayed measurements (M03 feed replay) cannot double count —
 *     idempotency fixture-proven.
 *  3. Review state is visible in the shared save/sync model (M02-T05) and clears ONLY
 *     through the domain path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MeasurementRepository,
  MeasurementRecord,
  ProvenanceBuilder,
  CalibrationRecord,
  TakeoffBoqLinkService,
  CallerContext,
  TakeoffInvalidationEngine
} from '../src/index.js';

function createMockCalibration(version = 1, scaleFactor = 0.05): CalibrationRecord {
  return {
    calibrationId: `cal-mock-${version}`,
    documentId: 'doc-blueprint-structural',
    revisionId: 'REV-A',
    pageIndex: 0,
    version,
    pointA: { x: 0, y: 0 },
    pointB: { x: 100, y: 0 },
    physicalDistance: 5.0,
    unit: 'm',
    scaleFactor,
    createdAtUtc: new Date().toISOString(),
    createdBy: 'estimator-1'
  };
}

function createMockMeasurement(
  id: string,
  rawQuantity: number,
  calibratedQuantity: number,
  revisionId = 'REV-A'
): MeasurementRecord {
  const cal = createMockCalibration();
  const prov = ProvenanceBuilder.createDefault('doc-blueprint-structural', revisionId, 0, cal);
  return {
    id,
    provenance: prov,
    type: 'POLYGON_AREA',
    label: `Slab Area ${id}`,
    geometry: {
      type: 'polygon',
      outerLoop: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
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

const authCaller: CallerContext = {
  userId: 'estimator-lead',
  tenantId: 'tenant-contractor-main',
  projectId: 'proj-kathmandu-tower',
  roles: ['estimator'],
  permissions: ['worksheet.write']
};

test('recalibration and revision invalidation: downstream BoQ quantities marked for review (no silent persistence)', async () => {
  const repo = new MeasurementRepository();
  const m1 = createMockMeasurement('meas-slab-east', 40000, 100.0, 'REV-A');
  repo.save(m1);

  const service = new TakeoffBoqLinkService(repo);

  // Post quantity to BoQ cell
  const receipt = await service.postQuantityUpdate(authCaller, {
    measurementId: 'meas-slab-east',
    boqCode: 'BOQ-CONC-SLAB',
    cellRef: 'sheet-ground:colQty:row10',
    multiplier: 1.0
  });

  assert.equal(receipt.exactDecimalQuantity, '100.00');
  let cell = service.getReflectedCell('sheet-ground:colQty:row10')!;
  assert.equal(cell.status, 'ACCEPTED');
  assert.equal(cell.needsReview, false);
  assert.equal(cell.value, '100.00');

  // Trigger page recalibration via the invalidation engine
  const invEngine = service.getInvalidationEngine();
  const newCal = createMockCalibration(2, 0.06); // scale changed from 0.05 to 0.06
  const invSummary = invEngine.invalidateForPageRecalibration('doc-blueprint-structural', 0, newCal);

  assert.equal(invSummary.reason, 'PAGE_RECALIBRATED');
  assert.deepEqual(invSummary.invalidatedMeasurementIds, ['meas-slab-east']);

  // Verify measurement is in NEEDS_REVIEW
  const updatedM = repo.getById('meas-slab-east')!;
  assert.equal(updatedM.provenance.status, 'NEEDS_REVIEW');
  assert.equal(updatedM.provenance.invalidationReason, 'PAGE_RECALIBRATED');

  // CRITICAL ACCEPTANCE INVARIANT:
  // Downstream BoQ cell is marked for review; accepted quantity CANNOT silently persist!
  cell = service.getReflectedCell('sheet-ground:colQty:row10')!;
  assert.equal(cell.status, 'NEEDS_REVIEW');
  assert.equal(cell.needsReview, true);

  // Attempting to post new quantities while measurement is in review fails-closed
  await assert.rejects(
    async () => {
      await service.postQuantityUpdate(authCaller, {
        measurementId: 'meas-slab-east',
        boqCode: 'BOQ-CONC-SLAB',
        cellRef: 'sheet-ground:colQty:row10'
      });
    },
    /Cannot post quantities for measurement in "NEEDS_REVIEW" status/i
  );
});

test('double-counting prevention: repeated links and replayed measurements are idempotent', async () => {
  const repo = new MeasurementRepository();
  const mA = createMockMeasurement('meas-room-A', 40000, 100.0);
  const mB = createMockMeasurement('meas-room-B', 20000, 50.0);
  repo.save(mA);
  repo.save(mB);

  const service = new TakeoffBoqLinkService(repo);

  // 1. Initial post for Measurement A (100.00 sqm)
  const receiptA1 = await service.postQuantityUpdate(authCaller, {
    measurementId: 'meas-room-A',
    boqCode: 'BOQ-DRYWALL-01',
    cellRef: 'sheet-finishes:colQty:row25',
    multiplier: 1.0,
    idempotencyKey: 'idemp-feed-evt-001'
  });
  assert.equal(receiptA1.exactDecimalQuantity, '100.00');

  let cell = service.getReflectedCell('sheet-finishes:colQty:row25')!;
  assert.equal(cell.value, '100.00');

  // 2. Replay Measurement A 5 times (simulating M03 feed retry / duplicate dispatch)
  for (let i = 0; i < 5; i++) {
    const replayReceipt = await service.postQuantityUpdate(authCaller, {
      measurementId: 'meas-room-A',
      boqCode: 'BOQ-DRYWALL-01',
      cellRef: 'sheet-finishes:colQty:row25',
      multiplier: 1.0,
      idempotencyKey: 'idemp-feed-evt-001'
    });
    assert.equal(replayReceipt.isIdempotentReplay, true);
  }

  // Value MUST remain 100.00, NOT 600.00!
  cell = service.getReflectedCell('sheet-finishes:colQty:row25')!;
  assert.equal(cell.value, '100.00');
  assert.equal(cell.contributingLinkIds.length, 1);

  // 3. Post Measurement B (50.00 sqm) to the SAME cell (multi-measurement aggregation)
  await service.postQuantityUpdate(authCaller, {
    measurementId: 'meas-room-B',
    boqCode: 'BOQ-DRYWALL-01',
    cellRef: 'sheet-finishes:colQty:row25',
    multiplier: 1.0
  });

  cell = service.getReflectedCell('sheet-finishes:colQty:row25')!;
  assert.equal(cell.value, '150.00');
  assert.equal(cell.contributingLinkIds.length, 2);

  // 4. Replay both Measurement A and Measurement B without idempotency keys (raw replay)
  for (let i = 0; i < 10; i++) {
    await service.postQuantityUpdate(authCaller, {
      measurementId: 'meas-room-A',
      boqCode: 'BOQ-DRYWALL-01',
      cellRef: 'sheet-finishes:colQty:row25',
      multiplier: 1.0
    });
    await service.postQuantityUpdate(authCaller, {
      measurementId: 'meas-room-B',
      boqCode: 'BOQ-DRYWALL-01',
      cellRef: 'sheet-finishes:colQty:row25',
      multiplier: 1.0
    });
  }

  // Aggregated total must remain exactly 150.00 (idempotent distinct-link aggregation)
  cell = service.getReflectedCell('sheet-finishes:colQty:row25')!;
  assert.equal(cell.value, '150.00');
  assert.equal(cell.contributingLinkIds.length, 2);
});

test('review state visibility in shared save/sync model (M02-T05) and domain resolution', async () => {
  const repo = new MeasurementRepository();
  const m1 = createMockMeasurement('meas-slab-west', 40000, 100.0, 'REV-A');
  repo.save(m1);

  const service = new TakeoffBoqLinkService(repo);

  await service.postQuantityUpdate(authCaller, {
    measurementId: 'meas-slab-west',
    boqCode: 'BOQ-CONC-SLAB',
    cellRef: 'sheet-ground:colQty:row12',
    multiplier: 1.0
  });

  // Initially: save/sync status is clean
  let syncState = service.getSaveSyncState();
  assert.equal(syncState.pendingWorkRetained, false);
  assert.equal(syncState.serverAcceptance, 'accepted');
  assert.equal(syncState.nextUserAction, 'none');

  // Invalidate due to document revision bump (REV-A -> REV-B)
  const invEngine = service.getInvalidationEngine();
  invEngine.invalidateForDocumentRevisionBump('doc-blueprint-structural', 'REV-A', 'REV-B');

  // CRITICAL ACCEPTANCE INVARIANT:
  // Review state is visible in M02-T05 SaveSyncState
  syncState = service.getSaveSyncState();
  assert.equal(syncState.pendingWorkRetained, true);
  assert.equal(syncState.serverAcceptance, 'rejected');
  assert.equal(syncState.nextUserAction, 'review_server_rejection');

  // Verify that UI cannot directly clear or bypass the review state
  assert.throws(
    () => {
      // Direct UI clear attempt is architecturally rejected
      (service as any).saveSyncTracker.directClearReviewState();
    },
    /Review state cannot be cleared directly by UI; it clears only through the domain review resolution path/i
  );

  // Resolve review through canonical domain path: RECALCULATE_QUANTITY with updated scale factor (0.06)
  const newCalibrationRatio = {
    unit: 'm' as const,
    scaleFactor: 0.06,
    referenceDistance: 6.0,
    calibratedAtUtc: new Date().toISOString()
  };

  const res = service.resolveReviewDecision(authCaller, {
    measurementId: 'meas-slab-west',
    action: 'RECALCULATE_QUANTITY',
    reviewer: 'lead-engineer-1',
    newCalibrationRatio
  });

  assert.equal(res.action, 'RECALCULATE_QUANTITY');
  assert.equal(res.remainingPendingReviewsCount, 0);

  // 40000 pt2 * (0.06)^2 = 40000 * 0.0036 = 144.00 sqm
  const updatedM = repo.getById('meas-slab-west')!;
  assert.equal(updatedM.provenance.status, 'ACCEPTED');
  assert.equal(updatedM.calibratedQuantity, 144.0);

  const cell = service.getReflectedCell('sheet-ground:colQty:row12')!;
  assert.equal(cell.status, 'ACCEPTED');
  assert.equal(cell.needsReview, false);
  assert.equal(cell.value, '144.00');

  // CRITICAL ACCEPTANCE INVARIANT:
  // SaveSyncState clears only after domain resolution completes
  syncState = service.getSaveSyncState();
  assert.equal(syncState.pendingWorkRetained, false);
  assert.equal(syncState.serverAcceptance, 'accepted');
  assert.equal(syncState.nextUserAction, 'none');
});

test('review resolution with DISCARD removes quantity contribution cleanly', async () => {
  const repo = new MeasurementRepository();
  const mA = createMockMeasurement('meas-keep', 40000, 100.0);
  const mB = createMockMeasurement('meas-discard', 20000, 50.0);
  repo.save(mA);
  repo.save(mB);

  const service = new TakeoffBoqLinkService(repo);

  await service.postQuantityUpdate(authCaller, {
    measurementId: 'meas-keep',
    boqCode: 'BOQ-STEEL-01',
    cellRef: 'sheet-steel:colQty:row5',
    multiplier: 1.0
  });

  await service.postQuantityUpdate(authCaller, {
    measurementId: 'meas-discard',
    boqCode: 'BOQ-STEEL-01',
    cellRef: 'sheet-steel:colQty:row5',
    multiplier: 1.0
  });

  let cell = service.getReflectedCell('sheet-steel:colQty:row5')!;
  assert.equal(cell.value, '150.00');

  // Invalidate mB
  service.invalidateDownstreamLinks(['meas-discard'], 'MANUAL_REVIEW_REQUESTED');
  cell = service.getReflectedCell('sheet-steel:colQty:row5')!;
  assert.equal(cell.needsReview, true);

  // Resolve with DISCARD
  const res = service.resolveReviewDecision(authCaller, {
    measurementId: 'meas-discard',
    action: 'DISCARD',
    reviewer: 'lead-engineer-1'
  });

  assert.equal(res.action, 'DISCARD');
  assert.equal(res.remainingPendingReviewsCount, 0);

  // Cell now reflects only mA (100.00) without discarded contribution
  cell = service.getReflectedCell('sheet-steel:colQty:row5')!;
  assert.equal(cell.status, 'ACCEPTED');
  assert.equal(cell.needsReview, false);
  assert.equal(cell.value, '100.00');
});
