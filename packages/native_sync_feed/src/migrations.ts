/**
 * Versioned schema migrations for the change feed (M03-T04).
 *
 * Same rules as the native_outbox migrations (M03-T03): ordered, contiguous
 * from 1, each applied inside its OWN transaction together with the
 * `schema_version` bump — an interrupted migration rolls back to the
 * previous version and stays re-migratable. The app layer extends the set
 * with `extraMigrations` (pilot-domain tables) at higher versions.
 */

import { repositoryError } from "./contract.js";
import type { SqlDriver } from "./driver.js";

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const FEED_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline_tenant_change_log",
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       ) WITHOUT ROWID`,
      // AUTOINCREMENT is deliberate: retention sweeps delete the oldest seqs,
      // and a plain INTEGER PRIMARY KEY would reuse rowids of deleted rows,
      // colliding with stale consumer cursors. AUTOINCREMENT guarantees
      // commit positions are never reused (pinned by test).
      `CREATE TABLE feed_event (
         seq INTEGER PRIMARY KEY AUTOINCREMENT,
         tenant_id TEXT NOT NULL,
         project_id TEXT,
         domain TEXT NOT NULL,
         entity TEXT NOT NULL,
         entity_id TEXT NOT NULL,
         op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
         payload TEXT NOT NULL,
         schema_version INTEGER NOT NULL,
         writer TEXT NOT NULL,
         event_id TEXT NOT NULL UNIQUE,
         published_at INTEGER NOT NULL
       )`,
      `CREATE INDEX idx_feed_event_tenant_seq ON feed_event (tenant_id, seq)`,
      `CREATE INDEX idx_feed_event_tenant_project ON feed_event (tenant_id, project_id, seq)`,
      `CREATE TABLE feed_watermark (
         partition TEXT PRIMARY KEY,
         floor_seq INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       ) WITHOUT ROWID`,
      `INSERT OR IGNORE INTO feed_watermark (partition, floor_seq, updated_at) VALUES ('global', 0, 0)`,
    ],
  },
  {
    version: 2,
    name: "consumer_checkpoint_dedup_receipts",
    statements: [
      `CREATE TABLE sync_checkpoint (
         account_id TEXT NOT NULL,
         tenant_id TEXT NOT NULL,
         confirmed_seq INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (account_id, tenant_id)
       ) WITHOUT ROWID`,
      `CREATE TABLE sync_inbox_dedup (
         account_id TEXT NOT NULL,
         event_id TEXT NOT NULL,
         seq INTEGER NOT NULL,
         applied_at INTEGER NOT NULL,
         PRIMARY KEY (account_id, event_id)
       ) WITHOUT ROWID`,
      `CREATE INDEX idx_sync_inbox_dedup_seq ON sync_inbox_dedup (account_id, seq)`,
      `CREATE TABLE command_receipt (
         account_id TEXT NOT NULL,
         op_id TEXT NOT NULL,
         domain TEXT NOT NULL,
         financially_effective INTEGER NOT NULL CHECK (financially_effective IN (0,1)),
         outcome TEXT NOT NULL,
         outcome_digest TEXT NOT NULL,
         payload_digest TEXT,
         created_at INTEGER NOT NULL,
         compacted INTEGER NOT NULL DEFAULT 0 CHECK (compacted IN (0,1)),
         PRIMARY KEY (account_id, op_id)
       ) WITHOUT ROWID`,
      `CREATE INDEX idx_command_receipt_sweep ON command_receipt (account_id, financially_effective, created_at)`,
    ],
  },
];

export interface MigrateOptions {
  /** App-owned migrations appended after the feed set (higher versions). */
  extraMigrations?: Migration[];
}

export interface MigrateResult {
  applied: number[];
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
  const combined = [...FEED_MIGRATIONS, ...(options.extraMigrations ?? [])];
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
        // see withImmediateTransaction: reopen path is the recovery boundary
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw repositoryError("migration_failed", `Migration ${m.version} ('${m.name}') failed and was rolled back.`, {
        sqlite: msg,
      });
    }
  }

  return { applied, currentVersion: readVersion(driver) };
}
