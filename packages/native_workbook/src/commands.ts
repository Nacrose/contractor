/**
 * Command Semantics, Execution Engine, and Compensating Undo (M06-T02).
 * Implements deterministic workbook mutations, cell protection enforcement,
 * compensating commands, and M02 save/sync status progression.
 */

import type {
  WorkbookModel,
  SheetModel,
  CellModel,
  CellValue,
  CellFormat,
  CellProtection,
  DomainCellMetadata,
  DefinedName,
} from './types.js';
import { markLocalEdit } from './save_sync_state.js';
import {
  insertRows,
  deleteRows,
  moveRows,
  insertCols,
  deleteCols,
  renameSheet,
  deleteSheet,
} from './transforms.js';
import { setDefinedName, deleteDefinedName } from './defined_names.js';
import { formulaA1ToCanonical } from './identity_map.js';

export type WorkbookCommand =
  | {
      id: string;
      type: 'set_cell';
      sheetId: string;
      rowId: string;
      colId: string;
      value?: CellValue;
      formula?: string;
      format?: CellFormat;
      protection?: CellProtection;
      domainMetadata?: DomainCellMetadata;
      forceUnlock?: boolean; // Required to modify protected/locked cells
    }
  | {
      id: string;
      type: 'insert_rows';
      sheetId: string;
      atIndex: number;
      count: number;
    }
  | {
      id: string;
      type: 'delete_rows';
      sheetId: string;
      atIndex: number;
      count: number;
    }
  | {
      id: string;
      type: 'move_rows';
      sheetId: string;
      fromIndex: number;
      toIndex: number;
      count: number;
    }
  | {
      id: string;
      type: 'insert_cols';
      sheetId: string;
      atIndex: number;
      count: number;
    }
  | {
      id: string;
      type: 'delete_cols';
      sheetId: string;
      atIndex: number;
      count: number;
    }
  | {
      id: string;
      type: 'insert_sheet';
      sheetId: string;
      title: string;
      rowCount?: number;
      colCount?: number;
    }
  | {
      id: string;
      type: 'delete_sheet';
      sheetId: string;
    }
  | {
      id: string;
      type: 'rename_sheet';
      sheetId: string;
      newTitle: string;
    }
  | {
      id: string;
      type: 'set_defined_name';
      definedName: DefinedName;
    }
  | {
      id: string;
      type: 'delete_defined_name';
      name: string;
      scope?: string;
    };

export interface CommandExecutionResult {
  success: boolean;
  commandId: string;
  error?: string;
  compensatingCommand?: WorkbookCommand;
}

/**
 * Executes a workbook command with cell protection validation,
 * revision bumping, and M02 save/sync advancement.
 */
