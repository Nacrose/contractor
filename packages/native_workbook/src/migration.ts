/**
 * Versioned Workbook Migration Engine (M06-T02).
 * Migrates legacy v2 positional schemas (from M00 fixtures) to v3 stable collaboration
 * identity models and downgrades back to v2 reversibly with zero loss.
 */

import type {
  LegacyWorkbookV2,
  LegacySheetV2,
  LegacyCellV2,
  WorkbookModel,
  SheetModel,
  CellModel,
  RowModel,
  ColModel,
  CellFormat,
  CellProtection,
  DomainCellMetadata,
} from './types.js';
import { createInitialSaveSyncState } from './save_sync_state.js';
import { formulaA1ToCanonical, identityToCoord } from './identity_map.js';

/**
 * Migrates a legacy v2 workbook to the evolved v3 collaboration workbook model.
 */
export function migrateV2ToV3(v2: LegacyWorkbookV2): WorkbookModel {
  const workbookId = (v2.metadata?.id as string) || `wb_${Date.now()}`;
  const sheets: SheetModel[] = [];

  for (const v2Sheet of v2.sheets) {
    const rows: RowModel[] = [];
    const cols: ColModel[] = [];

    // 1. Allocate stable identities for rows
    for (let r = 0; r < v2Sheet.rowCount; r++) {
      rows.push({
        id: `r_${r}`,
        index: r,
      });
    }

    // 2. Allocate stable identities for cols
    for (let c = 0; c < v2Sheet.colCount; c++) {
      const colWidth = v2Sheet.colWidths?.[String(c)];
      cols.push({
        id: `c_${c}`,
        index: c,
        width: colWidth !== undefined ? Number(colWidth) : undefined,
      });
    }

    const sheet: SheetModel = {
      id: v2Sheet.id,
      title: v2Sheet.title,
      rowCount: v2Sheet.rowCount,
      colCount: v2Sheet.colCount,
      rows,
      cols,
      cells: {},
      colWidths: v2Sheet.colWidths ? { ...v2Sheet.colWidths } : undefined,
      freeze: v2Sheet.freeze ? { ...v2Sheet.freeze } : undefined,
      definedNames: {},
    };

    sheets.push(sheet);
  }

  const getSheetByTitle = (title: string) => sheets.find((s) => s.title === title);

  // 3. Migrate cells
  for (let sIdx = 0; sIdx < v2.sheets.length; sIdx++) {
    const v2Sheet = v2.sheets[sIdx];
    const sheet = sheets[sIdx];

    for (const [coordKey, v2Cell] of Object.entries(v2Sheet.cells)) {
      const parts = coordKey.split(':');
      if (parts.length !== 2) continue;
      const rowIdx = parseInt(parts[0], 10);
      const colIdx = parseInt(parts[1], 10);

      // Expand rows/cols if fixture has sparse cells beyond declared dimensions
      if (rowIdx >= sheet.rowCount) {
        for (let r = sheet.rowCount; r <= rowIdx; r++) {
          sheet.rows.push({ id: `r_${r}`, index: r });
        }
        sheet.rowCount = rowIdx + 1;
      }
      if (colIdx >= sheet.colCount) {
        for (let c = sheet.colCount; c <= colIdx; c++) {
          sheet.cols.push({ id: `c_${c}`, index: c });
        }
        sheet.colCount = colIdx + 1;
      }

      const row = sheet.rows.find((r) => r.index === rowIdx)!;
      const col = sheet.cols.find((c) => c.index === colIdx)!;

      const format: CellFormat = {};
      if (v2Cell.bold !== undefined) format.bold = v2Cell.bold;
      if (v2Cell.italic !== undefined) format.italic = v2Cell.italic;
      if (v2Cell.align !== undefined) format.align = v2Cell.align as any;
      if (v2Cell.bg !== undefined) format.bg = v2Cell.bg;
      if (v2Cell.format !== undefined) format.format = v2Cell.format;

      // Cell protection: per ADR-0016 contract: formulas and rates default to locked
      let locked = false;
      if (v2Cell.locked !== undefined) {
        locked = Boolean(v2Cell.locked);
      } else if (v2Cell.formula || v2Cell.format === 'header' || (v2Cell.bold && rowIdx <= 2)) {
        locked = true;
      }
      const protection: CellProtection = { locked };

      const domainMetadata: DomainCellMetadata = {};
      if (v2Cell.boqCode !== undefined) domainMetadata.boqCode = v2Cell.boqCode;
      if (v2Cell.isQuantityTarget !== undefined) domainMetadata.isQuantityTarget = v2Cell.isQuantityTarget;

      // Preserve all other arbitrary properties in domainMetadata.custom
      const standardKeys = new Set([
        'value',
        'formula',
        'computed',
        'bold',
        'italic',
        'align',
        'bg',
        'format',
        'boqCode',
        'isQuantityTarget',
        'locked',
      ]);
      const custom: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(v2Cell)) {
        if (!standardKeys.has(k)) {
          custom[k] = v;
        }
      }
      if (Object.keys(custom).length > 0) {
        domainMetadata.custom = custom;
      }

      let canonicalFormula: string | undefined = undefined;
      if (v2Cell.formula) {
        canonicalFormula = formulaA1ToCanonical(v2Cell.formula, sheet, getSheetByTitle);
      }

      const cellModel: CellModel = {
        id: `${sheet.id}_${row.id}_${col.id}`,
        rowId: row.id,
        colId: col.id,
        value: v2Cell.value !== undefined ? v2Cell.value : null,
        formula: v2Cell.formula,
        canonicalFormula,
        format: Object.keys(format).length > 0 ? format : undefined,
        protection,
        domainMetadata: Object.keys(domainMetadata).length > 0 ? domainMetadata : undefined,
        computed: v2Cell.computed,
      };

      sheet.cells[`${row.id}:${col.id}`] = cellModel;
    }
  }

  const v3Workbook: WorkbookModel = {
    version: 3,
    workbookId,
    revision: 1,
    activeSheetId: v2.activeSheetId || (sheets[0] ? sheets[0].id : ''),
    metadata: {
      title: v2.metadata?.title as string | undefined,
      project: v2.metadata?.project as string | undefined,
      contractor: v2.metadata?.contractor as string | undefined,
      engineer: v2.metadata?.engineer as string | undefined,
      currency: v2.metadata?.currency as string | undefined,
      unitSystem: v2.metadata?.unitSystem as string | undefined,
      description: v2.metadata?.description as string | undefined,
      isSynthetic: v2.metadata?.isSynthetic as boolean | undefined,
      custom: v2.metadata,
    },
    sheets,
    definedNames: {},
    saveSyncStatus: createInitialSaveSyncState(),
  };

  return v3Workbook;
}

