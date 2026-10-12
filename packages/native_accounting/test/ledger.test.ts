import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountingLedger,
  UnbalancedJournalError,
  FiscalPeriodLockedError,
  toMinorUnits,
  formatMajorUnits,
} from '../src/index.js';

test('Monetary precision: converts exact decimal strings to integer minor units with zero floating-point drift', () => {
  assert.equal(toMinorUnits('150000.50'), 15000050n);
  assert.equal(toMinorUnits('0.05'), 5n);
  assert.equal(toMinorUnits('100'), 10000n);
  assert.equal(toMinorUnits('-250.75'), -25075n);

  assert.equal(formatMajorUnits(15000050n), '150000.50');
  assert.equal(formatMajorUnits(5n), '0.05');
  assert.equal(formatMajorUnits(-25075n), '-250.75');

  // Exact addition check
  const a = toMinorUnits('0.10');
  const b = toMinorUnits('0.20');
  assert.equal(a + b, 30n);
  assert.equal(formatMajorUnits(a + b), '0.30'); // Never 0.30000000000000004
});

test('AccountingLedger: posts complex client IPC billing with statutory VAT, TDS, and retention atomically', () => {
  const ledger = new AccountingLedger();

  // Typical Nepal Public Procurement IPC Transaction:
  // Gross certified work: NPR 1,000,000.00
  // Less: Retention deduction (5%): NPR 50,000.00 (Asset: Retention Held)
  // Subtotal: NPR 950,000.00
  // Plus: 13% VAT on Gross: NPR 130,000.00
  // Less: 1.5% Contract TDS on Gross: NPR 15,000.00 (Asset: TDS Receivable)
  // Net check receivable from client: NPR 950,000 + 130,000 - 15,000 = NPR 1,065,000.00
  //
  // Debits:
  // - 1110 Client Receivable: NPR 1,065,000.00
  // - 1150 Retention Held by Client: NPR 50,000.00
  // - 1160 TDS Receivable: NPR 15,000.00
  // Total Debits = NPR 1,130,000.00
  //
  // Credits:
  // - 4100 Certified Contract Revenue: NPR 1,000,000.00
  // - 2170 VAT Output Payable: NPR 130,000.00
  // Total Credits = NPR 1,130,000.00

  const { record, isDuplicate } = ledger.postJournalEntry({
    journalId: 'j-ipc-001',
    projectId: 'p-kathmandu-bridge',
    date: '2026-10-15',
    memo: 'IPC-01 Certified Progress Billing',
    idempotencyKey: 'idemp-ipc-001',
    lines: [
      { accountCode: '1110', debit: '1065000.00', credit: '0.00', description: 'Net Client Receivable' },
      { accountCode: '1150', debit: '50000.00', credit: '0.00', description: '5% Retention Withheld' },
      { accountCode: '1160', debit: '15000.00', credit: '0.00', description: '1.5% TDS Advance Tax' },
      { accountCode: '4100', debit: '0.00', credit: '1000000.00', description: 'Gross Certified Revenue' },
      { accountCode: '2170', debit: '0.00', credit: '130000.00', description: '13% VAT Output' },
    ],
  });

  assert.equal(isDuplicate, false);
  assert.equal(record.totalFormatted, '1130000.00');

  // Verify account balances
  const arBalance = ledger.getAccountBalance('1110', 'p-kathmandu-bridge');
  assert.equal(arBalance.netBalanceMinor, 106500000n);

  const retentionBalance = ledger.getAccountBalance('1150');
  assert.equal(retentionBalance.netBalanceMinor, 5000000n);

  const revenueBalance = ledger.getAccountBalance('4100');
  assert.equal(revenueBalance.netBalanceMinor, 100000000n);

  const vatBalance = ledger.getAccountBalance('2170');
  assert.equal(vatBalance.netBalanceMinor, 13000000n);
});

test('AccountingLedger: strictly rejects unbalanced journal entries fail-closed', () => {
  const ledger = new AccountingLedger();

  assert.throws(
    () => {
      ledger.postJournalEntry({
        journalId: 'j-bad-001',
        projectId: 'p-01',
        date: '2026-10-15',
        memo: 'Unbalanced purchase',
        idempotencyKey: 'idemp-bad-001',
        lines: [
          { accountCode: '5100', debit: '5000.00', credit: '0.00' },
          { accountCode: '1020', debit: '0.00', credit: '4900.00' }, // Imbalance of 100.00
        ],
      });
    },
    (err: any) => {
      assert.ok(err instanceof UnbalancedJournalError);
      assert.equal(err.code, 'UNBALANCED_JOURNAL_ERROR');
      assert.equal(err.totalDebitMinor, 500000n);
      assert.equal(err.totalCreditMinor, 490000n);
      return true;
    }
  );
});

