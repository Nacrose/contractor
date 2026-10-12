/**
 * Workbook model evolution schemas and core types (M06-T02).
 * Supports stable collaboration identities, reversible A1 mapping,
 * cell protection contracts, domain metadata, and M02 save/sync state.
 */

import type { SaveSyncState } from './save_sync_state.js';

export type CellValue = string | number | boolean | null;

export interface CellFormat {
  numberFormat?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  bg?: string;
  color?: string;
  format?: string;
}

export interface CellProtection {
  locked: boolean;
  hidden?: boolean;
}

export interface DomainCellMetadata {
  boqCode?: string;
  isQuantityTarget?: boolean;
  unit?: string;
  itemNo?: string;
  description?: string;
  ledgerRef?: string;
  custom?: Record<string, unknown>;
}

export interface CellModel {
  id: string;
  rowId: string;
  colId: string;
  value: CellValue;
  formula?: string;
  canonicalFormula?: string;
  format?: CellFormat;
  protection: CellProtection;
  domainMetadata?: DomainCellMetadata;
  computed?: CellValue;
}

export interface RowModel {
  id: string;
  index: number;
  height?: number;
  hidden?: boolean;
}

export interface ColModel {
  id: string;
  index: number;
  width?: number;
  hidden?: boolean;
}

export interface SheetFreeze {
  xSplit?: number;
  ySplit?: number;
}

export interface DefinedName {
  name: string;
  expression: string;
  scope: 'workbook' | string;
  comment?: string;
  hidden?: boolean;
}

export interface SheetModel {
  id: string;
  title: string;
  rowCount: number;
  colCount: number;
  rows: RowModel[];
  cols: ColModel[];
  cells: Record<string, CellModel>;
  freeze?: SheetFreeze;
  colWidths?: Record<string, number>;
  definedNames?: Record<string, DefinedName>;
}

export interface WorkbookMetadata {
  title?: string;
  project?: string;
  contractor?: string;
  engineer?: string;
  currency?: string;
  unitSystem?: string;
  description?: string;
  isSynthetic?: boolean;
  custom?: Record<string, unknown>;
}

export interface WorkbookModel {
  version: 3;
  workbookId: string;
  revision: number;
  activeSheetId: string;
  metadata: WorkbookMetadata;
  sheets: SheetModel[];
  definedNames: Record<string, DefinedName>;
  saveSyncStatus: SaveSyncState;
}

// ---------------------------------------------------------------------------
// Legacy V2 schemas (for M00 fixtures and compatibility migration)
// ---------------------------------------------------------------------------

export interface LegacyCellV2 {
  value?: CellValue;
  formula?: string;
  computed?: CellValue;
  bold?: boolean;
  italic?: boolean;
  align?: string;
  bg?: string;
  format?: string;
  boqCode?: string;
  isQuantityTarget?: boolean;
  locked?: boolean;
  [key: string]: unknown;
}

export interface LegacySheetV2 {
  id: string;
  title: string;
  rowCount: number;
  colCount: number;
  colWidths?: Record<string, number>;
  freeze?: {
    xSplit?: number;
    ySplit?: number;
  };
  cells: Record<string, LegacyCellV2>;
  [key: string]: unknown;
}

export interface LegacyWorkbookV2 {
  version: 2;
  activeSheetId: string;
  metadata?: Record<string, unknown>;
  sheets: LegacySheetV2[];
  [key: string]: unknown;
}
