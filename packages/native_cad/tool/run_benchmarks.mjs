#!/usr/bin/env node
/**
 * Standalone CAD Benchmark Runner (M07-T09).
 * Runs the full 100k and 1M declared-mix benchmarks and outputs performance tables.
 */
import { CadBenchmarkHarness } from '../.test-build/src/benchmark_harness.js';

console.log('================================================================');
console.log('       CONTRACTOR CAD BENCHMARK RUNNER (100k & 1M ENTITIES)');
console.log('================================================================');

const report = CadBenchmarkHarness.runFullSuite();

console.log('\n--- 100,000 Entities Workload ---');
console.table(report.workload100k);

console.log('\n--- 1,000,000 Entities Workload (Stress Scale) ---');
console.table(report.workload1m);

console.log('\nAll Budgets (60 Hz <= 16.7ms, Snap <= 1ms, Select <= 5ms):', report.passedAllBudgets ? 'PASSED ✅' : 'FAILED ❌');
