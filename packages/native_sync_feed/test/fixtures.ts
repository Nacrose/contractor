/**
 * Shared test fixtures (M03-T04) — imported by the test suite and the crash
 * child so schema and appliers are identical on both sides of the kill
 * boundary.
 *
 * PILOT DOMAIN: the daily report / field submission domain — explicitly
 * named per M03-T04 scope ("implement the M00-selected mechanism for one
 * explicitly named pilot domain"). It is the substrate of the M04 first
 * vertical workflow (daily log + photo) whose Flutter repository consumes
 * this feed (named in the evidence report; task id assigned at M04 R9
 * refinement, due M03-W10).
 *
 * The audited writer list below is transcribed from the M00 inventories
 * (inventory-routers.md, inventory-jobs-imports.md) for that domain.
 */

import type { Migration } from "../src/migrations.js";
import type { EntityApplier, RedactionPolicy } from "../src/contract.js";

/** App-owned pilot-domain migration (daily report / field submission tables). */
export const PILOT_DOMAIN_MIGRATION: Migration = {
  version: 3,
  name: "domain_daily_report_pilot",
  statements: [
    `CREATE TABLE daily_report (
       id TEXT PRIMARY KEY,
       tenant_id TEXT NOT NULL,
       project_id TEXT,
       site_note TEXT NOT NULL,
       worker_pan TEXT,
       bank_account TEXT,
       contact_phone TEXT,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE TABLE field_submission (
       id TEXT PRIMARY KEY,
       tenant_id TEXT NOT NULL,
       project_id TEXT,
       raw_payload TEXT NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
  ],
};

/**
 * Schema-driven redaction (ADR-0011 contract 3): worker PANs, bank details
 * and personal contact info never persist into the tenant change log.
 */
export const PILOT_REDACTION_POLICIES: RedactionPolicy[] = [
  {
    domain: "daily-report",
    schemaVersion: 1,
    strip: ["workerPan", "bankAccount"],
    mask: ["contactPhone"],
  },
  {
    domain: "field-submission",
    schemaVersion: 1,
    strip: ["workerPan", "bankAccount"],
    mask: ["contactPhone"],
  },
];

/** Entity appliers for the consumer: upsert/delete pilot-domain rows from redacted envelopes. */
export const PILOT_APPLIERS: Record<string, EntityApplier> = {
  "daily-report": (driver, event) => {
    if (event.op === "delete") {
      driver.prepare(`DELETE FROM daily_report WHERE id = ?`).run(event.entityId);
      return;
    }
    const payload = JSON.parse(event.payload) as Record<string, unknown>;
    driver
      .prepare(
        `INSERT INTO daily_report (id, tenant_id, project_id, site_note, worker_pan, bank_account, contact_phone, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           site_note = excluded.site_note, worker_pan = excluded.worker_pan,
           bank_account = excluded.bank_account, contact_phone = excluded.contact_phone,
           updated_at = excluded.updated_at`,
      )
      .run(
        event.entityId,
        event.tenantId,
        event.projectId,
        String(payload.siteNote ?? ""),
        payload.workerPan === undefined ? null : String(payload.workerPan),
        payload.bankAccount === undefined ? null : String(payload.bankAccount),
        payload.contactPhone === undefined ? null : String(payload.contactPhone),
        Date.now(),
      );
  },
  "field-submission": (driver, event) => {
    if (event.op === "delete") {
      driver.prepare(`DELETE FROM field_submission WHERE id = ?`).run(event.entityId);
      return;
    }
    driver
      .prepare(
        `INSERT INTO field_submission (id, tenant_id, project_id, raw_payload, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET raw_payload = excluded.raw_payload, updated_at = excluded.updated_at`,
      )
      .run(event.entityId, event.tenantId, event.projectId, event.payload, Date.now());
  },
};

/**
 * Audited pilot-domain writer list (M00 inventories). Migrated writers call
 * `publishAtomically` in the same transaction as their authoritative
 * mutation — the atomicity test iterates every entry. Intentionally
 * excluded writers are recorded here with reasons; the evidence report
 * mirrors this list.
 */
export interface PilotWriter {
  writer: string;
  source: string;
  domain: string;
  entity: string;
}

export const PILOT_WRITERS_MIGRATED: PilotWriter[] = [
  {
    writer: "router:fieldSubmission.submitFieldReport",
    source: "inventory-routers.md #57 field-submission.ts (ingests FieldSubmission; daily-report-sync normalizes into DailyReport*)",
    domain: "field-submission",
    entity: "field_submission",
  },
  {
    writer: "router:fieldPhotos.create",
    source: "inventory-routers.md #58 field-photos.ts (FieldPhoto metadata; attachment bytes are M03-T06)",
    domain: "field-submission",
    entity: "field_submission",
  },
  {
    writer: "router:dailyReport.create",
    source: "inventory-routers.md #14 daily-report.ts (5 mutations over DailyReport, MaterialTransaction, DailyReportAttachment)",
    domain: "daily-report",
    entity: "daily_report",
  },
  {
    writer: "router:dailyReport.update",
    source: "inventory-routers.md #14 daily-report.ts",
    domain: "daily-report",
    entity: "daily_report",
  },
  {
    writer: "router:dailyReportAttachments.attach",
    source: "inventory-routers.md #13 daily-report-attachments.ts (DailyReportAttachment metadata rows)",
    domain: "daily-report",
    entity: "daily_report",
  },
  {
    writer: "service:daily-report-sync",
    source: "inventory-jobs-imports.md (reconciliation service normalizing FieldSubmission -> DailyReport/DailyReportProgress/DailyReportMaterialConsumed/DailyReportEquipment/DailyReportWorkforce)",
    domain: "daily-report",
    entity: "daily_report",
  },
];

export const PILOT_WRITERS_EXCLUDED: Array<{ writer: string; reason: string }> = [
  {
    writer: "router:daily-report-access.ts (unmounted)",
    reason: "0 mutations (read-only legacy router); nothing to emit — confirmed by inventory-routers.md #12.",
  },
  {
    writer: "job:session.cleanup",
    reason: "Identity-domain maintenance (Session/LoginAttempt retention); client-invisible bookkeeping, not daily-report domain state.",
  },
  {
    writer: "job:outbox.dispatch",
    reason: "Notification dispatch bookkeeping (OutboxEvent/Notification); delivery state, not domain state — excluded from the sync feed by design.",
  },
];
