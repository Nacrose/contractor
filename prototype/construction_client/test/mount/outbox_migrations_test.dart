import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/migrations.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sqlite_driver.dart';

void main() {
  late Directory tmp;
  late String dbPath;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mount_migrations_test');
    dbPath = '${tmp.path}/outbox.db';
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  test('fresh database applies the TS-mirrored baseline plus the documented v3 extension', () {
    final driver = openNativeSqliteDriver(dbPath);
    try {
      final result = migrateMount(driver);
      expect(result.applied, [1, 2, 3]);
      expect(result.currentVersion, 3);
    } finally {
      driver.close();
    }
  });

  test('re-running migrations is a no-op (idempotent)', () {
    final driver = openNativeSqliteDriver(dbPath);
    try {
      final first = migrateMount(driver);
      final second = migrateMount(driver);
      expect(first.applied, isNotEmpty);
      expect(second.applied, isEmpty);
      expect(second.currentVersion, 3);
    } finally {
      driver.close();
    }
  });

  test('v3 extension: the six-value op state CHECK accepts blocked/conflict and rejects unknown states', () {
    final driver = openNativeSqliteDriver(dbPath);
    try {
      migrateMount(driver);
      final now = DateTime.now().millisecondsSinceEpoch;
      for (final state in ['pending', 'in_flight', 'accepted', 'rejected', 'blocked', 'conflict']) {
        driver
            .prepare('INSERT INTO pending_op (id, account_id, kind, payload, state, attempts, created_at, updated_at)'
                    " VALUES (?, 'acc', 'kind', 'p', ?, 0, ?, ?)")
            .run(['op-$state', state, now, now]);
      }
      expect(
        () => driver
            .prepare('INSERT INTO pending_op (id, account_id, kind, payload, state, attempts, created_at, updated_at)'
                    " VALUES ('op-bogus', 'acc', 'kind', 'p', 'bogus', 0, ?, ?)")
            .run([now, now]),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'constraint')),
      );
    } finally {
      driver.close();
    }
  });

  test('v3 extension: server_seq, tenant_id and role columns round-trip', () {
    final driver = openNativeSqliteDriver(dbPath);
    try {
      migrateMount(driver);
      final now = DateTime.now().millisecondsSinceEpoch;
      driver
          .prepare('INSERT INTO pending_op (id, account_id, kind, payload, state, attempts, created_at, updated_at,'
                  ' server_seq, tenant_id, role)'
                  " VALUES ('op1', 'acc', 'kind', 'p', 'accepted', 1, ?, ?, 4242, 'tenant-1', 'projectLead')")
          .run([now, now]);
      final row = driver.prepare('SELECT server_seq, tenant_id, role FROM pending_op WHERE id = ?').get(['op1'])!;
      expect(row['server_seq'], 4242);
      expect(row['tenant_id'], 'tenant-1');
      expect(row['role'], 'projectLead');
    } finally {
      driver.close();
    }
  });

  test('v3 rebuild on a v2 database preserves op rows AND dependency edges (no silent cascade loss)', () {
    final driver = openNativeSqliteDriver(dbPath);
    try {
      // Simulate the shipped TS baseline only (v1 + v2), then seed rows.
      final baseline = [kOutboxMigrationV1Baseline, kOutboxMigrationV2OpDependencies];
      driver.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID');
      for (final m in baseline) {
        driver.exec('BEGIN IMMEDIATE');
        for (final stmt in m.statements) {
          driver.exec(stmt);
        }
        driver
            .prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .run(['${m.version}']);
        driver.exec('COMMIT');
      }

      final now = DateTime.now().millisecondsSinceEpoch;
      for (final id in ['parent', 'child']) {
        driver
            .prepare('INSERT INTO pending_op (id, account_id, kind, payload, state, attempts, created_at, updated_at, digest)'
                    " VALUES (?, 'acc', 'kind', 'p', 'pending', 0, ?, ?, 'd1')")
            .run([id, now, now]);
      }
      driver
          .prepare('INSERT INTO op_dependency (pending_op_id, depends_on_op_id) VALUES (?, ?)')
          .run(['child', 'parent']);

      // Upgrade through the mount's v3 extension.
      final result = migrateMount(driver);
      expect(result.applied, [3]);

      // Rows carried over with their digests...
      final child = driver
          .prepare('SELECT digest, state FROM pending_op WHERE id = ?')
          .get(['child'])!;
      expect(child['digest'], 'd1');
      expect(child['state'], 'pending');
      // ...and the dependency edges survived the rebuild.
      final deps = driver
          .prepare('SELECT depends_on_op_id FROM op_dependency WHERE pending_op_id = ?')
          .all(['child']);
      expect(deps, hasLength(1));
      expect(deps.single['depends_on_op_id'], 'parent');

      // The rebuilt child table still cascades (same v2 definition).
      driver.prepare('DELETE FROM pending_op WHERE id = ?').run(['parent']);
      expect(driver.prepare('SELECT COUNT(*) AS n FROM op_dependency WHERE pending_op_id = ?').get(['child'])!['n'],
          0, reason: 'ON DELETE CASCADE must still be wired after the rebuild');
    } finally {
      driver.close();
    }
  });

  test('a database ahead of the set is left untouched (forward-compatible read)', () {
    final driver = openNativeSqliteDriver(dbPath);
    try {
      migrateMount(driver);
      driver.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)"
          " ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(['4']);
      final result = migrateMount(driver);
      expect(result.applied, isEmpty);
      expect(result.currentVersion, 4);
    } finally {
      driver.close();
    }
  });

  test('a failing extra migration rolls back and the database stays re-migratable', () {
    final driver = openNativeSqliteDriver(dbPath);
    try {
      migrateMount(driver);
      const bad = Migration(4, 'bad_extra', ['CREATE TABLE this is not sql']);
      expect(
        () => migrateMount(driver, extraMigrations: [bad]),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'migration_failed')),
      );
      // Rollback left the schema consistent at v3; the fix can re-run.
      driver.exec('DROP TABLE IF EXISTS pending_op_placeholder');
      final retry = migrateMount(driver, extraMigrations: [
        const Migration(4, 'good_extra', ['CREATE TABLE pending_op_placeholder (id TEXT PRIMARY KEY)']),
      ]);
      expect(retry.applied, [4]);
    } finally {
      driver.close();
    }
  });
}
