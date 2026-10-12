import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommercialBillingJourney,
  SupplyChainLedgerJourney,
  FieldProgressProjectControlsJourney,
  OfflineJourneyQueue,
  CrossEngineUpgradeGuard,
  TakeoffMeasurement,
  MaterialDelivery,
  SiteProgressLog,
} from '../src/index.js';

test('Journey 1: Takeoff measurement -> BoQ item -> Procurement requisition -> Client IPC billing', () => {
  const measurement: TakeoffMeasurement = {
    sheetId: 'sheet-ground-floor',
    polygonId: 'poly-col-c1-c8',
    description: 'RCC Grade M20 in Foundation Columns',
    quantity: 45.5,
    unit: 'm3',
  };

  const boqRateMinor = 1400000n; // Rs 14,000.00 / m3 = 1,400,000 Paisa
  const result = CommercialBillingJourney.execute(measurement, boqRateMinor, 1);

  // 1. BoQ Item verification
  assert.equal(result.boq.itemCode, 'BOQ-RCC-M20');
  assert.equal(result.boq.quantity, 45.5);
  assert.equal(result.boq.rateMinor, 1400000n);

  // 2. Requisition derived quantities
  assert.equal(result.requisitions.length, 3);
  const cementReq = result.requisitions.find((r) => r.materialCode === 'MAT-CEM-OPC');
  assert.ok(cementReq);
  assert.equal(cementReq.requiredQuantity, 364); // 45.5 * 8 = 364 bags

  // 3. IPC Billing arithmetic
  // Gross = 45.5 * 14000 = Rs 637,000.00 = 63,700,000 Paisa
  assert.equal(result.ipc.grossAmountMinor, 63700000n);
  // Retention 5% = 637,000 * 0.05 = Rs 31,850.00 = 3,185,000 Paisa
  assert.equal(result.ipc.retentionDeductionMinor, 3185000n);
  // Net before tax = 637,000 - 31,850 = Rs 605,150.00 = 60,515,000 Paisa
  assert.equal(result.ipc.netBeforeTaxMinor, 60515000n);
  // VAT 13% = 605,150 * 0.13 = Rs 78,669.50 = 7,866,950 Paisa
  assert.equal(result.ipc.vatAmountMinor, 7866950n);
  // Total payable = 605,150 + 78,669.50 = Rs 683,819.50 = 68,381,950 Paisa
  assert.equal(result.ipc.totalPayableMinor, 68381950n);
});

test('Journey 2: Material delivery -> GRN -> Stock ledger -> General Ledger Journal', () => {
  const delivery: MaterialDelivery = {
    deliveryTicketId: 'DT-2026-0089',
    supplierId: 'SUPP-SHIVAM-CEMENT',
    materialCode: 'MAT-CEM-OPC',
    quantityReceived: 500,
    unitPriceMinor: 75000n, // Rs 750.00 / bag = 75,000 Paisa
  };

  const acceptedQuantity = 500;
  const result = SupplyChainLedgerJourney.execute(delivery, acceptedQuantity);

  // 1. Goods Receipt Note
  assert.equal(result.grn.grnNumber, 'GRN-DT-2026-0089');
  assert.equal(result.grn.acceptedQuantity, 500);
  // Total cost = 500 * 750 = Rs 375,000.00 = 37,500,000 Paisa
  assert.equal(result.grn.totalCostMinor, 37500000n);
  assert.equal(result.grn.qualityChecked, true);

  // 2. Double-entry Journal
  assert.equal(result.journal.lines.length, 2);
  const debitLine = result.journal.lines.find((l) => l.accountCode === '1300_INVENTORY_MATERIALS');
  const creditLine = result.journal.lines.find((l) => l.accountCode === '2100_ACCOUNTS_PAYABLE');

  assert.ok(debitLine);
  assert.ok(creditLine);
  assert.equal(debitLine.debitMinor, 37500000n);
  assert.equal(debitLine.creditMinor, 0n);
  assert.equal(creditLine.debitMinor, 0n);
  assert.equal(creditLine.creditMinor, 37500000n);

  // Strict double-entry invariant: Sum(Debit) == Sum(Credit)
  assert.equal(result.journal.isBalanced, true);
});

test('Journey 3: Daily site progress -> TruePPM schedule recalculation -> EVM S-curves', () => {
  const plannedBudgetMinor = 100000000n; // Rs 1,000,000.00 = 100,000,000 Paisa
  const scheduledProgressRatio = 0.50;  // 50% planned at milestone date

  const progressLog: SiteProgressLog = {
    logId: 'LOG-2026-10-12-01',
    date: '2026-10-12',
    taskId: 'TSK-PIER-FOUNDATION',
    actualProgressRatio: 0.60, // 60% completed ahead of schedule
    actualCostMinor: 55000000n, // Rs 550,000.00 spent so far
  };

  const metrics = FieldProgressProjectControlsJourney.execute(
    progressLog,
    plannedBudgetMinor,
    scheduledProgressRatio
  );

  // PV = 50,000,000 Paisa
  assert.equal(metrics.plannedValueMinor, 50000000n);
  // EV = 60,000,000 Paisa
  assert.equal(metrics.earnedValueMinor, 60000000n);
  // AC = 55,000,000 Paisa
  assert.equal(metrics.actualCostMinor, 55000000n);

  // CV = EV - AC = +5,000,000 Paisa (Under budget favorable)
  assert.equal(metrics.costVarianceMinor, 5000000n);
  // SV = EV - PV = +10,000,000 Paisa (Ahead of schedule favorable)
  assert.equal(metrics.scheduleVarianceMinor, 10000000n);

  // CPI = 60M / 55M = 1.091
  assert.equal(metrics.cpi, 1.091);
  // SPI = 60M / 50M = 1.200
  assert.equal(metrics.spi, 1.2);
});

test('OfflineJourneyQueue: safely buffers actions offline and replays when connected', () => {
  const queue = new OfflineJourneyQueue();

  queue.enqueue('COMMERCIAL', { item: 'BOQ-1', qty: 10 });
  queue.enqueue('SUPPLY_CHAIN', { grn: 'GRN-1', qty: 50 });
  queue.enqueue('PROJECT_CONTROLS', { task: 'T-1', progress: 0.75 });

  assert.equal(queue.pendingCount, 3);

  // 1. Attempt replay while offline
  const offlineReplay = queue.replayAll(false);
  assert.equal(offlineReplay.processed, 0);
  assert.equal(offlineReplay.remaining, 3);
  assert.equal(queue.pendingCount, 3);

  // 2. Replay when online
  const onlineReplay = queue.replayAll(true);
  assert.equal(onlineReplay.processed, 3);
  assert.equal(onlineReplay.remaining, 0);
  assert.equal(queue.pendingCount, 0);
});

test('CrossEngineUpgradeGuard: preserves state schema across tool engine version bumps', () => {
  const initialPayload = {
    documentId: 'DOC-BOQ-001',
    workbookRevision: 14,
    cellRange: 'A1:H100',
    embeddedMode: true,
  };

  const migration = CrossEngineUpgradeGuard.verifySchemaPreservation(
    'v0.2.0',
    'v0.3.0',
    initialPayload
  );

  assert.equal(migration.preserved, true);
  assert.equal(migration.migratedPayload.documentId, 'DOC-BOQ-001');
  assert.equal(migration.migratedPayload.workbookRevision, 14);
  assert.equal(migration.migratedPayload._migratedFrom, 'v0.2.0');
  assert.equal(migration.migratedPayload._migratedTo, 'v0.3.0');
  assert.ok(typeof migration.migratedPayload._migrationTimestamp === 'number');
});
