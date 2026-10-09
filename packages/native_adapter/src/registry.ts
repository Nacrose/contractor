/**
 * Seed operation registry for the native adapter (M03-T01).
 *
 * Each entry maps an operationId to the EXISTING authoritative service/engine
 * it must dispatch to, plus the guard stages that operation requires. Entries
 * below are seed EXEMPLARS sourced from the M00-T07 router inventory
 * (docs/reports/M00/inventory-routers.md, app commit 7d80083e) — they
 * demonstrate the mapping discipline, not full coverage. Full per-domain
 * activation happens in later M03 tasks, and each activation PR must verify
 * the guard set against the inventory row for that router.
 */

import { OperationMap } from "./contract.js";

export const SEED_OPERATIONS: OperationMap = {
  // field-submission.ts — createDomainRouter declarative pipeline, withIdempotency
  // (M00-T07 §3 row 26: mutation via daily-report-sync normalization).
  "fieldSubmission.submit": {
    kind: "mutation",
    service: "field-submission ingestion (daily-report-sync normalization, idempotency, audit-log)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "capability", "inputReferences", "idempotency"],
  },

  // site-expense.ts — createDomainRouter proc.write + financialGuard + capabilityGuard;
  // ledger-entry/bank-balance/fiscal-year-lock engines (M00-T07 §3 row 67).
  "siteExpense.create": {
    kind: "mutation",
    service: "site-expense engine (financial-event-log, bank-balance, fiscal-year-lock, ledger-entry)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "capability", "delegation", "financial", "fiscalLock", "idempotency"],
  },

  // vendor-bill.ts — ledger-entry + fiscal-year-lock + withIdempotency (M00-T07 §3 row 77).
  "vendorBill.create": {
    kind: "mutation",
    service: "vendor-bill engine (ledger-entry, financial-event-log, idempotency)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "delegation", "financial", "fiscalLock", "idempotency"],
  },

  // worksheet.ts — ipc-recalc engine, workbook revisioning (M00-T07 §3 row 79; §4 IPC engine).
  "worksheet.update": {
    kind: "mutation",
    service: "worksheet engine (workbook revisions, recalculation via ipc-recalc)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "fiscalLock"],
  },

  // gantt-tasks.ts — gantt-cpm engine (M00-T07 §3 row 34; §4 CPM engine, Nepal calendar).
  "ganttTasks.update": {
    kind: "mutation",
    service: "gantt-cpm engine (schedule recalculation, baseline/version snapshots)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "fiscalLock"],
  },

  // dashboard.ts — read-only surface (M00-T07 §3 row 15: queries only, no writes).
  "dashboard.summary": {
    kind: "query",
    service: "dashboard read service (aggregations over existing project services)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership"],
  },
};
