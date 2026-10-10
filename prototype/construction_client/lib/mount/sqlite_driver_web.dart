/// Browser SQLite binding for the mount (M04-T03).
///
/// SQLite executes synchronously through the package's WASM build while the
/// file system persists its database pages in IndexedDB. Browser storage is
/// an evictable synchronized cache, so callers must still rely on server
/// synchronization for recovery.
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:sqlite3/common.dart' as sq3;
import 'package:sqlite3/wasm.dart' show IndexedDbFileSystem, WasmSqlite3;

import 'ports.dart';

MountSqliteDriver openNativeSqliteDriver(
  String path, {
  int busyTimeoutMs = 2000,
}) => throw RepositoryError(
  'misconfigured',
  'Native SQLite is unavailable on the web.',
);

/// Opens the browser's IndexedDB-backed SQLite database. The host must serve
/// sqlite3.wasm from the app's web root as documented by package:sqlite3.
Future<MountSqliteDriver> openBrowserSqliteDriver(
  String path, {
  int busyTimeoutMs = 2000,
  List<int>? wasmBytes,
}) async {
  try {
    final sqlite = wasmBytes == null
        ? await WasmSqlite3.loadFromUrl(Uri.parse('sqlite3.wasm'))
        : await WasmSqlite3.load(Uint8List.fromList(wasmBytes));
    final fileSystem = await IndexedDbFileSystem.open(
      dbName: 'construction-client-sqlite-v1',
    );
    sqlite.registerVirtualFileSystem(fileSystem, makeDefault: true);
    final db = sqlite.open(path);
    db.execute('PRAGMA journal_mode=DELETE');
    db.execute(kOutboxPragmaSynchronous);
    db.execute(kOutboxPragmaForeignKeys);
    return _BrowserSqliteDriver(db, fileSystem, path);
  } on sq3.SqliteException catch (error) {
    throw mapSqlitePrimaryCode(error.extendedResultCode & 0xff, error.message);
  }
}

class _BrowserSqliteDriver implements MountSqliteDriver {
  final sq3.CommonDatabase _db;
  final IndexedDbFileSystem _fileSystem;

  @override
  final String path;

  _BrowserSqliteDriver(this._db, this._fileSystem, this.path);

  @override
  bool get supportsWal => false;

  @override
  void exec(String sql) => _guard(() => _db.execute(sql));

  @override
  SqlStatement prepare(String sql) => _BrowserStatement(_db, sql);

  @override
  Object? pragmaValue(String pragma) {
    final rows = _guard(() => _db.select(pragma));
    return rows.isEmpty ? null : rows.first.values.first;
  }

  @override
  Future<void> flushDurability() => _fileSystem.flush();

  @override
  void close() {
    _db.dispose();
    unawaited(_fileSystem.close());
  }

  @override
  Future<void> closeDurably() async {
    _db.dispose();
    await _fileSystem.close();
  }
}

class _BrowserStatement implements SqlStatement {
  final sq3.CommonDatabase _db;
  final String _sql;

  _BrowserStatement(this._db, this._sql);

  @override
  ({int changes, int lastInsertRowid}) run(List<Object?> params) => _guard(() {
    final statement = _db.prepare(_sql);
    try {
      statement.execute(_normalize(params));
      return (changes: _db.updatedRows, lastInsertRowid: _db.lastInsertRowId);
    } finally {
      statement.dispose();
    }
  });

  @override
  List<Map<String, Object?>> all(List<Object?> params) => _guard(() {
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
