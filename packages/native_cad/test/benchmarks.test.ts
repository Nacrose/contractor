import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CadFixtureGenerator,
  CadBrowserViewportController,
  CadBenchmarkHarness,
  RATIFIED_DECLARED_MIX,
  CadDocument,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// 1. Fixture Generator: Declared Mix & Deterministic Reproducibility
// ---------------------------------------------------------------------------

test('fixture generator: enforces ratified declared mix ratios deterministically', () => {
  const sampleCount = 10000;
  const seed = 20261012;

  const entities1 = CadFixtureGenerator.generateDeclaredMix(sampleCount, seed);
  const entities2 = CadFixtureGenerator.generateDeclaredMix(sampleCount, seed);

  assert.equal(entities1.length, sampleCount);
  assert.equal(entities2.length, sampleCount);

  // Exact deterministic reproducibility across multiple runs
  assert.equal(entities1[0].handle, entities2[0].handle);
  assert.equal(entities1[500].handle, entities2[500].handle);
  assert.equal(entities1[9999].handle, entities2[9999].handle);

  // Check declared mix counts
  const linesAndPoly = entities1.filter((e) => e.type === 'LINE' || e.type === 'LWPOLYLINE').length;
  const curves = entities1.filter((e) => e.type === 'CIRCLE' || e.type === 'ARC').length;
  const textAndDims = entities1.filter((e) => e.type === 'TEXT' || e.type === 'DIMENSION').length;
  const hatches = entities1.filter((e) => e.type === 'HATCH').length;
  const blocks = entities1.filter((e) => e.type === 'INSERT').length;

  assert.equal(linesAndPoly, Math.floor(sampleCount * RATIFIED_DECLARED_MIX.linesAndPolylines));
  assert.equal(curves, Math.floor(sampleCount * RATIFIED_DECLARED_MIX.curves));
  assert.equal(textAndDims, Math.floor(sampleCount * RATIFIED_DECLARED_MIX.textAndDimensions));
  assert.equal(hatches, Math.floor(sampleCount * RATIFIED_DECLARED_MIX.hatches));
  assert.equal(blocks, sampleCount - (linesAndPoly + curves + textAndDims + hatches));
});

// ---------------------------------------------------------------------------
// 2. Browser Viewport Controller & Web Canvas Binding
// ---------------------------------------------------------------------------

test('browser binding: projects screen coordinates, bounds visible batches, and measures interactions', () => {
  const doc = new CadDocument();
  const entities = CadFixtureGenerator.generateDeclaredMix(5000, 20261012);
  doc.bulkLoad(entities);

  const controller = new CadBrowserViewportController(doc);
  controller.setCamera({ x: 250000, y: 250000 }, 0.01);

  // Coordinate projection check
  const centerScreen = controller.modelToScreen(250000, 250000);
  assert.equal(Math.round(centerScreen.x), 960); // 1920 / 2
  assert.equal(Math.round(centerScreen.y), 540); // 1080 / 2

  const modelPoint = controller.screenToModel(960, 540);
  assert.equal(Math.round(modelPoint.x), 250000);
  assert.equal(Math.round(modelPoint.y), 250000);

  // Render cycle execution through canvas drawing commands
  const frameMetrics = controller.renderFrame();
  assert.ok(frameMetrics.renderLatencyMs < 16.7, `Frame time ${frameMetrics.renderLatencyMs}ms must be <= 16.7ms`);
  assert.ok(frameMetrics.visibleEntityCount > 0);
  assert.ok(frameMetrics.batchMemoryBytes > 0);

  // Snapping query in screen coordinates
  const snapRes = controller.snapAtScreenPoint(960, 540, 50);
  assert.ok(snapRes.snapLatencyMs < 1.0, `Snap latency ${snapRes.snapLatencyMs}ms must be < 1.0ms`);

  // Selection box query in screen coordinates
  const selRes = controller.selectAtScreenBox(800, 400, 1100, 650);
  assert.ok(selRes.selectLatencyMs < 5.0, `Select latency ${selRes.selectLatencyMs}ms must be < 5.0ms`);
  assert.ok(selRes.selectedHandles.length > 0);
});

// ---------------------------------------------------------------------------
// 3. 100k Declared-Mix Workload Benchmark Execution
// ---------------------------------------------------------------------------

test('benchmarks: 100k declared-mix workload achieves <=16.7ms (60 Hz) frame budget and bounded memory', () => {
  const metrics = CadBenchmarkHarness.runWorkload(100000, 20261012);

  console.log(`\n======================================================`);
  console.log(`[CAD 100k-Entity Declared Mix Benchmark Results]`);
  console.log(` - Entity Count: ${metrics.entityCount.toLocaleString()}`);
  console.log(` - STR Bulk Load: ${metrics.bulkLoadTimeMs.toFixed(2)} ms`);
  console.log(` - Document Memory: ${metrics.documentMemoryMb.toFixed(2)} MB`);
  console.log(` - Render p50: ${metrics.renderP50Ms.toFixed(2)} ms`);
  console.log(` - Render p95: ${metrics.renderP95Ms.toFixed(2)} ms (Budget <= 16.7 ms: ${metrics.passed60HzBudget ? 'PASSED' : 'FAILED'})`);
  console.log(` - Snap p50: ${metrics.snapP50Ms.toFixed(3)} ms | p95: ${metrics.snapP95Ms.toFixed(3)} ms`);
  console.log(` - Select p50: ${metrics.selectP50Ms.toFixed(3)} ms | p95: ${metrics.selectP95Ms.toFixed(3)} ms`);
  console.log(` - Browser Canvas Frame: ${metrics.browserFrameLatencyMs.toFixed(2)} ms`);
  console.log(` - Max Viewport Batch Memory: ${metrics.maxBatchMemoryMb.toFixed(3)} MB`);
  console.log(`======================================================\n`);

  // Assertions per Platform Plan v3 §7
  assert.equal(metrics.passed60HzBudget, true, `Render p95 (${metrics.renderP95Ms}ms) exceeded 16.7ms`);
  assert.ok(metrics.snapP95Ms < 2.0, `Snap p95 (${metrics.snapP95Ms}ms) exceeded 2.0ms`);
  assert.ok(metrics.selectP95Ms < 10.0, `Select p95 (${metrics.selectP95Ms}ms) exceeded 10.0ms`);
  assert.ok(metrics.maxBatchMemoryMb < 25.0, `Max batch memory (${metrics.maxBatchMemoryMb}MB) exceeded 25MB`);
});
