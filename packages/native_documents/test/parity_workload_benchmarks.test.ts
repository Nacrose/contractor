import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentParityBenchmarkSuite,
} from '../src/parity_workload_benchmarks.js';

test('DocumentParityBenchmarkSuite: 500-page specification manual loads in < 1.5s and maintains 60 fps scrolling', () => {
  const suite = new DocumentParityBenchmarkSuite();
  const result = suite.benchmark500PageSpecificationManual();

  assert.equal(result.pageOrSlideCount, 500);
  assert.equal(result.totalParagraphsOrShapes, 19000);
  assert.ok(result.meetsLoadBudget, `Load took ${result.loadDurationMs}ms (target < 1500ms)`);
  assert.ok(result.loadDurationMs < 1500.0);
  assert.equal(result.scrollingFps, 60);
  assert.equal(result.frameDrops, 0);
  assert.equal(result.virtualizationActive, true);
  assert.ok(result.memoryAllocatedMb < 50.0); // Lean memory footprint
});

test('DocumentParityBenchmarkSuite: 100-slide master deck loads in < 500ms with instant navigation', () => {
  const suite = new DocumentParityBenchmarkSuite();
  const result = suite.benchmark100SlideMasterDeck();

  assert.equal(result.pageOrSlideCount, 100);
  assert.equal(result.totalParagraphsOrShapes, 1400);
  assert.ok(result.meetsLoadBudget, `Load took ${result.loadDurationMs}ms (target < 500ms)`);
  assert.ok(result.loadDurationMs < 500.0);
  assert.equal(result.scrollingFps, 60);
  assert.equal(result.frameDrops, 0);
});

test('DocumentParityBenchmarkSuite: cross-platform rendering parity across Web, Desktop, and Mobile', () => {
  const suite = new DocumentParityBenchmarkSuite();
  const metrics = suite.evaluateCrossPlatformParity();

  assert.equal(metrics.length, 5); // Web Canvas, macOS, Windows, Linux, Mobile
  for (const m of metrics) {
    assert.equal(m.layoutParityScore, 1.0);
    assert.equal(m.glyphFidelityScore, 1.0);
    assert.ok(m.colorContrastRatio >= 4.5); // Meets WCAG AA
    assert.equal(m.tableBordersAligned, true);
  }
});

test('DocumentParityBenchmarkSuite: WCAG 2.1 AA accessibility and Devanagari Unicode coverage', () => {
  const suite = new DocumentParityBenchmarkSuite();
  const audit = suite.auditAccessibilityAndUnicode();

  assert.equal(audit.wcagConformance, 'WCAG_2_1_AA');
  assert.equal(audit.keyboardNavigable, true);
  assert.ok(audit.focusableElementsCount > 0);
  assert.equal(audit.tabStopsValidated, true);
  assert.equal(audit.screenReaderRoleMappingValid, true);
  assert.equal(audit.colorContrastFailCount, 0);
  assert.equal(audit.devanagariUnicodeCoveragePercent, 100.0);
  assert.equal(audit.fontFallbackResolved, true);
});
