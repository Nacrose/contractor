import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setDefinedName,
  getDefinedName,
  deleteDefinedName,
  listDefinedNames,
  rewriteDefinedNamesOnStructureChange,
} from '../src/defined_names.js';
import type { WorkbookModel } from '../src/types.js';
import { createInitialSaveSyncState } from '../src/save_sync_state.js';

function createTestWorkbook(): WorkbookModel {
  return {
    version: 3,
    workbookId: 'wb_names',
    revision: 1,
    activeSheetId: 's1',
    metadata: { title: 'Names Test' },
    sheets: [
      {
        id: 's1',
        title: 'Measurements',
        rowCount: 10,
        colCount: 10,
        rows: Array.from({ length: 10 }, (_, i) => ({ id: `r_${i}`, index: i })),
        cols: Array.from({ length: 10 }, (_, i) => ({ id: `c_${i}`, index: i })),
        cells: {},
        definedNames: {},
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };
}

test('defined names support global and sheet-scoped variables', () => {
  const wb = createTestWorkbook();

  // Global name
  setDefinedName(wb, {
    name: 'VAT_RATE',
    expression: '0.13',
    scope: 'workbook',
    comment: 'Nepal Standard Value Added Tax',
  });

  // Sheet-scoped name
  setDefinedName(wb, {
    name: 'SUBTOTAL_CIVIL',
    expression: '=SUM(H4:H20)',
    scope: 's1',
  });

  // Lookups
  const vat = getDefinedName(wb, 'VAT_RATE', 's1');
  assert.ok(vat);
  assert.equal(vat.expression, '0.13');

  const subtotal = getDefinedName(wb, 'SUBTOTAL_CIVIL', 's1');
  assert.ok(subtotal);
  assert.equal(subtotal.expression, '=SUM(H4:H20)');

  // Sheet scope overrides global if names collide
  setDefinedName(wb, {
    name: 'VAT_RATE',
    expression: '0.00', // Exempt in this sheet
    scope: 's1',
  });

  const overridden = getDefinedName(wb, 'VAT_RATE', 's1');
  assert.equal(overridden?.expression, '0.00');

  // But from a different sheet or without activeSheetId, global is returned
  const globalVat = getDefinedName(wb, 'VAT_RATE');
  assert.equal(globalVat?.expression, '0.13');
});

test('structural changes update expressions in defined names', () => {
  const wb = createTestWorkbook();

  setDefinedName(wb, {
    name: 'CIVIL_TOTAL',
    expression: '=Measurements!H10',
    scope: 'workbook',
  });

  // Insert 2 rows at row index 3 (above row 10 / H10)
  rewriteDefinedNamesOnStructureChange(
    wb,
    {
      type: 'insert_rows',
      sheetId: 's1',
      atIndex: 3,
      count: 2,
    },
    'Measurements'
  );

  const def = getDefinedName(wb, 'CIVIL_TOTAL');
  assert.equal(def?.expression, '=Measurements!H12');
});
