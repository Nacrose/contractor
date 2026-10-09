import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/migrations.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sqlite_driver.dart';

void main() {
  late Directory tmp;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mount_driver_test');
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  group('NativeSqliteDriver (real SQLite via dart:ffi)', () {
    test('enforces the durability pragmas at open (WAL + synchronous=FULL + foreign keys + busy timeout)', () {
      final driver = openNativeSqliteDriver('${tmp.path}/outbox.db');
      try {
        expect(driver.pragmaValue('PRAGMA journal_mode'), 'wal',
            reason: 'WAL alone is NOT durability evidence without synchronous=FULL');
        expect(driver.pragmaValue('PRAGMA synchronous'), 2, reason: '2 = FULL');
        expect(driver.pragmaValue('PRAGMA foreign_keys'), 1);
        expect(driver.pragmaValue('PRAGMA busy_timeout'), 2000);
      } finally {
        driver.close();
      }
    });

    test('exec/prepare honor the SqlDriver port shape (run changes/rowid, all, get)', () {
      final driver = openNativeSqliteDriver('${tmp.path}/port.db');
      try {
        driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL, blob BLOB)');
        final res = driver.prepare('INSERT INTO t (name, blob) VALUES (?, ?)').run([
          'a',
          Uint8List.fromList([1, 2, 3]),
        ]);
        expect(res.changes, 1);
        expect(res.lastInsertRowid, 1);

        final rows = driver.prepare('SELECT id, name, blob FROM t WHERE name = ?').all(['a']);
        expect(rows, hasLength(1));
        expect(rows.single['name'], 'a');
        expect(rows.single['blob'], Uint8List.fromList([1, 2, 3]));

        final one = driver.prepare('SELECT name FROM t WHERE id = ?').get([1]);
        expect(one, isNotNull);
        expect(one!['name'], 'a');
        expect(driver.prepare('SELECT name FROM t WHERE id = ?').get([999]), isNull);

        final upd = driver.prepare('UPDATE t SET name = ? WHERE id = ?').run(['b', 1]);
        expect(upd.changes, 1);
      } finally {
        driver.close();
      }
    });

    test('maps the primary sqlite result code to typed repository kinds (constraint=19)', () {
      final driver = openNativeSqliteDriver('${tmp.path}/codes.db');
      try {
        driver.exec('CREATE TABLE c (id TEXT PRIMARY KEY)');
        driver.prepare('INSERT INTO c (id) VALUES (?)').run(['x']);
        expect(
          () => driver.prepare('INSERT INTO c (id) VALUES (?)').run(['x']),
          throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'constraint')),
        );
      } finally {
        driver.close();
      }
    });

    test('surfaces not-a-database as the typed notadb kind (26) at open', () {
      final garbage = File('${tmp.path}/garbage.db')..writeAsBytesSync(List.filled(64, 0x42));
      // The durability pragmas run inside the factory, so the garbage header
      // is detected during OPEN, typed — never a raw ffi exception.
      expect(
        () => openNativeSqliteDriver(garbage.path),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'notadb')),
      );
    });

    test('data persists across close/reopen (durable file-backed database)', () {
      final first = openNativeSqliteDriver('${tmp.path}/reopen.db');
      first.exec('CREATE TABLE d (k TEXT PRIMARY KEY, v TEXT)');
      first.prepare('INSERT INTO d VALUES (?, ?)').run(['k', 'v1']);
      first.close();

      final second = openNativeSqliteDriver('${tmp.path}/reopen.db');
      try {
        expect(second.prepare('SELECT v FROM d WHERE k = ?').get(['k'])!['v'], 'v1');
      } finally {
        second.close();
      }
    });
  });

  group('validateMigrations', () {
    test('rejects non-contiguous sets up front', () {
      const bad = [
        Migration(1, 'a', ['SELECT 1']),
        Migration(3, 'b', ['SELECT 1']),
      ];
      expect(
        () => validateMigrations(bad),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
    });

    test('rejects empty statement lists', () {
      const bad = [Migration(1, 'a', [])];
      expect(
        () => validateMigrations(bad),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
    });
  });
}
