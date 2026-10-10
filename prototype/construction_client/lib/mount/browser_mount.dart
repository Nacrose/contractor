/// Asynchronous browser composition root using SQLite WASM + IndexedDB.
library;

import 'mount.dart';
import 'ports.dart';
import 'sqlite_driver_web.dart';
import 'sqlite_object_store.dart';

Future<ConstructionMount> openBrowserMount({
  required String databaseName,
  required SyncTransportPort transport,
  SecureCredentialStore? credentials,
  SystemBrowserPort? systemBrowser,
  List<Migration> extraMigrations = const [],
  int busyTimeoutMs = 2000,
  String wasmUrl = 'sqlite3.wasm',
}) async {
  final driver = await openBrowserSqliteDriver(
    databaseName: databaseName,
    wasmUrl: wasmUrl,
    busyTimeoutMs: busyTimeoutMs,
  );
  final objects = SqliteObjectStore(driver);
  try {
    final mount = openMount(
      options: MountOptions(
        dbPath: driver.path,
        driver: driver,
        objectStore: objects,
        sourceReader: SqliteObjectSourceReader(objects),
        busyTimeoutMs: busyTimeoutMs,
        extraMigrations: extraMigrations,
      ),
      credentials: credentials,
      systemBrowser: systemBrowser,
      transport: transport,
    );
    await mount.flushDurability();
    return mount;
  } catch (_) {
    await driver.closeAndFlush();
    rethrow;
  }
}
