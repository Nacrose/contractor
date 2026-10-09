/**
 * Shared test fixtures (M03-T05) — imported by the test suite and the crash
 * child so schema and appliers are identical on both sides of the kill
 * boundary.
 *
 * PILOT DOMAIN: the daily report / field submission domain — the same
 * substrate as M03-T04's feed evidence, so the bootstrap-to-feed handoff is
 * proven on one continuous domain model. The Flutter consumer of this
 * bootstrap surface is the M04 repository/snapshot task (named in the
 * evidence report; task id assigned at M04 R9 refinement, due M03-T10).
 */

import type { Migration } from "../src/migrations.js";
import type { PendingWorkProbe, SnapshotEntityApplier, SnapshotSource } from "../src/contract.js";

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
 * In-memory row store the sources read from — the test's stand-in for the
 * server's authoritative tables (the mount injects real SELECTs in the app;
 * here the data lives in the test so concurrent-write scenarios can mutate
 * it independently of what a snapshot already materialized).
 */
export interface SourceRow {
  entityId: string;
  payload: string;
}

export function makeSource(
  domain: string,
  store: Map<string, SourceRow>,
  tombstones: Map<string, string[]>,
): SnapshotSource {
  return {
    domain,
    readRows: (tenantId, _projectId) =>
      [...store.values()].filter((r) => r.entityId.startsWith(tenantId)).sort((a, b) => (a.entityId < b.entityId ? -1 : 1)),
    readTombstones: (tenantId, _projectId) => [...(tombstones.get(`${domain}:${tenantId}`) ?? [])].sort(),
  };
}

/** Entity appliers for the client: upsert/delete pilot-domain rows from snapshot payloads. */
export const PILOT_APPLIERS: Record<string, SnapshotEntityApplier> = {
  "daily-report": {
    upsert: (driver, _domain, entityId, payload) => {
      const p = JSON.parse(payload) as { tenantId: string; projectId: string | null; siteNote: string };
      driver
        .prepare(
          `INSERT INTO daily_report (id, tenant_id, project_id, site_note, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET tenant_id = excluded.tenant_id, project_id = excluded.project_id,
             site_note = excluded.site_note, updated_at = excluded.updated_at`,
        )
        .run(entityId, p.tenantId, p.projectId, p.siteNote, Date.now());
    },
    delete: (driver, _domain, entityId) => {
      driver.prepare(`DELETE FROM daily_report WHERE id = ?`).run(entityId);
    },
    localIds: (driver) =>
      (driver.prepare(`SELECT id FROM daily_report ORDER BY id ASC`).all() as Array<Record<string, unknown>>).map((r) =>
        String(r.id),
      ),
  },
  "field-submission": {
    upsert: (driver, _domain, entityId, payload) => {
      const p = JSON.parse(payload) as { tenantId: string; projectId: string | null; rawPayload: string };
      driver
        .prepare(
          `INSERT INTO field_submission (id, tenant_id, project_id, raw_payload, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET raw_payload = excluded.raw_payload, updated_at = excluded.updated_at`,
        )
        .run(entityId, p.tenantId, p.projectId, p.rawPayload, Date.now());
    },
    delete: (driver, _domain, entityId) => {
      driver.prepare(`DELETE FROM field_submission WHERE id = ?`).run(entityId);
    },
    localIds: (driver) =>
      (driver.prepare(`SELECT id FROM field_submission ORDER BY id ASC`).all() as Array<Record<string, unknown>>).map((r) =>
        String(r.id),
      ),
  },
};

/**
 * Pending-work probe wired in tests to a local set of protected ids (the
 * mount wires this to the M03-T03 outbox; the package never imports it).
 */
export function makeProbe(protectedByDomain: Record<string, string[]>): PendingWorkProbe & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    protectedEntityIds(accountId: string, domain: string): string[] {
      seen.push(`${accountId}:${domain}`);
      return protectedByDomain[domain] ?? [];
    },
  };
}

/** Local daily-report rows, for assertions. */
export function localReportIds(driver: { prepare(sql: string): { all(...p: unknown[]): Record<string, unknown>[] } }): string[] {
  return (driver.prepare(`SELECT id FROM daily_report ORDER BY id ASC`).all() as Array<Record<string, unknown>>).map((r) => String(r.id));
}
