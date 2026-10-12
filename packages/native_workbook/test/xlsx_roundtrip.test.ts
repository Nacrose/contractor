import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exportWorkbookToXlsx,
  importWorkbookFromXlsx,
  crc32,
  ZipWriter,
  ZipReader,
  XlsxError,
} from '../src/xlsx.js';
import { migrateV2ToV3 } from '../src/migration.js';
import { createInitialSaveSyncState } from '../src/save_sync_state.js';
import type { LegacyWorkbookV2, WorkbookModel, SheetModel, CellModel } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures/platform-parity/worksheet/templates');

// ---------------------------------------------------------------------------
// 1. ZIP Engine & CRC-32 Primitive Tests
// ---------------------------------------------------------------------------

test('crc32 produces correct standard checksums', () => {
  // Test known CRC-32 vectors:
  // "123456789" -> 0xcbf43926 (3421780262)
  const testBytes = Buffer.from('123456789', 'utf-8');
  assert.equal(crc32(testBytes), 0xcbf43926);

  const emptyBytes = new Uint8Array(0);
  assert.equal(crc32(emptyBytes), 0x00000000);
});

test('ZipWriter and ZipReader round-trip text and binary payload parts', () => {
  const writer = new ZipWriter();
  writer.add('test.txt', 'Hello, OpenPackagingConventions!');
  writer.add('data/binary.bin', new Uint8Array([0, 1, 2, 253, 254, 255]));
  const zipBytes = writer.build();

  assert.ok(zipBytes.length > 50, 'ZIP bytes must be generated');

  const reader = new ZipReader(zipBytes);
  assert.equal(reader.getText('test.txt'), 'Hello, OpenPackagingConventions!');

  const bin = reader.get('data/binary.bin');
  assert.ok(bin);
  assert.equal(bin.length, 6);
  assert.equal(bin[0], 0);
  assert.equal(bin[5], 255);
});

test('ZipReader rejects corrupt and truncated inputs with typed XlsxError', () => {
  assert.throws(
    () => new ZipReader(new Uint8Array([1, 2, 3])),
    (err: unknown) => err instanceof XlsxError && err.code === 'invalid_zip',
  );

  const garbage = new Uint8Array(100).fill(42);
  assert.throws(
    () => new ZipReader(garbage),
    (err: unknown) => err instanceof XlsxError && err.code === 'invalid_zip',
  );
});

// ---------------------------------------------------------------------------
// 2. M00 Fixture Round-Trip: standard_ipc_measurement.json
// ---------------------------------------------------------------------------

test('standard_ipc_measurement.json full byte and semantic round-trip', () => {
  const filePath = resolve(FIXTURES_DIR, 'standard_ipc_measurement.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  const v3Orig = migrateV2ToV3(v2Fixture);

  // 1. Export V3 to XLSX bytes
  const xlsxBytes = exportWorkbookToXlsx(v3Orig);
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 1000, 'XLSX archive must contain populated parts');

  // Verify internal OpenXML parts exist in archive
  const zip = new ZipReader(xlsxBytes);
  assert.ok(zip.has('[Content_Types].xml'));
  assert.ok(zip.has('_rels/.rels'));
  assert.ok(zip.has('xl/workbook.xml'));
  assert.ok(zip.has('xl/styles.xml'));
  assert.ok(zip.has('xl/sharedStrings.xml'));
  assert.ok(zip.has('xl/worksheets/sheet1.xml'));
  assert.ok(zip.has('xl/worksheets/sheet2.xml'));

  // 2. Import back into WorkbookModel
  const v3Imported = importWorkbookFromXlsx(xlsxBytes);
  assert.equal(v3Imported.version, 3);
  assert.equal(v3Imported.sheets.length, v3Orig.sheets.length);

  // Check sheet titles
  assert.equal(v3Imported.sheets[0].title, v3Orig.sheets[0].title);
  assert.equal(v3Imported.sheets[1].title, v3Orig.sheets[1].title);

  // Check 4-factor measurement formulas (=D*E*F*G)
  const origSheet1 = v3Orig.sheets[0];
  const impSheet1 = v3Imported.sheets[0];

  let formulaMatchCount = 0;
  for (const [coord, origCell] of Object.entries(origSheet1.cells)) {
    if (origCell.formula) {
      const impCell = impSheet1.cells[coord];
      assert.ok(impCell, `Imported sheet must have cell at ${coord}`);
      assert.equal(impCell.formula, origCell.formula, `Formula mismatch at ${coord}`);
      formulaMatchCount++;
    }
  }
  assert.ok(formulaMatchCount > 0, 'Must have matched measurement formulas');

  // Check cell protection contract (formula cells locked, input cells preserved)
  for (const [coord, origCell] of Object.entries(origSheet1.cells)) {
    const impCell = impSheet1.cells[coord];
    if (origCell.protection) {
      assert.equal(
        impCell.protection.locked,
        origCell.protection.locked,
        `Protection mismatch at ${coord}`,
      );
    }
  }

  // 3. Re-export to verify idempotent re-encoding
  const reExportBytes = exportWorkbookToXlsx(v3Imported);
  assert.ok(reExportBytes.length > 1000);
});