export function executeCommand(
  workbook: WorkbookModel,
  command: WorkbookCommand
): CommandExecutionResult {
  switch (command.type) {
    case 'set_cell': {
      const sheet = workbook.sheets.find((s) => s.id === command.sheetId);
      if (!sheet) {
        return { success: false, commandId: command.id, error: `Sheet not found: ${command.sheetId}` };
      }

      const cellKey = `${command.rowId}:${command.colId}`;
      const existingCell = sheet.cells[cellKey];

      // Cell Protection Contract (ADR-0016 / M06-T02):
      // Locked cells require explicit forceUnlock (e.g. administrative amendment workflow)
      if (existingCell && existingCell.protection.locked && !command.forceUnlock) {
        return {
          success: false,
          commandId: command.id,
          error: `CELL_PROTECTED: Cell "${cellKey}" is locked against modifications without administrative unlock.`,
        };
      }

      // Prepare compensating undo command
      const compensatingCommand: WorkbookCommand = existingCell
        ? {
            id: `undo_${command.id}`,
            type: 'set_cell',
            sheetId: command.sheetId,
            rowId: command.rowId,
            colId: command.colId,
            value: existingCell.value,
            formula: existingCell.formula,
            format: existingCell.format ? { ...existingCell.format } : undefined,
            protection: { ...existingCell.protection },
            domainMetadata: existingCell.domainMetadata ? { ...existingCell.domainMetadata } : undefined,
            forceUnlock: true,
          }
        : {
            id: `undo_${command.id}`,
            type: 'set_cell',
            sheetId: command.sheetId,
            rowId: command.rowId,
            colId: command.colId,
            value: null,
            formula: undefined,
            forceUnlock: true,
          };

      // Mutate cell
      let canonicalFormula: string | undefined = undefined;
      if (command.formula) {
        canonicalFormula = formulaA1ToCanonical(
          command.formula,
          sheet,
          (t) => workbook.sheets.find((s) => s.title === t)
        );
      }

      const newCell: CellModel = {
        id: existingCell ? existingCell.id : `${sheet.id}_${command.rowId}_${command.colId}`,
        rowId: command.rowId,
        colId: command.colId,
        value: command.value !== undefined ? command.value : (existingCell ? existingCell.value : null),
        formula: command.formula !== undefined ? command.formula : (existingCell ? existingCell.formula : undefined),
        canonicalFormula: command.formula !== undefined ? canonicalFormula : (existingCell ? existingCell.canonicalFormula : undefined),
        format: command.format !== undefined ? command.format : (existingCell ? existingCell.format : undefined),
        protection: command.protection !== undefined ? command.protection : (existingCell ? existingCell.protection : { locked: false }),
        domainMetadata: command.domainMetadata !== undefined ? command.domainMetadata : (existingCell ? existingCell.domainMetadata : undefined),
        computed: existingCell ? existingCell.computed : undefined,
      };

      sheet.cells[cellKey] = newCell;
      advanceWorkbookState(workbook);

      return {
        success: true,
        commandId: command.id,
        compensatingCommand,
      };
    }

    case 'insert_rows': {
      insertRows(workbook, command.sheetId, command.atIndex, command.count);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand = {
        id: `undo_${command.id}`,
        type: 'delete_rows',
        sheetId: command.sheetId,
        atIndex: command.atIndex,
        count: command.count,
      };

      return { success: true, commandId: command.id, compensatingCommand };
    }

    case 'delete_rows': {
      deleteRows(workbook, command.sheetId, command.atIndex, command.count);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand = {
        id: `undo_${command.id}`,
        type: 'insert_rows',
        sheetId: command.sheetId,
        atIndex: command.atIndex,
        count: command.count,
      };

      return { success: true, commandId: command.id, compensatingCommand };
    }

    case 'move_rows': {
      moveRows(workbook, command.sheetId, command.fromIndex, command.toIndex, command.count);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand = {
        id: `undo_${command.id}`,
        type: 'move_rows',
        sheetId: command.sheetId,
        fromIndex: command.toIndex,
        toIndex: command.fromIndex,
        count: command.count,
      };

      return { success: true, commandId: command.id, compensatingCommand };
    }

    case 'insert_cols': {
      insertCols(workbook, command.sheetId, command.atIndex, command.count);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand = {
        id: `undo_${command.id}`,
        type: 'delete_cols',
        sheetId: command.sheetId,
        atIndex: command.atIndex,
        count: command.count,
      };

      return { success: true, commandId: command.id, compensatingCommand };
    }

    case 'delete_cols': {
      deleteCols(workbook, command.sheetId, command.atIndex, command.count);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand = {
        id: `undo_${command.id}`,
        type: 'insert_cols',
        sheetId: command.sheetId,
        atIndex: command.atIndex,
        count: command.count,
      };

      return { success: true, commandId: command.id, compensatingCommand };
    }

    case 'rename_sheet': {
      const sheet = workbook.sheets.find((s) => s.id === command.sheetId);
      if (!sheet) {
        return { success: false, commandId: command.id, error: `Sheet not found: ${command.sheetId}` };
      }
      const oldTitle = sheet.title;
      renameSheet(workbook, command.sheetId, command.newTitle);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand = {
        id: `undo_${command.id}`,
        type: 'rename_sheet',
        sheetId: command.sheetId,
        newTitle: oldTitle,
      };

      return { success: true, commandId: command.id, compensatingCommand };
    }

    case 'delete_sheet': {
      deleteSheet(workbook, command.sheetId);
      advanceWorkbookState(workbook);

      return {
        success: true,
        commandId: command.id,
      };
    }

    case 'set_defined_name': {
      const existing = workbook.definedNames[command.definedName.name];
      setDefinedName(workbook, command.definedName);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand = existing
        ? {
            id: `undo_${command.id}`,
            type: 'set_defined_name',
            definedName: existing,
          }
        : {
            id: `undo_${command.id}`,
            type: 'delete_defined_name',
            name: command.definedName.name,
            scope: command.definedName.scope,
          };

      return { success: true, commandId: command.id, compensatingCommand };
    }

    case 'delete_defined_name': {
      const existing = workbook.definedNames[command.name];
      deleteDefinedName(workbook, command.name, command.scope as any);
      advanceWorkbookState(workbook);

      const compensatingCommand: WorkbookCommand | undefined = existing
        ? {
            id: `undo_${command.id}`,
            type: 'set_defined_name',
            definedName: existing,
          }
        : undefined;

      return { success: true, commandId: command.id, compensatingCommand };
    }

    default:
      return {
        success: false,
        commandId: (command as any).id,
        error: `Unknown command type: ${(command as any).type}`,
      };
  }
}

function advanceWorkbookState(workbook: WorkbookModel): void {
  workbook.revision += 1;
  workbook.saveSyncStatus = markLocalEdit(workbook.saveSyncStatus);
}
