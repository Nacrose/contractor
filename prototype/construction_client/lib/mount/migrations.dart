/// Versioned outbox schema for the Flutter mount (M04-T02).
///
/// Migrations v1-v2 mirror packages/native_outbox/src/migrations.ts
/// (baseline_outbox + op_dependencies) STATEMENT FOR STATEMENT — the TS
/// package stays the semantic authority for the shipped schema shape.
///
/// Version 3 is the MOUNT's documented schema extension (M04-T02
/// acceptance: "including blocked/conflict states via documented schema
/// extension"): the orchestrator contract's PendingOperationSource carries
/// the six-value op state ('blocked'/'conflict' beyond the baseline four)
/// and records the acceptance serverSeq plus the op's scope claims. SQLite
/// cannot ALTER a CHECK constraint, so v3 rebuilds `pending_op` with the
/// extended state CHECK + `server_seq`/`tenant_id`/`role` columns inside one
/// transaction (rows preserved; dependencies and indexes recreated).
///
/// Rules carried over from migrations.ts (tested):
///   - Migrations are data: ordered, contiguously versioned from 1; each
///     runs inside its OWN transaction together with the schema_version
///     bump, so an interrupted migration rolls back and stays re-runnable.
///   - A database whose version is AHEAD of this set is left untouched
///     (forward-compatible read of the tables the outbox owns).
library;

import 'ports.dart';

/// Baseline mirror of OUTBOX_MIGRATIONS v1 (migrations.ts lines 27-75).
const Migration kOutboxMigrationV1Baseline = Migration(1, 'baseline_outbox', [
  'CREATE TABLE IF NOT EXISTS meta ('
      ' key TEXT PRIMARY KEY,'
      ' value TEXT NOT NULL'
      ') WITHOUT ROWID',
  'CREATE TABLE pending_op ('
      ' id TEXT PRIMARY KEY,'
      ' account_id TEXT NOT NULL,'
      ' project_id TEXT,'
      ' kind TEXT NOT NULL,'
      ' payload TEXT NOT NULL,'
      " state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','in_flight','accepted','rejected')),"
      ' attempts INTEGER NOT NULL DEFAULT 0,'
      ' next_attempt_at INTEGER,'
      ' created_at INTEGER NOT NULL,'
      ' updated_at INTEGER NOT NULL,'
      ' last_error TEXT,'
      ' accepted_receipt TEXT,'
      ' digest TEXT'
      ')',
  'CREATE INDEX idx_pending_op_dispatch ON pending_op (account_id, state, created_at)',
  'CREATE TABLE private_draft ('
      ' id TEXT PRIMARY KEY,'
      ' account_id TEXT NOT NULL,'
      ' project_id TEXT,'
      ' kind TEXT NOT NULL,'
      ' body TEXT NOT NULL,'
      ' created_at INTEGER NOT NULL,'
      ' updated_at INTEGER NOT NULL'
      ')',
  'CREATE INDEX idx_private_draft_account ON private_draft (account_id, updated_at)',
  'CREATE TABLE attachment_stage ('
      ' id TEXT PRIMARY KEY,'
      ' account_id TEXT NOT NULL,'
      ' project_id TEXT,'
      ' local_path TEXT NOT NULL,'
      ' digest TEXT NOT NULL,'
      ' bytes INTEGER NOT NULL,'
      " state TEXT NOT NULL CHECK (state IN ('staging','staged','finalized','registered','failed')),"
      ' created_at INTEGER NOT NULL,'
      ' updated_at INTEGER NOT NULL'
      ')',
  'CREATE INDEX idx_attachment_stage_account ON attachment_stage (account_id, state)',
]);

/// Baseline mirror of OUTBOX_MIGRATIONS v2 (migrations.ts lines 76-88).
const Migration kOutboxMigrationV2OpDependencies = Migration(2, 'op_dependencies', [
  'CREATE TABLE op_dependency ('
      ' pending_op_id TEXT NOT NULL REFERENCES pending_op(id) ON DELETE CASCADE,'
      ' depends_on_op_id TEXT NOT NULL REFERENCES pending_op(id) ON DELETE CASCADE,'
      ' PRIMARY KEY (pending_op_id, depends_on_op_id)'
      ') WITHOUT ROWID',
  'CREATE INDEX idx_op_dependency_dep ON op_dependency (depends_on_op_id)',
]);

