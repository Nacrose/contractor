/// Browser object store backed by the same IndexedDB-persisted SQLite mount.
///
/// This gives photo staging synchronous reads/writes to the M03 ObjectStore
/// port while [ConstructionMount.flushDurability] waits for the VFS to commit
/// those changes to IndexedDB before the UI acknowledges them.
library;

import 'dart:typed_data';

import 'ports.dart';

class SqliteObjectStore implements ObjectStore {
  final MountSqliteDriver driver;

  SqliteObjectStore(this.driver) {
    driver.exec(
      'CREATE TABLE IF NOT EXISTS browser_object '
      '(object_key TEXT PRIMARY KEY, bytes BLOB NOT NULL)',
    );
  }

  @override
  void putBytes(String key, Uint8List bytes) {
    _assertSafeKey(key);
    _transaction(() {
      driver
          .prepare(
            'INSERT INTO browser_object (object_key, bytes) VALUES (?, ?) '
            'ON CONFLICT(object_key) DO UPDATE SET bytes=excluded.bytes',
          )
          .run([key, bytes]);
    });
  }

  @override
  Uint8List getBytes(String key) {
    _assertSafeKey(key);
    final row = driver
        .prepare('SELECT bytes FROM browser_object WHERE object_key=?')
        .get([key]);
    if (row == null) {
      throw ObjectStoreError('io', 'Browser object path is missing.');
    }
    final value = row['bytes'];
    if (value is Uint8List) return Uint8List.fromList(value);
    if (value is List<int>) return Uint8List.fromList(value);
    throw ObjectStoreError('io', 'Browser object bytes have an invalid type.');
  }

  @override
  int? statBytes(String key) {
    _assertSafeKey(key);
    final row = driver
        .prepare(
          'SELECT length(bytes) AS size FROM browser_object WHERE object_key=?',
        )
        .get([key]);
    return row == null ? null : row['size'] as int;
  }

  @override
  void removeBytes(String key) {
    _assertSafeKey(key);
    driver.prepare('DELETE FROM browser_object WHERE object_key=?').run([key]);
  }

  @override
  void renameBytes(String fromKey, String toKey) {
    _assertSafeKey(fromKey);
    _assertSafeKey(toKey);
    _transaction(() {
      final source = driver
          .prepare('SELECT bytes FROM browser_object WHERE object_key=?')
          .get([fromKey]);
      if (source == null) {
        if (statBytes(toKey) != null) return;
        throw ObjectStoreError(
          'io',
          'renameBytes: source and destination are both missing.',
        );
      }
      driver
          .prepare(
            'INSERT INTO browser_object (object_key, bytes) VALUES (?, ?) '
            'ON CONFLICT(object_key) DO UPDATE SET bytes=excluded.bytes',
          )
          .run([toKey, source['bytes']]);
      driver.prepare('DELETE FROM browser_object WHERE object_key=?').run([
        fromKey,
      ]);
    });
  }

  @override
  List<String> listKeys(String prefix) {
    _assertSafeKey(prefix);
    return driver
        .prepare('SELECT object_key FROM browser_object ORDER BY object_key')
        .all(const [])
        .map((row) => row['object_key'] as String)
        .where((key) => key.startsWith(prefix))
        .toList(growable: false);
  }

  void _assertSafeKey(String key) {
    if (key.isEmpty ||
        key.startsWith('/') ||
        key.contains('\\') ||
        key.contains('..') ||
        key.contains('\x00')) {
      throw ObjectStoreError('io', 'Unsafe browser object key rejected.');
    }
  }

  void _transaction(void Function() body) {
    driver.exec('BEGIN IMMEDIATE');
    try {
      body();
      driver.exec('COMMIT');
    } catch (_) {
      try {
        driver.exec('ROLLBACK');
      } catch (_) {}
      rethrow;
    }
  }
}

class SqliteObjectSourceReader implements SourceReaderPort {
  final SqliteObjectStore objects;

  const SqliteObjectSourceReader(this.objects);

  @override
  Uint8List readBytes(String path) => objects.getBytes(path);
}
