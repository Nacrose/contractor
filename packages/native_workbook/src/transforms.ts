/**
 * Structure Transforms and Formula Reference Rewriter (M06-T02).
 * Implements deterministic reference transformation rules identical for
 * server replay and client preview during row, column, and sheet operations.
 */

import type {
  WorkbookModel,
  SheetModel,
  RowModel,
  ColModel,
} from './types.js';
import {
  coordToA1,
  lettersToColIndex,
  formulaA1ToCanonical,
} from './identity_map.js';

export interface StructureTransformResult {
  workbook: WorkbookModel;
  affectedCellCount: number;
  refErrorsIntroduced: number;
}

export type StructureOperation =
  | { type: 'insert_rows'; sheetId: string; atIndex: number; count: number }
  | { type: 'delete_rows'; sheetId: string; atIndex: number; count: number }
  | { type: 'move_rows'; sheetId: string; fromIndex: number; toIndex: number; count: number }
  | { type: 'insert_cols'; sheetId: string; atIndex: number; count: number }
  | { type: 'delete_cols'; sheetId: string; atIndex: number; count: number }
  | { type: 'move_cols'; sheetId: string; fromIndex: number; toIndex: number; count: number }
  | { type: 'rename_sheet'; sheetId: string; oldTitle: string; newTitle: string }
  | { type: 'delete_sheet'; sheetId: string; sheetTitle: string };

/**
 * Unified regex that matches:
 * 1. String literals: "..." (preserved as-is)
 * 2. Ranges and single cell references with optional quoted or unquoted sheet prefix.
 */
const FORMULA_TOKEN_REGEX =
  /("[^"]*")|(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7}))?/g;

/**
 * Rewrites a formula's cell references given a structural operation.
 * Guaranteed to be pure and deterministic for both client preview and server replay.
 */
