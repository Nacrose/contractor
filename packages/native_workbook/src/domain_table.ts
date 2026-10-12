/**
 * Calculation-Table Consumer Inventory & Domain-Backed Table Host (M06-T13).
 *
 * Implements:
 * 1. Consumer inventory and binding for all calculation-table domains:
 *    - BoQ & Measurement Book (Pilot)
 *    - MRR & Material Delivery Reconciliation
 *    - Daily Log Labor & Activity Takeoff
 *    - Site Expense & Petty Cash Ledger
 * 2. Stable domain row ID and column mappings (identity preserved across sort/filter/undo).
 * 3. Domain protection invariants: locked contractual cells cannot be bypassed,
 *    even in full-editor mode. Authorized rate changes use the amendment workflow.
 * 4. Outbox command dispatching: edits queue validated domain commands; no direct SQL.
 * 5. Exact-decimal financial arithmetic authority matching server billing services.
 * 6. Local crash recovery and real sync conflict review without silent LWW.
 * 7. Native/web and mobile input/accessibility contracts.
 */

import type {
  WorkbookModel,
  SheetModel,
  RowModel,
  ColModel,
  CellModel,
  CellValue,
  CellProtection,
} from './types.js';
import {
  GridCraftHostAdapter,
  type GridCraftMode,
  type GridCraftA11ySnapshot,
} from './gridcraft_host_adapter.js';
import {
  WorkbookSaveSyncCoordinator,
  createInitialSaveSyncState,
} from './save_sync_state.js';
import {
  isExactDecimalString,
  exactDecimalToScaledInt,
} from './boq_ipc_bridge.js';
import { colIndexToLetters } from './identity_map.js';

export type DomainTableType =
  | 'boq_measurement'
  | 'material_delivery'
  | 'daily_log_activity'
  | 'site_expense';

export type DomainProtectionRule =
  | 'locked_contractual'
  | 'editable'
  | 'amendment_required'
  | 'computed_formula';

export interface DomainColumnDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'exact_decimal' | 'formula' | 'code';
  protection: DomainProtectionRule;
  domainField: string;
  width?: number;
  inputMode?: 'text' | 'numeric' | 'decimal';
  formulaTemplate?: (rowNumber: number) => string;
}

export interface DomainRow {
  id: string; // Stable UUID
  version: number;
  [field: string]: any;
}

export interface DomainTableCommand {
  commandId: string;
  tableId: string;
  domainType: DomainTableType;
  timestamp: string;
  type: 'update_cell' | 'insert_row' | 'delete_row' | 'contract_amendment';
  payload: {
    rowId: string;
    columnKey?: string;
    oldValue?: any;
    newValue?: any;
    rowIndex?: number;
    rowData?: Record<string, any>;
    amendmentRef?: string;
    authorizedBy?: string;
    reason?: string;
  };
}

export interface ContractAmendmentInput {
  rowId: string;
  columnKey: string;
  newRate: string | number;
  amendmentRef: string;
  authorizedBy: string;
  reason?: string;
}

export interface SyncConflictReviewEntry {
  conflictId: string;
  tableId: string;
  rowId: string;
  columnKey: string;
  localValue: any;
  remoteValue: any;
  baseVersion: number;
  remoteVersion: number;
  timestamp: string;
  resolved: boolean;
}

export class DomainProtectionViolationError extends Error {
  constructor(
    public readonly rowId: string,
    public readonly columnKey: string,
    public readonly rule: DomainProtectionRule,
    message: string
  ) {
    super(message);
    this.name = 'DomainProtectionViolationError';
  }
}

// ---------------------------------------------------------------------------
// Predefined Domain Schemas
// ---------------------------------------------------------------------------

export const BOQ_MEASUREMENT_COLUMNS: DomainColumnDef[] = [
  { key: 'itemCode', label: 'Item Code', type: 'code', protection: 'locked_contractual', domainField: 'item_code', width: 100, inputMode: 'text' },
  { key: 'description', label: 'Description', type: 'text', protection: 'locked_contractual', domainField: 'description', width: 250, inputMode: 'text' },
  { key: 'unit', label: 'Unit', type: 'text', protection: 'locked_contractual', domainField: 'unit', width: 60, inputMode: 'text' },
  { key: 'contractRate', label: 'Contract Rate', type: 'exact_decimal', protection: 'amendment_required', domainField: 'contract_rate', width: 110, inputMode: 'decimal' },
  { key: 'quantity', label: 'Quantity', type: 'number', protection: 'editable', domainField: 'quantity', width: 90, inputMode: 'decimal' },
  {
    key: 'totalAmount',
    label: 'Total Amount',
    type: 'formula',
    protection: 'computed_formula',
    domainField: 'total_amount',
    width: 120,
    formulaTemplate: (row) => `=D${row}*E${row}`,
  },
  { key: 'notes', label: 'Remarks / Location', type: 'text', protection: 'editable', domainField: 'notes', width: 180, inputMode: 'text' },
];

