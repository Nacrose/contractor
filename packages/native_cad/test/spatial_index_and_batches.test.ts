/**
 * Spatial Indexing, Invalidation, and Geometry Batch Tests & Benchmarks (M07-T04).
 *
 * Verifies:
 *  - 2D R-tree spatial indexing & STR bulk loading
 *  - Full bounding box coverage for all CAD entities (lines, arcs, circles, polylines, dimensions, hatches, blocks, text)
 *  - High-performance range search and point snapping queries
 *  - Scoped invalidation tracking & dirty envelopes
 *  - Compact typed geometry batches without per-entity bridge calls
 *  - Screen-space LOD culling and memory bounding policy
 *  - Benchmarks covering text, hatches, blocks, dimensions, selection, and snapping
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CadDocument } from '../src/cad_document.js';
import {
  CadSpatialIndex,
  CadInvalidationTracker,
  computeEntityBounds,
  type SpatialItem,
} from '../src/spatial_index.js';
import {
  CadBatchRendererFeed,
  type ViewportQuery,
} from '../src/batch_renderer.js';
import { CadSelectionEngine } from '../src/selection_and_grips.js';
import { CadInputStateMachine } from '../src/input_state_machine.js';
import type {
  LineEntity,
  CircleEntity,
  ArcEntity,
  LwPolylineEntity,
  DimensionEntity,
  HatchEntity,
  InsertEntity,
  TextEntity,
  Box2D,
} from '../src/types.js';

test('spatial index: bounding box computation for all CAD entity types', () => {
  const line: LineEntity = {
    handle: '1',
    type: 'LINE',
    layer: '0',
    start: { x: 10, y: 20 },
    end: { x: 50, y: 80 },
  };
  const bLine = computeEntityBounds(line);
  assert.deepEqual(bLine, { minX: 10, minY: 20, maxX: 50, maxY: 80 });

  const circle: CircleEntity = {
    handle: '2',
    type: 'CIRCLE',
    layer: '0',
    center: { x: 100, y: 100 },
    radius: 25,
  };
  const bCircle = computeEntityBounds(circle);
  assert.deepEqual(bCircle, { minX: 75, minY: 75, maxX: 125, maxY: 125 });

  const arc: ArcEntity = {
    handle: '3',
    type: 'ARC',
    layer: '0',
    center: { x: 0, y: 0 },
    radius: 10,
    startAngle: 0,
    endAngle: Math.PI / 2, // First quadrant: (10,0) to (0,10)
  };
  const bArc = computeEntityBounds(arc);
  assert.ok(bArc);
  assert.ok(Math.abs(bArc.minX - 0) < 1e-4);
  assert.ok(Math.abs(bArc.minY - 0) < 1e-4);
  assert.ok(Math.abs(bArc.maxX - 10) < 1e-4);
  assert.ok(Math.abs(bArc.maxY - 10) < 1e-4);

  const poly: LwPolylineEntity = {
    handle: '4',
    type: 'LWPOLYLINE',
    layer: 'WALLS',
    closed: true,
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ],
  };
  const bPoly = computeEntityBounds(poly);
  assert.deepEqual(bPoly, { minX: 0, minY: 0, maxX: 100, maxY: 50 });

  const dim: DimensionEntity = {
    handle: '5',
    type: 'DIMENSION',
    layer: 'DIMS',
    defPoint1: { x: 10, y: 10 },
    defPoint2: { x: 60, y: 10 },
    textPosition: { x: 35, y: 25 },
    measurement: 50,
  };
  const bDim = computeEntityBounds(dim);
  assert.deepEqual(bDim, { minX: 10, minY: 10, maxX: 60, maxY: 25 });

  const ins: InsertEntity = {
    handle: '6',
    type: 'INSERT',
    layer: 'DOORS',
    blockName: 'DOOR_900',
    insertionPoint: { x: 200, y: 300 },
    scale: { x: 1, y: 1, z: 1 },
  };
  const bIns = computeEntityBounds(ins);
  assert.ok(bIns);
  assert.ok(bIns.minX < 200 && bIns.maxX > 200);

  const txt: TextEntity = {
    handle: '7',
    type: 'TEXT',
    layer: 'NOTES',
    position: { x: 500, y: 500 },
    height: 5,
    text: 'FOUNDATION PLAN',
  };
  const bTxt = computeEntityBounds(txt);
  assert.ok(bTxt);
  assert.equal(bTxt.minX, 500);
  assert.equal(bTxt.minY, 500);
  assert.equal(bTxt.maxY, 505);
  assert.ok(bTxt.maxX > 500);
});

test('spatial index: dynamic insert, remove, update, and range search', () => {
  const index = new CadSpatialIndex(4);

  const items: SpatialItem[] = [
    { id: 'e1', box: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, type: 'LINE' },
    { id: 'e2', box: { minX: 20, minY: 20, maxX: 30, maxY: 30 }, type: 'LINE' },
    { id: 'e3', box: { minX: 100, minY: 100, maxX: 110, maxY: 110 }, type: 'CIRCLE' },
  ];

  for (const it of items) index.insert(it);
  assert.equal(index.size(), 3);

  // Search box overlapping only e1
  const res1 = index.search({ minX: 5, minY: 5, maxX: 15, maxY: 15 });
  assert.deepEqual(res1, ['e1']);

  // Search box overlapping e1 and e2
  const res2 = index.search({ minX: 0, minY: 0, maxX: 25, maxY: 25 });
  assert.deepEqual(res2.sort(), ['e1', 'e2']);

  // Point pick query
  const pick = index.searchPoint({ x: 22, y: 22 }, 1.0);
  assert.deepEqual(pick, ['e2']);

  // Update e1 position to (200, 200)
  index.update({ id: 'e1', box: { minX: 200, minY: 200, maxX: 210, maxY: 210 }, type: 'LINE' });
  const afterUpdate = index.search({ minX: 0, minY: 0, maxX: 15, maxY: 15 });
  assert.deepEqual(afterUpdate, []);
  const atNewPos = index.search({ minX: 195, minY: 195, maxX: 215, maxY: 215 });
  assert.deepEqual(atNewPos, ['e1']);

  // Remove e2
  index.remove('e2');
  assert.equal(index.size(), 2);
  const afterRemove = index.search({ minX: 15, minY: 15, maxX: 35, maxY: 35 });
  assert.deepEqual(afterRemove, []);
});

test('invalidation tracker: scopes dirty regions and detects intersecting viewports', () => {
  const tracker = new CadInvalidationTracker();
  assert.equal(tracker.isDirty(), false);

  const dirtyBox1 = { minX: 10, minY: 10, maxX: 20, maxY: 20 };
  tracker.markDirty(dirtyBox1, 'h1');
  assert.equal(tracker.isDirty(), true);
  assert.equal(tracker.getRevision(), 1);

  const envelope = tracker.getAggregatedDirtyEnvelope();
  assert.deepEqual(envelope, dirtyBox1);

  // Intersecting query viewport
  const viewDirty = { minX: 15, minY: 15, maxX: 100, maxY: 100 };
  assert.equal(tracker.isRegionDirty(viewDirty), true);

  // Distant query viewport (should be clean)
  const viewClean = { minX: 500, minY: 500, maxX: 600, maxY: 600 };
  assert.equal(tracker.isRegionDirty(viewClean), false);

  // Mark second box
  const dirtyBox2 = { minX: 100, minY: 100, maxX: 120, maxY: 120 };
  tracker.markDirty(dirtyBox2, 'h2');
  assert.equal(tracker.getDirtyRegions().length, 2);

  tracker.reset();
  assert.equal(tracker.isDirty(), false);
  assert.equal(tracker.getAggregatedDirtyEnvelope(), null);
});

test('compact geometry batches: groups entities without per-entity bridge calls and applies LOD culling', () => {
  const doc = new CadDocument();

  // Insert a variety of entities
  doc._insertEntity({
    handle: doc.nextHandle(),
    type: 'LINE',
    layer: 'WALLS',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    color: '#FF0000',
    lineweight: 50,
  });

  doc._insertEntity({
    handle: doc.nextHandle(),
    type: 'CIRCLE',
    layer: 'COLUMNS',
    center: { x: 50, y: 50 },
    radius: 10,
    color: '#00FF00',
  });

  doc._insertEntity({
    handle: doc.nextHandle(),
    type: 'TEXT',
    layer: 'NOTES',
    position: { x: 20, y: 20 },
    height: 4.0,
    text: 'COLUMN C1',
  });

  doc._insertEntity({
    handle: doc.nextHandle(),
    type: 'INSERT',
    layer: 'DOORS',
    blockName: 'DOOR_SINGLE',
    insertionPoint: { x: 80, y: 20 },
  });

  // Query viewport covering model space
  const viewport: ViewportQuery = {
    bounds: { minX: -50, minY: -50, maxX: 200, maxY: 200 },
    zoomFactor: 1.0,
    cullingPixelThreshold: 0.5,
  };

  const result = CadBatchRendererFeed.generateBatches(doc, viewport);

  assert.equal(result.batches.lines.count, 1);
  assert.equal(result.batches.lines.buffer.length, 7); // [x1, y1, x2, y2, color, lw, layer]
  assert.equal(result.batches.arcsAndCircles.count, 1);
  assert.equal(result.batches.arcsAndCircles.buffer.length, 8);
  assert.equal(result.batches.texts.count, 1);
  assert.equal(result.batches.texts.strings[0], 'COLUMN C1');
  assert.equal(result.batches.instances.count, 1);
  assert.equal(result.batches.instances.blockNames[0], 'DOOR_SINGLE');

  assert.ok(result.stats.estimatedMemoryBytes > 0);
  assert.ok(result.stats.isBounded);

  // Test LOD culling at extreme zoom-out (zoomFactor = 0.01)
  const zoomedOutView: ViewportQuery = {
    bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
    zoomFactor: 0.01, // 4.0mm text -> 0.04px; culled!
    cullingPixelThreshold: 1.0,
  };

  const zoomedResult = CadBatchRendererFeed.generateBatches(doc, zoomedOutView);
  assert.equal(zoomedResult.batches.texts.count, 0, 'Sub-pixel text should be culled');
  assert.ok(zoomedResult.stats.culledCount > 0);
});

test('benchmarks: text, hatches, blocks, dimensions, selection and snapping on 15,000 entity dataset', () => {
  const doc = new CadDocument();
  const entities = [];

  const LAYERS = ['0', 'WALLS', 'DOORS', 'WINDOWS', 'DIMS', 'TEXT', 'HATCH'];
  for (const l of LAYERS) doc.addLayer(l);

  // Generate 15,000 mixed entities across a 2000m x 2000m site
  const TOTAL = 15000;
  for (let i = 0; i < TOTAL; i++) {
    const handle = (i + 1).toString(16).toUpperCase();
    const x = (i % 200) * 10;
    const y = Math.floor(i / 200) * 10;
    const entityCategory = i % 6;

    if (entityCategory === 0) {
      // LINE
      entities.push({
        handle,
        type: 'LINE' as const,
        layer: 'WALLS',
        start: { x, y },
        end: { x: x + 8, y: y + 8 },
        color: 7,
      });
    } else if (entityCategory === 1) {
      // CIRCLE / ARC
      entities.push({
        handle,
        type: 'CIRCLE' as const,
        layer: '0',
        center: { x: x + 5, y: y + 5 },
        radius: 3.5,
        color: 3,
      });
    } else if (entityCategory === 2) {
      // TEXT / MTEXT
      entities.push({
        handle,
        type: 'TEXT' as const,
        layer: 'TEXT',
        position: { x, y },
        height: 2.5,
        text: `ROOM-${i}`,
      });
    } else if (entityCategory === 3) {
      // HATCH
      entities.push({
        handle,
        type: 'HATCH' as const,
        layer: 'HATCH',
        patternName: 'ANSI31',
        solid: false,
        boundaryHandles: [],
        bounds: { minX: x, minY: y, maxX: x + 10, maxY: y + 10 },
      });
    } else if (entityCategory === 4) {
      // INSERT (Block Reference)
      entities.push({
        handle,
        type: 'INSERT' as const,
        layer: 'DOORS',
        blockName: 'DOOR_36',
        insertionPoint: { x, y },
        scale: { x: 1, y: 1, z: 1 },
      });
    } else {
      // DIMENSION
      entities.push({
        handle,
        type: 'DIMENSION' as const,
        layer: 'DIMS',
        defPoint1: { x, y },
        defPoint2: { x: x + 10, y },
        textPosition: { x: x + 5, y: y + 2 },
        measurement: 10,
        textOverride: '10.00m',
      });
    }
  }

  // 1. Benchmark: STR Bulk Loading
  const t0 = performance.now();
  doc.bulkLoad(entities);
  const bulkLoadTimeMs = performance.now() - t0;
  assert.equal(doc.spatialIndex.size(), TOTAL);
  assert.ok(bulkLoadTimeMs < 100, `STR bulk loading should be <100ms, took ${bulkLoadTimeMs}ms`);

  // 2. Benchmark: Spatial Range Query (Window Selection) vs Unindexed Linear Scan
  const testViewport: Box2D = { minX: 400, minY: 200, maxX: 600, maxY: 400 };

  const tIndexStart = performance.now();
  const indexedMatches = doc.spatialIndex.search(testViewport);
  const indexQueryTimeMs = performance.now() - tIndexStart;

  const tLinearStart = performance.now();
  const linearMatches = [];
  for (const ent of doc.getAllEntities()) {
    const b = computeEntityBounds(ent);
    if (b && !(b.maxX < testViewport.minX || b.minX > testViewport.maxX || b.maxY < testViewport.minY || b.minY > testViewport.maxY)) {
      linearMatches.push(ent.handle);
    }
  }
  const linearQueryTimeMs = performance.now() - tLinearStart;

  assert.equal(indexedMatches.length, linearMatches.length);
  assert.ok(
    indexQueryTimeMs <= linearQueryTimeMs || indexQueryTimeMs < 1.0,
    `Spatial index query took ${indexQueryTimeMs}ms vs linear ${linearQueryTimeMs}ms`
  );

  // 3. Benchmark: Selection Engine using Spatial Index
  const selEngine = new CadSelectionEngine();
  const tSelStart = performance.now();
  const selectedHandles = selEngine.selectByBox(doc, { x: 400, y: 200 }, { x: 600, y: 400 });
  const selTimeMs = performance.now() - tSelStart;
  assert.ok(selectedHandles.length > 0);
  assert.ok(selTimeMs < 5.0, `Window selection took ${selTimeMs}ms`);

  // 4. Benchmark: Snapping Engine at Arbitrary Coordinates
  const stateMachine = new CadInputStateMachine();
  const tSnapStart = performance.now();
  const snapResult = stateMachine.findSnap(doc, { x: 500.1, y: 300.1 }, 1.0);
  const snapTimeMs = performance.now() - tSnapStart;
  assert.ok(snapResult != null, 'Should snap to nearby candidate');
  assert.ok(snapTimeMs < 1.0, `Snap query took ${snapTimeMs}ms`);

  // 5. Benchmark: Visible Geometry Batch Generation
  const tBatchStart = performance.now();
  const batchResult = CadBatchRendererFeed.generateBatches(doc, {
    bounds: testViewport,
    zoomFactor: 5.0,
    cullingPixelThreshold: 1.0,
  });
  const batchTimeMs = performance.now() - tBatchStart;

  assert.ok(batchResult.stats.batchedCount > 0);
  assert.ok(batchTimeMs < 15.0, `Batch generation took ${batchTimeMs}ms`);
  assert.ok(batchResult.stats.estimatedMemoryBytes < 2 * 1024 * 1024, 'Batch memory < 2MB');

  // 6. Benchmark: Scoped Invalidation on Entity Edit
  doc.invalidationTracker.reset();
  const entityToModify = doc.getEntity(selectedHandles[0])!;
  const oldBox = computeEntityBounds(entityToModify)!;

  // Move entity by 1 unit
  if (entityToModify.type === 'LINE') {
    (entityToModify as LineEntity).start.x += 1;
    (entityToModify as LineEntity).end.x += 1;
  }
  doc._updateEntity(entityToModify);

  assert.equal(doc.invalidationTracker.isDirty(), true);
  const dirtyEnvelope = doc.invalidationTracker.getAggregatedDirtyEnvelope()!;
  const dirtyArea = (dirtyEnvelope.maxX - dirtyEnvelope.minX) * (dirtyEnvelope.maxY - dirtyEnvelope.minY);
  const totalArea = 2000 * 2000;
  const areaRatio = dirtyArea / totalArea;

  assert.ok(areaRatio < 0.001, `Dirty area ratio is ${areaRatio}, tightly scoped (<0.1%)`);

  // Check dirty batch generator
  const dirtyBatch = CadBatchRendererFeed.generateDirtyBatches(
    doc,
    { bounds: testViewport, zoomFactor: 5.0 },
    doc.revision - 1
  );
  assert.ok(dirtyBatch != null, 'Dirty viewport should regenerate batch');

  const cleanDistantView: ViewportQuery = {
    bounds: { minX: 1800, minY: 1800, maxX: 1900, maxY: 1900 },
    zoomFactor: 5.0,
  };
  const cleanBatch = CadBatchRendererFeed.generateDirtyBatches(
    doc,
    cleanDistantView,
    doc.revision - 1
  );
  assert.equal(cleanBatch, null, 'Clean viewport outside dirty region should return null (zero re-render cost)');

  console.log(`[M07-T04 Benchmark Results on 15,000 Entities]`);
  console.log(` - STR Bulk Load: ${bulkLoadTimeMs.toFixed(2)} ms`);
  console.log(` - Spatial Query (Window): ${indexQueryTimeMs.toFixed(3)} ms (Linear: ${linearQueryTimeMs.toFixed(3)} ms)`);
  console.log(` - Snapping Latency: ${snapTimeMs.toFixed(3)} ms`);
  console.log(` - Batch Gen (Window): ${batchTimeMs.toFixed(2)} ms (Batched: ${batchResult.stats.batchedCount} items)`);
  console.log(` - Batch Memory: ${(batchResult.stats.estimatedMemoryBytes / 1024).toFixed(1)} KB`);
  console.log(` - Scoped Dirty Envelope Ratio: ${(areaRatio * 100).toFixed(4)} %`);
});