export function rewriteFormulaReferences(
  formula: string,
  op: StructureOperation,
  contextSheetTitle: string
): { formula: string; hasRefError: boolean } {
  if (!formula.startsWith('=')) {
    return { formula, hasRefError: false };
  }

  let hasRefError = false;

  // 1. Handle sheet rename directly
  if (op.type === 'rename_sheet') {
    const quotePattern = (title: string) => (/[\s-]/.test(title) ? `'${title}'` : title);
    const newQuoted = quotePattern(op.newTitle);

    let updated = formula;
    const sheetRefRegex = new RegExp(
      `(?:'${escapeRegExp(op.oldTitle)}'|\\b${escapeRegExp(op.oldTitle)})!`,
      'g'
    );
    updated = updated.replace(sheetRefRegex, `${newQuoted}!`);
    return { formula: updated, hasRefError: false };
  }

  // 2. Handle sheet deletion: references to that sheet become #REF!
  if (op.type === 'delete_sheet') {
    const sheetRefRegex = new RegExp(
      `(?:'${escapeRegExp(op.sheetTitle)}'|\\b${escapeRegExp(op.sheetTitle)})!(?:\\$?[A-Za-z]+\\$?[0-9]+(?::\\$?[A-Za-z]+\\$?[0-9]+)?)`,
      'g'
    );
    let updated = formula.replace(sheetRefRegex, () => {
      hasRefError = true;
      return '#REF!';
    });
    return { formula: updated, hasRefError };
  }

  const targetSheetTitle = (op as any)._targetSheetTitle || contextSheetTitle;

  const isTargetSheet = (sheetName?: string) => {
    if (!sheetName) return contextSheetTitle === targetSheetTitle;
    return sheetName === targetSheetTitle;
  };

  const transformed = formula.replace(
    FORMULA_TOKEN_REGEX,
    (
      match,
      stringLiteral,
      quotedSheet,
      unquotedSheet,
      c1Dollar,
      c1Letters,
      r1Dollar,
      r1Str,
      c2Dollar,
      c2Letters,
      r2Dollar,
      r2Str
    ) => {
      // If inside string literal, preserve exactly
      if (stringLiteral) return stringLiteral;

      const sheetName = quotedSheet || unquotedSheet;
      if (!isTargetSheet(sheetName)) {
        return match;
      }

      const isRange = c2Letters !== undefined && r2Str !== undefined;

      if (isRange) {
        // Range rewriting
        let r1 = parseInt(r1Str, 10) - 1;
        let r2 = parseInt(r2Str, 10) - 1;
        let c1 = lettersToColIndex(c1Letters);
        let c2 = lettersToColIndex(c2Letters);

        let minR = Math.min(r1, r2);
        let maxR = Math.max(r1, r2);
        let minC = Math.min(c1, c2);
        let maxC = Math.max(c1, c2);

        if (op.type === 'insert_rows') {
          if (op.atIndex <= minR) {
            minR += op.count;
            maxR += op.count;
          } else if (op.atIndex <= maxR + 1) {
            maxR += op.count;
          }
        } else if (op.type === 'delete_rows') {
          const delStart = op.atIndex;
          const delEnd = op.atIndex + op.count - 1;

          if (minR >= delStart && maxR <= delEnd) {
            hasRefError = true;
            return '#REF!';
          }

          if (maxR < delStart) {
            // Unaffected
          } else if (minR > delEnd) {
            minR -= op.count;
            maxR -= op.count;
          } else {
            if (minR >= delStart && minR <= delEnd) {
              minR = delStart;
              maxR = Math.max(delStart, maxR - op.count);
            } else if (maxR >= delStart && maxR <= delEnd) {
              maxR = delStart - 1;
            } else {
              maxR -= op.count;
            }
            if (minR > maxR) {
              hasRefError = true;
              return '#REF!';
            }
          }
        } else if (op.type === 'insert_cols') {
          if (op.atIndex <= minC) {
            minC += op.count;
            maxC += op.count;
          } else if (op.atIndex <= maxC + 1) {
            maxC += op.count;
          }
        } else if (op.type === 'delete_cols') {
          const delStart = op.atIndex;
          const delEnd = op.atIndex + op.count - 1;

          if (minC >= delStart && maxC <= delEnd) {
            hasRefError = true;
            return '#REF!';
          }

          if (maxC < delStart) {
            // Unaffected
          } else if (minC > delEnd) {
            minC -= op.count;
            maxC -= op.count;
          } else {
            if (minC >= delStart && minC <= delEnd) {
              minC = delStart;
              maxC = Math.max(delStart, maxC - op.count);
            } else if (maxC >= delStart && maxC <= delEnd) {
              maxC = delStart - 1;
            } else {
              maxC -= op.count;
            }
            if (minC > maxC) {
              hasRefError = true;
              return '#REF!';
            }
          }
        }

        const p1 = coordToA1(minR, minC, r1Dollar === '$', c1Dollar === '$');
        const p2 = coordToA1(maxR, maxC, r2Dollar === '$', c2Dollar === '$');
        const prefix = sheetName ? (quotedSheet ? `'${quotedSheet}'!` : `${sheetName}!`) : '';
        return `${prefix}${p1}:${p2}`;
      } else {
        // Single cell reference rewriting
        let r = parseInt(r1Str, 10) - 1;
        let c = lettersToColIndex(c1Letters);

        if (op.type === 'insert_rows') {
          if (r >= op.atIndex) {
            r += op.count;
          }
        } else if (op.type === 'delete_rows') {
          const delStart = op.atIndex;
          const delEnd = op.atIndex + op.count - 1;
          if (r >= delStart && r <= delEnd) {
            hasRefError = true;
            return '#REF!';
          }
          if (r > delEnd) {
            r -= op.count;
          }
        } else if (op.type === 'move_rows') {
          const moveStart = op.fromIndex;
          const moveEnd = op.fromIndex + op.count - 1;
          if (r >= moveStart && r <= moveEnd) {
            r += op.toIndex - op.fromIndex;
          } else if (op.toIndex > op.fromIndex && r > moveEnd && r <= op.toIndex) {
            r -= op.count;
          } else if (op.toIndex < op.fromIndex && r >= op.toIndex && r < moveStart) {
            r += op.count;
          }
        } else if (op.type === 'insert_cols') {
          if (c >= op.atIndex) {
            c += op.count;
          }
        } else if (op.type === 'delete_cols') {
          const delStart = op.atIndex;
          const delEnd = op.atIndex + op.count - 1;
          if (c >= delStart && c <= delEnd) {
            hasRefError = true;
            return '#REF!';
          }
          if (c > delEnd) {
            c -= op.count;
          }
        } else if (op.type === 'move_cols') {
          const moveStart = op.fromIndex;
          const moveEnd = op.fromIndex + op.count - 1;
          if (c >= moveStart && c <= moveEnd) {
            c += op.toIndex - op.fromIndex;
          } else if (op.toIndex > op.fromIndex && c > moveEnd && c <= op.toIndex) {
            c -= op.count;
          } else if (op.toIndex < op.fromIndex && c >= op.toIndex && c < moveStart) {
            c += op.count;
          }
        }

        const a1 = coordToA1(r, c, r1Dollar === '$', c1Dollar === '$');
        const prefix = sheetName ? (quotedSheet ? `'${quotedSheet}'!` : `${sheetName}!`) : '';
        return `${prefix}${a1}`;
      }
    }
  );

  return { formula: transformed, hasRefError };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inserts rows into a sheet and updates workbook formulas.
 */
export function insertRows(
  workbook: WorkbookModel,
  sheetId: string,
  atIndex: number,
  count = 1
): StructureTransformResult {
  const sheet = workbook.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);

  // 1. Shift row indices
  for (const row of sheet.rows) {
    if (row.index >= atIndex) {
      row.index += count;
    }
  }

  // 2. Allocate new row models
  const newRows: RowModel[] = [];
  for (let i = 0; i < count; i++) {
    newRows.push({
      id: `r_ins_${Date.now()}_${i}`,
      index: atIndex + i,
    });
  }
  sheet.rows.push(...newRows);
  sheet.rows.sort((a, b) => a.index - b.index);
  sheet.rowCount += count;

  // 3. Rewrite all formulas across the workbook
  const op: StructureOperation & { _targetSheetTitle: string } = {
    type: 'insert_rows',
    sheetId,
    atIndex,
    count,
    _targetSheetTitle: sheet.title,
  };

  return applyFormulaRewrites(workbook, op);
}

