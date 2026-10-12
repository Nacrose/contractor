import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormulaRegistry, defaultFormulaRegistry } from '../src/formula_registry.js';

test('standard formula registry provides required function taxonomy', () => {
  const expectedCategories = ['math', 'logical', 'text', 'datetime', 'lookup'];
  for (const cat of expectedCategories) {
    const fns = defaultFormulaRegistry.list(cat as any);
    assert.ok(fns.length > 0, `Category "${cat}" must have functions registered`);
  }

  // Key math functions
  for (const name of ['SUM', 'PRODUCT', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'ABS', 'INT', 'MOD', 'SQRT', 'POWER', 'MAX', 'MIN', 'AVERAGE', 'COUNT', 'COUNTA', 'SUBTOTAL', 'SUMPRODUCT']) {
    assert.ok(defaultFormulaRegistry.has(name), `Missing math function: ${name}`);
  }

  // Key logical functions
  for (const name of ['IF', 'IFS', 'AND', 'OR', 'NOT', 'IFERROR', 'SWITCH']) {
    assert.ok(defaultFormulaRegistry.has(name), `Missing logical function: ${name}`);
  }

  // Key text functions
  for (const name of ['CONCAT', 'CONCATENATE', 'TEXT', 'LEFT', 'RIGHT', 'MID', 'LEN', 'TRIM', 'UPPER', 'LOWER']) {
    assert.ok(defaultFormulaRegistry.has(name), `Missing text function: ${name}`);
  }

  // Key date functions
  for (const name of ['DATE', 'YEAR', 'MONTH', 'DAY', 'TODAY', 'NOW', 'EDATE']) {
    assert.ok(defaultFormulaRegistry.has(name), `Missing date function: ${name}`);
  }
});

test('volatility semantics correctly distinguish volatile vs deterministic functions', () => {
  // Volatile functions
  assert.equal(defaultFormulaRegistry.isVolatile('NOW'), true);
  assert.equal(defaultFormulaRegistry.isVolatile('TODAY'), true);
  assert.equal(defaultFormulaRegistry.isVolatile('RAND'), true);

  // Deterministic functions
  assert.equal(defaultFormulaRegistry.isVolatile('SUM'), false);
  assert.equal(defaultFormulaRegistry.isVolatile('ROUND'), false);
  assert.equal(defaultFormulaRegistry.isVolatile('IF'), false);
  assert.equal(defaultFormulaRegistry.isVolatile('VLOOKUP'), false);
});

test('argument bound validation enforces function signatures', () => {
  // ROUND requires exactly 2 arguments
  assert.equal(defaultFormulaRegistry.validateCall('ROUND', 2).valid, true);
  assert.equal(defaultFormulaRegistry.validateCall('ROUND', 1).valid, false);
  assert.equal(defaultFormulaRegistry.validateCall('ROUND', 3).valid, false);

  // NOW takes 0 arguments
  assert.equal(defaultFormulaRegistry.validateCall('NOW', 0).valid, true);
  assert.equal(defaultFormulaRegistry.validateCall('NOW', 1).valid, false);

  // SUM is variadic with minArgs = 1
  assert.equal(defaultFormulaRegistry.validateCall('SUM', 1).valid, true);
  assert.equal(defaultFormulaRegistry.validateCall('SUM', 10).valid, true);
  assert.equal(defaultFormulaRegistry.validateCall('SUM', 0).valid, false);

  // Unknown function
  assert.equal(defaultFormulaRegistry.validateCall('NONEXISTENT_FN', 1).valid, false);
});

test('custom function registration extends registry without silent normalization', () => {
  const registry = new FormulaRegistry();

  registry.register({
    name: 'CONTRACTOR_TAX_NEPAL',
    category: 'custom',
    minArgs: 1,
    maxArgs: 2,
    isVolatile: false,
    description: 'Computes VAT and local withholding tax in NPR',
    signature: 'CONTRACTOR_TAX_NEPAL(amount, [tax_type])',
  });

  assert.equal(registry.has('CONTRACTOR_TAX_NEPAL'), true);
  assert.equal(registry.isVolatile('CONTRACTOR_TAX_NEPAL'), false);
  assert.equal(registry.validateCall('CONTRACTOR_TAX_NEPAL', 1).valid, true);
  assert.equal(registry.validateCall('CONTRACTOR_TAX_NEPAL', 2).valid, true);
  assert.equal(registry.validateCall('CONTRACTOR_TAX_NEPAL', 3).valid, false);
});
