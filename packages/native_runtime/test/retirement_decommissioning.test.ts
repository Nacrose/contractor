import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DecommissioningManifestRegistry,
  RollbackDrillEngine,
} from '../src/index.js';

test('DecommissioningManifestRegistry: registers all 5 migration waves and verifies preserved backend APIs', () => {
  const routes = DecommissioningManifestRegistry.getAllRoutes();
  assert.equal(routes.length, 6);

  // Wave 1: BoQ and Measurement
  const boqRoute = DecommissioningManifestRegistry.getRoute('/projects/:id/boq');
  assert.ok(boqRoute);
  assert.equal(boqRoute.migrationWave, 1);
  assert.equal(boqRoute.legacyComponent, 'LegacyBoqSpreadsheetView');
  assert.equal(boqRoute.preservedBackendApi, '/api/v1/projects/:id/boq');

  const measurementRoute = DecommissioningManifestRegistry.getRoute('/projects/:id/measurement');
  assert.ok(measurementRoute);
  assert.equal(measurementRoute.migrationWave, 1);
  assert.equal(measurementRoute.legacyComponent, 'LegacyMeasurementSheetView');

  // Wave 2: Takeoff
  const takeoffRoute = DecommissioningManifestRegistry.getRoute('/projects/:id/takeoff');
  assert.ok(takeoffRoute);
  assert.equal(takeoffRoute.migrationWave, 2);
  assert.equal(takeoffRoute.legacyComponent, 'LegacyPdfTakeoffView');

  // Wave 3: CAD
  const cadRoute = DecommissioningManifestRegistry.getRoute('/projects/:id/cad');
  assert.ok(cadRoute);
  assert.equal(cadRoute.migrationWave, 3);
  assert.equal(cadRoute.legacyComponent, 'LegacyCadDrawingView');

  // Wave 4: Schedule
  const scheduleRoute = DecommissioningManifestRegistry.getRoute('/projects/:id/schedule');
  assert.ok(scheduleRoute);
  assert.equal(scheduleRoute.migrationWave, 4);
  assert.equal(scheduleRoute.legacyComponent, 'LegacyGanttScheduleView');

  // Wave 5: Accounting
  const accountingRoute = DecommissioningManifestRegistry.getRoute('/projects/:id/accounting');
  assert.ok(accountingRoute);
  assert.equal(accountingRoute.migrationWave, 5);
  assert.equal(accountingRoute.legacyComponent, 'LegacyAccountingLedgerView');

  // Verify all backend APIs are preserved
  const apis = DecommissioningManifestRegistry.getPreservedBackendApis();
  assert.equal(apis.length, 6);
  assert.ok(apis.includes('/api/v1/projects/:id/boq'));
  assert.ok(apis.includes('/api/v1/projects/:id/accounting'));
});

test('RollbackDrillEngine: executes emergency rollback drill with < 60s SLA and zero data loss', () => {
  const engine = new RollbackDrillEngine();
  assert.equal(engine.activeTarget, 'FLUTTER_WEB');

  // Execute drill with 15 in-flight mutations in queue
  const drillResult = engine.executeRollbackDrill(15);

  assert.ok(drillResult.drillId.startsWith('DRILL-'));
  assert.equal(drillResult.activeTarget, 'LEGACY_NEXTJS');
  assert.equal(drillResult.inFlightMutationsDrained, 15);
  assert.equal(drillResult.zeroDataLossVerified, true);
  assert.ok(drillResult.meetsLatencySla);
  assert.ok(drillResult.latencyMs < 60000); // Guarantees < 60s restoration

  // Verify engine state switched
  assert.equal(engine.activeTarget, 'LEGACY_NEXTJS');

  // Resume modern target
  engine.resumeModernTarget();
  assert.equal(engine.activeTarget, 'FLUTTER_WEB');
});