/**
 * Deletes rows from a sheet and updates workbook formulas.
 */
export function deleteRows(
  workbook: WorkbookModel,
  sheetId: string,
  atIndex: number,
  count = 1
): StructureTransformResult {
  const sheet = workbook.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);

  const delStart = atIndex;
  const delEnd = atIndex + count - 1;

  // 1. Identify deleted row IDs
  const deletedRowIds = new Set<string>();
  for (const row of sheet.rows) {
    if (row.index >= delStart && row.index <= delEnd) {
      deletedRowIds.add(row.id);
    }
  }

  // 2. Remove cells belonging to deleted rows
  for (const cellKey of Object.keys(sheet.cells)) {
    const cell = sheet.cells[cellKey];
    if (deletedRowIds.has(cell.rowId)) {
      delete sheet.cells[cellKey];
    }
  }

  // 3. Remove rows and re-index remaining
  sheet.rows = sheet.rows.filter((r) => !deletedRowIds.has(r.id));
  for (const row of sheet.rows) {
    if (row.index > delEnd) {
      row.index -= count;
    }
  }
  sheet.rows.sort((a, b) => a.index - b.index);
  sheet.rowCount = Math.max(0, sheet.rowCount - count);

  // 4. Rewrite all formulas across the workbook
  const op: StructureOperation & { _targetSheetTitle: string } = {
    type: 'delete_rows',
    sheetId,
    atIndex,
    count,
    _targetSheetTitle: sheet.title,
  };

  return applyFormulaRewrites(workbook, op);
}

/**
 * Moves rows within a sheet and updates workbook formulas.
 */
export function moveRows(
  workbook: WorkbookModel,
  sheetId: string,
  fromIndex: number,
  toIndex: number,
  count = 1
): StructureTransformResult {
  const sheet = workbook.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);

  // Re-index rows
  const moveStart = fromIndex;
  const moveEnd = fromIndex + count - 1;
  const shift = toIndex - fromIndex;

  for (const row of sheet.rows) {
    if (row.index >= moveStart && row.index <= moveEnd) {
      row.index += shift;
    } else if (toIndex > fromIndex && row.index > moveEnd && row.index <= toIndex) {
      row.index -= count;
    } else if (toIndex < fromIndex && row.index >= toIndex && row.index < moveStart) {
      row.index += count;
    }
  }
  sheet.rows.sort((a, b) => a.index - b.index);

  const op: StructureOperation & { _targetSheetTitle: string } = {
    type: 'move_rows',
    sheetId,
    fromIndex,
    toIndex,
    count,
    _targetSheetTitle: sheet.title,
  };

  return applyFormulaRewrites(workbook, op);
}

/**
 * Inserts columns into a sheet and updates workbook formulas.
 */
