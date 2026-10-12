/**
 * Core Double-Entry General Ledger & Exact Monetary Precision (M10-T04)
 *
 * Implements:
 * - Exact integer minor units (paisa/cents) with zero floating-point drift.
 * - Strict atomic balance invariant: sum(Debits) == sum(Credits).
 * - Closed fiscal period lock enforcement.
 * - Formal reversal transactions preserving audit history.
 * - Deterministic idempotency for M03 sync feed replay.
 * - Canonical Nepal construction chart of accounts.
 */

export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE_DIRECT_COST'
  | 'EXPENSE_OVERHEAD';

export interface AccountDefinition {
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly description?: string;
}

export interface JournalLineInput {
  readonly accountCode: string;
  readonly debit: string;  // Exact decimal string (e.g. "150000.50") or integer
  readonly credit: string; // Exact decimal string (e.g. "0.00")
  readonly description?: string;
  readonly subledgerEntityId?: string; // e.g. subcontractorId or vendorId
}

export interface JournalLineRecord {
  readonly accountCode: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly debitFormatted: string;
  readonly creditFormatted: string;
  readonly description?: string;
  readonly subledgerEntityId?: string;
}

export interface JournalEntryInput {
  readonly journalId: string;
  readonly projectId: string;
  readonly date: string; // YYYY-MM-DD
  readonly memo: string;
  readonly idempotencyKey: string;
  readonly lines: readonly JournalLineInput[];
  readonly referenceType?: string; // 'IPC', 'PURCHASE_ORDER', 'PAYROLL', etc.
  readonly referenceId?: string;
}

export interface JournalEntryRecord {
  readonly journalId: string;
  readonly projectId: string;
  readonly date: string;
  readonly memo: string;
  readonly idempotencyKey: string;
  readonly lines: readonly JournalLineRecord[];
  readonly totalMinor: bigint;
  readonly totalFormatted: string;
  readonly isReversal: boolean;
  readonly reversedJournalId?: string;
  readonly postedAt: string;
}

export interface FiscalPeriodLock {
  readonly periodId: string;
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string;   // YYYY-MM-DD
  readonly lockedAt: string;
  readonly lockedBy: string;
}

export class UnbalancedJournalError extends Error {
  public readonly code = 'UNBALANCED_JOURNAL_ERROR';
  public readonly totalDebitMinor: bigint;
  public readonly totalCreditMinor: bigint;

  constructor(totalDebitMinor: bigint, totalCreditMinor: bigint) {
    super(
      `Unbalanced journal entry: total debits (${totalDebitMinor}) does not equal total credits (${totalCreditMinor}). Net imbalance: ${totalDebitMinor - totalCreditMinor}`
    );
    this.name = 'UnbalancedJournalError';
    this.totalDebitMinor = totalDebitMinor;
    this.totalCreditMinor = totalCreditMinor;
  }
}

export class FiscalPeriodLockedError extends Error {
  public readonly code = 'FISCAL_PERIOD_LOCKED';
  public readonly transactionDate: string;
  public readonly periodId: string;

  constructor(transactionDate: string, periodId: string) {
    super(`Cannot post transaction on "${transactionDate}": fiscal period "${periodId}" is locked against retroactive modifications.`);
    this.name = 'FiscalPeriodLockedError';
    this.transactionDate = transactionDate;
    this.periodId = periodId;
  }
}

export class DuplicateJournalEntryError extends Error {
  public readonly code = 'DUPLICATE_JOURNAL_ENTRY';
  public readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    super(`Duplicate journal entry with idempotency key "${idempotencyKey}" already posted.`);
    this.name = 'DuplicateJournalEntryError';
    this.idempotencyKey = idempotencyKey;
  }
}

/**
 * Parses exact monetary decimal string into integer minor units (10^-2).
 */
export function toMinorUnits(value: string | number): bigint {
  const str = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) throw new TypeError(`Invalid decimal currency amount: "${value}"`);
  const [, sign, whole, frac = ''] = match;
  const paddedFrac = frac.slice(0, 2).padEnd(2, '0');
  const magnitude = BigInt(`${whole}${paddedFrac}`);
  return sign === '-' ? -magnitude : magnitude;
}

/**
 * Formats integer minor units back into standard decimal string.
 */
