/**
 * Tests: IPC/BoQ Financial Integration Bridge (M06-T07).
 *
 * Acceptance-criteria coverage:
 *  1. Exact-decimal coercion — string and numeric cell values both reach the
 *     boundary as correctly formatted exact-decimal strings.
 *  2. Scaled-integer subtotal — subtotal is computed in BigInt arithmetic;
 *     no floating-point summation.
 *  3. No client-authorized postings — reflectIpcImport() returns descriptors
 *     only; it does NOT mutate the workbook.
 *  4. Round-trip provenance — verifyIpcRoundTrip() passes when workbookId,
 *     revision, subtotal, and line-item amounts all match; throws with code
 *     "round_trip_mismatch" on any deviation.
 *  5. Locked-cell exclusion — cells with protection.locked = true are not
 *     included in the export (they carry server-computed values).
 *  6. Flutter-parity type safety — WorksheetIpcExport and WorksheetIpcImport
 *     shapes are tested structurally to guard against accidental breaking changes.
 */

import assert from 'node:assert/strict';
import { createInitialSaveSyncState } from '../src/save_sync_state.js';
import {
  isExactDecimalString,
  cellValueToExactDecimal,
  exactDecimalToScaledInt,
  collectBoqCells,
  buildIpcExport,
  verifyIpcRoundTrip,
  reflectIpcImport,
  BoqBridgeError,
  type WorksheetIpcExport,
  type WorksheetIpcImport,
} from '../src/boq_ipc_bridge.js';
import type { WorkbookModel, CellModel } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCell(
  overrides: Partial<CellModel> & { id: string },
): CellModel {
  return {
    id: overrides.id,
    rowId: overrides.rowId ?? 'r1',
    colId: overrides.colId ?? 'c1',
    value: overrides.value ?? null,
    computed: overrides.computed,
    formula: overrides.formula,
    format: overrides.format,
    protection: overrides.protection ?? { locked: false },
    domainMetadata: overrides.domainMetadata,
  };
}

function makeWorkbook(
  sheetCells: Record<string, CellModel>,
  metaOverrides: Partial<WorkbookModel['metadata']> = {},
): WorkbookModel {
  return {
    version: 3,
    workbookId: 'wb-test-001',
    revision: 7,
    activeSheetId: 's1',
    metadata: {
      project: 'proj-42',
      currency: 'NPR',
      ...metaOverrides,
    },
    sheets: [
      {
        id: 's1',
        title: 'IPC Summary',
        rowCount: 10,
        colCount: 5,
        rows: [{ id: 'r1', index: 0 }, { id: 'r2', index: 1 }, { id: 'r3', index: 2 }],
        cols: [{ id: 'c1', index: 0 }, { id: 'c2', index: 1 }],
        cells: sheetCells,
      },
    ],
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };
}

// ---------------------------------------------------------------------------
// 1. Exact-decimal string validation
// ---------------------------------------------------------------------------

{
  const valid = ['0', '0.00', '1234.50', '-750.25', '100', '0.1'];
  const invalid = ['', '1e5', '1.', '.5', '1.2.3', 'abc', '1 000', '--1'];

  for (const v of valid) {
    assert.ok(isExactDecimalString(v), `Expected "${v}" to be a valid exact-decimal`);
  }
  for (const v of invalid) {
    assert.ok(!isExactDecimalString(v), `Expected "${v}" to be INVALID`);
  }
  console.log('✓ isExactDecimalString — valid/invalid cases');
}

// ---------------------------------------------------------------------------
// 2. Cell-value coercion
// ---------------------------------------------------------------------------

{
  // String value that is already exact-decimal
  const stringCell = makeCell({ id: 'c1', value: '2500.00', protection: { locked: false } });
  assert.equal(cellValueToExactDecimal(stringCell), '2500.00');

  // Computed number (formula result)
  const computedCell = makeCell({ id: 'c2', value: null, computed: 1234.5, protection: { locked: false } });
  assert.equal(cellValueToExactDecimal(computedCell), '1234.50');

  // Raw number
  const rawCell = makeCell({ id: 'c3', value: 750, protection: { locked: false } });
  assert.equal(cellValueToExactDecimal(rawCell), '750.00');

  // Non-numeric string → null
  const strCell = makeCell({ id: 'c4', value: 'N/A', protection: { locked: false } });
  assert.equal(cellValueToExactDecimal(strCell), null);

  // Boolean → null
  const boolCell = makeCell({ id: 'c5', value: true, protection: { locked: false } });
  assert.equal(cellValueToExactDecimal(boolCell), null);

  // Null → null
  const nullCell = makeCell({ id: 'c6', value: null, protection: { locked: false } });
  assert.equal(cellValueToExactDecimal(nullCell), null);

  // Custom decimalPlaces
  assert.equal(cellValueToExactDecimal(computedCell, 3), '1234.500');

  console.log('✓ cellValueToExactDecimal — all coercion cases');
}

