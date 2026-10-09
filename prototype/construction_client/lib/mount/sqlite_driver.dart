/// Platform-selected SQLite driver for the mount (M04-T02).
///
/// Native builds (VM/AOT: android, ios, linux, macos, windows) bind the
/// dart:ffi driver; the web build binds the fail-closed stub until the
/// browser outbox binding lands (recorded constraint in the M04-T02 report).
/// Both branches export the same-signature factory; the static surface is
/// [MountSqliteDriver] from ports.dart.
library;

export 'sqlite_driver_stub.dart' if (dart.library.ffi) 'sqlite_driver_io.dart';
