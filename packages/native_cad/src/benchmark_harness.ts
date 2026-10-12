/**
 * Authoritative CAD Benchmark Harness for Native & Web Surfaces (M07-T09).
 *
 * Implements:
 *  - 100k and 1m declared-mix entity workloads per Platform Plan v3 §7
 *  - Separate reporting of Render, Snap, and Select latencies
 *  - Browser canvas binding profiling (web execution path)
 *  - Bounded memory monitoring and verification against 60 Hz (16.7 ms) budget
 *  - Deterministic reproducibility using pinned seeds
 */

declare const process: any;
import { CadDocument } from './cad_document.js';
import { CadFixtureGenerator } from './fixture_generator.js';
import { CadBrowserViewportController } from './browser_cad_binding.js';
import type { Box2D, Point2D } from './types.js';

export interface WorkloadMetrics {
  entityCount: number;
  bulkLoadTimeMs: number;
  documentMemoryMb: number;
  renderP50Ms: number;
  renderP95Ms: number;
  renderP99Ms: number;
  snapP50Ms: number;
  snapP95Ms: number;
  selectP50Ms: number;
  selectP95Ms: number;
  browserFrameLatencyMs: number;
  maxBatchMemoryMb: number;
  passed60HzBudget: boolean; // <= 16.7 ms
}

export interface CadBenchmarkSuiteReport {
  timestamp: string;
  nodeVersion: string;
  hardwareProfile: string;
  workload100k: WorkloadMetrics;
  workload1m: WorkloadMetrics;
  passedAllBudgets: boolean;
}

function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export class CadBenchmarkHarness {
  /**
   * Runs the complete benchmark suite on a declared workload scale.
   */
  static runWorkload(entityCount: number, seed: number = 20261012): WorkloadMetrics {
    const memBefore = process.memoryUsage().heapUsed;

    // 1. Generate declared mix entities
    const entities = CadFixtureGenerator.generateDeclaredMix(entityCount, seed);

    // 2. Measure STR Bulk Loading into CadDocument
    const doc = new CadDocument();
    const t0Bulk = performance.now();
    doc.bulkLoad(entities);
    const bulkLoadTimeMs = performance.now() - t0Bulk;

    const memAfter = process.memoryUsage().heapUsed;
    const documentMemoryMb = Math.max(0, (memAfter - memBefore) / (1024 * 1024));

    // 3. Initialize Browser Viewport Controller (exercising Web Canvas Binding)
    const controller = new CadBrowserViewportController(doc);

    // 4. Render Latencies across 3 architectural zoom scenarios:
    //    - Full site overview (zoom = 0.002, 1920x1080)
    //    - Medium building wing (zoom = 0.01)
    //    - Detailed room inspection (zoom = 0.05)
    const renderTimes: number[] = [];
    let maxBatchMemory = 0;

    const zoomLevels = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];
    for (const z of zoomLevels) {
      for (let iter = 0; iter < 5; iter++) {
        controller.setCamera({ x: 250000 + iter * 5000, y: 250000 + iter * 5000 }, z);
        const frame = controller.renderFrame();
        renderTimes.push(frame.renderLatencyMs);
        if (frame.batchMemoryBytes > maxBatchMemory) {
          maxBatchMemory = frame.batchMemoryBytes;
        }
      }
    }

    const renderP50Ms = calculatePercentile(renderTimes, 50);
    const renderP95Ms = calculatePercentile(renderTimes, 95);
    const renderP99Ms = calculatePercentile(renderTimes, 99);

    // 5. Snapping Latencies across 50 point samples
    const snapTimes: number[] = [];
    controller.setCamera({ x: 250000, y: 250000 }, 0.02);
    for (let i = 0; i < 50; i++) {
      const sx = 200 + (i % 10) * 150;
      const sy = 100 + Math.floor(i / 10) * 180;
      const res = controller.snapAtScreenPoint(sx, sy, 15);
      snapTimes.push(res.snapLatencyMs);
    }

    const snapP50Ms = calculatePercentile(snapTimes, 50);
    const snapP95Ms = calculatePercentile(snapTimes, 95);

    // 6. Selection Latencies across 25 window/crossing boxes
    const selectTimes: number[] = [];
    for (let i = 0; i < 25; i++) {
      const sx1 = 300 + (i % 5) * 50;
      const sy1 = 200 + Math.floor(i / 5) * 50;
      const sx2 = sx1 + 400;
      const sy2 = sy1 + 300;
      const res = controller.selectAtScreenBox(sx1, sy1, sx2, sy2);
      selectTimes.push(res.selectLatencyMs);
    }

    const selectP50Ms = calculatePercentile(selectTimes, 50);
    const selectP95Ms = calculatePercentile(selectTimes, 95);

    // 7. Simulated browser interactive frame
    const browserFrame = controller.renderFrame();

    return {
      entityCount,
      bulkLoadTimeMs,
      documentMemoryMb,
      renderP50Ms,
      renderP95Ms,
      renderP99Ms,
      snapP50Ms,
      snapP95Ms,
      selectP50Ms,
      selectP95Ms,
      browserFrameLatencyMs: browserFrame.renderLatencyMs,
      maxBatchMemoryMb: maxBatchMemory / (1024 * 1024),
      passed60HzBudget: renderP95Ms <= 16.7,
    };
  }

  /**
   * Executes the full 100k and 1m benchmark suite.
   */
  static runFullSuite(): CadBenchmarkSuiteReport {
    console.log('[CAD Benchmarks] Executing 100k-Entity Declared Mix Workload...');
    const workload100k = this.runWorkload(100000, 20261012);

    console.log('[CAD Benchmarks] Executing 1M-Entity Declared Mix Workload (Stress Scale)...');
    const workload1m = this.runWorkload(1000000, 20261012);

    const passedAllBudgets =
      workload100k.passed60HzBudget &&
      workload1m.renderP50Ms <= 16.7 &&
      workload1m.snapP95Ms <= 1.0 &&
      workload1m.selectP95Ms <= 5.0;

    return {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      hardwareProfile: `${process.platform} ${process.arch} (60Hz Display Profile)`,
      workload100k,
      workload1m,
      passedAllBudgets,
    };
  }
}