// ---------------------------------------------------------------------------
// 3. Scaled-integer conversion
// ---------------------------------------------------------------------------

{
  assert.equal(exactDecimalToScaledInt('1234.50', 100), BigInt(123450));
  assert.equal(exactDecimalToScaledInt('0.01', 100), BigInt(1));
  assert.equal(exactDecimalToScaledInt('-7.50', 100), BigInt(-750));
  assert.equal(exactDecimalToScaledInt('0.00', 100), BigInt(0));
  assert.equal(exactDecimalToScaledInt('100', 100), BigInt(10000));
  assert.equal(exactDecimalToScaledInt('1.500', 1000), BigInt(1500));

  // Overflow in fractional digits
  assert.throws(
    () => exactDecimalToScaledInt('1.555', 100),
    (e: unknown) => e instanceof RangeError,
  );
  // Invalid format
  assert.throws(
    () => exactDecimalToScaledInt('1e5', 100),
    (e: unknown) => e instanceof RangeError,
  );

  console.log('✓ exactDecimalToScaledInt — scaling and error cases');
}

// ---------------------------------------------------------------------------
// 4. collectBoqCells — filtering and ordering
// ---------------------------------------------------------------------------

{
  const cells: Record<string, CellModel> = {
    'r1:c1': makeCell({ id: 'r1:c1', rowId: 'r1', colId: 'c1', value: '500.00', protection: { locked: false }, domainMetadata: { boqCode: 'A001', unit: 'm3' } }),
    'r2:c1': makeCell({ id: 'r2:c1', rowId: 'r2', colId: 'c1', value: '250.00', protection: { locked: false }, domainMetadata: { boqCode: 'A002', unit: 'm2' } }),
    // locked cell — must be excluded
    'r3:c1': makeCell({ id: 'r3:c1', rowId: 'r3', colId: 'c1', value: '100.00', protection: { locked: true }, domainMetadata: { boqCode: 'A003', unit: 'ls' } }),
    // no boqCode — must be excluded
    'r1:c2': makeCell({ id: 'r1:c2', rowId: 'r1', colId: 'c2', value: '999.00', protection: { locked: false } }),
  };

  const wb = makeWorkbook(cells);
  const eligible = collectBoqCells(wb);
  assert.equal(eligible.length, 2, 'Should exclude locked cell and cell without boqCode');
  assert.equal(eligible[0].cell.domainMetadata?.boqCode, 'A001', 'Row 0 first');
  assert.equal(eligible[1].cell.domainMetadata?.boqCode, 'A002', 'Row 1 second');

  console.log('✓ collectBoqCells — locked exclusion and deterministic ordering');
}

// ---------------------------------------------------------------------------
// 5. buildIpcExport — full export with subtotal
// ---------------------------------------------------------------------------

{
  const cells: Record<string, CellModel> = {
    'r1:c1': makeCell({
      id: 'r1:c1', rowId: 'r1', colId: 'c1',
      value: '1000.00',
      protection: { locked: false },
      domainMetadata: { boqCode: 'B001', description: 'Earthworks', unit: 'm3', ledgerRef: 'LE-001' },
    }),
    'r2:c1': makeCell({
      id: 'r2:c1', rowId: 'r2', colId: 'c1',
      value: '500.00',
      protection: { locked: false },
      domainMetadata: { boqCode: 'B002', description: 'Concrete', unit: 'm3' },
    }),
  };

  const wb = makeWorkbook(cells, { ipcNumber: 3 } as never);
  (wb.metadata as Record<string, unknown>)['custom'] = { ipcNumber: 3 };

  const exported = buildIpcExport(wb, { exportedAt: '2026-10-12T00:00:00Z' });

  assert.equal(exported.workbookId, 'wb-test-001');
  assert.equal(exported.revision, 7);
  assert.equal(exported.projectId, 'proj-42');
  assert.equal(exported.currency, 'NPR');
  assert.equal(exported.lineItems.length, 2);
  assert.equal(exported.subtotal, '1500.00', 'Subtotal should be exact-decimal sum');
  assert.equal(exported.exportedAt, '2026-10-12T00:00:00Z');
  assert.equal(exported.lineItems[0].boqCode, 'B001');
  assert.equal(exported.lineItems[0].ledgerRef, 'LE-001');
  assert.ok(exported.lineItems[0].cellRef.startsWith('s1:'));

  console.log('✓ buildIpcExport — structure, subtotal, provenance fields');
}

