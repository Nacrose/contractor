import test from "node:test";
import assert from "node:assert/strict";
import {
  approveAndPostSiteExpenseToLedger,
  editSiteExpenseInOffice,
  ingestSiteExpenseSubmission,
} from "../src/site_expense.js";

test("site expense: lands in submitted state and does NOT post to financial ledger initially", () => {
  const expense = ingestSiteExpenseSubmission({
    input: {
      clientUuid: "exp-uuid-001",
      projectId: "proj-1",
      expenseDate: "2026-10-12",
      category: "fuel",
      amount: "4500.00",
      payee: "Himalayan Fuel Station",
      memo: "Generator diesel",
      submittedBy: "supervisor-1",
      submittedAt: "2026-10-12T09:00:00Z",
    },
    serverSeq: 101,
    serverReceivedAt: "2026-10-12T09:01:00Z",
  });

  assert.equal(expense.status, "submitted");
  assert.equal(expense.postedToLedger, false);
  assert.equal(expense.ledgerEntryId, undefined);
  assert.equal(expense.originalSubmitterId, "supervisor-1");
  assert.equal(expense.originalSubmission.amount, "4500.00");
  assert.equal(expense.originalSubmission.payee, "Himalayan Fuel Station");
  assert.equal(expense.auditTrail.length, 1);
  assert.equal(expense.auditTrail[0].action, "submit");
  assert.equal(expense.durableReceipt.opId, "exp-uuid-001");
  assert.equal(expense.durableReceipt.serverSeq, 101);
});

test("site expense: office edit preserves original submitter and initial submission audit history", () => {
  const original = ingestSiteExpenseSubmission({
    input: {
      clientUuid: "exp-uuid-002",
      projectId: "proj-1",
      expenseDate: "2026-10-12",
      category: "food",
      amount: "1500.00",
      payee: "Site Canteen",
      memo: "Crew snacks",
      submittedBy: "field-sup-john",
      submittedAt: "2026-10-12T10:00:00Z",
    },
    serverSeq: 102,
    serverReceivedAt: "2026-10-12T10:01:00Z",
  });

  // Office manager adjusts amount and adds comment
  const edited = editSiteExpenseInOffice({
    expense: original,
    officeActorId: "pm-alice",
    officeActorRole: "manager",
    edits: {
      amount: "1350.00", // Deducted unapproved item
      memo: "Crew snacks (Rs. 150 personal item removed)",
    },
    comment: "Adjusted per site policy",
    serverTimestamp: "2026-10-12T11:00:00Z",
  });

  // Current values are updated
  assert.equal(edited.amount, "1350.00");
  assert.equal(edited.memo, "Crew snacks (Rs. 150 personal item removed)");
  assert.equal(edited.postedToLedger, false);

  // Original submitter and original submission are 100% UNTOUCHED
  assert.equal(edited.originalSubmitterId, "field-sup-john");
  assert.equal(edited.originalSubmission.amount, "1500.00");
  assert.equal(edited.originalSubmission.payee, "Site Canteen");
  assert.equal(edited.originalSubmission.submittedAt, "2026-10-12T10:00:00Z");

  // Audit trail captures both actions
  assert.equal(edited.auditTrail.length, 2);
  assert.equal(edited.auditTrail[0].action, "submit");
  assert.equal(edited.auditTrail[0].actorId, "field-sup-john");
  assert.equal(edited.auditTrail[1].action, "office_edit");
  assert.equal(edited.auditTrail[1].actorId, "pm-alice");
  assert.deepEqual(edited.auditTrail[1].changes.amount, { from: "1500.00", to: "1350.00" });
});

test("financial guard chain: fiscal year lock rejects ledger posting", () => {
  const expense = ingestSiteExpenseSubmission({
    input: {
      clientUuid: "exp-uuid-003",
      projectId: "proj-1",
      expenseDate: "2025-03-31", // Old fiscal year date
      category: "tools",
      amount: "2000.00",
      payee: "Hardware Store",
      submittedBy: "user-1",
      submittedAt: "2025-03-31T12:00:00Z",
    },
    serverSeq: 103,
    serverReceivedAt: "2026-10-12T12:00:00Z",
  });

  assert.throws(
    () =>
      approveAndPostSiteExpenseToLedger({
        expense,
        approverId: "manager-1",
        approverRole: "manager",
        delegationLimit: 50000,
        fiscalYearLocked: true, // Fiscal year boundary locked!
        serverTimestamp: "2026-10-12T12:05:00Z",
      }),
    /Fiscal lock: fiscal year for this expense date is locked/,
  );
});

test("financial guard chain: delegation limit is enforced server-side", () => {
  const highValueExpense = ingestSiteExpenseSubmission({
    input: {
      clientUuid: "exp-uuid-004",
      projectId: "proj-1",
      expenseDate: "2026-10-12",
      category: "equipment_hire",
      amount: "75000.00", // Large expense
      payee: "Heavy Equipment Rental",
      submittedBy: "user-1",
      submittedAt: "2026-10-12T12:00:00Z",
    },
    serverSeq: 104,
    serverReceivedAt: "2026-10-12T12:00:00Z",
  });

  // Approver with low delegation limit (e.g. 50,000) is rejected
  assert.throws(
    () =>
      approveAndPostSiteExpenseToLedger({
        expense: highValueExpense,
        approverId: "jr-manager",
        approverRole: "manager",
        delegationLimit: 50000, // Insufficient limit
        fiscalYearLocked: false,
        serverTimestamp: "2026-10-12T12:10:00Z",
      }),
    /Delegation limit exceeded/,
  );

  // Approver with senior delegation limit (e.g. 100,000) succeeds and posts to ledger
  const approved = approveAndPostSiteExpenseToLedger({
    expense: highValueExpense,
    approverId: "sr-finance-director",
    approverRole: "manager",
    delegationLimit: 100000,
    fiscalYearLocked: false,
    serverTimestamp: "2026-10-12T12:15:00Z",
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.postedToLedger, true);
  assert.ok(approved.ledgerEntryId);
  assert.equal(approved.auditTrail[1].action, "approve");
  assert.equal(approved.auditTrail[1].actorId, "sr-finance-director");
});

test("office edit: cannot edit after an expense is posted to the ledger", () => {
  const expense = ingestSiteExpenseSubmission({
    input: {
      clientUuid: "exp-uuid-005",
      projectId: "proj-1",
      expenseDate: "2026-10-12",
      category: "misc",
      amount: "500.00",
      payee: "Stationery",
      submittedBy: "user-1",
      submittedAt: "2026-10-12T12:00:00Z",
    },
    serverSeq: 105,
    serverReceivedAt: "2026-10-12T12:00:00Z",
  });

  const posted = approveAndPostSiteExpenseToLedger({
    expense,
    approverId: "manager-1",
    approverRole: "manager",
    delegationLimit: 10000,
    fiscalYearLocked: false,
    serverTimestamp: "2026-10-12T12:05:00Z",
  });

  assert.throws(
    () =>
      editSiteExpenseInOffice({
        expense: posted,
        officeActorId: "pm-1",
        officeActorRole: "manager",
        edits: { amount: "600.00" },
        serverTimestamp: "2026-10-12T12:10:00Z",
      }),
    /Conflict: cannot edit an expense that has already posted to the financial ledger/,
  );
});