/// The mount's documented extension: six-value op state (adds
/// 'blocked','conflict'), acceptance server_seq, and the op's scope claims.
///
/// The rebuild preserves op_dependency edges: with foreign_keys=ON a plain
/// `DROP TABLE pending_op` performs an implicit row DELETE whose CASCADE
/// would silently erase every dependency row, so the edges are backed up and
/// restored and the child table is rebuilt exactly as v2 defined it.
const Migration kMountMigrationV3OrchestratorStates = Migration(3, 'mount_orchestrator_states', [
  // SQLite cannot alter a CHECK constraint: rebuild the table in one
  // transaction (this migration IS that transaction; rows carry over).
  'CREATE TABLE pending_op_v3 ('
      ' id TEXT PRIMARY KEY,'
      ' account_id TEXT NOT NULL,'
      ' project_id TEXT,'
      ' kind TEXT NOT NULL,'
      ' payload TEXT NOT NULL,'
      " state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','in_flight','accepted','rejected','blocked','conflict')),"
      ' attempts INTEGER NOT NULL DEFAULT 0,'
      ' next_attempt_at INTEGER,'
      ' created_at INTEGER NOT NULL,'
      ' updated_at INTEGER NOT NULL,'
      ' last_error TEXT,'
      ' accepted_receipt TEXT,'
      ' digest TEXT,'
      ' server_seq INTEGER,'
      ' tenant_id TEXT,'
      ' role TEXT'
      ')',
  'INSERT INTO pending_op_v3 (id, account_id, project_id, kind, payload, state, attempts,'
      ' next_attempt_at, created_at, updated_at, last_error, accepted_receipt, digest)'
      ' SELECT id, account_id, project_id, kind, payload, state, attempts,'
      ' next_attempt_at, created_at, updated_at, last_error, accepted_receipt, digest FROM pending_op',
  // Back up dependency edges BEFORE the cascade-bearing drops.
  'CREATE TABLE op_dependency_backup ('
      ' pending_op_id TEXT NOT NULL,'
      ' depends_on_op_id TEXT NOT NULL,'
      ' PRIMARY KEY (pending_op_id, depends_on_op_id)'
      ') WITHOUT ROWID',
  'INSERT INTO op_dependency_backup SELECT pending_op_id, depends_on_op_id FROM op_dependency',
  // Child first, then parent — no cascade can erase anything now.
  'DROP TABLE op_dependency',
  'DROP TABLE pending_op',
  'ALTER TABLE pending_op_v3 RENAME TO pending_op',
  // Recreate the child table exactly as v2 defined it, restore edges.
  'CREATE TABLE op_dependency ('
      ' pending_op_id TEXT NOT NULL REFERENCES pending_op(id) ON DELETE CASCADE,'
      ' depends_on_op_id TEXT NOT NULL REFERENCES pending_op(id) ON DELETE CASCADE,'
      ' PRIMARY KEY (pending_op_id, depends_on_op_id)'
      ') WITHOUT ROWID',
  'INSERT INTO op_dependency SELECT pending_op_id, depends_on_op_id FROM op_dependency_backup',
  'DROP TABLE op_dependency_backup',
  'CREATE INDEX idx_pending_op_dispatch ON pending_op (account_id, state, created_at)',
  'CREATE INDEX idx_op_dependency_dep ON op_dependency (depends_on_op_id)',
]);

/// The full mount migration set: baseline (TS mirror) + mount extension.
const List<Migration> kMountMigrations = [
  kOutboxMigrationV1Baseline,
  kOutboxMigrationV2OpDependencies,
  kMountMigrationV3OrchestratorStates,
];

void validateMigrations(List<Migration> all) {
  var expected = 1;
  for (final m in all) {
    if (m.version != expected) {
      throw RepositoryError(
          'misconfigured',
          "Migrations must be contiguous from 1; expected $expected, got ${m.version} ('${m.name}').");
    }
    if (m.statements.isEmpty) {
      throw RepositoryError('misconfigured', "Migration ${m.version} ('${m.name}') has no statements.");
    }
    expected += 1;
  }
}

int _readVersion(SqlDriver driver) {
  // meta may not exist yet on a version-0 database.
  final row = driver.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(const []);
  if (row == null) return 0;
  return int.tryParse('${row['value']}') ?? 0;
}

void _writeVersion(SqlDriver driver, int version) {
  driver
      .prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)"
          " ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run([version.toString()]);
}

/// Apply pending migrations (migrations.ts migrate(): one immediate
/// transaction per version including the version bump; contiguity validated
/// up front; a database ahead of the set is left untouched).
MigrateResult migrateMount(SqlDriver driver, {List<Migration>? extraMigrations}) {
  final combined = [...kMountMigrations, ...?extraMigrations];
  validateMigrations(combined);

  // meta must exist before versioning reads; migration 1 owns its creation,
  // but a version-0 database may not have run it yet.
  driver.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID");
  final current = _readVersion(driver);
  final applied = <int>[];

  for (final m in combined) {
    if (m.version <= current) continue;
    driver.exec('BEGIN IMMEDIATE');
    try {
      for (final stmt in m.statements) {
        driver.exec(stmt);
      }
      _writeVersion(driver, m.version);
      driver.exec('COMMIT');
      applied.add(m.version);
    } catch (e) {
      try {
        driver.exec('ROLLBACK');
      } catch (_) {
        // rollback of an already-dead transaction; re-migration is the path
      }
      throw RepositoryError('migration_failed',
          "Migration ${m.version} ('${m.name}') failed and was rolled back.", {'sqlite': '$e'});
    }
  }

  return MigrateResult(applied, _readVersion(driver));
}
