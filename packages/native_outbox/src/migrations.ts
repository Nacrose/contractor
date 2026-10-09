/**
 * Versioned schema migrations for the outbox repository (M03-T03).
 *
 * Rules (recorded, testable):
 *   - Migrations are data: ordered, contiguously versioned from 1, each one
 *     a list of SQL statements applied inside its OWN transaction together
 *     with the `schema_version` bump. An interrupted migration therefore
 *     rolls back to the previous version — the database stays consistent
 *     and re-migratable (recovery test proves it).
 *   - The app layer extends the schema with its own `extraMigrations`
 *     (domain tables) using higher version numbers; the runner validates
 *     contiguity and rejects duplicates/lower versions up front.
 *   - A database whose version is AHEAD of the provided migration set is
 *     left untouched (forward-compatible read: the outbox tables it owns
 *     keep their shipped shape).
 */

import { repositoryError } from "./contract.js";
import type { SqlDriver } from "./driver.js";

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const OUTBOX_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline_outbox",
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       ) WITHOUT ROWID`,
      `CREATE TABLE pending_op (
         id TEXT PRIMARY KEY,
         account_id TEXT NOT NULL,
         project_id TEXT,
         kind TEXT NOT NULL,
         payload TEXT NOT NULL,
         state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','in_flight','accepted','rejected')),
         attempts INTEGER NOT NULL DEFAULT 0,
         next_attempt_at INTEGER,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         last_error TEXT,
         accepted_receipt TEXT,
         digest TEXT
       )`,
      `CREATE INDEX idx_pending_op_dispatch ON pending_op (account_id, state, created_at)`,
      `CREATE TABLE private_draft (
         id TEXT PRIMARY KEY,
         account_id TEXT NOT NULL,
         project_id TEXT,
         kind TEXT NOT NULL,
         body TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX idx_private_draft_account ON private_draft (account_id, updated_at)`,
      `CREATE TABLE attachment_stage (
         id TEXT PRIMARY KEY,
         account_id TEXT NOT NULL,
         project_id TEXT,
         local_path TEXT NOT NULL,
         digest TEXT NOT NULL,
         bytes INTEGER NOT NULL,
         state TEXT NOT NULL CHECK (state IN ('staging','staged','finalized','registered','failed')),
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX idx_attachment_stage_account ON attachment_stage (account_id, state)`,
    ],
  },
  {
    version: 2,
    name: "op_dependencies",
    statements: [
      `CREATE TABLE op_dependency (
         pending_op_id TEXT NOT NULL REFERENCES pending_op(id) ON DELETE CASCADE,
         depends_on_op_id TEXT NOT NULL REFERENCES pending_op(id) ON DELETE CASCADE,
         PRIMARY KEY (pending_op_id, depends_on_op_id)
       ) WITHOUT ROWID`,
      `CREATE INDEX idx_op_dependency_dep ON op_dependency (depends_on_op_id)`,
    ],
  },
];

export interface MigrateOptions {
  /** App-owned migrations appended after the outbox set (higher versions). */
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
  const combined = [...OUTBOX_MIGRATIONS, ...(options.extraMigrations ?? [])];
  validateMigrations(combined);

  // meta must exist before versioning reads; migration 1 owns its creation,
  // but a version-0 database may not have run it yet.
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