export const MATERIAL_DELIVERY_COLUMNS: DomainColumnDef[] = [
  { key: 'poItemCode', label: 'PO Item', type: 'code', protection: 'locked_contractual', domainField: 'po_item_code', width: 100, inputMode: 'text' },
  { key: 'materialName', label: 'Material Description', type: 'text', protection: 'locked_contractual', domainField: 'material_name', width: 220, inputMode: 'text' },
  { key: 'unit', label: 'Unit', type: 'text', protection: 'locked_contractual', domainField: 'unit', width: 60, inputMode: 'text' },
  { key: 'orderedQty', label: 'Ordered Qty', type: 'number', protection: 'locked_contractual', domainField: 'ordered_qty', width: 100, inputMode: 'decimal' },
  { key: 'receivedQty', label: 'Received Qty', type: 'number', protection: 'editable', domainField: 'received_qty', width: 100, inputMode: 'decimal' },
  { key: 'rejectedQty', label: 'Rejected Qty', type: 'number', protection: 'editable', domainField: 'rejected_qty', width: 100, inputMode: 'decimal' },
  {
    key: 'acceptedQty',
    label: 'Accepted Qty',
    type: 'formula',
    protection: 'computed_formula',
    domainField: 'accepted_qty',
    width: 110,
    formulaTemplate: (row) => `=E${row}-F${row}`,
  },
  {
    key: 'variance',
    label: 'Variance',
    type: 'formula',
    protection: 'computed_formula',
    domainField: 'variance',
    width: 100,
    formulaTemplate: (row) => `=G${row}-D${row}`,
  },
];

export const DAILY_LOG_ACTIVITY_COLUMNS: DomainColumnDef[] = [
  { key: 'tradeCode', label: 'Trade Code', type: 'code', protection: 'locked_contractual', domainField: 'trade_code', width: 90, inputMode: 'text' },
  { key: 'tradeName', label: 'Trade Description', type: 'text', protection: 'locked_contractual', domainField: 'trade_name', width: 200, inputMode: 'text' },
  { key: 'location', label: 'Site Location / Zone', type: 'text', protection: 'editable', domainField: 'location', width: 160, inputMode: 'text' },
  { key: 'workerCount', label: 'Headcount', type: 'number', protection: 'editable', domainField: 'worker_count', width: 90, inputMode: 'numeric' },
  { key: 'hoursWorked', label: 'Hours Worked', type: 'number', protection: 'editable', domainField: 'hours_worked', width: 100, inputMode: 'decimal' },
  {
    key: 'totalManHours',
    label: 'Total Man-Hours',
    type: 'formula',
    protection: 'computed_formula',
    domainField: 'total_man_hours',
    width: 120,
    formulaTemplate: (row) => `=D${row}*E${row}`,
  },
  { key: 'remarks', label: 'Supervisor Remarks', type: 'text', protection: 'editable', domainField: 'remarks', width: 200, inputMode: 'text' },
];

export const SITE_EXPENSE_COLUMNS: DomainColumnDef[] = [
  { key: 'expenseCode', label: 'Expense Code', type: 'code', protection: 'locked_contractual', domainField: 'expense_code', width: 100, inputMode: 'text' },
  { key: 'category', label: 'Category', type: 'text', protection: 'locked_contractual', domainField: 'category', width: 140, inputMode: 'text' },
  { key: 'description', label: 'Expense Description', type: 'text', protection: 'editable', domainField: 'description', width: 220, inputMode: 'text' },
  { key: 'quantity', label: 'Quantity', type: 'number', protection: 'editable', domainField: 'quantity', width: 80, inputMode: 'decimal' },
  { key: 'unitPrice', label: 'Unit Price', type: 'exact_decimal', protection: 'editable', domainField: 'unit_price', width: 100, inputMode: 'decimal' },
  {
    key: 'totalAmount',
    label: 'Total Expense',
    type: 'formula',
    protection: 'computed_formula',
    domainField: 'total_amount',
    width: 120,
    formulaTemplate: (row) => `=D${row}*E${row}`,
  },
  { key: 'receiptRef', label: 'Receipt Voucher #', type: 'text', protection: 'editable', domainField: 'receipt_ref', width: 130, inputMode: 'text' },
];

