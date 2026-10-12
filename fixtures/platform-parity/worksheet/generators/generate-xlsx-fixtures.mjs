/**
 * Generates canonical XLSX fixture files from platform templates.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../templates');
const OUTPUT_DIR = resolve(__dirname, '../xlsx');

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// We import the compiled or source native workbook module
const { migrateV2ToV3 } = await import('../../../../packages/native_workbook/.test-build/src/migration.js');
const { exportWorkbookToXlsx } = await import('../../../../packages/native_workbook/.test-build/src/xlsx.js');
const { createInitialSaveSyncState } = await import('../../../../packages/native_workbook/.test-build/src/save_sync_state.js');

// 1. Generate standard_ipc_measurement.xlsx
const ipcRaw = readFileSync(resolve(TEMPLATES_DIR, 'standard_ipc_measurement.json'), 'utf-8');
const ipcV2 = JSON.parse(ipcRaw);
const ipcV3 = migrateV2ToV3(ipcV2);
const ipcBytes = exportWorkbookToXlsx(ipcV3);
writeFileSync(resolve(OUTPUT_DIR, 'standard_ipc_measurement.xlsx'), ipcBytes);
console.log(`Generated standard_ipc_measurement.xlsx (${ipcBytes.length} bytes)`);

// 2. Generate sample_bridge_culvert.xlsx (representative engineering takeoff)
const culvertWb = {
  version: 3,
  workbookId: 'wb-bridge-culvert-001',
  revision: 1,
  activeSheetId: 'sheet_1',
  metadata: {
    title: 'Bridge Culvert Takeoff & Interim Certificate',
    currency: 'NPR',
    unitSystem: 'metric',
  },
  sheets: [
    {
      id: 'sheet_1',
      title: 'Takeoff Measurement',
      rowCount: 12,
      colCount: 8,
      rows: [
        { id: 'r_0', index: 0 },
        { id: 'r_1', index: 1 },
        { id: 'r_2', index: 2 },
        { id: 'r_3', index: 3 },
        { id: 'r_4', index: 4 },
        { id: 'r_5', index: 5 },
      ],
      cols: [
        { id: 'c_0', index: 0, width: 8 },
        { id: 'c_1', index: 1, width: 35 },
        { id: 'c_2', index: 2, width: 10 },
        { id: 'c_3', index: 3, width: 10 },
        { id: 'c_4', index: 4, width: 10 },
        { id: 'c_5', index: 5, width: 15 },
        { id: 'c_6', index: 6, width: 15 },
        { id: 'c_7', index: 7, width: 20 },
      ],
      colWidths: { c_0: 8, c_1: 35, c_2: 10, c_3: 10, c_4: 10, c_5: 15, c_6: 15, c_7: 20 },
      freeze: { xSplit: 2, ySplit: 1 },
      cells: {
        'r_0:c_0': { id: 'r_0:c_0', rowId: 'r_0', colId: 'c_0', value: 'Item', format: { bold: true, align: 'center' }, protection: { locked: true } },
        'r_0:c_1': { id: 'r_0:c_1', rowId: 'r_0', colId: 'c_1', value: 'Description', format: { bold: true, align: 'left' }, protection: { locked: true } },
        'r_0:c_2': { id: 'r_0:c_2', rowId: 'r_0', colId: 'c_2', value: 'Length (m)', format: { bold: true, align: 'right' }, protection: { locked: true } },
        'r_0:c_3': { id: 'r_0:c_3', rowId: 'r_0', colId: 'c_3', value: 'Breadth (m)', format: { bold: true, align: 'right' }, protection: { locked: true } },
        'r_0:c_4': { id: 'r_0:c_4', rowId: 'r_0', colId: 'c_4', value: 'Height (m)', format: { bold: true, align: 'right' }, protection: { locked: true } },
        'r_0:c_5': { id: 'r_0:c_5', rowId: 'r_0', colId: 'c_5', value: 'Quantity', format: { bold: true, align: 'right' }, protection: { locked: true } },
        'r_0:c_6': { id: 'r_0:c_6', rowId: 'r_0', colId: 'c_6', value: 'Unit Rate (NPR)', format: { bold: true, align: 'right' }, protection: { locked: true } },
        'r_0:c_7': { id: 'r_0:c_7', rowId: 'r_0', colId: 'c_7', value: 'Total Amount', format: { bold: true, align: 'right' }, protection: { locked: true } },

        // Row 1: Structural concrete
        'r_1:c_0': { id: 'r_1:c_0', rowId: 'r_1', colId: 'c_0', value: '3.01', protection: { locked: true } },
        'r_1:c_1': { id: 'r_1:c_1', rowId: 'r_1', colId: 'c_1', value: 'M25 Structural Concrete in Abutments', protection: { locked: true } },
        'r_1:c_2': { id: 'r_1:c_2', rowId: 'r_1', colId: 'c_2', value: 12.5, format: { align: 'right' }, protection: { locked: false } },
        'r_1:c_3': { id: 'r_1:c_3', rowId: 'r_1', colId: 'c_3', value: 2.2, format: { align: 'right' }, protection: { locked: false } },
        'r_1:c_4': { id: 'r_1:c_4', rowId: 'r_1', colId: 'c_4', value: 3.5, format: { align: 'right' }, protection: { locked: false } },
        'r_1:c_5': { id: 'r_1:c_5', rowId: 'r_1', colId: 'c_5', value: null, formula: '=C2*D2*E2', computed: 96.25, format: { align: 'right' }, protection: { locked: true } },
        'r_1:c_6': { id: 'r_1:c_6', rowId: 'r_1', colId: 'c_6', value: 16500.0, format: { align: 'right' }, protection: { locked: true } },
        'r_1:c_7': { id: 'r_1:c_7', rowId: 'r_1', colId: 'c_7', value: null, formula: '=F2*G2', computed: 1588125.0, format: { align: 'right' }, protection: { locked: true } },

        // Row 2: Rebar
        'r_2:c_0': { id: 'r_2:c_0', rowId: 'r_2', colId: 'c_0', value: '4.01', protection: { locked: true } },
        'r_2:c_1': { id: 'r_2:c_1', rowId: 'r_2', colId: 'c_1', value: 'Fe500 TMT Steel Reinforcement (kg)', protection: { locked: true } },
        'r_2:c_2': { id: 'r_2:c_2', rowId: 'r_2', colId: 'c_2', value: 1.0, format: { align: 'right' }, protection: { locked: false } },
        'r_2:c_3': { id: 'r_2:c_3', rowId: 'r_2', colId: 'c_3', value: 1.0, format: { align: 'right' }, protection: { locked: false } },
        'r_2:c_4': { id: 'r_2:c_4', rowId: 'r_2', colId: 'c_4', value: 8500.0, format: { align: 'right' }, protection: { locked: false } },
        'r_2:c_5': { id: 'r_2:c_5', rowId: 'r_2', colId: 'c_5', value: null, formula: '=C3*D3*E3', computed: 8500.0, format: { align: 'right' }, protection: { locked: true } },
        'r_2:c_6': { id: 'r_2:c_6', rowId: 'r_2', colId: 'c_6', value: 135.0, format: { align: 'right' }, protection: { locked: true } },
        'r_2:c_7': { id: 'r_2:c_7', rowId: 'r_2', colId: 'c_7', value: null, formula: '=F3*G3', computed: 1147500.0, format: { align: 'right' }, protection: { locked: true } },

        // Row 3: Subtotal
        'r_3:c_1': { id: 'r_3:c_1', rowId: 'r_3', colId: 'c_1', value: 'Net Subtotal', format: { bold: true }, protection: { locked: true } },
        'r_3:c_7': { id: 'r_3:c_7', rowId: 'r_3', colId: 'c_7', value: null, formula: '=SUM(H2:H3)', computed: 2735625.0, format: { bold: true, align: 'right' }, protection: { locked: true } },

        // Row 4: 13% VAT
        'r_4:c_1': { id: 'r_4:c_1', rowId: 'r_4', colId: 'c_1', value: 'VAT 13%', format: { bold: true }, protection: { locked: true } },
        'r_4:c_7': { id: 'r_4:c_7', rowId: 'r_4', colId: 'c_7', value: null, formula: '=H4*0.13', computed: 355631.25, format: { bold: true, align: 'right' }, protection: { locked: true } },

        // Row 5: Total with VAT
        'r_5:c_1': { id: 'r_5:c_1', rowId: 'r_5', colId: 'c_1', value: 'Gross Total (NPR)', format: { bold: true }, protection: { locked: true } },
        'r_5:c_7': { id: 'r_5:c_7', rowId: 'r_5', colId: 'c_7', value: null, formula: '=H4+H5', computed: 3091256.25, format: { bold: true, align: 'right' }, protection: { locked: true } },
      },
    },
  ],
  definedNames: {
    VAT_RATE: { name: 'VAT_RATE', expression: '0.13', scope: 'workbook' },
  },
  saveSyncStatus: createInitialSaveSyncState(),
};

const culvertBytes = exportWorkbookToXlsx(culvertWb);
writeFileSync(resolve(OUTPUT_DIR, 'sample_bridge_culvert.xlsx'), culvertBytes);
console.log(`Generated sample_bridge_culvert.xlsx (${culvertBytes.length} bytes)`);
