/// Fail-closed web stub of the native SQLite driver (M04-T02).
///
/// The web build does not carry dart:ffi. Per the mount's fail-closed rule,
/// the web outbox binding is a SEPARATE obligation (the browser store driver
/// that the vertical workflow's web leg binds in M04-T03); this stub never
/// pretends to be durable storage — it refuses, with a typed error, at
/// RUNTIME. The static surface is identical to the io branch (ports.dart
/// MountSqliteDriver), so nothing upstream can accidentally compile against
/// a web-shaped lie.
library;

import 'ports.dart';

/// Conditional-export factory (sqlite_driver.dart): identical signature on
/// every platform; the web branch refuses with the typed misconfigured kind.
MountSqliteDriver openNativeSqliteDriver(
  String path, {
  int busyTimeoutMs = 2000,
}) {
  throw RepositoryError(
    'misconfigured',
    'NativeSqliteDriver is unavailable on the web build; the browser outbox binding is a separate mount obligation (M04-T02 report, web-binding constraint).',
  );
}

Future<MountSqliteDriver> openBrowserSqliteDriver(
  String path, {
  int busyTimeoutMs = 2000,
  List<int>? wasmBytes,
}) => Future.error(
  RepositoryError(
    'misconfigured',
    'Browser SQLite is unavailable on this target.',
  ),
);
