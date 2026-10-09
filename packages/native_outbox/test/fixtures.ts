/**
 * Shared test fixtures (M03-T03) — imported by both the test suite and the
 * crash child so the schema is identical on both sides of the kill boundary.
 */

import type { Migration } from "../src/migrations.js";

/** App-owned domain migration used by the crash scenarios (sample domain table). */
export const DAILY_LOG_MIGRATION: Migration = {
  version: 3,
  name: "domain_daily_log_sample",
  statements: [
    `CREATE TABLE daily_log (
       id TEXT PRIMARY KEY,
       account_id TEXT NOT NULL,
       project_id TEXT,
       note TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`,
  ],
};
