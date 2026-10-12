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

export const DAILY_REPORT_OPERATION = "workflow.dailyReport.createFieldReport" as const;
export const DAILY_REPORT_UPDATE_OPERATION = "workflow.dailyReport.updateFieldReport" as const;
export const ATTENDANCE_RECORD_OPERATION = "attendance.record" as const;
export const ATTENDANCE_UPDATE_OPERATION = "attendance.update" as const;
export const SITE_EXPENSE_OPERATION = "siteExpense.create" as const;
export const MATERIAL_DELIVERY_OPERATION = "material.delivery" as const;
export const FIELD_PHOTOS_UPLOAD_OPERATION = "fieldPhotos.upload" as const;

export const SEED_OPERATIONS: OperationMap = {
  // M04-T03 activation — the product native-sync route calls the existing
  // daily-report service, preserving its project edit guard, transactional
  // photo-reference checks, and durable clientUuid idempotency.
  [DAILY_REPORT_OPERATION]: {
    kind: "mutation",
    service: "workflow.dailyReport.createFieldReport",
    guards: [
      "identity",
      "tenantScope",
      "rateLimit",
      "projectMembership",
      "projectPermission",
      "inputReferences",
      "idempotency",
    ],
  },

  [DAILY_REPORT_UPDATE_OPERATION]: {
    kind: "mutation",
    service: "workflow.dailyReport.updateReport",
    guards: [
      "identity",
      "tenantScope",
      "rateLimit",
      "projectMembership",
      "projectPermission",
      "inputReferences",
      "idempotency",
    ],
  },

  // M05-T02 expansion — attendance submissions (M00 router inventory row 43:
  // leave.ts / StaffAttendance; row 39: hr.ts; row 26: field-submission.ts).
  // Central duplicate rules and server-authoritative timestamps enforced.
  [ATTENDANCE_RECORD_OPERATION]: {
    kind: "mutation",
    service: "attendance submission engine (field-submission ingestion / daily-report-sync normalization, idempotency, audit-log)",
    guards: [
      "identity",
      "tenantScope",
      "rateLimit",
      "projectMembership",
      "projectPermission",
      "inputReferences",
      "idempotency",
    ],
  },

  [ATTENDANCE_UPDATE_OPERATION]: {
    kind: "mutation",
    service: "attendance update engine (field-submission ingestion / daily-report-sync normalization, idempotency, audit-log)",
    guards: [
      "identity",
      "tenantScope",
      "rateLimit",
      "projectMembership",
      "projectPermission",
      "inputReferences",
      "idempotency",
    ],
  },

  // field-submission.ts — createDomainRouter declarative pipeline, withIdempotency
  // (M00-T07 §3 row 26: mutation via daily-report-sync normalization).
  "fieldSubmission.submit": {
    kind: "mutation",
    service: "field-submission ingestion (daily-report-sync normalization, idempotency, audit-log)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "capability", "inputReferences", "idempotency"],
  },

  // site-expense.ts — createDomainRouter proc.write + financialGuard + capabilityGuard;
  // ledger-entry/bank-balance/fiscal-year-lock engines (M00-T07 §3 row 67).
  [SITE_EXPENSE_OPERATION]: {
    kind: "mutation",
    service: "site-expense engine (financial-event-log, bank-balance, fiscal-year-lock, ledger-entry)",
    guards: ["identity", "tenantScope", "rateLimit", "projectMembership", "projectPermission", "capability", "delegation", "financial", "fiscalLock", "idempotency"],
  },

  // M05-T04 expansion — MRR / delivery submissions (M00 router inventory
  // row 26: field-submission.ts and row 44-46: material routers).
  // Material reconciliation and office review flow reused.
  [MATERIAL_DELIVERY_OPERATION]: {
    kind: "mutation",
    service: "material delivery ingestion (field-submission ingestion / daily-report-sync normalization, idempotency, audit-log)",
    guards: [
      "identity",
      "tenantScope",
      "rateLimit",
      "projectMembership",
      "projectPermission",
      "capability",
      "inputReferences",
      "idempotency",
    ],
  },

  // M05-T05 expansion — field photos through resumable pipeline (M00 router
  // inventory row 25: field-photos.ts).
  [FIELD_PHOTOS_UPLOAD_OPERATION]: {
    kind: "mutation",
    service: "field-photos engine (resumable chunks, sharp digest verification, StoredFile / FieldPhoto registration)",
    guards: [
      "identity",
      "tenantScope",
      "rateLimit",
      "projectMembership",
      "projectPermission",
      "inputReferences",
      "idempotency",
    ],
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