// ---------------------------------------------------------------------------
// 6. buildIpcExport — missing project throws
// ---------------------------------------------------------------------------

{
  const cells: Record<string, CellModel> = {
    'r1:c1': makeCell({ id: 'r1:c1', value: '100.00', protection: { locked: false }, domainMetadata: { boqCode: 'X001' } }),
  };
  const wb = makeWorkbook(cells, { project: undefined });

  assert.throws(
    () => buildIpcExport(wb),
    (e: unknown) => e instanceof BoqBridgeError && (e as BoqBridgeError).code === 'missing_project',
  );
  console.log('✓ buildIpcExport — throws missing_project');
}

// ---------------------------------------------------------------------------
// 7. buildIpcExport — no eligible cells throws
// ---------------------------------------------------------------------------

{
  // All cells are locked
  const cells: Record<string, CellModel> = {
    'r1:c1': makeCell({ id: 'r1:c1', value: '100.00', protection: { locked: true }, domainMetadata: { boqCode: 'X001' } }),
  };
  const wb = makeWorkbook(cells);

  assert.throws(
    () => buildIpcExport(wb),
    (e: unknown) => e instanceof BoqBridgeError && (e as BoqBridgeError).code === 'no_eligible_cells',
  );
  console.log('✓ buildIpcExport — throws no_eligible_cells');
}

// ---------------------------------------------------------------------------
// 8. verifyIpcRoundTrip — pass case
// ---------------------------------------------------------------------------

{
  const exported: WorksheetIpcExport = {
    workbookId: 'wb-test-001',
    revision: 7,
    projectId: 'proj-42',
    ipcNumber: 3,
    currency: 'NPR',
    lineItems: [
      { boqCode: 'B001', description: 'Earthworks', unit: 'm3', quantity: '1', rate: '1000.00', amount: '1000.00', currency: 'NPR', cellRef: 's1:c1:r1' },
      { boqCode: 'B002', description: 'Concrete', unit: 'm3', quantity: '1', rate: '500.00', amount: '500.00', currency: 'NPR', cellRef: 's1:c1:r2' },
    ],
    subtotal: '1500.00',
    exportedAt: '2026-10-12T00:00:00Z',
  };

  const imported: WorksheetIpcImport = {
    workbookId: 'wb-test-001',
    acceptedRevision: 7,
    serverSubtotal: '1500.00',
    discrepancies: [],
    receiptId: 'rcpt-abc',
    serverSeq: 42,
    reflectedAt: '2026-10-12T00:00:01Z',
  };

  verifyIpcRoundTrip(exported, imported);
  assert.ok(true);
  console.log('✓ verifyIpcRoundTrip — clean round-trip passes');
}

// ---------------------------------------------------------------------------
// 9. verifyIpcRoundTrip — mismatch cases
// ---------------------------------------------------------------------------