export function insertCols(
  workbook: WorkbookModel,
  sheetId: string,
  atIndex: number,
  count = 1
): StructureTransformResult {
  const sheet = workbook.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);

  for (const col of sheet.cols) {
    if (col.index >= atIndex) {
      col.index += count;
    }
  }

  const newCols: ColModel[] = [];
  for (let i = 0; i < count; i++) {
    newCols.push({
      id: `c_ins_${Date.now()}_${i}`,
      index: atIndex + i,
    });
  }
  sheet.cols.push(...newCols);
  sheet.cols.sort((a, b) => a.index - b.index);
  sheet.colCount += count;

  const op: StructureOperation & { _targetSheetTitle: string } = {
    type: 'insert_cols',
    sheetId,
    atIndex,
    count,
    _targetSheetTitle: sheet.title,
  };

  return applyFormulaRewrites(workbook, op);
}

/**
 * Deletes columns from a sheet and updates workbook formulas.
 */
export function deleteCols(
  workbook: WorkbookModel,
  sheetId: string,
  atIndex: number,
  count = 1
): StructureTransformResult {
  const sheet = workbook.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);

  const delStart = atIndex;
  const delEnd = atIndex + count - 1;

  const deletedColIds = new Set<string>();
  for (const col of sheet.cols) {
    if (col.index >= delStart && col.index <= delEnd) {
      deletedColIds.add(col.id);
    }
  }

  for (const cellKey of Object.keys(sheet.cells)) {
    const cell = sheet.cells[cellKey];
    if (deletedColIds.has(cell.colId)) {
      delete sheet.cells[cellKey];
    }
  }

  sheet.cols = sheet.cols.filter((c) => !deletedColIds.has(c.id));
  for (const col of sheet.cols) {
    if (col.index > delEnd) {
      col.index -= count;
    }
  }
  sheet.cols.sort((a, b) => a.index - b.index);
  sheet.colCount = Math.max(0, sheet.colCount - count);

  const op: StructureOperation & { _targetSheetTitle: string } = {
    type: 'delete_cols',
    sheetId,
    atIndex,
    count,
    _targetSheetTitle: sheet.title,
  };

  return applyFormulaRewrites(workbook, op);
}

/**
 * Renames a sheet and updates all 3D cross-sheet references across the workbook.
 */
export function renameSheet(
  workbook: WorkbookModel,
  sheetId: string,
  newTitle: string
): StructureTransformResult {
  const sheet = workbook.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);

  const oldTitle = sheet.title;
  sheet.title = newTitle;

  const op: StructureOperation = {
    type: 'rename_sheet',
    sheetId,
    oldTitle,
    newTitle,
  };

  return applyFormulaRewrites(workbook, op);
}

/**
 * Deletes a sheet and turns all references pointing to it into #REF!.
 */
export function deleteSheet(
  workbook: WorkbookModel,
  sheetId: string
): StructureTransformResult {
  const sheetIdx = workbook.sheets.findIndex((s) => s.id === sheetId);
  if (sheetIdx === -1) throw new Error(`Sheet not found: ${sheetId}`);

  const sheet = workbook.sheets[sheetIdx];
  const sheetTitle = sheet.title;
  workbook.sheets.splice(sheetIdx, 1);

  if (workbook.activeSheetId === sheetId && workbook.sheets.length > 0) {
    workbook.activeSheetId = workbook.sheets[0].id;
  }

  const op: StructureOperation = {
    type: 'delete_sheet',
    sheetId,
    sheetTitle,
  };

  return applyFormulaRewrites(workbook, op);
}

function applyFormulaRewrites(
  workbook: WorkbookModel,
  op: StructureOperation
): StructureTransformResult {
  let affectedCellCount = 0;
  let refErrorsIntroduced = 0;

  for (const sheet of workbook.sheets) {
    for (const cell of Object.values(sheet.cells)) {
      if (cell.formula) {
        const res = rewriteFormulaReferences(cell.formula, op, sheet.title);
        if (res.formula !== cell.formula) {
          cell.formula = res.formula;
          cell.canonicalFormula = formulaA1ToCanonical(
            res.formula,
            sheet,
            (title) => workbook.sheets.find((s) => s.title === title)
          );
          affectedCellCount++;
        }
        if (res.hasRefError) {
          refErrorsIntroduced++;
        }
      }
    }
  }

  return {
    workbook,
    affectedCellCount,
    refErrorsIntroduced,
  };
}
