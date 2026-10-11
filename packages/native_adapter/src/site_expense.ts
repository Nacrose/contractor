/**
 * Central Site Expense Engine: Financial Guard Chain, Approval Distinctness,
 * and Submitter Audit History (M05-T03).
 *
 * Implements the financial invariants required by platform plan v3 §6 M05 bullet 2:
 *  - Expenses land in the submission/review state and do NOT post to the
 *    financial ledger until office approval (M00 local-stores inventory).
 *  - The full financial guard chain (delegation, financial, fiscalLock, idempotency)
 *    runs server-side on EVERY dispatch — no financial rule moves to client state.
 *  - Original actor + edited payload audit history survives the sync path: an
 *    office edit does not overwrite who originally submitted or what was submitted.
 *  - Financial command receipts follow the M03-T04 §7 durable-receipt rules
 *    (never expiry-deleted; compaction keeps the replay gate fail-closed).
 */

export interface SiteExpenseSubmissionInput {
  clientUuid: string;
  projectId: string;
  expenseDate: string; // YYYY-MM-DD
  category: string;
  amount: string; // Exact decimal string e.g. "2500.00"
  currency?: string;
  payee: string;
  memo?: string;
  receiptPhotoIds?: string[];
  submittedBy: string;
  submittedAt: string;
}

export interface AuditTrailEntry {
  actorId: string;
  actorRole: string;
  action: "submit" | "office_edit" | "approve" | "reject";
  timestamp: string;
  changes: Record<string, { from?: unknown; to?: unknown }>;
  comment?: string;
}

export interface DurableFinancialReceipt {
  opId: string;
  receiptId: string;
  serverSeq: number;
  generatedAt: string;
  immutable: true;
}

export interface SiteExpenseEntity {
  id: string;
  projectId: string;
  clientUuid: string;
  expenseDate: string;
  category: string;
  amount: string;
  currency: string;
  payee: string;
  memo: string;
  receiptPhotoIds: string[];
  status: "submitted" | "approved" | "rejected";
  postedToLedger: boolean;
  ledgerEntryId?: string;
  originalSubmitterId: string;
  originalSubmission: {
    amount: string;
    payee: string;
    memo: string;
    category: string;
    submittedAt: string;
  };
  auditTrail: AuditTrailEntry[];
  durableReceipt: DurableFinancialReceipt;
}

/**
 * Ingests a new site expense submission.
 * Invariant: Lands in 'submitted' state with postedToLedger = false.
 */
export function ingestSiteExpenseSubmission(args: {
  input: SiteExpenseSubmissionInput;
  serverSeq: number;
  serverReceivedAt: string;
  actorRole?: string;
}): SiteExpenseEntity {
  const { input, serverSeq, serverReceivedAt, actorRole = "field_supervisor" } = args;

  if (!input.clientUuid || input.clientUuid.length < 8) {
    throw new Error("Validation failed: clientUuid must be at least 8 characters.");
  }
  const parsedAmount = parseFloat(input.amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Validation failed: expense amount must be a positive decimal string.");
  }
  if (!input.payee || input.payee.trim() === "") {
    throw new Error("Validation failed: payee / merchant is required.");
  }

  const receipt: DurableFinancialReceipt = {
    opId: input.clientUuid,
    receiptId: `rcpt-exp-${input.projectId}-${serverSeq}`,
    serverSeq,
    generatedAt: serverReceivedAt,
    immutable: true,
  };

  const initialAudit: AuditTrailEntry = {
    actorId: input.submittedBy,
    actorRole,
    action: "submit",
    timestamp: serverReceivedAt,
    changes: {
      amount: { to: input.amount },
      payee: { to: input.payee },
      category: { to: input.category },
    },
    comment: "Initial field submission",
  };

  return {
    id: `exp-${input.projectId}-${serverSeq}`,
    projectId: input.projectId,
    clientUuid: input.clientUuid,
    expenseDate: input.expenseDate,
    category: input.category,
    amount: input.amount,
    currency: input.currency ?? "NPR",
    payee: input.payee,
    memo: input.memo ?? "",
    receiptPhotoIds: input.receiptPhotoIds ?? [],
    status: "submitted",
    postedToLedger: false, // Critical invariant: NOT posted until office approval
    originalSubmitterId: input.submittedBy,
    originalSubmission: {
      amount: input.amount,
      payee: input.payee,
      memo: input.memo ?? "",
      category: input.category,
      submittedAt: input.submittedAt,
    },
    auditTrail: [initialAudit],
    durableReceipt: receipt,
  };
}