export function getColumnsForDomain(domainType: DomainTableType): DomainColumnDef[] {
  switch (domainType) {
    case 'boq_measurement':
      return BOQ_MEASUREMENT_COLUMNS;
    case 'material_delivery':
      return MATERIAL_DELIVERY_COLUMNS;
    case 'daily_log_activity':
      return DAILY_LOG_ACTIVITY_COLUMNS;
    case 'site_expense':
      return SITE_EXPENSE_COLUMNS;
  }
}

function toExactDecimalString(value: any, decimalPlaces = 2): string {
  if (value === undefined || value === null) return '0.00';
  const str = String(value);
  if (isExactDecimalString(str)) return str;
  const num = Number(value);
  if (Number.isFinite(num)) return num.toFixed(decimalPlaces);
  return '0.00';
}

// ---------------------------------------------------------------------------
// DomainTableController Implementation
// ---------------------------------------------------------------------------

export interface DomainTableControllerOptions<T extends DomainRow> {
  tableId: string;
  tableName: string;
  domainType: DomainTableType;
  columns?: DomainColumnDef[];
  initialRows: T[];
  mode?: GridCraftMode;
  onDispatchDomainCommand?: (cmd: DomainTableCommand) => Promise<void> | void;
  saveCoordinator?: WorkbookSaveSyncCoordinator;
}

export class DomainTableController<T extends DomainRow = DomainRow> {
  public readonly tableId: string;
  public readonly tableName: string;
  public readonly domainType: DomainTableType;
  public readonly columns: DomainColumnDef[];

  private hostAdapter: GridCraftHostAdapter;
  private rows: T[];
  private idToRowMap: Map<string, T> = new Map();
  private rowOrder: string[] = []; // array of row IDs representing visual order
  private outboxQueue: DomainTableCommand[] = [];
  private conflictLog: SyncConflictReviewEntry[] = [];
  private onDispatchDomainCommand?: (cmd: DomainTableCommand) => Promise<void> | void;
  private saveCoordinator?: WorkbookSaveSyncCoordinator;

  constructor(options: DomainTableControllerOptions<T>) {
    this.tableId = options.tableId;
    this.tableName = options.tableName;
    this.domainType = options.domainType;
    this.columns = options.columns || getColumnsForDomain(options.domainType);
    this.rows = [...options.initialRows];
    this.onDispatchDomainCommand = options.onDispatchDomainCommand;
    this.saveCoordinator = options.saveCoordinator;

    for (const r of this.rows) {
      this.idToRowMap.set(r.id, { ...r });
      this.rowOrder.push(r.id);
    }

    const workbook = this.buildWorkbookModel();
    this.hostAdapter = new GridCraftHostAdapter(workbook, {
      mode: options.mode || 'embedded_table',
      domainRestrictions: {
        preventLockedCellEdits: true,
        requireAdminForUnlock: true,
      },
      saveCoordinator: this.saveCoordinator,
    });
  }

  public getHostAdapter(): GridCraftHostAdapter {
    return this.hostAdapter;
  }

  public getMode(): GridCraftMode {
    return this.hostAdapter.getMode();
  }

  public switchMode(newMode: GridCraftMode): void {
    this.hostAdapter.switchMode(newMode);
  }

  public getRowCount(): number {
    return this.rowOrder.length;
  }

  public getRowIdByIndex(index: number): string | undefined {
    return this.rowOrder[index];
  }

  public getIndexByRowId(id: string): number {
    return this.rowOrder.indexOf(id);
  }

  public getRowById(id: string): T | undefined {
    return this.idToRowMap.get(id);
  }

  public getOutboxQueue(): DomainTableCommand[] {
    return [...this.outboxQueue];
  }

  public getConflictLog(): SyncConflictReviewEntry[] {
    return [...this.conflictLog];
  }

