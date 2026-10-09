/// Native SQLite binding of the mount's SqlDriver port (M04-T02).
///
/// Binds package:sqlite3 (dart:ffi) to the driver shape the M03 outbox
/// contract defines, enforcing the durability pragmas at open exactly like
/// the TS openOutbox does: journal_mode=WAL paired with synchronous=FULL
/// (WAL alone is NOT durability evidence), foreign_keys=ON, and a bounded
/// busy_timeout. SQLite failures map onto the typed repository kinds via
/// mapSqlitePrimaryCode (driver.ts error table).
library;

import 'package:sqlite3/sqlite3.dart' as sq3;

import 'ports.dart';

/// Conditional-export factory (sqlite_driver.dart): identical signature on
/// every platform; the VM/AOT branch constructs the ffi driver.
MountSqliteDriver openNativeSqliteDriver(String path, {int busyTimeoutMs = 2000}) {
  final sq3.Database db;
  try {
    db = sq3.sqlite3.open(path);
    // Durability pragmas enforced inside the factory so a garbage file
    // surfaces as the typed notadb kind, never a raw ffi exception.
    db.execute(kOutboxPragmaJournalMode);
    db.execute(kOutboxPragmaSynchronous);
    db.execute(kOutboxPragmaForeignKeys);
    final bounded = busyTimeoutMs < 0 ? 0 : busyTimeoutMs;
    db.execute('PRAGMA busy_timeout=$bounded');
  } on sq3.SqliteException catch (e) {
    throw mapSqlitePrimaryCode(e.extendedResultCode & 0xff, e.message);
  }
  return _NativeSqliteDriver(db, path);
}

class _NativeSqliteDriver implements MountSqliteDriver {
  final sq3.Database _db;

  @override
  final String path;

  _NativeSqliteDriver(this._db, this.path);

  @override
  void exec(String sql) {
    _guard(() => _db.execute(sql));
  }

  @override
  SqlStatement prepare(String sql) => _NativeStatement(_db, sql);

  @override
  Object? pragmaValue(String pragma) {
    final rows = _db.select(pragma);
    if (rows.isEmpty) return null;
    return rows.first.values.first;
  }

  @override
  void close() => _db.dispose();
}

class _NativeStatement implements SqlStatement {
  final sq3.Database _db;
  final String _sql;

  _NativeStatement(this._db, this._sql);

  @override
  ({int changes, int lastInsertRowid}) run(List<Object?> params) {
    return _guard(() {
      final stmt = _db.prepare(_sql);
      try {
        stmt.execute(_normalize(params));
        return (changes: _db.updatedRows, lastInsertRowid: _db.lastInsertRowId);
      } finally {
        stmt.dispose();
      }
    });
  }

  @override
  List<Map<String, Object?>> all(List<Object?> params) {
    return _guard(() {
      final stmt = _db.prepare(_sql);
      try {
        return stmt
            .select(_normalize(params))
            .map((row) => Map<String, Object?>.from(row))
            .toList(growable: false);
      } finally {
        stmt.dispose();
      }
    });
  }

  @override
  Map<String, Object?>? get(List<Object?> params) {
    final rows = all(params);
    return rows.isEmpty ? null : rows.first;
  }
}

/// sqlite3 ffi throws SqliteException carrying the extended result code; the
/// mount maps the PRIMARY code (extended & 0xff) exactly like driver.ts.
T _guard<T>(T Function() body) {
  try {
    return body();
  } on sq3.SqliteException catch (e) {
    final primary = e.extendedResultCode & 0xff;
    throw mapSqlitePrimaryCode(primary, e.message);
  }
}

/// Dart null/bool/int/String/bytes map onto SQLite's dynamic typing; keep
/// Uint8List as-is (BLOB) and let null pass through.
List<Object?> _normalize(List<Object?> params) {
  final out = List<Object?>.filled(params.length, null);
  for (var i = 0; i < params.length; i++) {
    final p = params[i];
    if (p is bool) {
      out[i] = p ? 1 : 0;
    } else {
      out[i] = p;
    }
  }
  return out;
}
