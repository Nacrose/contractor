/**
 * Versioned schema migrations for the snapshot package (M03-T05).
 *
 * Same rules as the M03-T03/T04 migration runners (recorded, testable):
 * migrations are data — ordered, contiguously versioned from 1, each applied
 * inside its OWN transaction together with the `schema_version` bump, so an
 * interrupted migration rolls back to the previous version and the database
 * stays re-migratable. The app layer extends the schema with its own
 * `extraMigrations` (higher versions); contiguity is validated up front.
 *
 * v1 — server side: `snapshot_manifest` (snapshot identity + watermark +
 *       state) and `snapshot_object` (materialized rows and tombstones in a
 *       deterministic total order). Swept snapshots keep their manifest row
 *       with state='swept' so cursors referencing them surface typed
 *       `resync_required` instead of a confusing not-found.
 * v2 — client side: `snapshot_checkpoint` (per account+tenant+scope bootstrap
 *       cursor; state machine applying→complete) and `snapshot_page_dedup`
 *       (page identity = snapshot + firstOrd; duplicate delivery is a no-op).
 *       The package ships NO domain tables — applies go through ports.
 */

import { repositoryError } from "./contract.js";
import type { SqlDriver } from "./driver.js";

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const SNAPSHOT_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "snapshot_server_baseline",
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       ) WITHOUT ROWID`,
      `CREATE TABLE snapshot_manifest (
         snapshot_id TEXT PRIMARY KEY,
         tenant_id TEXT NOT NULL,
         project_id TEXT,
         watermark INTEGER NOT NULL,
         object_count INTEGER NOT NULL,
         tombstone_count INTEGER NOT NULL,
         state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','swept')),
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX idx_snapshot_manifest_tenant ON snapshot_manifest (tenant_id, created_at)`,
      `CREATE TABLE snapshot_object (
         snapshot_id TEXT NOT NULL REFERENCES snapshot_manifest(snapshot_id) ON DELETE CASCADE,
         ord INTEGER NOT NULL,
         domain TEXT NOT NULL,
         entity_id TEXT NOT NULL,
         op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
         payload TEXT,
         PRIMARY KEY (snapshot_id, ord)
       )`,
      `CREATE INDEX idx_snapshot_object_lookup ON snapshot_object (snapshot_id, domain, entity_id)`,
    ],
  },
  {
    version: 2,
    name: "snapshot_client_bootstrap",
    statements: [
      `CREATE TABLE snapshot_checkpoint (
         account_id TEXT NOT NULL,
         tenant_id TEXT NOT NULL,
         scope_key TEXT NOT NULL,
         snapshot_id TEXT NOT NULL,
         watermark INTEGER NOT NULL,
         pages_applied INTEGER NOT NULL DEFAULT 0,
         rows_applied INTEGER NOT NULL DEFAULT 0,
         last_after_ord INTEGER NOT NULL DEFAULT -1,
         state TEXT NOT NULL DEFAULT 'applying' CHECK (state IN ('applying','complete')),
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (account_id, tenant_id, scope_key)
       )`,
      `CREATE TABLE snapshot_page_dedup (
         account_id TEXT NOT NULL,
         snapshot_id TEXT NOT NULL,
         first_ord INTEGER NOT NULL,
         applied_at INTEGER NOT NULL,
         PRIMARY KEY (account_id, snapshot_id, first_ord)
       )`,
      `CREATE TABLE snapshot_applied_entity (
         account_id TEXT NOT NULL,
         scope_key TEXT NOT NULL,
         snapshot_id TEXT NOT NULL,
         domain TEXT NOT NULL,
         entity_id TEXT NOT NULL,
         op TEXT NOT NULL,
         applied_at INTEGER NOT NULL,
         PRIMARY KEY (account_id, snapshot_id, domain, entity_id)
       )`,
    ],
  },
];

export interface MigrateOptions {
  /** App-owned migrations appended after the snapshot set (higher versions). */
  extraMigrations?: Migration[];
}

export interface MigrateResult {
  /** Versions applied during THIS call (empty when already current). */
  applied: number[];
  /** Schema version after the call. */
  currentVersion: number;
}

function readVersion(driver: SqlDriver): number {
  const row = driver.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get();
  if (!row) return 0;
  const v = Number(row.value);
  return Number.isFinite(v) ? v : 0;
}

function writeVersion(driver: SqlDriver, version: number): void {
  driver
    .prepare(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(String(version));
}

/** Validate the combined migration set: versions contiguous from 1, ascending, unique. */
export function validateMigrations(all: Migration[]): void {
  let expected = 1;
  for (const m of all) {
    if (m.version !== expected) {
      throw repositoryError("misconfigured", `Migrations must be contiguous from 1; expected ${expected}, got ${m.version} ('${m.name}').`);
    }
    if (!Array.isArray(m.statements) || m.statements.length === 0) {
      throw repositoryError("misconfigured", `Migration ${m.version} ('${m.name}') has no statements.`);
    }
    expected += 1;
  }
}

/**
 * Apply pending migrations. Each migration runs in its own
 * BEGIN IMMEDIATE transaction including the version bump.
 */
export function migrate(driver: SqlDriver, options: MigrateOptions = {}): MigrateResult {
  const combined = [...SNAPSHOT_MIGRATIONS, ...(options.extraMigrations ?? [])];
  validateMigrations(combined);

  driver.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID`);
  const current = readVersion(driver);
  const applied: number[] = [];

  for (const m of combined) {
    if (m.version <= current) continue;
    driver.exec("BEGIN IMMEDIATE");
    try {
      for (const stmt of m.statements) driver.exec(stmt);
      writeVersion(driver, m.version);
      driver.exec("COMMIT");
      applied.push(m.version);
    } catch (e) {
      try {
        driver.exec("ROLLBACK");
      } catch {
        // see driver.ts withImmediateTransaction: reopen path is the recovery boundary
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw repositoryError("migration_failed", `Migration ${m.version} ('${m.name}') failed and was rolled back.`, {
        sqlite: msg,
      });
    }
  }

  return { applied, currentVersion: readVersion(driver) };
}