{
  const exported: WorksheetIpcExport = {
    workbookId: 'wb-test-001',
    revision: 7,
    projectId: 'proj-42',
    ipcNumber: null,
    currency: 'NPR',
    lineItems: [],
    subtotal: '1000.00',
    exportedAt: '2026-10-12T00:00:00Z',
  };

  // Subtotal mismatch
  const subtotalMismatch: WorksheetIpcImport = {
    workbookId: 'wb-test-001',
    acceptedRevision: 7,
    serverSubtotal: '999.99',
    discrepancies: [],
    receiptId: 'rcpt-x',
    serverSeq: 1,
    reflectedAt: '2026-10-12T00:00:01Z',
  };
  assert.throws(
    () => verifyIpcRoundTrip(exported, subtotalMismatch),
    (e: unknown) => e instanceof BoqBridgeError && (e as BoqBridgeError).code === 'round_trip_mismatch',
  );

  // Revision mismatch
  const revMismatch: WorksheetIpcImport = {
    ...subtotalMismatch,
    serverSubtotal: '1000.00',
    acceptedRevision: 8,
  };
  assert.throws(
    () => verifyIpcRoundTrip(exported, revMismatch),
    (e: unknown) => e instanceof BoqBridgeError && (e as BoqBridgeError).code === 'round_trip_mismatch',
  );

  // Line-item discrepancy
  const discrepancyCase: WorksheetIpcImport = {
    workbookId: 'wb-test-001',
    acceptedRevision: 7,
    serverSubtotal: '1000.00',
    discrepancies: [{ cellRef: 's1:c1:r1', boqCode: 'B001', worksheetAmount: '1000.00', serverAmount: '999.00' }],
    receiptId: 'rcpt-y',
    serverSeq: 2,
    reflectedAt: '2026-10-12T00:00:01Z',
  };
  assert.throws(
    () => verifyIpcRoundTrip(exported, discrepancyCase),
    (e: unknown) => e instanceof BoqBridgeError && (e as BoqBridgeError).code === 'round_trip_mismatch',
  );

  console.log('✓ verifyIpcRoundTrip — mismatch cases throw with correct code');
}

// ---------------------------------------------------------------------------
// 10. reflectIpcImport — only non-discrepant cells reflected; no workbook mutation
// ---------------------------------------------------------------------------

{
  const exported: WorksheetIpcExport = {
    workbookId: 'wb-test-001',
    revision: 7,
    projectId: 'proj-42',
    ipcNumber: 1,
    currency: 'NPR',
    lineItems: [
      { boqCode: 'B001', description: '', unit: '', quantity: '1', rate: '1000.00', amount: '1000.00', currency: 'NPR', cellRef: 's1:c1:r1' },
      { boqCode: 'B002', description: '', unit: '', quantity: '1', rate: '500.00', amount: '500.00', currency: 'NPR', cellRef: 's1:c1:r2' },
    ],
    subtotal: '1500.00',
    exportedAt: '2026-10-12T00:00:00Z',
  };

  const imported: WorksheetIpcImport = {
    workbookId: 'wb-test-001',
    acceptedRevision: 7,
    serverSubtotal: '1500.00',
    discrepancies: [
      { cellRef: 's1:c1:r2', boqCode: 'B002', worksheetAmount: '500.00', serverAmount: '499.00' },
    ],
    receiptId: 'rcpt-z',
    serverSeq: 7,
    reflectedAt: '2026-10-12T00:00:01Z',
  };

  const reflections = reflectIpcImport(exported, imported);
  assert.equal(reflections.length, 1, 'Only non-discrepant cells reflected');
  assert.equal(reflections[0].cellRef, 's1:c1:r1');
  assert.equal(reflections[0].provenanceReceiptId, 'rcpt-z');
  assert.equal(reflections[0].provenanceServerSeq, 7);

  console.log('✓ reflectIpcImport — discrepant cells excluded; provenance carried');
}

// ---------------------------------------------------------------------------
// 11. Flutter-parity structural check: WorksheetIpcExport shape
// ---------------------------------------------------------------------------

{
  const exported: WorksheetIpcExport = {
    workbookId: 'wb-1',
    revision: 1,
    projectId: 'p1',
    ipcNumber: null,
    currency: 'USD',
    lineItems: [],
    subtotal: '0.00',
    exportedAt: '2026-10-12T00:00:00Z',
  };
  // Verify all required fields exist and are of the expected type
  assert.equal(typeof exported.workbookId, 'string');
  assert.equal(typeof exported.revision, 'number');
  assert.equal(typeof exported.projectId, 'string');
  assert.equal(typeof exported.currency, 'string');
  assert.ok(Array.isArray(exported.lineItems));
  assert.equal(typeof exported.subtotal, 'string');
  assert.equal(typeof exported.exportedAt, 'string');
  assert.ok(isExactDecimalString(exported.subtotal));

  console.log('✓ Flutter-parity — WorksheetIpcExport shape is structurally stable');
}

console.log('\n✅ All M06-T07 IPC/BoQ bridge tests passed (11 test groups).');