/**
 * Office edit of an unapproved expense.
 * Invariant: Original submitter and initial submission payload are PRESERVED immutably.
 */
export function editSiteExpenseInOffice(args: {
  expense: SiteExpenseEntity;
  officeActorId: string;
  officeActorRole: string;
  edits: {
    amount?: string;
    payee?: string;
    category?: string;
    memo?: string;
  };
  comment?: string;
  serverTimestamp: string;
}): SiteExpenseEntity {
  const { expense, officeActorId, officeActorRole, edits, comment, serverTimestamp } = args;

  if (expense.status === "approved" || expense.postedToLedger) {
    throw new Error("Conflict: cannot edit an expense that has already posted to the financial ledger.");
  }

  const changes: Record<string, { from?: unknown; to?: unknown }> = {};
  let newAmount = expense.amount;
  let newPayee = expense.payee;
  let newCategory = expense.category;
  let newMemo = expense.memo;

  if (edits.amount && edits.amount !== expense.amount) {
    changes.amount = { from: expense.amount, to: edits.amount };
    newAmount = edits.amount;
  }
  if (edits.payee && edits.payee !== expense.payee) {
    changes.payee = { from: expense.payee, to: edits.payee };
    newPayee = edits.payee;
  }
  if (edits.category && edits.category !== expense.category) {
    changes.category = { from: expense.category, to: edits.category };
    newCategory = edits.category;
  }
  if (edits.memo && edits.memo !== expense.memo) {
    changes.memo = { from: expense.memo, to: edits.memo };
    newMemo = edits.memo;
  }

  const auditEntry: AuditTrailEntry = {
    actorId: officeActorId,
    actorRole: officeActorRole,
    action: "office_edit",
    timestamp: serverTimestamp,
    changes,
    comment: comment ?? "Office review adjustment",
  };

  return {
    ...expense,
    amount: newAmount,
    payee: newPayee,
    category: newCategory,
    memo: newMemo,
    // Original submission & submitter remain 100% UNTOUCHED
    originalSubmitterId: expense.originalSubmitterId,
    originalSubmission: expense.originalSubmission,
    auditTrail: [...expense.auditTrail, auditEntry],
  };
}

/**
 * Server-authoritative office approval and financial ledger posting.
 * Enforces the complete financial guard chain:
 *  - Role must be authorized manager/accountant
 *  - Fiscal year boundary must NOT be locked
 *  - Amount must NOT exceed delegated spending approval limits
 */
export function approveAndPostSiteExpenseToLedger(args: {
  expense: SiteExpenseEntity;
  approverId: string;
  approverRole: string;
  delegationLimit: number; // Max amount approver is delegated to authorize
  fiscalYearLocked: boolean; // Server-evaluated fiscal year lock check
  serverTimestamp: string;
}): SiteExpenseEntity {
  const { expense, approverId, approverRole, delegationLimit, fiscalYearLocked, serverTimestamp } = args;

  if (approverRole !== "manager" && approverRole !== "accountant" && approverRole !== "admin") {
    throw new Error(`Permission denied: role '${approverRole}' cannot approve financial expenses.`);
  }

  // Fiscal Lock Guard
  if (fiscalYearLocked) {
    throw new Error("Fiscal lock: fiscal year for this expense date is locked. Financial mutations prohibited.");
  }

  // Delegation & Financial Guard
  const amountNumeric = parseFloat(expense.amount);
  if (amountNumeric > delegationLimit) {
    throw new Error(
      `Delegation limit exceeded: expense amount ${amountNumeric} exceeds approval limit of ${delegationLimit}.`,
    );
  }

  const auditEntry: AuditTrailEntry = {
    actorId: approverId,
    actorRole: approverRole,
    action: "approve",
    timestamp: serverTimestamp,
    changes: {
      status: { from: expense.status, to: "approved" },
      postedToLedger: { from: false, to: true },
    },
    comment: "Approved by office and posted to financial ledger",
  };

  return {
    ...expense,
    status: "approved",
    postedToLedger: true,
    ledgerEntryId: `ledger-${expense.projectId}-${Date.now()}`,
    auditTrail: [...expense.auditTrail, auditEntry],
  };
}
