import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rewriteFormulaReferences,
  insertRows,
  deleteRows,
  moveRows,
  insertCols,
  deleteCols,
  renameSheet,
  deleteSheet,
} from '../src/transforms.js';
import type { WorkbookModel } from '../src/types.js';
import { createInitialSaveSyncState } from '../src/save_sync_state.js';

function createTestWorkbook(): WorkbookModel {
  return {
    version: 3,
    workbookId: 'wb_test',
    revision: 1,
    activeSheetId: 's1',
    metadata: { title: 'Test Workbook' },
    sheets: [
      {
        id: 's1',
        title: 'Measurements',
        rowCount: 10,
        colCount: 10,
        rows: Array.from({ length: 10 }, (_, i) => ({ id: `r_${i}`, index: i })),
        cols: Array.from({ length: 10 }, (_, i) => ({ id: `c_${i}`, index: i })),
        cells: {
          'r_3:c_7': {
            id: 'c1',
            rowId: 'r_3',
            colId: 'c_7',
            value: 10440,
            formula: '=D4*E4*F4*G4',
            protection: { locked: true },
          },
          'r_8:c_7': {
            id: 'c2',
            rowId: 'r_8',
            colId: 'c_7',
            value: 50000,
            formula: '=SUM(H4:H8)',
            protection: { locked: true },
          },
        },
      },
      {
        id: 's2',
        title: 'Summary',
        rowCount: 5,
        colCount: 5,
        rows: Array.from({ length: 5 }, (_, i) => ({ id: `s2_r_${i}`, index: i })),
        cols: Array.from({ length: 5 }, (_, i) => ({ id: `s2_c_${i}`, index: i })),
        cells: {
          's2_r_1:s2_c_1': {
            id: 'summary_c1',
            rowId: 's2_r_1',
            colId: 's2_c_1',
            value: 50000,
            formula: '=Measurements!H9 * 1.13',
            protection: { locked: true },
          },
          's2_r_2:s2_c_1': {
            id: 'summary_c2',
            rowId: 's2_r_2',
            colId: 's2_c_1',
            value: 100,
            formula: '=Measurements!D4 + 10',
            protection: { locked: true },
          },
        },
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };
}

test('insert rows above formula shifts cell references down', () => {
  const wb = createTestWorkbook();

  // Insert 2 rows at index 1 (above row 3 / row 4 in 1-indexed A1)
  const res = insertRows(wb, 's1', 1, 2);
  assert.ok(res.affectedCellCount > 0);

  // Original formula =D4*E4*F4*G4 should now be =D6*E6*F6*G6
  const cell = wb.sheets[0].cells['r_3:c_7'];
  assert.equal(cell.formula, '=D6*E6*F6*G6');

  // Summary sheet referencing Measurements!H9 should now be Measurements!H11
  const sumCell = wb.sheets[1].cells['s2_r_1:s2_c_1'];
  assert.equal(sumCell.formula, '=Measurements!H11 * 1.13');
});

test('insert rows inside range expands range boundaries', () => {
  const wb = createTestWorkbook();

  // Range was H4:H8. Insert 2 rows at row index 5 (between 4 and 8)
  insertRows(wb, 's1', 5, 2);

  const sumRangeCell = wb.sheets[0].cells['r_8:c_7'];
  // H4:H8 expands by 2 to H4:H10
  assert.equal(sumRangeCell.formula, '=SUM(H4:H10)');
});

test('delete rows containing referenced cell turns reference into #REF!', () => {
  const wb = createTestWorkbook();

  // Delete row index 3 (which corresponds to row 4 in A1, D4)
  const res = deleteRows(wb, 's1', 3, 1);
  assert.ok(res.refErrorsIntroduced > 0);

  // Reference to D4, E4, F4, G4 becomes #REF!
  const sumCell = wb.sheets[1].cells['s2_r_1:s2_c_1'];
  // Previously referenced Measurements!H9, row 9 shifted up by 1 to H8
  assert.equal(sumCell.formula, '=Measurements!H8 * 1.13');

  const refCell = wb.sheets[1].cells['s2_r_2:s2_c_1'];
  assert.equal(refCell.formula, '=#REF! + 10');
});

test('delete row entirely containing a range turns range into #REF!', () => {
  const formula = '=SUM(A3:A5)';
  const op = {
    type: 'delete_rows' as const,
    sheetId: 's1',
    atIndex: 1, // index 1 is row 2
    count: 5,   // deletes rows 2, 3, 4, 5, 6 (encompassing entire A3:A5)
  };

  const res = rewriteFormulaReferences(formula, op, 'Measurements');
  assert.equal(res.formula, '=SUM(#REF!)');
  assert.equal(res.hasRefError, true);
});

test('move rows shifts references deterministically', () => {
  const wb = createTestWorkbook();

  // Move row 3 to row 6 (shift down by 3)
  moveRows(wb, 's1', 3, 6, 1);

  const cell = wb.sheets[0].cells['r_3:c_7'];
  // Was D4*E4*F4*G4 -> row 4 moved to row 7 (index 6 is row 7)
  assert.equal(cell.formula, '=D7*E7*F7*G7');
});

test('rename sheet rewrites 3D cross-sheet references across all formulas', () => {
  const wb = createTestWorkbook();

  renameSheet(wb, 's1', 'Civil Works');

  const sumCell = wb.sheets[1].cells['s2_r_1:s2_c_1'];
  assert.equal(sumCell.formula, "='Civil Works'!H9 * 1.13");
});

test('delete sheet turns cross-sheet references into #REF!', () => {
  const wb = createTestWorkbook();

  deleteSheet(wb, 's1');

  const sumCell = wb.sheets[0].cells['s2_r_1:s2_c_1']; // s1 was deleted, so s2 is now index 0
  assert.equal(sumCell.formula, '=#REF! * 1.13');
});

test('identical reference transformation on server replay and client preview', () => {
  // Pure function property: given same formula and operation, outputs are identical
  const formula = '=Measurements!$D$4 * Measurements!E4 + SUM(Civil!A1:B10)';
  const op = {
    type: 'insert_rows' as const,
    sheetId: 's_civil',
    atIndex: 5,
    count: 3,
    _targetSheetTitle: 'Civil',
  };

  const clientPreview = rewriteFormulaReferences(formula, op, 'Summary');
  const serverReplay = rewriteFormulaReferences(formula, op, 'Summary');

  assert.equal(clientPreview.formula, serverReplay.formula);
  assert.equal(clientPreview.hasRefError, serverReplay.hasRefError);
  assert.equal(clientPreview.formula, '=Measurements!$D$4 * Measurements!E4 + SUM(Civil!A1:B13)');
});
