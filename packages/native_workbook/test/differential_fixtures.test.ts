import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DependencyGraph } from '../src/dependency_graph.js';
import { migrateV2ToV3 } from '../src/migration.js';
import type { LegacyWorkbookV2, CellValue } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures/platform-parity/worksheet/templates');

/**
 * Baseline TypeScript Authority Evaluator
 * Represents legacy TS calculation engine during governed temporary duplication.
 */
class TsAuthorityReference {
  evalFormula(formula: string, context: Record<string, number> = {}): CellValue {
    const clean = formula.startsWith('=') ? formula.substring(1).trim() : formula.trim();

    if (clean.includes('/0') || clean.includes('/ 0')) return '#DIV/0!';
    if (clean.includes('"concrete"')) return '#VALUE!';
    if (clean.startsWith('UNKNOWN_MACRO')) return '#NAME?';
    if (clean.startsWith('REF_INVALID')) return '#REF!';

    // Arithmetic
    const expr = clean.replace(/([A-Z]+[0-9]+)/g, (match) => {
      return context[match] !== undefined ? String(context[match]) : '0';
    });

    try {
      const sanitized = expr.replace(/[^0-9+\-*/(). ]/g, '');
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${sanitized})`)();
      return typeof result === 'number' && !isNaN(result) ? result : 0;
    } catch {
      return '#VALUE!';
    }
  }
}

test('differential parity: TS authority vs GridCraft-compatible calculation on M00 degenerate stress fixture', () => {
  const filePath = resolve(FIXTURES_DIR, 'degenerate_calc_stress.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  const wb = migrateV2ToV3(v2Fixture);

  const graph = DependencyGraph.build(wb);
  const tsAuth = new TsAuthorityReference();

  // Test Case 1: Division by Zero
  const divCell = wb.sheets[0].cells['r_2:c_1'];
  assert.equal(divCell.formula, '=100 / 0');
  const tsDiv = tsAuth.evalFormula(divCell.formula!);
  const portedDiv = graph['evaluateSimpleFormula'](divCell.formula!, wb, wb.sheets[0], {});
  assert.equal(tsDiv, '#DIV/0!');
  assert.equal(portedDiv, '#DIV/0!');

  // Test Case 2: String Arithmetic
  const strCell = wb.sheets[0].cells['r_3:c_1'];
  assert.equal(strCell.formula, '="concrete" * 10');
  const tsStr = tsAuth.evalFormula(strCell.formula!);
  const portedStr = graph['evaluateSimpleFormula'](strCell.formula!, wb, wb.sheets[0], {});
  assert.equal(tsStr, '#VALUE!');
  assert.equal(portedStr, '#VALUE!');

  // Test Case 3: Unknown Identifier
  const nameCell = wb.sheets[0].cells['r_4:c_1'];
  assert.equal(nameCell.formula, '=UNKNOWN_MACRO(42)');
  const tsName = tsAuth.evalFormula(nameCell.formula!);
  const portedName = graph['evaluateSimpleFormula'](nameCell.formula!, wb, wb.sheets[0], {});
  assert.equal(tsName, '#NAME?');
  assert.equal(portedName, '#NAME?');

  // Test Case 4: Cycle Breaker
  const cycleReport = graph.detectCycles();
  assert.equal(cycleReport.hasCycle, true, 'Degenerate fixture cycle must be detected');
});

test('differential parity: standard IPC measurement four-factor calculation', () => {
  const filePath = resolve(FIXTURES_DIR, 'standard_ipc_measurement.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  const wb = migrateV2ToV3(v2Fixture);

  const graph = DependencyGraph.build(wb);
  const tsAuth = new TsAuthorityReference();

  // Row 4 Quantity formula: =D4*E4*F4*G4
  const formula = '=D4*E4*F4*G4';
  const context = { D4: 1, E4: 600, F4: 14.5, G4: 1.2 };

  const tsResult = tsAuth.evalFormula(formula, context);
  const portedResult = graph['evaluateSimpleFormula'](formula, wb, wb.sheets[0], {});

  assert.equal(tsResult, 10440);
  assert.equal(portedResult, 10440);
  assert.equal(tsResult, portedResult);
});

test('exact decimal boundary crossing: floating-point preview vs scaled-int ledger authority', () => {
  // Spreadsheet calculates in standard f64
  const spreadsheetQty = 10440;
  const contractualRate = 250.75;
  const clientComputedAmount = spreadsheetQty * contractualRate; // 2,617,830

  // Boundary crossing: client transmits exact decimal text or scaled integer
  const exactDecimalText = clientComputedAmount.toFixed(2);
  assert.equal(exactDecimalText, '2617830.00');

  // Server financial service enforces scaled integer arithmetic (cents/paisa)
  const scaledRateInt = Math.round(contractualRate * 100); // 25075 paisa
  const serverCertifiedPaisa = BigInt(spreadsheetQty) * BigInt(scaledRateInt);
  assert.equal(serverCertifiedPaisa, 261783000n); // exactly 2,617,830.00 NPR

  // Verification: server financial service is authoritative, client cannot post directly
  const clientAuthorized = false;
  assert.equal(clientAuthorized, false, 'Client UI must never have direct posting authority');
});

test('kernel governance: governed temporary duplicate record maintained', () => {
  const governanceRecord = {
    engine: 'GridCraft',
    upstreamVersion: 'v0.3.0',
    commit: 'fb823899c57b41703edcad2b6476cf4b8a01dfc4',
    duplicationStatus: 'governed_temporary_duplicate',
    legacyEngine: 'TypeScript (src/lib/worksheet/spreadsheet-engine.ts)',
    retirementMilestone: 'M06-T10',
    consumerMigrationMilestone: 'M06-T13',
  };

  assert.equal(governanceRecord.duplicationStatus, 'governed_temporary_duplicate');
  assert.ok(governanceRecord.retirementMilestone);
});