  /**
   * Sort the visual presentation while preserving domain row identities.
   */
  public sortRows(columnKey: string, ascending = true): void {
    const colDef = this.columns.find((c) => c.key === columnKey);
    if (!colDef) return;

    this.rowOrder.sort((idA, idB) => {
      const rowA = this.idToRowMap.get(idA)!;
      const rowB = this.idToRowMap.get(idB)!;
      const valA = rowA[colDef.key];
      const valB = rowB[colDef.key];

      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      const comp = valA < valB ? -1 : 1;
      return ascending ? comp : -comp;
    });

    this.rebuildHostAdapter();
  }

  /**
   * Filter visible rows while preserving full collection and row identities.
   */
  public filterRows(predicate: (row: T) => boolean): void {
    this.rowOrder = this.rows
      .filter(predicate)
      .map((r) => r.id);

    this.rebuildHostAdapter();
  }

  public resetFilter(): void {
    this.rowOrder = this.rows.map((r) => r.id);
    this.rebuildHostAdapter();
  }

  /**
   * Safe domain edit. Validates cell protection rules before allowing edit.
   */
  public setCellValue(rowId: string, columnKey: string, newValue: any): void {
    const colIndex = this.columns.findIndex((c) => c.key === columnKey);
    if (colIndex === -1) {
      throw new Error(`Unknown column '${columnKey}' for table ${this.tableId}`);
    }
    const colDef = this.columns[colIndex];
    const row = this.idToRowMap.get(rowId);
    if (!row) {
      throw new Error(`Row with ID '${rowId}' not found`);
    }

    // Invariant: Locked contractual columns reject direct edits in both embedded AND full_editor mode!
    if (colDef.protection === 'locked_contractual') {
      throw new DomainProtectionViolationError(
        rowId,
        columnKey,
        colDef.protection,
        `Cannot edit locked contractual field '${colDef.label}' (domain protection is enforced in all modes).`
      );
    }

    if (colDef.protection === 'computed_formula') {
      throw new DomainProtectionViolationError(
        rowId,
        columnKey,
        colDef.protection,
        `Field '${colDef.label}' is a calculated formula and cannot be overwritten with raw values.`
      );
    }

    if (colDef.protection === 'amendment_required') {
      throw new DomainProtectionViolationError(
        rowId,
        columnKey,
        colDef.protection,
        `Field '${colDef.label}' requires an authorized contract amendment to change.`
      );
    }

    const record = row as Record<string, any>;
    const oldValue = record[columnKey];
    record[columnKey] = newValue;
    row.version += 1;

    // Update in host workbook via command engine
    const visualRowIndex = this.getIndexByRowId(rowId);
    if (visualRowIndex >= 0) {
      const sheetRowIndex = visualRowIndex + 1;
      this.hostAdapter.executeCommand({
        id: `edit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'set_cell',
        sheetId: 'sheet-1',
        rowId: `r-${sheetRowIndex}`,
        colId: `c-${colIndex}`,
        value: newValue,
        forceUnlock: true,
      });
    }

    // Dispatch domain command to outbox
    const command: DomainTableCommand = {
      commandId: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tableId: this.tableId,
      domainType: this.domainType,
      timestamp: new Date().toISOString(),
      type: 'update_cell',
      payload: {
        rowId,
        columnKey,
        oldValue,
        newValue,
      },
    };

    this.outboxQueue.push(command);
    if (this.onDispatchDomainCommand) {
      this.onDispatchDomainCommand(command);
    }
  }

  /**
   * Applies an authorized contract amendment (e.g. rate change) to an amendment-required field.
   */
  public applyContractAmendment(input: ContractAmendmentInput): void {
    const colIndex = this.columns.findIndex((c) => c.key === input.columnKey);
    if (colIndex === -1) {
      throw new Error(`Unknown column '${input.columnKey}'`);
    }
    const colDef = this.columns[colIndex];
    if (colDef.protection !== 'amendment_required' && colDef.protection !== 'locked_contractual') {
      throw new Error(`Column '${colDef.label}' does not accept contract amendments.`);
    }

    const row = this.idToRowMap.get(input.rowId);
    if (!row) {
      throw new Error(`Row '${input.rowId}' not found.`);
    }

    if (!input.amendmentRef || !input.authorizedBy) {
      throw new Error(`Contract amendments require valid amendmentRef and authorizedBy credentials.`);
    }

    const record = row as Record<string, any>;
    const oldValue = record[input.columnKey];
    record[input.columnKey] = input.newRate;
    row.version += 1;
    record['lastAmendmentRef'] = input.amendmentRef;
    record['amendedBy'] = input.authorizedBy;

    const visualRowIndex = this.getIndexByRowId(input.rowId);
    if (visualRowIndex >= 0) {
      const sheetRowIndex = visualRowIndex + 1;
      this.hostAdapter.executeCommand({
        id: `amend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'set_cell',
        sheetId: 'sheet-1',
        rowId: `r-${sheetRowIndex}`,
        colId: `c-${colIndex}`,
        value: input.newRate,
        forceUnlock: true,
      });
    }

    const command: DomainTableCommand = {
      commandId: `amend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tableId: this.tableId,
      domainType: this.domainType,
      timestamp: new Date().toISOString(),
      type: 'contract_amendment',
      payload: {
        rowId: input.rowId,
        columnKey: input.columnKey,
        oldValue,
        newValue: input.newRate,
        amendmentRef: input.amendmentRef,
        authorizedBy: input.authorizedBy,
        reason: input.reason,
      },
    };

    this.outboxQueue.push(command);
    if (this.onDispatchDomainCommand) {
      this.onDispatchDomainCommand(command);
    }
  }

  /**
   * Inserts a new domain row at a specified index.
   */
  public insertRow(newRow: T, targetIndex?: number): void {
    if (this.idToRowMap.has(newRow.id)) {
      throw new Error(`Row with ID '${newRow.id}' already exists.`);
    }

    const insertIdx = targetIndex !== undefined && targetIndex >= 0 && targetIndex <= this.rowOrder.length
      ? targetIndex
      : this.rowOrder.length;

    this.rows.push(newRow);
    this.idToRowMap.set(newRow.id, { ...newRow });
    this.rowOrder.splice(insertIdx, 0, newRow.id);

    this.rebuildHostAdapter();

    const command: DomainTableCommand = {
      commandId: `insert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tableId: this.tableId,
      domainType: this.domainType,
      timestamp: new Date().toISOString(),
      type: 'insert_row',
      payload: {
        rowId: newRow.id,
        rowIndex: insertIdx,
        rowData: { ...newRow },
      },
    };

    this.outboxQueue.push(command);
    if (this.onDispatchDomainCommand) {
      this.onDispatchDomainCommand(command);
    }
  }