test('AccountingLedger: fiscal period lock prevents retroactive modifications', () => {
  const ledger = new AccountingLedger();

  // Lock fiscal period for FY 2025/2026 (closed 2026-07-15)
  ledger.lockPeriod({
    periodId: 'FY-2025-2026-Q4',
    startDate: '2026-04-01',
    endDate: '2026-07-15',
    lockedAt: '2026-07-16T00:00:00.000Z',
    lockedBy: 'user-cfo',
  });

  // Attempt to backdate entry into locked period
  assert.throws(
    () => {
      ledger.postJournalEntry({
        journalId: 'j-retro-001',
        projectId: 'p-01',
        date: '2026-06-30', // Inside locked range!
        memo: 'Late material invoice',
        idempotencyKey: 'idemp-retro-001',
        lines: [
          { accountCode: '5100', debit: '1000.00', credit: '0.00' },
          { accountCode: '2010', debit: '0.00', credit: '1000.00' },
        ],
      });
    },
    (err: any) => {
      assert.ok(err instanceof FiscalPeriodLockedError);
      assert.equal(err.code, 'FISCAL_PERIOD_LOCKED');
      assert.equal(err.transactionDate, '2026-06-30');
      assert.equal(err.periodId, 'FY-2025-2026-Q4');
      return true;
    }
  );

  // Subsequent transaction in active period succeeds
  const { record } = ledger.postJournalEntry({
    journalId: 'j-current-001',
    projectId: 'p-01',
    date: '2026-08-01',
    memo: 'Current period purchase',
    idempotencyKey: 'idemp-current-001',
    lines: [
      { accountCode: '5100', debit: '1000.00', credit: '0.00' },
      { accountCode: '2010', debit: '0.00', credit: '1000.00' },
    ],
  });
  assert.equal(record.totalFormatted, '1000.00');
});

test('AccountingLedger: reversing entries invert debits and credits cleanly', () => {
  const ledger = new AccountingLedger();

  ledger.postJournalEntry({
    journalId: 'j-err-001',
    projectId: 'p-01',
    date: '2026-10-10',
    memo: 'Mistaken subcontractor payment',
    idempotencyKey: 'idemp-err-001',
    lines: [
      { accountCode: '5400', debit: '25000.00', credit: '0.00', description: 'Subcontractor Cost' },
      { accountCode: '1020', debit: '0.00', credit: '25000.00', description: 'Bank Disbursement' },
    ],
  });

  const costBalBefore = ledger.getAccountBalance('5400');
  assert.equal(costBalBefore.netBalanceMinor, 2500000n);

  // Create reversing entry on 2026-10-12
  const reversal = ledger.createReversingEntry('j-err-001', '2026-10-12', 'Duplicate bill submitted by subcontractor');
  assert.equal(reversal.isReversal, true);
  assert.equal(reversal.reversedJournalId, 'j-err-001');

  // Net cost balance should now be exactly 0
  const costBalAfter = ledger.getAccountBalance('5400');
  assert.equal(costBalAfter.netBalanceMinor, 0n);

  const bankBalAfter = ledger.getAccountBalance('1020');
  assert.equal(bankBalAfter.netBalanceMinor, 0n);
});

test('AccountingLedger: idempotent submission eliminates duplicate postings on sync replay', () => {
  const ledger = new AccountingLedger();

  const payload = {
    journalId: 'j-site-petty-10',
    projectId: 'p-01',
    date: '2026-10-12',
    memo: 'Site petty cash purchase',
    idempotencyKey: 'idemp-petty-10',
    lines: [
      { accountCode: '6100', debit: '450.00', credit: '0.00', description: 'Office supplies' },
      { accountCode: '1010', debit: '0.00', credit: '450.00', description: 'Petty cash cash-out' },
    ],
  };

  const first = ledger.postJournalEntry(payload);
  assert.equal(first.isDuplicate, false);

  // Sync replay with same idempotencyKey
  const second = ledger.postJournalEntry(payload);
  assert.equal(second.isDuplicate, true);
  assert.equal(second.record.journalId, 'j-site-petty-10');

  // Ensure balance has only been impacted once
  const pettyBal = ledger.getAccountBalance('1010');
  assert.equal(pettyBal.creditMinor, 45000n); // exactly 450.00, not 900.00
});

test('AccountingLedger: generates balanced Trial Balance report', () => {
  const ledger = new AccountingLedger();

  ledger.postJournalEntry({
    journalId: 'j-tb-1',
    projectId: 'p-01',
    date: '2026-10-01',
    memo: 'Initial Capital Injection',
    idempotencyKey: 'idemp-tb-1',
    lines: [
      { accountCode: '1020', debit: '500000.00', credit: '0.00' },
      { accountCode: '3010', debit: '0.00', credit: '500000.00' },
    ],
  });

  ledger.postJournalEntry({
    journalId: 'j-tb-2',
    projectId: 'p-01',
    date: '2026-10-05',
    memo: 'Purchase of Cement for Stock',
    idempotencyKey: 'idemp-tb-2',
    lines: [
      { accountCode: '1210', debit: '200000.00', credit: '0.00' },
      { accountCode: '1020', debit: '0.00', credit: '200000.00' },
    ],
  });

  const tb = ledger.generateTrialBalance();
  assert.equal(tb.isBalanced, true);
  assert.equal(tb.totalDebitFormatted, '700000.00');
  assert.equal(tb.totalCreditFormatted, '700000.00');
  assert.equal(tb.rows.length, 3);
});
