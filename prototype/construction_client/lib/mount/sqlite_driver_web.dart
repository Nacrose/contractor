/// Browser SQLite driver using sqlite3 WASM and its IndexedDB VFS.
///
/// The VFS performs synchronous SQLite calls over an in-memory cache and
/// persists them asynchronously. Call [flushDurability] after a user-visible
/// local save before reporting that save as durable.
library;

import 'dart:async';

import 'package:sqlite3/common.dart' as sq3;
import 'package:sqlite3/wasm.dart' as wasm;

import 'ports.dart';

/// Native-only factory retained so shared host code compiles in browser
/// builds. Browser hosts must use [openBrowserSqliteDriver] instead.
MountSqliteDriver openNativeSqliteDriver(
  String path, {
  int busyTimeoutMs = 2000,
}) => throw UnsupportedError('Use openBrowserSqliteDriver on the web.');

Future<BrowserSqliteDriver> openBrowserSqliteDriver({
  required String databaseName,
  String wasmUrl = 'sqlite3.wasm',
  int busyTimeoutMs = 2000,
}) async {
  if (databaseName.trim().isEmpty) {
    throw RepositoryError(
      'misconfigured',
      'Browser database name is required.',
    );
  }
  final sqlite = await wasm.WasmSqlite3.loadFromUrl(Uri.parse(wasmUrl));
  final fileSystem = await wasm.IndexedDbFileSystem.open(
    dbName: '$databaseName-vfs',
  );
  sqlite.registerVirtualFileSystem(fileSystem, makeDefault: true);
  try {
    final db = sqlite.open('/$databaseName.sqlite');
    db.execute(kOutboxPragmaJournalMode);
    db.execute(kOutboxPragmaSynchronous);
    db.execute(kOutboxPragmaForeignKeys);
    db.execute('PRAGMA busy_timeout=${busyTimeoutMs < 0 ? 0 : busyTimeoutMs}');
    return BrowserSqliteDriver._(
      sqlite,
      fileSystem,
      db,
      '/$databaseName.sqlite',
    );
  } on sq3.SqliteException catch (error) {
    sqlite.unregisterVirtualFileSystem(fileSystem);
    await fileSystem.close();
    throw mapSqlitePrimaryCode(error.extendedResultCode & 0xff, error.message);
  }
}

class BrowserSqliteDriver implements MountSqliteDriver {
  final wasm.WasmSqlite3 _sqlite;
  final wasm.IndexedDbFileSystem _fileSystem;
  final sq3.CommonDatabase _db;

  @override
  final String path;

  BrowserSqliteDriver._(this._sqlite, this._fileSystem, this._db, this.path);

  @override
  void exec(String sql) {
    _guard(() => _db.execute(sql));
  }

  @override
  SqlStatement prepare(String sql) => _BrowserStatement(_db, sql);

  @override
  Object? pragmaValue(String pragma) {
    final rows = _db.select(pragma);
    if (rows.isEmpty) return null;
    return rows.first.values.first;
  }

  @override
  Future<void> flushDurability() => _fileSystem.flush();

  /// Flushes pending IndexedDB work before disposing the database and VFS.
  Future<void> closeAndFlush() async {
    await flushDurability();
    _db.dispose();
    _sqlite.unregisterVirtualFileSystem(_fileSystem);
    await _fileSystem.close();
  }

  @override
  void close() {
    _db.dispose();
    _sqlite.unregisterVirtualFileSystem(_fileSystem);
    unawaited(_fileSystem.close());
  }
}

class _BrowserStatement implements SqlStatement {
  final sq3.CommonDatabase _db;
  final String _sql;

  _BrowserStatement(this._db, this._sql);

  @override
  ({int changes, int lastInsertRowid}) run(List<Object?> params) {
    return _guard(() {
      final statement = _db.prepare(_sql);
      try {
        statement.execute(_normalize(params));
        return (changes: _db.updatedRows, lastInsertRowid: _db.lastInsertRowId);
      } finally {
        statement.dispose();
      }
    });
  }

  @override
  List<Map<String, Object?>> all(List<Object?> params) {
    return _guard(() {
      final statement = _db.prepare(_sql);
      try {
        return statement
            .select(_normalize(params))
            .map((row) => Map<String, Object?>.from(row))
            .toList(growable: false);
      } finally {
        statement.dispose();
      }
    });
  }

  @override
  Map<String, Object?>? get(List<Object?> params) {
    final rows = all(params);
    return rows.isEmpty ? null : rows.first;
  }
}

T _guard<T>(T Function() body) {
  try {
    return body();
  } on sq3.SqliteException catch (error) {
    throw mapSqlitePrimaryCode(error.extendedResultCode & 0xff, error.message);
  }
}

List<Object?> _normalize(List<Object?> params) => [
  for (final param in params)
    if (param is bool) (param ? 1 : 0) else param,
];