/**
 * Downgrades a v3 workbook back to legacy v2 positional format without loss of data.
 */
export function downgradeV3ToV2(v3: WorkbookModel): LegacyWorkbookV2 {
  const legacySheets: LegacySheetV2[] = [];

  for (const sheet of v3.sheets) {
    const legacyCells: Record<string, LegacyCellV2> = {};

    for (const cell of Object.values(sheet.cells)) {
      const coord = identityToCoord(sheet, cell.rowId, cell.colId);
      if (!coord) continue;

      const key = `${coord.row}:${coord.col}`;
      const legacyCell: LegacyCellV2 = {};

      if (cell.value !== undefined && cell.value !== null) legacyCell.value = cell.value;
      if (cell.formula) legacyCell.formula = cell.formula;
      if (cell.computed !== undefined) legacyCell.computed = cell.computed;

      if (cell.format) {
        if (cell.format.bold !== undefined) legacyCell.bold = cell.format.bold;
        if (cell.format.italic !== undefined) legacyCell.italic = cell.format.italic;
        if (cell.format.align !== undefined) legacyCell.align = cell.format.align;
        if (cell.format.bg !== undefined) legacyCell.bg = cell.format.bg;
        if (cell.format.format !== undefined) legacyCell.format = cell.format.format;
      }

      if (cell.protection && cell.protection.locked !== undefined) {
        legacyCell.locked = cell.protection.locked;
      }

      if (cell.domainMetadata) {
        if (cell.domainMetadata.boqCode !== undefined) {
          legacyCell.boqCode = cell.domainMetadata.boqCode;
        }
        if (cell.domainMetadata.isQuantityTarget !== undefined) {
          legacyCell.isQuantityTarget = cell.domainMetadata.isQuantityTarget;
        }
        if (cell.domainMetadata.custom) {
          for (const [k, v] of Object.entries(cell.domainMetadata.custom)) {
            legacyCell[k] = v;
          }
        }
      }

      legacyCells[key] = legacyCell;
    }

    const legacySheet: LegacySheetV2 = {
      id: sheet.id,
      title: sheet.title,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      colWidths: sheet.colWidths,
      freeze: sheet.freeze,
      cells: legacyCells,
    };

    legacySheets.push(legacySheet);
  }

  const legacyWb: LegacyWorkbookV2 = {
    version: 2,
    activeSheetId: v3.activeSheetId,
    metadata: (v3.metadata.custom as Record<string, unknown>) || {
      title: v3.metadata.title,
      project: v3.metadata.project,
      contractor: v3.metadata.contractor,
      engineer: v3.metadata.engineer,
      currency: v3.metadata.currency,
      unitSystem: v3.metadata.unitSystem,
    },
    sheets: legacySheets,
  };

  return legacyWb;
}
