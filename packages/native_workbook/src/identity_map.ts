/**
 * Reversible Coordinate and Stable Identity Mapping Engine (M06-T02).
 * Converts between visual A1 notation and persistent collaboration identities
 * without changing displayed formula behavior.
 */

import type { SheetModel } from './types.js';

export interface CellCoord {
  row: number; // 0-indexed
  col: number; // 0-indexed
}

export interface CellIdentity {
  rowId: string;
  colId: string;
  sheetId?: string;
}

/**
 * Converts a 0-indexed column number to Excel column letters (0 -> "A", 26 -> "AA").
 */
export function colIndexToLetters(col: number): string {
  if (col < 0) throw new Error(`Invalid column index: ${col}`);
  let letters = '';
  let temp = col;
  while (temp >= 0) {
    letters = String.fromCharCode((temp % 26) + 65) + letters;
    temp = Math.floor(temp / 26) - 1;
  }
  return letters;
}

/**
 * Converts Excel column letters to a 0-indexed column number ("A" -> 0, "AA" -> 26).
 */
export function lettersToColIndex(letters: string): number {
  const upper = letters.toUpperCase();
  let col = 0;
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code < 65 || code > 90) {
      throw new Error(`Invalid column letters: ${letters}`);
    }
    col = col * 26 + (code - 64);
  }
  return col - 1;
}

/**
 * Converts 0-indexed row and col to A1 notation (0, 0 -> "A1", 3, 7 -> "H4").
 */
export function coordToA1(row: number, col: number, rowAbsolute = false, colAbsolute = false): string {
  const colStr = (colAbsolute ? '$' : '') + colIndexToLetters(col);
  const rowStr = (rowAbsolute ? '$' : '') + String(row + 1);
  return `${colStr}${rowStr}`;
}

/**
 * Parses an A1 reference into 0-indexed row and col plus absolute flags.
 */
export function a1ToCoord(a1: string): {
  row: number;
  col: number;
  rowAbsolute: boolean;
  colAbsolute: boolean;
} {
  const match = a1.trim().match(/^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/);
  if (!match) {
    throw new Error(`Invalid A1 reference: "${a1}"`);
  }
  const colAbsolute = match[1] === '$';
  const colLetters = match[2];
  const rowAbsolute = match[3] === '$';
  const rowNum = parseInt(match[4], 10);

  return {
    row: rowNum - 1,
    col: lettersToColIndex(colLetters),
    rowAbsolute,
    colAbsolute,
  };
}

/**
 * Resolves visual (rowIdx, colIdx) to stable (rowId, colId) on a sheet.
 */
export function coordToIdentity(sheet: SheetModel, rowIdx: number, colIdx: number): CellIdentity | null {
  const row = sheet.rows.find((r) => r.index === rowIdx);
  const col = sheet.cols.find((c) => c.index === colIdx);
  if (!row || !col) return null;
  return {
    rowId: row.id,
    colId: col.id,
    sheetId: sheet.id,
  };
}

/**
 * Resolves stable (rowId, colId) back to visual 0-indexed (rowIdx, colIdx).
 */
export function identityToCoord(sheet: SheetModel, rowId: string, colId: string): CellCoord | null {
  const row = sheet.rows.find((r) => r.id === rowId);
  const col = sheet.cols.find((c) => c.id === colId);
  if (!row || !col) return null;
  return {
    row: row.index,
    col: col.index,
  };
}

/**
 * Resolves an A1 reference on a sheet to stable (rowId, colId).
 */
export function a1ToIdentity(sheet: SheetModel, a1: string): CellIdentity | null {
  const coord = a1ToCoord(a1);
  return coordToIdentity(sheet, coord.row, coord.col);
}

/**
 * Formats a stable (rowId, colId) into visual A1 reference on a sheet.
 */
export function identityToA1(
  sheet: SheetModel,
  rowId: string,
  colId: string,
  rowAbsolute = false,
  colAbsolute = false
): string | null {
  const coord = identityToCoord(sheet, rowId, colId);
  if (!coord) return null;
  return coordToA1(coord.row, coord.col, rowAbsolute, colAbsolute);
}

// ---------------------------------------------------------------------------
// Canonical Formula Transformation (Reversible at read time)
// Canonical token format: `@{sheetId!colAbs?colId$rowAbs?rowId}`
// Example: `=D4*E4` on sheet "s1" where D->c_3, 4->r_3, E->c_4
// Canonical: `={s1!c_3$r_3}*{s1!c_4$r_3}`
// ---------------------------------------------------------------------------

const CELL_REF_REGEX = /(?:('?[^'!]+'?)!)?(\$?)([A-Za-z]+)(\$?)([0-9]+)/g;
const CANONICAL_TOKEN_REGEX = /@\{([^!]+)!(\$?)([^$]+)(\$?)(\$?)([^}]+)\}/g;

/**
 * Converts an A1 formula into a canonical formula referencing stable IDs.
 */
export function formulaA1ToCanonical(
  formula: string,
  activeSheet: SheetModel,
  getSheetByTitle: (title: string) => SheetModel | undefined = () => undefined
): string {
  if (!formula.startsWith('=')) return formula;

  return formula.replace(
    CELL_REF_REGEX,
    (match, sheetPrefix, colDollar, colLetters, rowDollar, rowStr) => {
      let targetSheet = activeSheet;
      let sheetName = '';
      if (sheetPrefix) {
        sheetName = sheetPrefix.replace(/^'|'$/g, '');
        const found = getSheetByTitle(sheetName);
        if (found) {
          targetSheet = found;
        } else if (sheetName === activeSheet.title) {
          targetSheet = activeSheet;
        }
      }

      const rowIdx = parseInt(rowStr, 10) - 1;
      const colIdx = lettersToColIndex(colLetters);
      const ident = coordToIdentity(targetSheet, rowIdx, colIdx);

      if (!ident) {
        // If coordinate exceeds registered rows/cols, keep match
        return match;
      }

      const cAbs = colDollar === '$' ? '$' : '';
      const rAbs = rowDollar === '$' ? '$' : '';
      return `@{${targetSheet.id}!${cAbs}${ident.colId}$${rAbs}${ident.rowId}}`;
    }
  );
}

/**
 * Converts a canonical identity formula back into an A1 formula.
 * This is 100% reversible at read time.
 */
export function formulaCanonicalToA1(
  canonicalFormula: string,
  activeSheet: SheetModel,
  getSheetById: (id: string) => SheetModel | undefined = () => undefined
): string {
  if (!canonicalFormula.startsWith('=')) return canonicalFormula;

  return canonicalFormula.replace(
    CANONICAL_TOKEN_REGEX,
    (match, sheetId, colDollar, colId, _dollarSep, rowDollar, rowId) => {
      let targetSheet = activeSheet;
      if (sheetId !== activeSheet.id) {
        const found = getSheetById(sheetId);
        if (found) targetSheet = found;
      }

      const coord = identityToCoord(targetSheet, rowId, colId);
      if (!coord) {
        return '#REF!';
      }

      const a1 = coordToA1(
        coord.row,
        coord.col,
        rowDollar === '$',
        colDollar === '$'
      );

      if (targetSheet.id !== activeSheet.id) {
        const titleNeedsQuotes = /[\s-]/.test(targetSheet.title);
        const titlePart = titleNeedsQuotes
          ? `'${targetSheet.title}'`
          : targetSheet.title;
        return `${titlePart}!${a1}`;
      }
      return a1;
    }
  );
}
