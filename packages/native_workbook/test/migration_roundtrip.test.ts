import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateV2ToV3, downgradeV3ToV2 } from '../src/migration.js';
import type { LegacyWorkbookV2 } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures/platform-parity/worksheet/templates');

test('standard_ipc_measurement.json v2 -> v3 -> v2 lossless round-trip', () => {
  const filePath = resolve(FIXTURES_DIR, 'standard_ipc_measurement.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);

  // 1. Migrate to v3
  const v3 = migrateV2ToV3(v2Fixture);
  assert.equal(v3.version, 3);
  assert.equal(v3.sheets.length, v2Fixture.sheets.length);
  assert.equal(v3.activeSheetId, v2Fixture.activeSheetId);
  assert.equal(v3.saveSyncStatus.localPersistence, 'saved');
  assert.equal(v3.saveSyncStatus.serverAcceptance, 'not_queued');

  const sheetV3 = v3.sheets[0];
  const sheetV2 = v2Fixture.sheets[0];

  assert.equal(sheetV3.id, sheetV2.id);
  assert.equal(sheetV3.title, sheetV2.title);
  assert.equal(sheetV3.rowCount, sheetV2.rowCount);
  assert.equal(sheetV3.colCount, sheetV2.colCount);

  // Verify cell counts
  const v2CellCount = Object.keys(sheetV2.cells).length;
  const v3CellCount = Object.keys(sheetV3.cells).length;
  assert.equal(v3CellCount, v2CellCount);

  // Verify formula cell locking contract (ADR-0016: formulas are locked)
  const formulaCell = Object.values(sheetV3.cells).find((c) => c.formula !== undefined);
  assert.ok(formulaCell, 'Must contain formula cells');
  assert.equal(formulaCell.protection.locked, true, 'Formula cell must be locked by default');

  // Verify quantity target domain metadata
  const qtyCell = Object.values(sheetV3.cells).find((c) => c.domainMetadata?.isQuantityTarget);
  assert.ok(qtyCell, 'Must preserve isQuantityTarget domain metadata');
  assert.ok(qtyCell.domainMetadata?.boqCode, 'Must preserve boqCode');

  // 2. Downgrade back to v2
  const v2Restored = downgradeV3ToV2(v3);
  assert.equal(v2Restored.version, 2);
  assert.equal(v2Restored.activeSheetId, v2Fixture.activeSheetId);
  assert.equal(v2Restored.sheets.length, v2Fixture.sheets.length);

  const restoredSheet = v2Restored.sheets[0];
  assert.equal(Object.keys(restoredSheet.cells).length, v2CellCount);

  // Compare every cell in original fixture
  for (const [key, origCell] of Object.entries(sheetV2.cells)) {
    const resCell = restoredSheet.cells[key];
    assert.ok(resCell, `Missing restored cell at ${key}`);
    assert.equal(resCell.value, origCell.value, `Value mismatch at ${key}`);
    assert.equal(resCell.formula, origCell.formula, `Formula mismatch at ${key}`);
    assert.equal(resCell.computed, origCell.computed, `Computed mismatch at ${key}`);
    assert.equal(resCell.bold, origCell.bold, `Bold mismatch at ${key}`);
    assert.equal(resCell.boqCode, origCell.boqCode, `boqCode mismatch at ${key}`);
    assert.equal(resCell.isQuantityTarget, origCell.isQuantityTarget, `isQuantityTarget mismatch at ${key}`);
  }
});

test('degenerate_calc_stress.json v2 -> v3 -> v2 round-trip', () => {
  const filePath = resolve(FIXTURES_DIR, 'degenerate_calc_stress.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);

  const v3 = migrateV2ToV3(v2Fixture);
  assert.equal(v3.version, 3);
  assert.ok(v3.metadata.isSynthetic);

  const v2Restored = downgradeV3ToV2(v3);
  assert.equal(v2Restored.version, 2);

  const sheetV2 = v2Fixture.sheets[0];
  const restoredSheet = v2Restored.sheets[0];

  assert.equal(Object.keys(restoredSheet.cells).length, Object.keys(sheetV2.cells).length);
  for (const [key, origCell] of Object.entries(sheetV2.cells)) {
    const resCell = restoredSheet.cells[key];
    assert.ok(resCell, `Missing restored cell at ${key}`);
    assert.equal(resCell.value, origCell.value, `Value mismatch at ${key}`);
    assert.equal(resCell.formula, origCell.formula, `Formula mismatch at ${key}`);
  }
});

test('sample_boq_1k.json 1000-row fixture v2 -> v3 -> v2 performance and fidelity', () => {
  const filePath = resolve(FIXTURES_DIR, 'sample_boq_1k.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);

  const start = Date.now();
  const v3 = migrateV2ToV3(v2Fixture);
  const migrateElapsed = Date.now() - start;

  assert.equal(v3.version, 3);
  assert.ok(v3.sheets[0].rowCount >= 1000);
  assert.ok(migrateElapsed < 500, `Migration of 1k BoQ rows must be fast (< 500ms), took ${migrateElapsed}ms`);

  const v2Restored = downgradeV3ToV2(v3);
  assert.equal(v2Restored.version, 2);
  assert.equal(
    Object.keys(v2Restored.sheets[0].cells).length,
    Object.keys(v2Fixture.sheets[0].cells).length
  );
});
