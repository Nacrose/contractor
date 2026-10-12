import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DependencyGraph } from '../src/dependency_graph.js';
import { migrateV2ToV3 } from '../src/migration.js';
import type { WorkbookModel, LegacyWorkbookV2 } from '../src/types.js';
import { createInitialSaveSyncState } from '../src/save_sync_state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures/platform-parity/worksheet/templates');

function createSampleWorkbook(): WorkbookModel {
  return {
    version: 3,
    workbookId: 'wb_dep_test',
    revision: 1,
    activeSheetId: 's1',
    metadata: { title: 'Dependency Test' },
    sheets: [
      {
        id: 's1',
        title: 'Measurements',
        rowCount: 10,
        colCount: 10,
        rows: Array.from({ length: 10 }, (_, i) => ({ id: `r_${i}`, index: i })),
        cols: Array.from({ length: 10 }, (_, i) => ({ id: `c_${i}`, index: i })),
        cells: {
          // Inputs
          'r_3:c_3': { id: 'c_nos', rowId: 'r_3', colId: 'c_3', value: 1, protection: { locked: false } },       // D4
          'r_3:c_4': { id: 'c_len', rowId: 'r_3', colId: 'c_4', value: 600, protection: { locked: false } },     // E4
          'r_3:c_5': { id: 'c_brd', rowId: 'r_3', colId: 'c_5', value: 14.5, protection: { locked: false } },    // F4
          'r_3:c_6': { id: 'c_hgt', rowId: 'r_3', colId: 'c_6', value: 1.2, protection: { locked: false } },     // G4
          // Quantity calculation: =D4*E4*F4*G4
          'r_3:c_7': {
            id: 'c_qty',
            rowId: 'r_3',
            colId: 'c_7',
            value: 0,
            formula: '=D4*E4*F4*G4',
            protection: { locked: true },
          },
          // Rate input
          'r_3:c_8': { id: 'c_rate', rowId: 'r_3', colId: 'c_8', value: 250, protection: { locked: true } },     // I4
          // Amount: =H4*I4
          'r_3:c_9': {
            id: 'c_amt',
            rowId: 'r_3',
            colId: 'c_9',
            value: 0,
            formula: '=H4*I4',
            protection: { locked: true },
          },
          // Unrelated row 5
          'r_4:c_3': { id: 'c_r5_d', rowId: 'r_4', colId: 'c_3', value: 2, protection: { locked: false } },
          'r_4:c_7': {
            id: 'c_r5_qty',
            rowId: 'r_4',
            colId: 'c_7',
            value: 200,
            formula: '=D5 * 100',
            protection: { locked: true },
          },
        },
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };
}

test('dependency graph builds precedents and dependents DAG accurately', () => {
  const wb = createSampleWorkbook();
  const graph = DependencyGraph.build(wb);

  const qtyKey = 's1:r_3:c_7';
  const qtyNode = graph.nodes.get(qtyKey);
  assert.ok(qtyNode);

  // Precedents of H4 must be D4, E4, F4, G4
  assert.equal(qtyNode.precedents.has('s1:r_3:c_3'), true); // D4
  assert.equal(qtyNode.precedents.has('s1:r_3:c_4'), true); // E4
  assert.equal(qtyNode.precedents.has('s1:r_3:c_5'), true); // F4
  assert.equal(qtyNode.precedents.has('s1:r_3:c_6'), true); // G4

  // Dependents of H4 must include J4 (Amount)
  assert.equal(qtyNode.dependents.has('s1:r_3:c_9'), true);
});

test('dirty sub-graph recalculation only touches downstream cells', () => {
  const wb = createSampleWorkbook();
  const graph = DependencyGraph.build(wb);

  // Initial full evaluation
  graph.recalculate(wb, { dirtyKeys: ['s1:r_3:c_3', 's1:r_4:c_3'] });
  assert.equal(wb.sheets[0].cells['r_3:c_7'].computed, 10440); // 1 * 600 * 14.5 * 1.2
  assert.equal(wb.sheets[0].cells['r_3:c_9'].computed, 2610000); // 10440 * 250
  assert.equal(wb.sheets[0].cells['r_4:c_7'].computed, 200);

  // Now user edits only D4 (length / nos)
  wb.sheets[0].cells['r_3:c_3'].value = 2; // change nos from 1 to 2

  const dirtyKeys = ['s1:r_3:c_3'];
  const res = graph.recalculate(wb, { dirtyKeys });

  assert.equal(res.success, true);
  // Evaluated keys must ONLY be H4 and J4 (not unrelated row 5)
  assert.equal(res.evaluatedCount, 2);
  assert.equal(res.evaluatedKeys.includes('s1:r_3:c_7'), true);
  assert.equal(res.evaluatedKeys.includes('s1:r_3:c_9'), true);
  assert.equal(res.evaluatedKeys.includes('s1:r_4:c_7'), false);

  // Values updated
  assert.equal(wb.sheets[0].cells['r_3:c_7'].computed, 20880); // 2 * 600 * 14.5 * 1.2
  assert.equal(wb.sheets[0].cells['r_3:c_9'].computed, 5220000); // 20880 * 250
});

test('deterministic cycle detection and typed #CYCLE! error propagation', () => {
  const wb: WorkbookModel = {
    version: 3,
    workbookId: 'wb_cycle',
    revision: 1,
    activeSheetId: 's1',
    metadata: {},
    sheets: [
      {
        id: 's1',
        title: 'Sheet1',
        rowCount: 5,
        colCount: 5,
        rows: Array.from({ length: 5 }, (_, i) => ({ id: `r_${i}`, index: i })),
        cols: Array.from({ length: 5 }, (_, i) => ({ id: `c_${i}`, index: i })),
        cells: {
          // B6: =B7 + 1
          'r_0:c_1': { id: 'c_b6', rowId: 'r_0', colId: 'c_1', value: 0, formula: '=B2 + 1', protection: { locked: true } },
          // B7: =B6 + 1
          'r_1:c_1': { id: 'c_b7', rowId: 'r_1', colId: 'c_1', value: 0, formula: '=B1 + 1', protection: { locked: true } },
          // B8: =B7 * 10 (downstream consumer of cyclic cells)
          'r_2:c_1': { id: 'c_b8', rowId: 'r_2', colId: 'c_1', value: 0, formula: '=B2 * 10', protection: { locked: true } },
        },
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };

  const graph = DependencyGraph.build(wb);
  const cycleReport = graph.detectCycles();

  assert.equal(cycleReport.hasCycle, true);
  assert.ok(cycleReport.cycleNodes.size >= 2);

  const res = graph.recalculate(wb, { dirtyKeys: ['s1:r_0:c_1', 's1:r_1:c_1'] });
  assert.equal(res.cycleCount >= 2, true);

  // Cyclic cells receive #CYCLE!
  assert.equal(wb.sheets[0].cells['r_0:c_1'].computed, '#CYCLE!');
  assert.equal(wb.sheets[0].cells['r_1:c_1'].computed, '#CYCLE!');

  // Downstream cell propagates typed #CYCLE!
  assert.equal(wb.sheets[0].cells['r_2:c_1'].computed, '#CYCLE!');
});

test('error propagation: division by zero emits #DIV/0! and propagates downstream', () => {
  const wb: WorkbookModel = {
    version: 3,
    workbookId: 'wb_err',
    revision: 1,
    activeSheetId: 's1',
    metadata: {},
    sheets: [
      {
        id: 's1',
        title: 'Sheet1',
        rowCount: 5,
        colCount: 5,
        rows: Array.from({ length: 5 }, (_, i) => ({ id: `r_${i}`, index: i })),
        cols: Array.from({ length: 5 }, (_, i) => ({ id: `c_${i}`, index: i })),
        cells: {
          'r_0:c_0': { id: 'c_div', rowId: 'r_0', colId: 'c_0', value: 0, formula: '=100 / 0', protection: { locked: true } },
          'r_1:c_0': { id: 'c_dep', rowId: 'r_1', colId: 'c_0', value: 0, formula: '=A1 + 50', protection: { locked: true } },
        },
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };

  const graph = DependencyGraph.build(wb);
  graph.recalculate(wb, { dirtyKeys: ['s1:r_0:c_0'] });

  assert.equal(wb.sheets[0].cells['r_0:c_0'].computed, '#DIV/0!');
  assert.equal(wb.sheets[0].cells['r_1:c_0'].computed, '#DIV/0!');
});

test('cancellable recalculation halts and performs atomic rollback', () => {
  const wb = createSampleWorkbook();
  const graph = DependencyGraph.build(wb);

  // Initial calculation
  graph.recalculate(wb, { dirtyKeys: ['s1:r_3:c_3'] });
  const prevH4 = wb.sheets[0].cells['r_3:c_7'].computed;
  const prevJ4 = wb.sheets[0].cells['r_3:c_9'].computed;

  // New edit with aborted cancellation signal
  wb.sheets[0].cells['r_3:c_3'].value = 999;
  const abortSignal = { aborted: true };

  const res = graph.recalculate(wb, {
    dirtyKeys: ['s1:r_3:c_3'],
    signal: abortSignal,
  });

  assert.equal(res.success, false);
  assert.equal(res.cancelled, true);

  // State must NOT be half-propagated or corrupt: previous values restored
  assert.equal(wb.sheets[0].cells['r_3:c_7'].computed, prevH4);
  assert.equal(wb.sheets[0].cells['r_3:c_9'].computed, prevJ4);
});

test('volatile function scheduling and deterministic seeding', () => {
  const wb: WorkbookModel = {
    version: 3,
    workbookId: 'wb_vol',
    revision: 1,
    activeSheetId: 's1',
    metadata: {},
    sheets: [
      {
        id: 's1',
        title: 'Sheet1',
        rowCount: 5,
        colCount: 5,
        rows: Array.from({ length: 5 }, (_, i) => ({ id: `r_${i}`, index: i })),
        cols: Array.from({ length: 5 }, (_, i) => ({ id: `c_${i}`, index: i })),
        cells: {
          'r_0:c_0': { id: 'c_today', rowId: 'r_0', colId: 'c_0', value: '', formula: '=TODAY()', protection: { locked: true } },
          'r_1:c_0': { id: 'c_rand', rowId: 'r_1', colId: 'c_0', value: 0, formula: '=RAND()', protection: { locked: true } },
        },
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };

  const graph = DependencyGraph.build(wb);
  assert.equal(graph.volatileKeys.has('s1:r_0:c_0'), true);
  assert.equal(graph.volatileKeys.has('s1:r_1:c_0'), true);

  // Deterministic seed for reproducible multi-target cross checks
  graph.recalculate(wb, {
    referenceDate: '2026-10-12',
    seedRandom: 0.887766,
  });

  assert.equal(wb.sheets[0].cells['r_0:c_0'].computed, '2026-10-12');
  assert.equal(wb.sheets[0].cells['r_1:c_0'].computed, 0.887766);
});

test('sub-graph recalculation performance vs whole workbook on sample_boq_1k', () => {
  const filePath = resolve(FIXTURES_DIR, 'sample_boq_1k.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  const wb = migrateV2ToV3(v2Fixture);

  const graph = DependencyGraph.build(wb);
  assert.ok(graph.nodes.size >= 1000);

  // Measure single cell dirty propagation latency
  const targetKey = 'sheet-boq-1:r_10:c_3'; // row 10 quantity
  const start = Date.now();
  const res = graph.recalculate(wb, { dirtyKeys: [targetKey], includeVolatile: false });
  const elapsed = Date.now() - start;

  assert.equal(res.success, true);
  // Incremental sub-graph evaluation must execute in < 20ms (typically < 2ms)
  assert.ok(elapsed < 20, `Incremental recalculation took ${elapsed}ms, must be < 20ms`);
});
