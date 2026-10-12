import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DomainTableController,
  DomainProtectionViolationError,
  BOQ_MEASUREMENT_COLUMNS,
  MATERIAL_DELIVERY_COLUMNS,
  DAILY_LOG_ACTIVITY_COLUMNS,
  SITE_EXPENSE_COLUMNS,
  type DomainRow,
} from '../src/domain_table.js';

test('BoQ / Measurement Pilot: stable identity, sorting, and filtering', () => {
  interface BoqItem extends DomainRow {
    itemCode: string;
    description: string;
    unit: string;
    contractRate: string;
    quantity: number;
    notes?: string;
  }

  const initialRows: BoqItem[] = [
    {
      id: 'boq-uuid-1',
      version: 1,
      itemCode: 'A.01',
      description: 'Site Clearance and Topsoil Stripping',
      unit: 'm2',
      contractRate: '15.50',
      quantity: 1200,
    },
    {
      id: 'boq-uuid-2',
      version: 1,
      itemCode: 'C.04',
      description: 'Structural Concrete Grade 30',
      unit: 'm3',
      contractRate: '185.00',
      quantity: 450,
    },
    {
      id: 'boq-uuid-3',
      version: 1,
      itemCode: 'B.02',
      description: 'Bulk Earthwork Excavation',
      unit: 'm3',
      contractRate: '28.00',
      quantity: 800,
    },
  ];

  const controller = new DomainTableController<BoqItem>({
    tableId: 'boq-sheet-2026',
    tableName: 'BoQ Master Measurement',
    domainType: 'boq_measurement',
    initialRows,
  });

  assert.equal(controller.getRowCount(), 3);
  assert.equal(controller.getRowIdByIndex(0), 'boq-uuid-1');
  assert.equal(controller.getRowIdByIndex(1), 'boq-uuid-2');
  assert.equal(controller.getRowIdByIndex(2), 'boq-uuid-3');

  // Sort by itemCode ascending
  controller.sortRows('itemCode', true);
  assert.equal(controller.getRowIdByIndex(0), 'boq-uuid-1'); // A.01
  assert.equal(controller.getRowIdByIndex(1), 'boq-uuid-3'); // B.02
  assert.equal(controller.getRowIdByIndex(2), 'boq-uuid-2'); // C.04

  // Verify entity retrieval by ID remains 100% stable
  const itemB = controller.getRowById('boq-uuid-3');
  assert.ok(itemB);
  assert.equal(itemB.description, 'Bulk Earthwork Excavation');
  assert.equal(itemB.contractRate, '28.00');

  // Filter rows (quantity > 500)
  controller.filterRows((row) => row.quantity > 500);
  assert.equal(controller.getRowCount(), 2);
  assert.equal(controller.getRowIdByIndex(0), 'boq-uuid-1');
  assert.equal(controller.getRowIdByIndex(1), 'boq-uuid-3');

  // Reset filter
  controller.resetFilter();
  assert.equal(controller.getRowCount(), 3);
});

test('BoQ / Measurement Pilot: domain cell protection cannot be bypassed in embedded or full_editor mode', () => {
  const initialRows = [
    {
      id: 'item-101',
      version: 1,
      itemCode: 'D.12',
      description: 'Reinforcement Steel High Yield T20',
      unit: 'kg',
      contractRate: '2.40',
      quantity: 5000,
    },
  ];

  const controller = new DomainTableController({
    tableId: 'boq-table',
    tableName: 'BoQ Steel Takeoff',
    domainType: 'boq_measurement',
    initialRows,
    mode: 'embedded_table',
  });

  // 1. Direct edit to locked contractual itemCode must fail
  assert.throws(
    () => controller.setCellValue('item-101', 'itemCode', 'FORGED.01'),
    (err: unknown) => {
      assert.ok(err instanceof DomainProtectionViolationError);
      assert.equal(err.rule, 'locked_contractual');
      return true;
    }
  );

  // 2. Direct edit to contractRate must fail (requires amendment)
  assert.throws(
    () => controller.setCellValue('item-101', 'contractRate', '9.99'),
    (err: unknown) => {
      assert.ok(err instanceof DomainProtectionViolationError);
      assert.equal(err.rule, 'amendment_required');
      return true;
    }
  );

  // 3. Direct overwrite of computed formula must fail
  assert.throws(
    () => controller.setCellValue('item-101', 'totalAmount', 99999),
    (err: unknown) => {
      assert.ok(err instanceof DomainProtectionViolationError);
      assert.equal(err.rule, 'computed_formula');
      return true;
    }
  );

  // 4. Switch to full_editor mode: PROTECTION MUST STILL HOLD! Full editor cannot bypass domain contracts!
  controller.switchMode('full_editor');
  assert.equal(controller.getMode(), 'full_editor');

  assert.throws(
    () => controller.setCellValue('item-101', 'itemCode', 'BYPASS.01'),
    (err: unknown) => {
      assert.ok(err instanceof DomainProtectionViolationError);
      assert.equal(err.rule, 'locked_contractual');
      return true;
    }
  );

  assert.throws(
    () => controller.setCellValue('item-101', 'contractRate', '99.99'),
    (err: unknown) => {
      assert.ok(err instanceof DomainProtectionViolationError);
      assert.equal(err.rule, 'amendment_required');
      return true;
    }
  );

  // 5. Editing editable field (quantity) succeeds in both modes
  controller.setCellValue('item-101', 'quantity', 5250);
  const updated = controller.getRowById('item-101');
  assert.equal(updated?.quantity, 5250);
  assert.equal(updated?.version, 2);
});