export function formatMajorUnits(minor: bigint): string {
  const isNegative = minor < 0n;
  const abs = isNegative ? -minor : minor;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${fraction}`;
}

/**
 * Authoritative Canonical Chart of Accounts for Construction Operations.
 */
export const NEPAL_CONSTRUCTION_CHART_OF_ACCOUNTS: readonly AccountDefinition[] = [
  { code: '1010', name: 'Cash in Hand (Petty Cash)', type: 'ASSET' },
  { code: '1020', name: 'Operating Bank Account', type: 'ASSET' },
  { code: '1030', name: 'Dedicated JV Escrow Bank Account', type: 'ASSET' },
  { code: '1110', name: 'Accounts Receivable (Client Progress Claims)', type: 'ASSET' },
  { code: '1120', name: 'Advance Mobilization to Subcontractors', type: 'ASSET' },
  { code: '1150', name: 'Retention Money Held by Client (DLP)', type: 'ASSET' },
  { code: '1160', name: 'Advance Tax / TDS Receivable (1.5% Contract Withholding)', type: 'ASSET' },
  { code: '1170', name: 'VAT Input Tax Credit (13%)', type: 'ASSET' },
  { code: '1210', name: 'Material Warehouse Inventory', type: 'ASSET' },
  { code: '2010', name: 'Accounts Payable (Vendors / Subcontractors)', type: 'LIABILITY' },
  { code: '2120', name: 'Advance Mobilization Received from Client', type: 'LIABILITY' },
  { code: '2150', name: 'Retention Money Withheld from Subcontractors (5%)', type: 'LIABILITY' },
  { code: '2160', name: 'TDS Payable to Inland Revenue Department', type: 'LIABILITY' },
  { code: '2170', name: 'VAT Output Payable to Inland Revenue Department (13%)', type: 'LIABILITY' },
  { code: '3010', name: 'Partner Equity / Capital Contribution', type: 'EQUITY' },
  { code: '4100', name: 'Certified Construction Contract Revenue', type: 'REVENUE' },
  { code: '5100', name: 'Direct Material Cost Consumed', type: 'EXPENSE_DIRECT_COST' },
  { code: '5200', name: 'Direct Site Labor Wages (Muster Roll)', type: 'EXPENSE_DIRECT_COST' },
  { code: '5300', name: 'Equipment Operation & Fuel Cost', type: 'EXPENSE_DIRECT_COST' },
  { code: '5400', name: 'Subcontractor Certified Work Cost', type: 'EXPENSE_DIRECT_COST' },
  { code: '6100', name: 'Site Indirect Overheads & Administration', type: 'EXPENSE_OVERHEAD' },
];

/**
 * AccountingLedger: Double-Entry Core Engine.
 */
export class AccountingLedger {
  private readonly accounts = new Map<string, AccountDefinition>();
  private readonly journals = new Map<string, JournalEntryRecord>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> journalId
  private readonly periodLocks: FiscalPeriodLock[] = [];

  constructor(chartOfAccounts: readonly AccountDefinition[] = NEPAL_CONSTRUCTION_CHART_OF_ACCOUNTS) {
    for (const acc of chartOfAccounts) {
      this.accounts.set(acc.code, acc);
    }
  }

  public registerAccount(acc: AccountDefinition): void {
    this.accounts.set(acc.code, acc);
  }

  public getAccount(code: string): AccountDefinition | undefined {
    return this.accounts.get(code);
  }

  public lockPeriod(lock: FiscalPeriodLock): void {
    this.periodLocks.push(lock);
  }

  public isPeriodLocked(date: string): FiscalPeriodLock | undefined {
    return this.periodLocks.find((p) => date >= p.startDate && date <= p.endDate);
  }

  /**
   * Posts an atomic double-entry journal.
   */
  public postJournalEntry(input: JournalEntryInput): { record: JournalEntryRecord; isDuplicate: boolean } {
    // 1. Idempotency Check
    const existingId = this.idempotencyIndex.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.journals.get(existingId);
      if (existing) {
        return { record: existing, isDuplicate: true };
      }
    }

    // 2. Fiscal Period Lock Check
    const lock = this.isPeriodLocked(input.date);
    if (lock) {
      throw new FiscalPeriodLockedError(input.date, lock.periodId);
    }

    // 3. Line Validation and Double-Entry Summation
    if (input.lines.length < 2) {
      throw new Error(`A valid double-entry journal requires at least 2 lines (found ${input.lines.length}).`);
    }

    let totalDebitMinor = 0n;
    let totalCreditMinor = 0n;
    const processedLines: JournalLineRecord[] = [];

    for (const line of input.lines) {
      const account = this.accounts.get(line.accountCode);
      if (!account) {
        throw new Error(`Invalid account code: "${line.accountCode}" not registered in Chart of Accounts.`);
      }

      const dMinor = toMinorUnits(line.debit);
      const cMinor = toMinorUnits(line.credit);

      if (dMinor < 0n || cMinor < 0n) {
        throw new RangeError(`Negative debits or credits are prohibited in double-entry ledger.`);
      }
      if (dMinor > 0n && cMinor > 0n) {
        throw new Error(`Line for account "${line.accountCode}" cannot contain both debit and credit.`);
      }

      totalDebitMinor += dMinor;
      totalCreditMinor += cMinor;

      processedLines.push({
        accountCode: line.accountCode,
        debitMinor: dMinor,
        creditMinor: cMinor,
        debitFormatted: formatMajorUnits(dMinor),
        creditFormatted: formatMajorUnits(cMinor),
        description: line.description,
        subledgerEntityId: line.subledgerEntityId,
      });
    }

    // 4. Strict Balance Invariant: Sum(Debits) == Sum(Credits)
    if (totalDebitMinor !== totalCreditMinor) {
      throw new UnbalancedJournalError(totalDebitMinor, totalCreditMinor);
    }

    const record: JournalEntryRecord = {
      journalId: input.journalId,
      projectId: input.projectId,
      date: input.date,
      memo: input.memo,
      idempotencyKey: input.idempotencyKey,
      lines: processedLines,
      totalMinor: totalDebitMinor,
      totalFormatted: formatMajorUnits(totalDebitMinor),
      isReversal: false,
      postedAt: new Date().toISOString(),
    };

    this.journals.set(record.journalId, record);
    this.idempotencyIndex.set(input.idempotencyKey, record.journalId);

    return { record, isDuplicate: false };
  }

  /**
   * Creates an explicit reversing journal entry, inverting debits and credits.
   */
  public createReversingEntry(originalJournalId: string, reversalDate: string, reason: string): JournalEntryRecord {
    const original = this.journals.get(originalJournalId);
    if (!original) {
      throw new Error(`Cannot reverse non-existent journal entry: "${originalJournalId}".`);
    }

    const lock = this.isPeriodLocked(reversalDate);
    if (lock) {
      throw new FiscalPeriodLockedError(reversalDate, lock.periodId);
    }

    const reversedLines: JournalLineRecord[] = original.lines.map((l) => ({
      accountCode: l.accountCode,
      debitMinor: l.creditMinor,  // Invert
      creditMinor: l.debitMinor, // Invert
      debitFormatted: formatMajorUnits(l.creditMinor),
      creditFormatted: formatMajorUnits(l.debitMinor),
      description: `Reversal: ${l.description || original.memo}`,
      subledgerEntityId: l.subledgerEntityId,
    }));

    const reversalRecord: JournalEntryRecord = {
      journalId: `rev_${original.journalId}_${Date.now()}`,
      projectId: original.projectId,
      date: reversalDate,
      memo: `REVERSAL of ${original.journalId}: ${reason}`,
      idempotencyKey: `idemp_rev_${original.idempotencyKey}`,
      lines: reversedLines,
      totalMinor: original.totalMinor,
      totalFormatted: original.totalFormatted,
      isReversal: true,
      reversedJournalId: original.journalId,
      postedAt: new Date().toISOString(),
    };

    this.journals.set(reversalRecord.journalId, reversalRecord);
    this.idempotencyIndex.set(reversalRecord.idempotencyKey, reversalRecord.journalId);

    return reversalRecord;
  }

  /**
   * Calculates account balance.
   */
  public getAccountBalance(accountCode: string, projectId?: string): { debitMinor: bigint; creditMinor: bigint; netBalanceMinor: bigint } {
    let debitMinor = 0n;
    let creditMinor = 0n;

    for (const j of this.journals.values()) {
      if (projectId && j.projectId !== projectId) continue;
      for (const line of j.lines) {
        if (line.accountCode === accountCode) {
          debitMinor += line.debitMinor;
          creditMinor += line.creditMinor;
        }
      }
    }

    const acc = this.accounts.get(accountCode);
    const isNormalDebit = acc?.type === 'ASSET' || acc?.type === 'EXPENSE_DIRECT_COST' || acc?.type === 'EXPENSE_OVERHEAD';
    const netBalanceMinor = isNormalDebit ? (debitMinor - creditMinor) : (creditMinor - debitMinor);

    return { debitMinor, creditMinor, netBalanceMinor };
  }

  /**
   * Generates a balanced Trial Balance report.
   */
  public generateTrialBalance(projectId?: string): {
    rows: Array<{ code: string; name: string; debitFormatted: string; creditFormatted: string }>;
    totalDebitFormatted: string;
    totalCreditFormatted: string;
    isBalanced: boolean;
  } {
    let grandDebit = 0n;
    let grandCredit = 0n;
    const rows = [];

    for (const acc of this.accounts.values()) {
      let d = 0n;
      let c = 0n;
      for (const j of this.journals.values()) {
        if (projectId && j.projectId !== projectId) continue;
        for (const l of j.lines) {
          if (l.accountCode === acc.code) {
            d += l.debitMinor;
            c += l.creditMinor;
          }
        }
      }

      if (d > 0n || c > 0n) {
        grandDebit += d;
        grandCredit += c;
        rows.push({
          code: acc.code,
          name: acc.name,
          debitFormatted: formatMajorUnits(d),
          creditFormatted: formatMajorUnits(c),
        });
      }
    }

    return {
      rows,
      totalDebitFormatted: formatMajorUnits(grandDebit),
      totalCreditFormatted: formatMajorUnits(grandCredit),
      isBalanced: grandDebit === grandCredit,
    };
  }
}
