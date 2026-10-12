import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coordToA1,
  a1ToCoord,
  colIndexToLetters,
  lettersToColIndex,
  coordToIdentity,
  identityToCoord,
  formulaA1ToCanonical,
  formulaCanonicalToA1,
} from '../src/identity_map.js';
import type { SheetModel } from '../src/types.js';

test('colIndexToLetters and lettersToColIndex round-trip correctly', () => {
  const cases = [
    [0, 'A'],
    [1, 'B'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
  ] as const;

  for (const [idx, letters] of cases) {
    assert.equal(colIndexToLetters(idx), letters);
    assert.equal(lettersToColIndex(letters), idx);
  }
});

test('coordToA1 and a1ToCoord parse and format absolute and relative references', () => {
  assert.equal(coordToA1(0, 0), 'A1');
  assert.equal(coordToA1(3, 7), 'H4');
  assert.equal(coordToA1(3, 7, true, true), '$H$4');
  assert.equal(coordToA1(3, 7, false, true), '$H4');
  assert.equal(coordToA1(3, 7, true, false), 'H$4');

  const parsed1 = a1ToCoord('H4');
  assert.equal(parsed1.row, 3);
  assert.equal(parsed1.col, 7);
  assert.equal(parsed1.rowAbsolute, false);
  assert.equal(parsed1.colAbsolute, false);

  const parsed2 = a1ToCoord('$H$4');
  assert.equal(parsed2.row, 3);
  assert.equal(parsed2.col, 7);
  assert.equal(parsed2.rowAbsolute, true);
  assert.equal(parsed2.colAbsolute, true);

  const parsed3 = a1ToCoord('$AA$100');
  assert.equal(parsed3.row, 99);
  assert.equal(parsed3.col, 26);
  assert.equal(parsed3.rowAbsolute, true);
  assert.equal(parsed3.colAbsolute, true);
});

test('stable identity resolution and reverse mapping', () => {
  const sheet: SheetModel = {
    id: 's1',
    title: 'Sheet1',
    rowCount: 5,
    colCount: 5,
    rows: [
      { id: 'r_0', index: 0 },
      { id: 'r_1', index: 1 },
      { id: 'r_2', index: 2 },
      { id: 'r_3', index: 3 },
      { id: 'r_4', index: 4 },
    ],
    cols: [
      { id: 'c_0', index: 0 },
      { id: 'c_1', index: 1 },
      { id: 'c_2', index: 2 },
      { id: 'c_3', index: 3 },
      { id: 'c_4', index: 4 },
    ],
    cells: {},
  };

  const id = coordToIdentity(sheet, 2, 3);
  assert.deepEqual(id, { rowId: 'r_2', colId: 'c_3', sheetId: 's1' });

  const coord = identityToCoord(sheet, 'r_2', 'c_3');
  assert.deepEqual(coord, { row: 2, col: 3 });
});

test('formulaA1ToCanonical and formulaCanonicalToA1 are 100% reversible', () => {
  const sheet: SheetModel = {
    id: 's1',
    title: 'Measurements',
    rowCount: 10,
    colCount: 10,
    rows: Array.from({ length: 10 }, (_, i) => ({ id: `row_${i}`, index: i })),
    cols: Array.from({ length: 10 }, (_, i) => ({ id: `col_${i}`, index: i })),
    cells: {},
  };

  const formulas = [
    '=D4*E4*F4*G4',
    '=SUM(A1:B5) + 100',
    '=$D$4 * E$4 + $F4',
    '=ROUND(D4 * 1.13, 2)',
    '=IF(D4 > 0, E4, 0)',
  ];

  for (const formula of formulas) {
    const canonical = formulaA1ToCanonical(formula, sheet);
    assert.notEqual(canonical, formula, 'Canonical must encode stable tokens');
    const restored = formulaCanonicalToA1(canonical, sheet);
    assert.equal(restored, formula, `Formula must be reversibly restored: ${formula}`);
  }
});
