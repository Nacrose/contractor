import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, type WorkbookCommand } from '../src/commands.js';
import type { WorkbookModel } from '../src/types.js';
import { createInitialSaveSyncState } from '../src/save_sync_state.js';

function createTestWorkbook(): WorkbookModel {
  return {
    version: 3,
    workbookId: 'wb_cmd_test',
    revision: 1,
    activeSheetId: 's1',
    metadata: { title: 'Command Test' },
    sheets: [
      {
        id: 's1',
        title: 'Measurements',
        rowCount: 5,
        colCount: 5,
        rows: Array.from({ length: 5 }, (_, i) => ({ id: `r_${i}`, index: i })),
        cols: Array.from({ length: 5 }, (_, i) => ({ id: `c_${i}`, index: i })),
        cells: {
          'r_1:c_1': {
            id: 'c_input',
            rowId: 'r_1',
            colId: 'c_1',
            value: 100,
            protection: { locked: false }, // Editable input
          },
          'r_2:c_1': {
            id: 'c_formula',
            rowId: 'r_2',
            colId: 'c_1',
            value: 200,
            formula: '=B2 * 2',
            protection: { locked: true }, // Protected derived formula
          },
        },
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };
}

test('set_cell command modifies unlocked cell and generates compensating undo', () => {
  const wb = createTestWorkbook();
  assert.equal(wb.revision, 1);
  assert.equal(wb.saveSyncStatus.localPersistence, 'saved');

  const cmd: WorkbookCommand = {
    id: 'cmd_1',
    type: 'set_cell',
    sheetId: 's1',
    rowId: 'r_1',
    colId: 'c_1',
    value: 150,
  };

  const result = executeCommand(wb, cmd);
  assert.equal(result.success, true);
  assert.ok(result.compensatingCommand);

  // Cell updated
  const cell = wb.sheets[0].cells['r_1:c_1'];
  assert.equal(cell.value, 150);

  // Revision bumped & M02 save/sync marked local edit
  assert.equal(wb.revision, 2);
  assert.equal(wb.saveSyncStatus.localPersistence, 'saving');
  assert.equal(wb.saveSyncStatus.serverAcceptance, 'queued');
  assert.equal(wb.saveSyncStatus.pendingWorkRetained, true);

  // Executing undo restores original value
  const undoResult = executeCommand(wb, result.compensatingCommand!);
  assert.equal(undoResult.success, true);
  assert.equal(wb.sheets[0].cells['r_1:c_1'].value, 100);
});

test('cell protection contract: locked cell edits rejected without administrative unlock', () => {
  const wb = createTestWorkbook();

  const unauthorizedEdit: WorkbookCommand = {
    id: 'cmd_bad',
    type: 'set_cell',
    sheetId: 's1',
    rowId: 'r_2',
    colId: 'c_1',
    value: 999, // Attempt to overwrite protected formula cell
  };

  const result = executeCommand(wb, unauthorizedEdit);
  assert.equal(result.success, false);
  assert.ok(result.error?.includes('CELL_PROTECTED'));

  // Cell remains unmutated
  const cell = wb.sheets[0].cells['r_2:c_1'];
  assert.equal(cell.value, 200);
  assert.equal(cell.formula, '=B2 * 2');

  // Authorized edit with forceUnlock (administrative amendment workflow) succeeds
  const authorizedEdit: WorkbookCommand = {
    ...unauthorizedEdit,
    id: 'cmd_auth',
    forceUnlock: true,
  };

  const authResult = executeCommand(wb, authorizedEdit);
  assert.equal(authResult.success, true);
  assert.equal(wb.sheets[0].cells['r_2:c_1'].value, 999);
});

test('structural command execution and undo through command engine', () => {
  const wb = createTestWorkbook();

  const insertCmd: WorkbookCommand = {
    id: 'cmd_ins',
    type: 'insert_rows',
    sheetId: 's1',
    atIndex: 0,
    count: 2,
  };

  const res = executeCommand(wb, insertCmd);
  assert.equal(res.success, true);
  assert.equal(wb.sheets[0].rowCount, 7);
  assert.ok(res.compensatingCommand);

  // Undo structural insert
  const undoRes = executeCommand(wb, res.compensatingCommand!);
  assert.equal(undoRes.success, true);
  assert.equal(wb.sheets[0].rowCount, 5);
});
