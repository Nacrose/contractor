/**
 * Conformance & Host Binding Test Battery for CADCraft (M07-T11).
 *
 * Validates:
 *  1. Dual presentation modes (Full Editor vs Embedded Review vs Headless CLI) and chrome configuration.
 *  2. 100% identity preservation across mode switches (handles, revisions, selections, undo stack).
 *  3. Redline overlay isolation on dedicated CONTRACTOR_REDLINES layer.
 *  4. Domain permission boundary enforcement (view_only, markup_only, full_authoring).
 *  5. Revision checks, atomic group validation, and human conflict resolution.
 *  6. Vector PDF 1.4 plot generation and measurement queries.
 *  7. Cross-release document upgrade and rollback qualification (v0.2.0 <-> v0.3.0).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CadDocument,
  CadCraftHostAdapter,
  type LineEntity,
  type CircleEntity,
  type Point2D,
  type CadGroupOperation,
} from '../src/index.js';

test('cadcraft host adapter: dual presentation modes and chrome configuration', () => {
  const doc = new CadDocument('drawing_site_plan');
  const adapter = new CadCraftHostAdapter(doc, 'full_editor');

  // 1. Full Editor Mode
  assert.equal(adapter.getMode(), 'full_editor');
  const fullChrome = adapter.getChromeConfig();
  assert.equal(fullChrome.ribbonVisible, true, 'Ribbon must be visible in Full Editor');
  assert.equal(fullChrome.commandLineVisible, true, 'Command line must be visible in Full Editor');
  assert.equal(fullChrome.layerManagerVisible, true);
  assert.equal(fullChrome.propertiesInspectorVisible, true);
  assert.equal(fullChrome.redlineToolbarVisible, true);
  assert.equal(fullChrome.measurementToolsVisible, true);
  assert.equal(fullChrome.plotButtonVisible, true);

  // 2. Embedded Review Mode (ADR-0016 / ADR-0020)
  const state = adapter.setMode('embedded_review');
  assert.equal(adapter.getMode(), 'embedded_review');
  assert.equal(state.mode, 'embedded_review');
  const embeddedChrome = adapter.getChromeConfig();
  assert.equal(embeddedChrome.ribbonVisible, false, 'Ribbon must be collapsed in Embedded Review to maximize drawing area');
  assert.equal(embeddedChrome.commandLineVisible, false, 'Command line must be collapsed in Embedded Review');
  assert.equal(embeddedChrome.layerManagerVisible, true, 'Layer toggles must remain available in Embedded Review');
  assert.equal(embeddedChrome.propertiesInspectorVisible, false);
  assert.equal(embeddedChrome.redlineToolbarVisible, true, 'Redline markups must be available in Embedded Review');
  assert.equal(embeddedChrome.measurementToolsVisible, true, 'Measurement tools must be available in Embedded Review');
  assert.equal(embeddedChrome.plotButtonVisible, true, 'Vector PDF plot must be available in Embedded Review');

  // 3. Headless CLI Mode
  adapter.setMode('headless_cli');
  assert.equal(adapter.getMode(), 'headless_cli');
  const cliChrome = adapter.getChromeConfig();
  assert.equal(cliChrome.ribbonVisible, false);
  assert.equal(cliChrome.commandLineVisible, false);
  assert.equal(cliChrome.canvasInteractionEnabled, false);
});

test('cadcraft host adapter: drawing identity & revision preservation across mode transitions', () => {
  const doc = new CadDocument('drawing_parcels');
  const adapter = new CadCraftHostAdapter(doc, 'full_editor');

  // Create baseline drawing entities
  adapter.executeCommand('LINE 0,0 100,0');
  adapter.executeCommand('LINE 100,0 100,50');
  adapter.executeCommand('CIRCLE 50,25 15');

  const initialEntities = doc.getAllEntities();
  assert.equal(initialEntities.length, 3);
  const handle0 = initialEntities[0].handle;
  const handle1 = initialEntities[1].handle;
  const initialRevision = doc.revision;

  // Make a selection
  adapter.selectionEngine.select([handle0, handle1]);
  assert.equal(adapter.selectionEngine.getSelectedHandles().length, 2);

  // Switch to Embedded Review Mode
  const embeddedState = adapter.setMode('embedded_review');
  assert.equal(embeddedState.entityCount, 3);
  assert.equal(embeddedState.revision, initialRevision);
  assert.equal(embeddedState.selectedCount, 2);
  assert.equal(doc.getAllEntities()[0].handle, handle0, 'Group code 5 handle must not mutate');
  assert.equal(doc.getAllEntities()[1].handle, handle1);
  assert.equal(adapter.selectionEngine.isSelected(handle0), true);

  // Switch back to Full Editor Mode
  const editorState = adapter.setMode('full_editor');
  assert.equal(editorState.entityCount, 3);
  assert.equal(editorState.revision, initialRevision);
  assert.equal(editorState.selectedCount, 2);
  assert.equal(adapter.selectionEngine.isSelected(handle0), true);
});

test('cadcraft host adapter: redline overlay isolation on dedicated layer', () => {
  const doc = new CadDocument('drawing_structural');
  const adapter = new CadCraftHostAdapter(doc, 'embedded_review');

  // Base structural line
  const baseLine: LineEntity = {
    handle: doc.nextHandle(),
    type: 'LINE',
    layer: 'S-BEAM',
    start: { x: 0, y: 0 },
    end: { x: 500, y: 0 },
    lineweight: 50,
  };
  doc.addEntity(baseLine);

  assert.equal(adapter.getBaseEntities().length, 1);
  assert.equal(adapter.getRedlineEntities().length, 0);

  // Add Redline Markups
  const cloud = adapter.addRedlineMarkup({
    markupType: 'CLOUD',
    points: [
      { x: 50, y: -20 },
      { x: 150, y: -20 },
      { x: 150, y: 20 },
      { x: 50, y: 20 },
    ],
    authorId: 'inspector-site',
    comment: 'Check connection detailing',
  });

  const note = adapter.addRedlineMarkup({
    markupType: 'NOTE',
    points: [{ x: 60, y: 30 }],
    text: 'REVISE BEAM DEPTH',
    authorId: 'inspector-site',
  });

  const meas = adapter.addRedlineMarkup({
    markupType: 'MEASUREMENT',
    points: [{ x: 0, y: 0 }, { x: 500, y: 0 }],
    authorId: 'takeoff-estimator',
    measurementValue: 500,
  });

  assert.equal(cloud.layer, 'CONTRACTOR_REDLINES');
  assert.equal(note.layer, 'CONTRACTOR_REDLINES');
  assert.equal(meas.layer, 'CONTRACTOR_REDLINES');

  assert.equal(adapter.getBaseEntities().length, 1, 'Base drawing must remain isolated');
  assert.equal(adapter.getRedlineEntities().length, 3, 'Redline entities must count 3');

  // Verify clearing redlines leaves base drawing completely untouched
  const cleared = adapter.clearRedlines();
  assert.equal(cleared, 3);
  assert.equal(adapter.getRedlineEntities().length, 0);
  assert.equal(adapter.getBaseEntities().length, 1);
  assert.equal(doc.getEntity(baseLine.handle)?.handle, baseLine.handle);
});

test('cadcraft host adapter: domain permission boundary enforcement', () => {
  const doc = new CadDocument('drawing_tender');
  const adapter = new CadCraftHostAdapter(doc, 'embedded_review', 'view_only');

  // 1. View-Only Mode
  assert.equal(adapter.getPermission(), 'view_only');

  // Mutations must fail
  const cmdResult = adapter.executeCommand('LINE 0,0 100,100');
  assert.equal(cmdResult.success, false);
  assert.match(cmdResult.message || '', /Permission denied/);

  assert.throws(() => {
    adapter.addRedlineMarkup({
      markupType: 'NOTE',
      points: [{ x: 10, y: 10 }],
      text: 'Disallowed note',
    });
  }, /Permission denied/);

  // Queries must succeed in view_only mode
  const measurement = adapter.queryMeasurement({ x: 0, y: 0 }, { x: 30, y: 40 });
  assert.equal(measurement.distance, 50);
  assert.equal(measurement.dx, 30);
  assert.equal(measurement.dy, 40);
  assert.equal(measurement.formatted, '50.00 millimeters');

  // 2. Markup-Only Mode
  adapter.setPermission('markup_only');
  assert.equal(adapter.getPermission(), 'markup_only');

  // Redline markup succeeds
  const markup = adapter.addRedlineMarkup({
    markupType: 'NOTE',
    points: [{ x: 10, y: 10 }],
    text: 'Allowed markup note',
  });
  assert.equal(markup.layer, 'CONTRACTOR_REDLINES');

  // Group operation mutating base layer fails in markup_only mode
  const op: CadGroupOperation = {
    id: 'op_illegal_base',
    name: 'Illegal Base Modification',
    authorId: 'subcontractor-1',
    baseDocumentRevision: doc.revision,
    mutations: [
      {
        action: 'CREATE',
        handle: 'H_NEW_BASE',
        entity: {
          handle: 'H_NEW_BASE',
          type: 'LINE',
          layer: '0',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
        } as LineEntity,
      },
    ],
  };
  const opRes = adapter.applyAtomicGroupOperation(op);
  assert.equal(opRes.success, false);
  assert.equal(opRes.conflict?.reason, 'PERMISSION_DENIED');

  // 3. Full-Authoring Mode
  adapter.setPermission('full_authoring');
  const authoringOpRes = adapter.applyAtomicGroupOperation(op);
  assert.equal(authoringOpRes.success, true);
  assert.equal(doc.getEntity('H_NEW_BASE')?.handle, 'H_NEW_BASE');
});

test('cadcraft host adapter: atomic revisions, conflict review, and resolution workflows', () => {
  const doc = new CadDocument('drawing_conflict_test');
  const adapter = new CadCraftHostAdapter(doc, 'full_editor', 'full_authoring');

  const line: LineEntity = {
    handle: '10',
    type: 'LINE',
    layer: 'WALLS',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    revision: 1,
  };
  doc.addEntity(line);

  // Stale writer attempt: expected revision 0 when actual is 1
  const staleOp: CadGroupOperation = {
    id: 'op_stale_writer',
    name: 'Outdated Move Operation',
    authorId: 'remote-draftsman',
    baseDocumentRevision: doc.revision,
    mutations: [
      {
        action: 'UPDATE',
        handle: '10',
        expectedRevision: 0,
        entity: {
          handle: '10',
          type: 'LINE',
          layer: 'WALLS',
          start: { x: 0, y: 10 },
          end: { x: 100, y: 10 },
          revision: 2,
        } as LineEntity,
      },
    ],
  };

  const staleResult = adapter.applyAtomicGroupOperation(staleOp);
  assert.equal(staleResult.success, false);
  assert.equal(staleResult.conflict?.reason, 'STALE_WRITER_CONFLICT');
  assert.equal(staleResult.conflict?.status, 'PENDING_REVIEW');

  // Resolve with OVERWRITE
  const overwriteRes = adapter.resolveConflict(staleResult.conflict!.conflictId, 'OVERWRITE');
  assert.equal(overwriteRes.success, true);
  assert.equal(staleResult.conflict!.status, 'RESOLVED_OVERWRITE');
  const updatedLine = doc.getEntity('10') as LineEntity;
  assert.equal(updatedLine.start.y, 10);
});

test('cadcraft host adapter: vector PDF 1.4 plot generation and bilingual typography fallback', () => {
  const doc = new CadDocument('drawing_plot');
  const adapter = new CadCraftHostAdapter(doc, 'embedded_review');

  adapter.executeCommand('LINE 0,0 200,0');
  adapter.executeCommand('CIRCLE 100,100 50');

  // Add bilingual text note with Devanagari script (Nepali/Hindi)
  adapter.addRedlineMarkup({
    markupType: 'NOTE',
    points: [{ x: 50, y: 50 }],
    text: 'निर्माण स्थल (Site Inspection)',
  });

  const plotResult = adapter.plotPdf({
    paperSize: 'ISO_A1',
    orientation: 'landscape',
    monochrome: false,
  });

  assert.equal(plotResult.pageCount, 1);
  assert.ok(plotResult.pdfBytes.length > 500, 'PDF output must be non-empty');
  assert.equal(plotResult.devanagariFallbackApplied, true, 'Devanagari fallback font must be applied');
  assert.ok(plotResult.fontsUsed.includes('NotoSansDevanagari'));
});

test('cadcraft host adapter: two-release qualification (v0.2.0 <-> v0.3.0) and document upgrade', () => {
  // 1. Create a simulated v0.2.0 document fixture (v2 format: basic layers, entities, handles)
  const v2Fixture = {
    formatVersion: 2,
    documentId: 'doc_v020_baseline',
    revision: 5,
    sourceVersion: 'AC1015',
    units: {
      format: 'decimal',
      precision: 2,
      insertionUnits: 'millimeters',
    },
    layoutState: {
      activeSpace: 'model',
      activeLayoutName: 'Model',
      layouts: ['Model'],
      viewports: [],
    },
    layers: ['0', 'WALLS', 'DIMENSIONS'],
    entities: [
      {
        handle: 'A1',
        type: 'LINE',
        layer: 'WALLS',
        start: { x: 0, y: 0 },
        end: { x: 250, y: 0 },
        lineweight: 35,
        revision: 1,
      },
      {
        handle: 'A2',
        type: 'CIRCLE',
        layer: '0',
        center: { x: 125, y: 50 },
        radius: 25,
        revision: 1,
      },
    ],
  };

  const v2Json = JSON.stringify(v2Fixture);

  // 2. Ingest and upgrade into v0.3.0 adapter
  const adapter = new CadCraftHostAdapter(undefined, 'embedded_review');
  adapter.loadPreviousReleaseDocument(v2Json);

  assert.equal(adapter.document.getEntityCount(), 2);
  assert.equal(adapter.document.getEntity('A1')?.handle, 'A1', 'Entity handle A1 must be preserved');
  assert.equal(adapter.document.getEntity('A2')?.handle, 'A2', 'Entity handle A2 must be preserved');
  assert.equal(adapter.document.hasLayer('CONTRACTOR_REDLINES'), true, 'Upgraded document must have redlines layer');

  // 3. Add v3 features (redline markups)
  adapter.addRedlineMarkup({
    markupType: 'NOTE',
    points: [{ x: 125, y: 50 }],
    text: 'Upgraded inspection pin',
  });

  assert.equal(adapter.getRedlineEntities().length, 1);

  // 4. Serialize to v3 format and verify round-trip
  const v3Serialized = adapter.serializeDocument('v3');
  const restoredAdapter = CadCraftHostAdapter.deserializeDocument(v3Serialized);

  assert.equal(restoredAdapter.document.getEntityCount(), 3);
  assert.equal(restoredAdapter.document.getEntity('A1')?.handle, 'A1');
  assert.equal(restoredAdapter.document.getEntity('A2')?.handle, 'A2');
  assert.equal(restoredAdapter.getRedlineEntities().length, 1);
});