test('Contract amendment workflow: authorized rate adjustments with provenance audit', () => {
  const initialRows = [
    {
      id: 'boq-rate-1',
      version: 1,
      itemCode: 'E.05',
      description: 'Waterproofing Membrane 4mm',
      unit: 'm2',
      contractRate: '45.00',
      quantity: 1200,
    },
  ];

  const controller = new DomainTableController({
    tableId: 'boq-amend-test',
    tableName: 'BoQ Waterproofing',
    domainType: 'boq_measurement',
    initialRows,
  });

  // Attempt amendment without credentials must fail
  assert.throws(() => {
    controller.applyContractAmendment({
      rowId: 'boq-rate-1',
      columnKey: 'contractRate',
      newRate: '48.50',
      amendmentRef: '',
      authorizedBy: '',
    });
  });

  // Authorized amendment execution
  controller.applyContractAmendment({
    rowId: 'boq-rate-1',
    columnKey: 'contractRate',
    newRate: '48.50',
    amendmentRef: 'CO-2026-004',
    authorizedBy: 'CommercialManager@contractor.internal',
    reason: 'Approved Variation Order #4 for specification upgrade',
  });

  const updatedRow = controller.getRowById('boq-rate-1');
  assert.ok(updatedRow);
  assert.equal(updatedRow.contractRate, '48.50');
  assert.equal(updatedRow.version, 2);
  const rowRecord = updatedRow as Record<string, any>;
  assert.equal(rowRecord['lastAmendmentRef'], 'CO-2026-004');
  assert.equal(rowRecord['amendedBy'], 'CommercialManager@contractor.internal');

  // Verify outbox command was queued with amendment details
  const queue = controller.getOutboxQueue();
  const amendCmd = queue.find((c) => c.type === 'contract_amendment');
  assert.ok(amendCmd);
  assert.equal(amendCmd.payload.oldValue, '45.00');
  assert.equal(amendCmd.payload.newValue, '48.50');
  assert.equal(amendCmd.payload.amendmentRef, 'CO-2026-004');
  assert.equal(amendCmd.payload.authorizedBy, 'CommercialManager@contractor.internal');
});

test('Authoritative financial arithmetic: scaled integer exactness matching billing.ts', () => {
  const initialRows = [
    {
      id: 'item-1',
      version: 1,
      itemCode: 'F.01',
      description: 'Item 1',
      unit: 'm',
      contractRate: '12.34',
      quantity: 100.5,
    },
    {
      id: 'item-2',
      version: 1,
      itemCode: 'F.02',
      description: 'Item 2',
      unit: 'm',
      contractRate: '56.78',
      quantity: 200.25,
    },
  ];

  const controller = new DomainTableController({
    tableId: 'boq-financial-exactness',
    tableName: 'BoQ Financial Test',
    domainType: 'boq_measurement',
    initialRows,
  });

  const totals = controller.getAuthoritativeTotals();
  assert.equal(totals.rowCount, 2);
  // Row 1: 12.34 * 100.5 = 1240.17
  // Row 2: 56.78 * 200.25 = 11370.195 -> 11370.20
  // Subtotal: 1240.17 + 11370.20 = 12610.37
  assert.equal(totals.subtotalScaledInt, 1261037);
  assert.equal(totals.subtotalDecimal, '12610.37');
});

test('Row structural operations (insert/delete) preserve existing row IDs', () => {
  const initialRows = [
    { id: 'row-a', version: 1, itemCode: '1.0', description: 'Row A', unit: 'ea', contractRate: '10.00', quantity: 5 },
    { id: 'row-b', version: 1, itemCode: '2.0', description: 'Row B', unit: 'ea', contractRate: '20.00', quantity: 10 },
  ];

  const controller = new DomainTableController({
    tableId: 'struct-table',
    tableName: 'Structural Test',
    domainType: 'boq_measurement',
    initialRows,
  });

  // Insert row between A and B
  controller.insertRow(
    { id: 'row-new', version: 1, itemCode: '1.5', description: 'Row New', unit: 'ea', contractRate: '15.00', quantity: 8 },
    1
  );

  assert.equal(controller.getRowCount(), 3);
  assert.equal(controller.getRowIdByIndex(0), 'row-a');
  assert.equal(controller.getRowIdByIndex(1), 'row-new');
  assert.equal(controller.getRowIdByIndex(2), 'row-b');

  // Delete row A
  controller.deleteRow('row-a');
  assert.equal(controller.getRowCount(), 2);
  assert.equal(controller.getRowIdByIndex(0), 'row-new');
  assert.equal(controller.getRowIdByIndex(1), 'row-b');
  assert.equal(controller.getRowById('row-a'), undefined);
});

