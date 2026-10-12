/**
 * PdfCraft Host Adapter & Upstream Qualification Tests (M08-T09).
 *
 * Verifies:
 *  1. Dual presentation surfaces: Full Editor vs Embedded Takeoff vs Headless CLI.
 *  2. Invariant preservation: Document ID, revision, measurements, calibrations, selections across transitions.
 *  3. Domain permission boundary enforcement (view_only, takeoff_markup_only, full_authoring).
 *  4. Single domain path for BoQ quantity postings via TakeoffBoqLinkService.
 *  5. M04 photo-to-PDF markup pipeline and audit export.
 *  6. Two-release serialization compatibility (v0.3.0 format 3 vs v0.4.0 format 4).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentSession,
  PdfCraftRendererAdapter,
  MeasurementRepository,
  MeasurementRecord,
  ProvenanceBuilder,
  CalibrationRecord,
  TakeoffBoqLinkService,
  CallerContext,
  PdfCraftHostAdapter
} from '../src/index.js';

function createMockCalibration(): CalibrationRecord {
  return {
    calibrationId: 'cal-mock-01',
    documentId: 'doc-blueprint-01',
    revisionId: 'REV-A',
    pageIndex: 0,
    version: 1,
    pointA: { x: 0, y: 0 },
    pointB: { x: 100, y: 0 },
    physicalDistance: 10.0,
    unit: 'm',
    scaleFactor: 0.1,
    createdAtUtc: new Date().toISOString(),
    createdBy: 'estimator-1'
  };
}

function createMockMeasurement(id: string, rawVal = 100, calVal = 10): MeasurementRecord {
  const cal = createMockCalibration();
  const prov = ProvenanceBuilder.createDefault('doc-blueprint-01', 'REV-A', 0, cal);
  return {
    id,
    provenance: prov,
    type: 'LINEAR_DISTANCE',
    label: `Measurement ${id}`,
    geometry: {
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    },
    rawDocumentQuantity: rawVal,
    calibratedQuantity: calVal,
    declaredUnit: 'm',
    version: 1,
    derivedQuantities: [],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString()
  };
}

const validCaller: CallerContext = {
  userId: 'user-estimator',
  tenantId: 'tenant-acme',
  projectId: 'proj-1',
  roles: ['estimator'],
  permissions: ['worksheet.write']
};

async function createHostContext(initialMode: 'full_editor' | 'embedded_takeoff' | 'headless_cli' = 'full_editor') {
  const adapter = new PdfCraftRendererAdapter();
  const session = new DocumentSession(
    {
      documentId: 'doc-blueprint-01',
      revisionId: 'REV-A',
      uri: 'file://fixtures/blueprint.pdf',
      byteSource: 'blueprint-bytes'
    },
    adapter
  );
  await session.initialize();

  const repo = new MeasurementRepository();
  const boqService = new TakeoffBoqLinkService(repo);
  const host = new PdfCraftHostAdapter(session, repo, boqService, initialMode);

  return { session, repo, boqService, host };
}

test('dual presentation modes and headless CLI configure chrome correctly', async () => {
  const { host } = await createHostContext('full_editor');

  // 1. Full Editor Mode
  assert.equal(host.getMode(), 'full_editor');
  const fullChrome = host.getChromeConfig();
  assert.equal(fullChrome.ribbonVisible, true);
  assert.equal(fullChrome.sidebarVisible, true);
  assert.equal(fullChrome.thumbnailViewVisible, true);
  assert.equal(fullChrome.takeoffPaletteVisible, true);
  assert.equal(fullChrome.photoMarkupBarVisible, true);
  assert.equal(fullChrome.exportButtonVisible, true);
  assert.equal(fullChrome.canvasInteractionEnabled, true);

  // 2. Embedded Takeoff Mode (collapsed ribbon/sidebar for maximum viewport)
  host.setMode('embedded_takeoff');
  assert.equal(host.getMode(), 'embedded_takeoff');
  const embedChrome = host.getChromeConfig();
  assert.equal(embedChrome.ribbonVisible, false);
  assert.equal(embedChrome.sidebarVisible, false);
  assert.equal(embedChrome.thumbnailViewVisible, false);
  assert.equal(embedChrome.takeoffPaletteVisible, true);
  assert.equal(embedChrome.photoMarkupBarVisible, true);
  assert.equal(embedChrome.exportButtonVisible, true);
  assert.equal(embedChrome.canvasInteractionEnabled, true);

  // 3. Headless CLI Mode (automated pipelines & CI)
  host.setMode('headless_cli');
  assert.equal(host.getMode(), 'headless_cli');
  const headlessChrome = host.getChromeConfig();
  assert.equal(headlessChrome.ribbonVisible, false);
  assert.equal(headlessChrome.sidebarVisible, false);
  assert.equal(headlessChrome.takeoffPaletteVisible, false);
  assert.equal(headlessChrome.photoMarkupBarVisible, false);
  assert.equal(headlessChrome.exportButtonVisible, false);
  assert.equal(headlessChrome.canvasInteractionEnabled, false);
});

test('mode switching preserves document identity, selections, and measurements', async () => {
  const { host, repo } = await createHostContext('full_editor');

  const m1 = createMockMeasurement('meas-101');
  const m2 = createMockMeasurement('meas-102');
  host.addMeasurement(m1);
  host.addMeasurement(m2);
  host.selectMeasurement('meas-101');

  assert.equal(repo.getAll().length, 2);
  assert.equal(host.getHostState().selectedMeasurementId, 'meas-101');

  // Transition to embedded mode
  const stateEmbed = host.setMode('embedded_takeoff');
  assert.equal(stateEmbed.documentId, 'doc-blueprint-01');
  assert.equal(stateEmbed.revisionId, 'REV-A');
  assert.equal(stateEmbed.measurementsCount, 2);
  assert.equal(stateEmbed.selectedMeasurementId, 'meas-101');

  // Transition back to full editor mode
  const stateFull = host.setMode('full_editor');
  assert.equal(stateFull.measurementsCount, 2);
  assert.equal(stateFull.selectedMeasurementId, 'meas-101');
  assert.equal(repo.getById('meas-101')?.calibratedQuantity, 10);
});

test('domain permission boundary blocks unauthorized modifications', async () => {
  const { host } = await createHostContext('full_editor');

  // Set permission to view_only
  host.setPermission('view_only');
  assert.equal(host.getPermission(), 'view_only');

  const m1 = createMockMeasurement('meas-201');

  // Adding measurements blocked
  assert.throws(
    () => host.addMeasurement(m1),
    /PERMISSION_DENIED: view_only mode cannot create or edit takeoff measurements/
  );

  // Adding photo markups blocked
  assert.throws(
    () => host.addPhotoMarkup('photo-1', 'file://photos/defect.jpg', 0),
    /PERMISSION_DENIED: view_only mode cannot attach photo markups/
  );

  // Posting quantities to BoQ blocked
  await assert.rejects(
    async () => host.postTakeoffQuantityToBoq(validCaller, 'meas-201', '03.300', 'sheet1:C4'),
    /PERMISSION_DENIED: view_only mode cannot post quantities to BoQ/
  );
});

test('service-mediated BoQ quantity posting succeeds under takeoff_markup_only', async () => {
  const { host } = await createHostContext('embedded_takeoff');
  host.setPermission('takeoff_markup_only');

  const m1 = createMockMeasurement('meas-301', 200, 20);
  host.addMeasurement(m1);

  const receipt = await host.postTakeoffQuantityToBoq(validCaller, 'meas-301', '03.300', 'sheet1:C4', 2.0);
  assert.equal(receipt.operation, 'worksheet.update');
  assert.equal(receipt.measurementId, 'meas-301');
  assert.equal(receipt.boqCode, '03.300');
  assert.equal(receipt.exactDecimalQuantity, '40.00'); // 20 * 2.0
});

test('M04 photo-to-PDF markup pipeline records photo attachments and preserves state', async () => {
  const { host } = await createHostContext('embedded_takeoff');
  host.setPermission('takeoff_markup_only');

  host.addPhotoMarkup('photo-audit-01', 'file://site/crack_foundation.jpg', 0);
  host.addPhotoMarkup('photo-audit-02', 'file://site/rebar_spacing.jpg', 1);

  const pkg = host.exportDocumentPackage('v0.4.0');
  assert.ok(pkg.photoMarkups);
  assert.equal(pkg.photoMarkups.length, 2);
  assert.equal(pkg.photoMarkups[0].id, 'photo-audit-01');
  assert.equal(pkg.photoMarkups[0].uri, 'file://site/crack_foundation.jpg');

  // Verify import restores photo markups
  const { host: restoreHost } = await createHostContext('embedded_takeoff');
  restoreHost.importDocumentPackage(pkg);

  const restoredPkg = restoreHost.exportDocumentPackage('v0.4.0');
  assert.ok(restoredPkg.photoMarkups);
  assert.equal(restoredPkg.photoMarkups.length, 2);
  assert.equal(restoredPkg.photoMarkups[1].id, 'photo-audit-02');
});

test('two-release export format compatibility (v0.3.0 format 3 vs v0.4.0 format 4)', async () => {
  const { host } = await createHostContext('full_editor');

  const m1 = createMockMeasurement('meas-401', 50, 5);
  host.addMeasurement(m1);

  // v0.3.0 export produces format version 3
  const pkgV3 = host.exportDocumentPackage('v0.3.0');
  assert.equal(pkgV3.formatVersion, 3);
  assert.equal(pkgV3.upstreamRelease, 'v0.3.0');
  assert.equal(pkgV3.measurements.length, 1);
  assert.equal(pkgV3.calibrations.length, 1);

  // v0.4.0 export produces format version 4
  const pkgV4 = host.exportDocumentPackage('v0.4.0');
  assert.equal(pkgV4.formatVersion, 4);
  assert.equal(pkgV4.upstreamRelease, 'v0.4.0');
  assert.equal(pkgV4.measurements.length, 1);
  assert.equal(pkgV4.calibrations.length, 1);

  // Roundtrip import of v3 format into modern v4 host works seamlessly
  const { host: modernHost, repo: modernRepo } = await createHostContext('embedded_takeoff');
  modernHost.importDocumentPackage(pkgV3);

  assert.equal(modernRepo.getAll().length, 1);
  assert.equal(modernRepo.getById('meas-401')?.calibratedQuantity, 5);
});
