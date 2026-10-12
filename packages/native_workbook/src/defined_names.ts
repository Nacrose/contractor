/**
 * Defined Names and Named Range Manager (M06-T02).
 * Supports global (workbook) and local (sheet) scope, reference resolution,
 * and structural shift updates without silent normalization.
 */

import type { WorkbookModel, DefinedName } from './types.js';
import { rewriteFormulaReferences, type StructureOperation } from './transforms.js';

/**
 * Sets or updates a defined name.
 */
export function setDefinedName(workbook: WorkbookModel, def: DefinedName): void {
  const normName = def.name.trim();
  const entry: DefinedName = {
    ...def,
    name: normName,
  };

  if (def.scope === 'workbook' || !def.scope) {
    workbook.definedNames[normName] = entry;
  } else {
    const sheet = workbook.sheets.find((s) => s.id === def.scope);
    if (!sheet) throw new Error(`Scope sheet not found: ${def.scope}`);
    if (!sheet.definedNames) sheet.definedNames = {};
    sheet.definedNames[normName] = entry;
  }
}

/**
 * Looks up a defined name, searching sheet scope first then workbook scope.
 */
export function getDefinedName(
  workbook: WorkbookModel,
  name: string,
  activeSheetId?: string
): DefinedName | undefined {
  const normName = name.trim();

  if (activeSheetId) {
    const sheet = workbook.sheets.find((s) => s.id === activeSheetId);
    if (sheet && sheet.definedNames && sheet.definedNames[normName]) {
      return sheet.definedNames[normName];
    }
  }

  return workbook.definedNames[normName];
}

/**
 * Deletes a defined name from workbook or sheet scope.
 */
export function deleteDefinedName(
  workbook: WorkbookModel,
  name: string,
  scope: 'workbook' | string = 'workbook'
): boolean {
  const normName = name.trim();

  if (scope === 'workbook') {
    if (normName in workbook.definedNames) {
      delete workbook.definedNames[normName];
      return true;
    }
    return false;
  }

  const sheet = workbook.sheets.find((s) => s.id === scope);
  if (sheet && sheet.definedNames && normName in sheet.definedNames) {
    delete sheet.definedNames[normName];
    return true;
  }
  return false;
}

/**
 * Lists all defined names visible to the active sheet.
 */
export function listDefinedNames(
  workbook: WorkbookModel,
  activeSheetId?: string
): DefinedName[] {
  const results = new Map<string, DefinedName>();

  // Global names
  for (const [k, v] of Object.entries(workbook.definedNames)) {
    results.set(k, v);
  }

  // Local names override global names in active sheet scope
  if (activeSheetId) {
    const sheet = workbook.sheets.find((s) => s.id === activeSheetId);
    if (sheet && sheet.definedNames) {
      for (const [k, v] of Object.entries(sheet.definedNames)) {
        results.set(k, v);
      }
    }
  }

  return Array.from(results.values());
}

/**
 * Updates defined names expressions when structure transforms occur.
 */
export function rewriteDefinedNamesOnStructureChange(
  workbook: WorkbookModel,
  op: StructureOperation,
  targetSheetTitle: string
): void {
  // Global
  for (const name of Object.values(workbook.definedNames)) {
    if (name.expression.startsWith('=')) {
      const res = rewriteFormulaReferences(name.expression, op, targetSheetTitle);
      name.expression = res.formula;
    }
  }

  // Sheet-scoped
  for (const sheet of workbook.sheets) {
    if (sheet.definedNames) {
      for (const name of Object.values(sheet.definedNames)) {
        if (name.expression.startsWith('=')) {
          const res = rewriteFormulaReferences(name.expression, op, targetSheetTitle);
          name.expression = res.formula;
        }
      }
    }
  }
}