  /**
   * Deletes a domain row by ID.
   */
  public deleteRow(rowId: string): void {
    const idx = this.getIndexByRowId(rowId);
    if (idx === -1) {
      throw new Error(`Row '${rowId}' not found.`);
    }

    const row = this.idToRowMap.get(rowId)!;
    this.rowOrder.splice(idx, 1);
    this.idToRowMap.delete(rowId);
    const rowListIdx = this.rows.findIndex((r) => r.id === rowId);
    if (rowListIdx >= 0) this.rows.splice(rowListIdx, 1);

    this.rebuildHostAdapter();

    const command: DomainTableCommand = {
      commandId: `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tableId: this.tableId,
      domainType: this.domainType,
      timestamp: new Date().toISOString(),
      type: 'delete_row',
      payload: {
        rowId,
        rowIndex: idx,
        rowData: { ...row },
      },
    };

    this.outboxQueue.push(command);
    if (this.onDispatchDomainCommand) {
      this.onDispatchDomainCommand(command);
    }
  }

  /**
   * Handles incoming remote server update with conflict detection.
   */
  public applyRemoteUpdate(remoteUpdate: {
    rowId: string;
    columnKey: string;
    remoteValue: any;
    remoteVersion: number;
    baseVersion: number;
  }): { applied: boolean; conflictLogged: boolean } {
    const row = this.idToRowMap.get(remoteUpdate.rowId);
    if (!row) {
      return { applied: false, conflictLogged: false };
    }

    // Check if local version has changed since baseVersion
    if (row.version !== remoteUpdate.baseVersion && row[remoteUpdate.columnKey] !== remoteUpdate.remoteValue) {
      // Conflict detected! Preserve for user review; reject silent LWW!
      const conflict: SyncConflictReviewEntry = {
        conflictId: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tableId: this.tableId,
        rowId: remoteUpdate.rowId,
        columnKey: remoteUpdate.columnKey,
        localValue: row[remoteUpdate.columnKey],
        remoteValue: remoteUpdate.remoteValue,
        baseVersion: remoteUpdate.baseVersion,
        remoteVersion: remoteUpdate.remoteVersion,
        timestamp: new Date().toISOString(),
        resolved: false,
      };
      this.conflictLog.push(conflict);
      return { applied: false, conflictLogged: true };
    }

    // Clean merge: update local value
    (row as Record<string, any>)[remoteUpdate.columnKey] = remoteUpdate.remoteValue;
    row.version = Math.max(row.version, remoteUpdate.remoteVersion);

    const visualIdx = this.getIndexByRowId(remoteUpdate.rowId);
    if (visualIdx >= 0) {
      const colIndex = this.columns.findIndex((c) => c.key === remoteUpdate.columnKey);
      if (colIndex >= 0) {
        this.hostAdapter.executeCommand({
          id: `remote_sync_${Date.now()}`,
          type: 'set_cell',
          sheetId: 'sheet-1',
          rowId: `r-${visualIdx + 1}`,
          colId: `c-${colIndex}`,
          value: remoteUpdate.remoteValue,
          forceUnlock: true,
        });
      }
    }

    return { applied: true, conflictLogged: false };
  }

  /**
   * Computes authoritative totals using scaled integer arithmetic (integer cents)
   * matching server billing services (`billing.ts`).
   */
  public getAuthoritativeTotals(): {
    rowCount: number;
    subtotalScaledInt: number;
    subtotalDecimal: string;
  } {
    let subtotalScaled = 0;

    for (const r of this.rows) {
      if (this.domainType === 'boq_measurement') {
        const rateScaled = exactDecimalToScaledInt(toExactDecimalString(r['contractRate']), 100);
        const qtyScaled = exactDecimalToScaledInt(toExactDecimalString(r['quantity']), 100);
        const rowAmountScaled = (rateScaled * qtyScaled + 50n) / 100n;
        subtotalScaled += Number(rowAmountScaled);
      } else if (this.domainType === 'site_expense') {
        const qtyScaled = exactDecimalToScaledInt(toExactDecimalString(r['quantity']), 100);
        const priceScaled = exactDecimalToScaledInt(toExactDecimalString(r['unitPrice']), 100);
        const rowAmountScaled = (qtyScaled * priceScaled + 50n) / 100n;
        subtotalScaled += Number(rowAmountScaled);
      } else if (this.domainType === 'daily_log_activity') {
        const workers = Number(r['workerCount'] || 0);
        const hours = Number(r['hoursWorked'] || 0);
        subtotalScaled += Math.round(workers * hours * 100);
      } else if (this.domainType === 'material_delivery') {
        const accepted = Number(r['receivedQty'] || 0) - Number(r['rejectedQty'] || 0);
        subtotalScaled += Math.round(accepted * 100);
      }
    }

    const subtotalDecimal = (subtotalScaled / 100).toFixed(2);
    return {
      rowCount: this.rows.length,
      subtotalScaledInt: subtotalScaled,
      subtotalDecimal,
    };
  }

  /**
   * Mobile input descriptor for touch devices and on-screen keyboards.
   */
  public getMobileInputDescriptor(rowId: string, columnKey: string): {
    inputMode: 'text' | 'numeric' | 'decimal';
    readOnly: boolean;
    label: string;
    value: any;
    isProtected: boolean;
  } {
    const colDef = this.columns.find((c) => c.key === columnKey);
    if (!colDef) {
      throw new Error(`Unknown column ${columnKey}`);
    }
    const row = this.idToRowMap.get(rowId);
    const value = row ? row[columnKey] : undefined;

    const isProtected =
      colDef.protection === 'locked_contractual' ||
      colDef.protection === 'computed_formula' ||
      colDef.protection === 'amendment_required';

    return {
      inputMode: colDef.inputMode || 'text',
      readOnly: isProtected,
      label: colDef.label,
      value,
      isProtected,
    };
  }

  /**
   * Accessibility snapshot for screen readers.
   */
  public getA11ySnapshot(rowId: string, columnKey: string): GridCraftA11ySnapshot {
    const visualIdx = this.getIndexByRowId(rowId);
    const colIdx = this.columns.findIndex((c) => c.key === columnKey);
    if (visualIdx === -1 || colIdx === -1) {
      throw new Error(`Row ${rowId} or column ${columnKey} not in visible layout`);
    }

    this.hostAdapter.setSelection({
      sheetId: 'sheet-1',
      startRow: visualIdx + 1,
      startCol: colIdx,
      endRow: visualIdx + 1,
      endCol: colIdx,
    });
    const snap = this.hostAdapter.getA11ySnapshot();
    if (!snap) {
      const colDef = this.columns[colIdx];
      const row = this.idToRowMap.get(rowId)!;
      return {
        focusedCellA1: `${colIndexToLetters(colIdx)}${visualIdx + 2}`,
        role: 'gridcell',
        label: colDef.label,
        valueText: String(row[columnKey] ?? ''),
        isReadOnly: colDef.protection !== 'editable',
        hasFormula: colDef.protection === 'computed_formula',
      };
    }
    return snap;
  }

  // -------------------------------------------------------------------------
  // Internal Workbook Builders
  // -------------------------------------------------------------------------

  private buildWorkbookModel(): WorkbookModel {
    const sheetId = 'sheet-1';
    const rowCount = this.rowOrder.length + 1; // row 0: header, rows 1..N: data
    const colCount = this.columns.length;

    const rows: RowModel[] = [];
    for (let r = 0; r < rowCount; r++) {
      rows.push({ id: `r-${r}`, index: r });
    }

    const cols: ColModel[] = [];
    for (let c = 0; c < colCount; c++) {
      cols.push({ id: `c-${c}`, index: c, width: this.columns[c].width || 100 });
    }

    const cells: Record<string, CellModel> = {};

    // Header row (Row 0)
    for (let c = 0; c < colCount; c++) {
      const col = this.columns[c];
      const cellKey = `r-0:c-${c}`;
      cells[cellKey] = {
        id: cellKey,
        rowId: 'r-0',
        colId: `c-${c}`,
        value: col.label,
        computed: col.label,
        protection: { locked: true, hidden: false },
        format: { bold: true, bg: '#f1f5f9' },
      };
    }

    // Data rows (Row 1..N)
    for (let r = 0; r < this.rowOrder.length; r++) {
      const rowId = this.rowOrder[r];
      const rowData = this.idToRowMap.get(rowId)!;
      const sheetRowIdx = r + 1;
      const sheetRowNumber = r + 2; // A1 notation 1-indexed

      for (let c = 0; c < colCount; c++) {
        const col = this.columns[c];
        const cellKey = `r-${sheetRowIdx}:c-${c}`;
        const isLocked =
          col.protection === 'locked_contractual' ||
          col.protection === 'computed_formula' ||
          col.protection === 'amendment_required';

        if (col.protection === 'computed_formula' && col.formulaTemplate) {
          const formula = col.formulaTemplate(sheetRowNumber);
          cells[cellKey] = {
            id: cellKey,
            rowId: `r-${sheetRowIdx}`,
            colId: `c-${c}`,
            value: null,
            formula,
            protection: { locked: true, hidden: false },
            domainMetadata: {
              custom: {
                entityId: rowId,
                fieldName: col.domainField,
                rule: col.protection,
                rowVersion: rowData.version,
              },
            },
          };
        } else {
          const rawVal: CellValue = rowData[col.key] !== undefined ? rowData[col.key] : null;
          cells[cellKey] = {
            id: cellKey,
            rowId: `r-${sheetRowIdx}`,
            colId: `c-${c}`,
            value: rawVal,
            computed: rawVal,
            protection: { locked: isLocked, hidden: false },
            domainMetadata: {
              custom: {
                entityId: rowId,
                fieldName: col.domainField,
                rule: col.protection,
                rowVersion: rowData.version,
              },
            },
          };
        }
      }
    }

    const sheet: SheetModel = {
      id: sheetId,
      title: this.tableName,
      rowCount,
      colCount,
      rows,
      cols,
      cells,
      freeze: { ySplit: 1 },
    };

    return {
      version: 3,
      workbookId: this.tableId,
      revision: 1,
      activeSheetId: sheetId,
      metadata: {
        title: this.tableName,
        currency: 'USD',
      },
      sheets: [sheet],
      definedNames: {},
      saveSyncStatus: createInitialSaveSyncState(),
    };
  }

  private rebuildHostAdapter(): void {
    const activeMode = this.hostAdapter.getMode();
    const workbook = this.buildWorkbookModel();
    this.hostAdapter = new GridCraftHostAdapter(workbook, {
      mode: activeMode,
      domainRestrictions: {
        preventLockedCellEdits: true,
        requireAdminForUnlock: true,
      },
      saveCoordinator: this.saveCoordinator,
    });
  }
}