test('Concurrency and sync conflict handling: preserve conflict for review, no silent LWW', () => {
  const initialRows = [
    { id: 'row-sync-1', version: 1, itemCode: 'S.01', description: 'Sync Test', unit: 'm', contractRate: '10.00', quantity: 100 },
  ];

  const controller = new DomainTableController({
    tableId: 'sync-table',
    tableName: 'Sync Conflict Test',
    domainType: 'boq_measurement',
    initialRows,
  });

  // Local user edits quantity to 150 -> version becomes 2
  controller.setCellValue('row-sync-1', 'quantity', 150);

  // Incoming remote update based on stale version 1 with different quantity 200
  const result = controller.applyRemoteUpdate({
    rowId: 'row-sync-1',
    columnKey: 'quantity',
    remoteValue: 200,
    remoteVersion: 2,
    baseVersion: 1,
  });

  assert.equal(result.applied, false);
  assert.equal(result.conflictLogged, true);

  // Local value was NOT silently overwritten!
  assert.equal(controller.getRowById('row-sync-1')?.quantity, 150);

  // Conflict logged for review
  const conflicts = controller.getConflictLog();
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].localValue, 150);
  assert.equal(conflicts[0].remoteValue, 200);
});

test('Expansion workflows: Material Delivery, Daily Log, and Site Expense schemas', () => {
  // 1. Material Delivery Table
  const mrrController = new DomainTableController({
    tableId: 'mrr-table-01',
    tableName: 'Material Receipt & MRR',
    domainType: 'material_delivery',
    initialRows: [
      {
        id: 'mat-1',
        version: 1,
        poItemCode: 'PO-901',
        materialName: 'Portland Cement Type I',
        unit: 'bags',
        orderedQty: 500,
        receivedQty: 500,
        rejectedQty: 10,
      },
    ],
  });

  assert.equal(mrrController.columns.length, MATERIAL_DELIVERY_COLUMNS.length);
  const mrrTotals = mrrController.getAuthoritativeTotals();
  // accepted = 500 - 10 = 490 bags
  assert.equal(mrrTotals.subtotalScaledInt, 49000);

  // 2. Daily Log Activity Table
  const dailyLogController = new DomainTableController({
    tableId: 'log-table-01',
    tableName: 'Daily Log Trade Breakdown',
    domainType: 'daily_log_activity',
    initialRows: [
      {
        id: 'log-1',
        version: 1,
        tradeCode: 'CARP',
        tradeName: 'Carpentry & Formwork',
        location: 'Zone 2 North Core',
        workerCount: 6,
        hoursWorked: 8.5,
      },
    ],
  });

  assert.equal(dailyLogController.columns.length, DAILY_LOG_ACTIVITY_COLUMNS.length);
  const logTotals = dailyLogController.getAuthoritativeTotals();
  // 6 * 8.5 = 51 man hours -> 5100 scaled
  assert.equal(logTotals.subtotalScaledInt, 5100);

  // 3. Site Expense Table
  const expenseController = new DomainTableController({
    tableId: 'exp-table-01',
    tableName: 'Site Petty Cash Ledger',
    domainType: 'site_expense',
    initialRows: [
      {
        id: 'exp-1',
        version: 1,
        expenseCode: 'PC-101',
        category: 'Safety PPE',
        description: 'Hard hats & high-vis vests',
        quantity: 12,
        unitPrice: '15.00',
        receiptRef: 'REC-8849',
      },
    ],
  });

  assert.equal(expenseController.columns.length, SITE_EXPENSE_COLUMNS.length);
  const expTotals = expenseController.getAuthoritativeTotals();
  // 12 * 15.00 = 180.00 -> 18000 scaled cents
  assert.equal(expTotals.subtotalScaledInt, 18000);
  assert.equal(expTotals.subtotalDecimal, '180.00');
});

test('Mobile input and accessibility descriptors', () => {
  const controller = new DomainTableController({
    tableId: 'a11y-test',
    tableName: 'Mobile / A11y Table',
    domainType: 'boq_measurement',
    initialRows: [
      {
        id: 'row-a11y',
        version: 1,
        itemCode: 'G.01',
        description: 'Structural Excavation',
        unit: 'm3',
        contractRate: '35.00',
        quantity: 250,
      },
    ],
  });

  // Mobile descriptor for quantity (editable, decimal keyboard)
  const qtyInput = controller.getMobileInputDescriptor('row-a11y', 'quantity');
  assert.equal(qtyInput.inputMode, 'decimal');
  assert.equal(qtyInput.readOnly, false);
  assert.equal(qtyInput.isProtected, false);

  // Mobile descriptor for contractRate (amendment required, protected)
  const rateInput = controller.getMobileInputDescriptor('row-a11y', 'contractRate');
  assert.equal(rateInput.inputMode, 'decimal');
  assert.equal(rateInput.readOnly, true);
  assert.equal(rateInput.isProtected, true);

  // A11y snapshot check
  const a11ySnap = controller.getA11ySnapshot('row-a11y', 'quantity');
  assert.ok(a11ySnap.role);
  assert.ok(a11ySnap.valueText.includes('250'));
});
