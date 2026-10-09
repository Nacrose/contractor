/**
 * Versioned schema migrations for the attachment package (M03-T06).
 *
 * Same rules as the M03-T03/T04/T05 migration runners (recorded, testable):
 * migrations are data — ordered, contiguously versioned from 1, each applied
 * inside its OWN transaction together with the `schema_version` bump, so an
 * interrupted migration rolls back to the previous version and the database
 * stays re-migratable. The app layer extends the schema with its own
 * `extraMigrations` (higher versions); contiguity is validated up front.
 *
 * v1 — client reconciliation journal:
 *   `attachment` — one row per attachment transfer (state machine,
 *     verified digest, byte count, typed failure + resume step, bounded
 *     backoff, server receipt). Registered receipts are the ONLY proof a
 *     server registration happened; nothing is ever auto-registered.
 *   `attachment_event` — append-only sanitized journal (ids, digests,
 *     offsets, counts, receipts — never payload bytes). The reconciler
 *     reads reality (object store + server), the journal explains history.
 */

import { transferError } from "./contract.js";
import type { SqlDriver } from "./driver.js";

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const ATTACHMENT_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "attachment_journal_baseline",
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       ) WITHOUT ROWID`,
      `CREATE TABLE attachment (
         id TEXT NOT NULL,
         account_id TEXT NOT NULL,
         project_id TEXT,
         source_path TEXT NOT NULL,
         object_key TEXT,
         digest TEXT,
         bytes INTEGER,
         state TEXT NOT NULL DEFAULT 'staging'
           CHECK (state IN ('staging','staged','finalized','registered','failed')),
         failure_kind TEXT CHECK (failure_kind IN
           ('retryable','rejection','revoked','storage','digest_mismatch','source_missing','internal')),
         failure_step TEXT CHECK (failure_step IN ('stage','finalize','register')),
         failure_detail TEXT,
         attempts INTEGER NOT NULL DEFAULT 0,
         next_attempt_at_ms INTEGER,
         receipt TEXT,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (id, account_id)
       )`,
      `CREATE INDEX idx_attachment_account_state ON attachment (account_id, state)`,
      `CREATE TABLE attachment_event (
         ord INTEGER PRIMARY KEY AUTOINCREMENT,
         attachment_id TEXT NOT NULL,
         account_id TEXT NOT NULL,
         kind TEXT NOT NULL CHECK (kind IN
           ('stage_started','staged_verified','finalized','upload_opened',
            'chunk_ack','registered','failed','recovered')),
         detail TEXT,
         at_ms INTEGER NOT NULL
       )`,
      `CREATE INDEX idx_attachment_event_lookup ON attachment_event (account_id, attachment_id, ord)`,
    ],
  },
];

export interface MigrateOptions {
  /** App-layer schema extensions; versions must continue the package's sequence. */
  extraMigrations?: Migration[];
}

export interface MigrateResult {
  fromVersion: number;
  toVersion: number;
  applied: number[];
}

export function validateMigrations(all: Migration[]): void {
  let expected = 1;
  const seen = new Set<string>();
  for (const m of all) {
    if (m.version !== expected) {
      throw transferError("misconfigured", `Migration versions must be contiguous from 1: expected ${expected}, found ${m.version}.`);
    }
    if (seen.has(m.name)) {
      throw transferError("misconfigured", `Migration names must be unique: '${m.name}' repeated.`);
    }
    seen.add(m.name);
    expected += 1;
  }
}

export function migrate(driver: SqlDriver, options: MigrateOptions = {}): MigrateResult {
  const all = [...ATTACHMENT_MIGRATIONS, ...(options.extraMigrations ?? [])];
  validateMigrations(all);

  driver.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID");
  const row = driver.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  const fromVersion = row ? Number(row.value) : 0;

  const applied: number[] = [];
  for (const m of all) {
    if (m.version <= fromVersion) continue;
    driver.exec("BEGIN IMMEDIATE");
    try {
      for (const s of m.statements) driver.exec(s);
      driver.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(String(m.version));
      driver.exec("COMMIT");
      applied.push(m.version);
    } catch (e) {
      try { driver.exec("ROLLBACK"); } catch { /* reopen path is the recovery boundary */ }
      throw e;
    }
  }
  return { fromVersion, toVersion: Math.max(fromVersion, all.length), applied };
}
