import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GridCraftHostAdapter,
  type GridCraftMode,
} from '../src/gridcraft_host_adapter.js';
import { migrateV2ToV3 } from '../src/migration.js';
import type { LegacyWorkbookV2 } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures/platform-parity/worksheet/templates');

function loadStandardIpcWorkbook() {
  const filePath = resolve(FIXTURES_DIR, 'standard_ipc_measurement.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  return migrateV2ToV3(v2Fixture);
}

test('dual UI modes: full_editor and embedded_table chrome configurations', () => {
  const wb = loadStandardIpcWorkbook();
  const adapter = new GridCraftHostAdapter(wb, { mode: 'full_editor' });

  // Full Editor chrome
  assert.equal(adapter.getMode(), 'full_editor');
  const fullUi = adapter.getUiState();
  assert.equal(fullUi.ribbonCollapsed, false, 'Full editor must show ribbon');
  assert.equal(fullUi.formulaBar, true, 'Full editor must show formula bar');
  assert.equal(fullUi.statusBar, true, 'Full editor must show status bar');
  assert.equal(fullUi.sheetTabs, true, 'Full editor must show sheet tabs');

  // Switch to Embedded Table mode
  adapter.switchMode('embedded_table');
  assert.equal(adapter.getMode(), 'embedded_table');
  const embeddedUi = adapter.getUiState();
  assert.equal(embeddedUi.ribbonCollapsed, true, 'Embedded table must collapse ribbon');
  assert.equal(embeddedUi.formulaBar, false, 'Embedded table uses inline inspector');
  assert.equal(embeddedUi.statusBar, false, 'Embedded table hides status bar');
});

test('mode switching preserves document identity, revision, selection, pending edits, and undo continuity', () => {
  const wb = loadStandardIpcWorkbook();
  const adapter = new GridCraftHostAdapter(wb, { mode: 'embedded_table' });

  const initialWbId = wb.workbookId;
  const initialRev = wb.revision;

  // Make an edit in embedded mode (quantity cell D4 -> row 3, col 3)
  const sheet = wb.sheets[0];
  const row = sheet.rows[3];
  const col = sheet.cols[3];

  adapter.setSelection({
    sheetId: sheet.id,
    startRow: 3,
    startCol: 3,
    endRow: 3,
    endCol: 3,
  });

  // Set pending edit
  adapter.setPendingEdit(sheet.id, row.id, col.id, '2');
  assert.ok(adapter.getPendingEdit(), 'Pending edit must exist');

  // Switch to full editor mode
  adapter.switchMode('full_editor');

  // Assert continuity
  assert.equal(adapter.getWorkbook().workbookId, initialWbId, 'Document identity preserved');
  assert.equal(adapter.getWorkbook().revision, initialRev, 'Revision counter preserved');
  assert.equal(adapter.getPendingEdit()?.text, '2', 'Pending edit preserved across mode switch');
  assert.deepEqual(adapter.getSelection(), {
    sheetId: sheet.id,
    startRow: 3,
    startCol: 3,
    endRow: 3,
    endCol: 3,
  }, 'Selection range preserved across mode switch');

  // Commit the edit in full editor mode
  const committed = adapter.commitPendingEdit();
  assert.equal(committed, true, 'Committed edit in full editor mode');
  assert.equal(adapter.getWorkbook().revision, initialRev + 1, 'Revision bumped on commit');

  // Check that cell value updated
  const updatedCell = sheet.cells[`${row.id}:${col.id}`];
  assert.equal(updatedCell.value, 2);

  // Switch back to embedded mode and verify undo continuity
  adapter.switchMode('embedded_table');
  assert.equal(adapter.canUndo(), true, 'Undo stack must remain continuous');

  const undid = adapter.undo();
  assert.equal(undid, true, 'Undo succeeds in embedded mode');
  const revertedCell = sheet.cells[`${row.id}:${col.id}`];
  assert.equal(revertedCell.value, '1', 'Value restored via undo');
});

test('domain restrictions: locked contractual cells reject editing in both modes', () => {
  const wb = loadStandardIpcWorkbook();
  const adapter = new GridCraftHostAdapter(wb, { mode: 'embedded_table' });
  const sheet = wb.sheets[0];

  // Lock a contractual rate cell
  const rateRow = sheet.rows[3];
  const rateCol = sheet.cols[1]; // BOQ Code
  const cell = sheet.cells[`${rateRow.id}:${rateCol.id}`];
  cell.protection = { locked: true };

  // Attempt editing in embedded mode
  adapter.setPendingEdit(sheet.id, rateRow.id, rateCol.id, '999.00');
  const committedEmbedded = adapter.commitPendingEdit(false);
  assert.equal(committedEmbedded, false, 'Must reject locked cell edit in embedded mode');

  // Switch to full editor and attempt editing without admin unlock
  adapter.switchMode('full_editor');
  adapter.setPendingEdit(sheet.id, rateRow.id, rateCol.id, '999.00');
  const committedFull = adapter.commitPendingEdit(false);
  assert.equal(committedFull, false, 'Must reject locked cell edit in full editor mode');

  // Administrative override allows edit
  const committedAdmin = adapter.commitPendingEdit(true);
  assert.equal(committedAdmin, true, 'Admin forceUnlock succeeds');
  assert.equal(sheet.cells[`${rateRow.id}:${rateCol.id}`].value, 999);
});

test('derived-formula inspection in embedded mode without full editor chrome', () => {
  const wb = loadStandardIpcWorkbook();
  const adapter = new GridCraftHostAdapter(wb, { mode: 'embedded_table' });
  const sheet = wb.sheets[0];

  // Row 3, col 7 is Quantity formula =D4*E4*F4*G4
  const row = sheet.rows[3];
  const col = sheet.cols[7];

  const info = adapter.inspectCellFormula(sheet.id, row.id, col.id);
  assert.ok(info, 'Inspection info returned');
  assert.equal(info?.formula, '=D4*E4*F4*G4');
  assert.equal(info?.computed, 10440);
  assert.ok(Array.isArray(info?.precedents));
});

test('native/web host bridge: focus, IME, clipboard, resize, a11y, and save interception', async () => {
  const wb = loadStandardIpcWorkbook();
  let saved = false;
  const adapter = new GridCraftHostAdapter(wb, {
    mode: 'embedded_table',
    onSave: async () => {
      saved = true;
    },
  });

  // Focus
  adapter.focus();
  assert.equal(adapter.hasFocus(), true);
  adapter.blur();
  assert.equal(adapter.hasFocus(), false);

  // Resize
  const viewport = adapter.handleResize(1440, 900);
  assert.equal(viewport.width, 1440);
  assert.equal(viewport.height, 900);
  assert.ok(viewport.visibleRows > 20);
  assert.ok(viewport.visibleCols > 10);

  // Accessibility snapshot
  const a11y = adapter.getA11ySnapshot();
  assert.ok(a11y);
  assert.equal(a11y?.role, 'gridcell');
  assert.ok(a11y?.focusedCellA1.length > 0);

  // Clipboard copy
  const sheet = wb.sheets[0];
  adapter.setSelection({
    sheetId: sheet.id,
    startRow: 3,
    startCol: 3,
    endRow: 3,
    endCol: 6,
  });
  const tsv = adapter.handleClipboardCopy();
  assert.equal(tsv, '1\t600\t14.5\t1.2', 'TSV copy output matches selection cells');

  // Intercept save action
  const saveResult = await adapter.interceptSaveAction();
  assert.equal(saveResult, true);
  assert.equal(saved, true, 'Interception successfully routed to onSave lifecycle hook');
});

test('virtualization benchmark: 50k and 100k row workloads report 0 scroll recalc', () => {
  const wb = loadStandardIpcWorkbook();
  const adapter = new GridCraftHostAdapter(wb, { mode: 'embedded_table' });

  // 50k row workload
  const profile50k = adapter.benchmarkWorkload(50000, 10);
  assert.equal(profile50k.rowCount, 50000);
  assert.equal(profile50k.virtualWindowRows, 40);
  assert.equal(profile50k.scrollingRecalcCount, 0, 'Scrolling 50k rows must trigger 0 recalculations');
  assert.ok(profile50k.renderTimeMs < 100);

  // 100k row workload
  const profile100k = adapter.benchmarkWorkload(100000, 10);
  assert.equal(profile100k.rowCount, 100000);
  assert.equal(profile100k.scrollingRecalcCount, 0, 'Scrolling 100k rows must trigger 0 recalculations');
  assert.ok(profile100k.memoryEstimateBytes > 0);
});

test('resource disposal', () => {
  const wb = loadStandardIpcWorkbook();
  const adapter = new GridCraftHostAdapter(wb);

  adapter.dispose();
  assert.throws(() => adapter.switchMode('full_editor'), /disposed/);
});