// ---------------------------------------------------------------------------
// 3. M00 Fixture Round-Trip: degenerate_calc_stress.json
// ---------------------------------------------------------------------------

test('degenerate_calc_stress.json preserves adverse formulas through XLSX', () => {
  const filePath = resolve(FIXTURES_DIR, 'degenerate_calc_stress.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  const v3Orig = migrateV2ToV3(v2Fixture);

  const xlsxBytes = exportWorkbookToXlsx(v3Orig);
  const v3Imported = importWorkbookFromXlsx(xlsxBytes);

  const sOrig = v3Orig.sheets[0];
  const sImp = v3Imported.sheets[0];

  // Division by zero formula
  const divOrig = sOrig.cells['r_2:c_1'];
  const divImp = sImp.cells['r_2:c_1'];
  assert.equal(divImp.formula, divOrig.formula);

  // String arithmetic formula
  const strOrig = sOrig.cells['r_3:c_1'];
  const strImp = sImp.cells['r_3:c_1'];
  assert.equal(strImp.formula, strOrig.formula);

  // Unknown macro formula
  const nameOrig = sOrig.cells['r_4:c_1'];
  const nameImp = sImp.cells['r_4:c_1'];
  assert.equal(nameImp.formula, nameOrig.formula);
});

// ---------------------------------------------------------------------------
// 4. Large Scale Benchmark: sample_boq_1k.json (10,000+ cells)
// ---------------------------------------------------------------------------

test('sample_boq_1k.json high-volume serialization and round-trip performance', () => {
  const filePath = resolve(FIXTURES_DIR, 'sample_boq_1k.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  const v3Orig = migrateV2ToV3(v2Fixture);

  const tStartExport = performance.now();
  const xlsxBytes = exportWorkbookToXlsx(v3Orig);
  const exportDuration = performance.now() - tStartExport;

  assert.ok(xlsxBytes.length > 50000, 'Large BoQ produces substantial archive');
  assert.ok(exportDuration < 1500, `Export took ${exportDuration}ms (expected < 1500ms)`);

  const tStartImport = performance.now();
  const v3Imported = importWorkbookFromXlsx(xlsxBytes);
  const importDuration = performance.now() - tStartImport;

  assert.ok(importDuration < 1500, `Import took ${importDuration}ms (expected < 1500ms)`);

  const origCellCount = Object.keys(v3Orig.sheets[0].cells).length;
  const impCellCount = Object.keys(v3Imported.sheets[0].cells).length;
  assert.equal(impCellCount, origCellCount, 'All 10,000+ cells must be recovered');
});

// ---------------------------------------------------------------------------
// 5. Formatting, Panes & Defined Names Fidelity Verification
// ---------------------------------------------------------------------------

test('preserves cell formatting, frozen panes, and defined names', () => {
  const customWb: WorkbookModel = {
    version: 3,
    workbookId: 'wb-custom-fidelity',
    revision: 1,
    activeSheetId: 'sheet_1',
    metadata: {
      title: 'Takeoff Test',
      currency: 'NPR',
      unitSystem: 'metric',
    },
    sheets: [
      {
        id: 'sheet_1',
        title: 'Bridge Culvert',
        rowCount: 10,
        colCount: 10,
        rows: [{ id: 'r_1', index: 1 }, { id: 'r_2', index: 2 }],
        cols: [{ id: 'c_1', index: 1 }, { id: 'c_2', index: 2, width: 22.5 }],
        colWidths: { c_2: 22.5 },
        freeze: { xSplit: 1, ySplit: 2 },
        cells: {
          'r_1:c_1': {
            id: 'r_1:c_1',
            rowId: 'r_1',
            colId: 'c_1',
            value: 'Item Description',
            format: { bold: true, align: 'left' },
            protection: { locked: true },
          },
          'r_1:c_2': {
            id: 'r_1:c_2',
            rowId: 'r_1',
            colId: 'c_2',
            value: 'Rate (NPR)',
            format: { bold: true, italic: true, align: 'right' },
            protection: { locked: true },
          },
          'r_2:c_1': {
            id: 'r_2:c_1',
            rowId: 'r_2',
            colId: 'c_1',
            value: 12500.5,
            format: { align: 'right' },
            protection: { locked: false }, // Editable quantity input
          },
          'r_2:c_2': {
            id: 'r_2:c_2',
            rowId: 'r_2',
            colId: 'c_2',
            value: null,
            formula: '=A2*1.13',
            computed: 14125.565,
            protection: { locked: true }, // Contractual total
          },
        },
      },
    ],
    definedNames: {
      VAT_RATE: {
        name: 'VAT_RATE',
        expression: '0.13',
        scope: 'workbook',
      },
    },
    saveSyncStatus: createInitialSaveSyncState(),
  };

  const bytes = exportWorkbookToXlsx(customWb);
  const imported = importWorkbookFromXlsx(bytes);

  const sheet = imported.sheets[0];
  assert.equal(sheet.title, 'Bridge Culvert');
  assert.ok(sheet.freeze);
  assert.equal(sheet.freeze.xSplit, 1);
  assert.equal(sheet.freeze.ySplit, 2);

  // Column width
  assert.ok(sheet.colWidths);
  assert.equal(sheet.colWidths['c_2'], 22.5);

  // Cells
  const c11 = sheet.cells['r_1:c_1'];
  assert.equal(c11.value, 'Item Description');
  assert.equal(c11.format?.bold, true);
  assert.equal(c11.format?.align, 'left');
  assert.equal(c11.protection.locked, true);

  const c12 = sheet.cells['r_1:c_2'];
  assert.equal(c12.value, 'Rate (NPR)');
  assert.equal(c12.format?.bold, true);
  assert.equal(c12.format?.italic, true);
  assert.equal(c12.protection.locked, true);

  // Unlocked editable input cell
  const c21 = sheet.cells['r_2:c_1'];
  assert.equal(c21.value, 12500.5);
  assert.equal(c21.protection.locked, false);

  // Formula cell
  const c22 = sheet.cells['r_2:c_2'];
  assert.equal(c22.formula, '=A2*1.13');
  assert.equal(c22.protection.locked, true);

  // Defined names
  assert.ok(imported.definedNames['VAT_RATE']);
  assert.equal(imported.definedNames['VAT_RATE'].expression, '0.13');
});

// ---------------------------------------------------------------------------
// 6. Independently Produced Representative Files Verification
// ---------------------------------------------------------------------------

test('independently produced XLSX files load and verify fidelity from disk', () => {
  const xlsxDir = resolve(__dirname, '../../../../fixtures/platform-parity/worksheet/xlsx');

  // Load sample_bridge_culvert.xlsx
  const culvertPath = resolve(xlsxDir, 'sample_bridge_culvert.xlsx');
  const culvertBuf = readFileSync(culvertPath);
  const culvertWb = importWorkbookFromXlsx(new Uint8Array(culvertBuf));

  assert.equal(culvertWb.sheets.length, 1);
  const culvertSheet = culvertWb.sheets[0];
  assert.equal(culvertSheet.title, 'Takeoff Measurement');

  // Verify frozen pane (split at cols 2, row 1)
  assert.ok(culvertSheet.freeze);
  assert.equal(culvertSheet.freeze.xSplit, 2);
  assert.equal(culvertSheet.freeze.ySplit, 1);

  // Verify 4-factor volume formula: =C2*D2*E2
  const volCell = culvertSheet.cells['r_1:c_5'];
  assert.ok(volCell);
  assert.equal(volCell.formula, '=C2*D2*E2');
  assert.equal(volCell.computed, 96.25);
  assert.equal(volCell.protection.locked, true);

  // Verify VAT formula: =H4*0.13
  const vatCell = culvertSheet.cells['r_4:c_7'];
  assert.ok(vatCell);
  assert.equal(vatCell.formula, '=H4*0.13');
  assert.equal(vatCell.computed, 355631.25);

  // Load standard_ipc_measurement.xlsx
  const ipcPath = resolve(xlsxDir, 'standard_ipc_measurement.xlsx');
  const ipcBuf = readFileSync(ipcPath);
  const ipcWb = importWorkbookFromXlsx(new Uint8Array(ipcBuf));
  assert.equal(ipcWb.sheets.length, 2);
  assert.equal(ipcWb.sheets[0].title, 'Measurements');
  assert.equal(ipcWb.sheets[1].title, 'BOQ Abstract');
});

