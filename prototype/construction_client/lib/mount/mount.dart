/// The composition root the M03 packages were designed for (M04-T02).
///
/// [openMount] binds every M03 port to its device implementation and hands
/// the bundle to the app:
///
///   SqlDriver            -> NativeSqliteDriver (WAL + synchronous=FULL +
///                           foreign_keys=ON, bounded busy_timeout)
///   outbox schema        -> kMountMigrations (TS baseline mirror + the
///                           documented v3 orchestrator-state extension)
///   PendingOperationSource -> OutboxPendingOperationSource (1:1)
///   SyncHealthSource     -> OutboxSyncHealthSource (honest read model)
///   SecureCredentialStore-> MethodChannelSecureCredentialStore (OS keystore;
///                           fail-closed where no host handler exists)
///   SystemBrowserPort    -> UrlLauncherSystemBrowserPort (external browser)
///   ObjectStore/SourceReader/Digest -> FilesystemObjectStore /
///                           FileSourceReader / Sha256DigestPort (REAL sha-256)
///   SyncTransportPort    -> HttpSyncTransport (typed outcomes; throws on
///                           network death)
///   drain triggers       -> SyncDrainTriggers (launch/foreground/manual/
///                           background-gated)
///
/// The M03 packages remain the semantic authority; the mount owns only the
/// device bindings. Platform hosts without a binding yet fail CLOSED with
/// typed errors (recorded constraints in the M04-T02 report).
library;

import 'dart:io';

import 'drain_triggers.dart';
import 'migrations.dart';
import 'object_store.dart';
import 'outbox_repository.dart';
import 'pending_operation_source.dart';
import 'ports.dart';
import 'secure_store.dart';
import 'sqlite_driver.dart';
import 'sync_health.dart';
import 'sync_transport.dart';
import 'system_browser.dart';

class MountOptions {
  /// SQLite file for the outbox (app support directory; the host supplies
  /// the path — the mount never picks storage locations itself).
  final String dbPath;

  /// Root directory for attachment objects (device filesystem on native).
  final Directory? objectRoot;

  /// Optional platform-bound SQLite driver. Browser hosts construct this
  /// asynchronously over IndexedDB before opening the shared mount.
  final MountSqliteDriver? driver;

  /// Optional platform-specific object store and attachment source reader.
  /// Native defaults use the device filesystem; browser hosts must provide
  /// their own bindings before enabling attachment capture.
  final ObjectStore? objectStore;
  final SourceReaderPort? sourceReader;
  final DigestPort? digest;

  final int busyTimeoutMs;

  /// Feature-owned migrations append after the mount's stable v3 schema.
  /// The workflow supplies its own versioned migration without changing the
  /// M03 outbox baseline.
  final List<Migration> extraMigrations;

  /// Run PRAGMA integrity_check at open (recommended for every app start).
  final bool integrityCheck;

  MountOptions({
    required this.dbPath,
    this.objectRoot,
    this.driver,
    this.objectStore,
    this.sourceReader,
    this.digest,
    this.busyTimeoutMs = 2000,
    this.integrityCheck = true,
    List<Migration> extraMigrations = const [],
  }) : extraMigrations = List.unmodifiable(extraMigrations);
}

class ConstructionMount {
  final MountSqliteDriver driver;
  final OutboxRepository outbox;
  final OutboxPendingOperationSource pendingOps;
  final OutboxSyncHealthSourceFactory healthSource;
  final SecureCredentialStore credentials;
  final SystemBrowserPort systemBrowser;
  final ObjectStore objects;
  final SourceReaderPort sourceReader;
  final DigestPort digest;
  final SyncTransportPort transport;
  final SyncDrainTriggers drainTriggers;
  final MigrateResult migrations;

  const ConstructionMount({
    required this.driver,
    required this.outbox,
    required this.pendingOps,
    required this.healthSource,
    required this.credentials,
    required this.systemBrowser,
    required this.objects,
    required this.sourceReader,
    required this.digest,
    required this.transport,
    required this.drainTriggers,
    required this.migrations,
  });

  /// Waits for the backing platform store to persist all writes issued before
  /// this call. Native SQLite has already completed synchronous=FULL writes;
  /// the browser VFS waits for its queued IndexedDB operations.
  Future<void> flushDurability() => driver.flushDurability();

  /// Envelope constructor for the drain loop (M04-T03 orchestrator port).
  SyncEnvelope envelopeFor({
    required PendingOpRecord op,
    required String deviceId,
    required int attempt,
    required int nowMs,
    ScopeClaims? scopeClaims,
  }) {
    return buildSyncEnvelope(
      op: op,
      deviceId: deviceId,
      scopeClaims: scopeClaims,
      attempt: attempt,
      nowMs: nowMs,
      digest: digest,
    );
  }
}

typedef OutboxSyncHealthSourceFactory = OutboxSyncHealthSource Function({
  required String accountId,
  required String tenantId,
});

/// Opens the mount: durability pragmas, integrity check, migrations, then
/// the port bundle. Every failure is typed (corrupt/notadb/migration kinds).
ConstructionMount openMount({
  required MountOptions options,
  SecureCredentialStore? credentials,
  SystemBrowserPort? systemBrowser,
  SyncTransportPort? transport,
  ExecutionEnvironmentPort? environment,
}) {
  final driver = options.driver ??
      openNativeSqliteDriver(
        options.dbPath,
        busyTimeoutMs: options.busyTimeoutMs,
      );

  // Durability policy enforced at open (outbox repository.ts openOutbox):
  // re-asserted idempotently so an arbitrary driver construction cannot
  // silently weaken the flags.
  driver.exec(
    driver.supportsWal
        ? kOutboxPragmaJournalMode
        : 'PRAGMA journal_mode=DELETE',
  );
  driver.exec(kOutboxPragmaSynchronous);
  driver.exec(kOutboxPragmaForeignKeys);
  driver.exec(
    'PRAGMA busy_timeout=${options.busyTimeoutMs < 0 ? 0 : options.busyTimeoutMs}',
  );
  if (options.integrityCheck) {
    final row = driver.prepare('PRAGMA integrity_check').get(const []);
    final result = row == null ? null : '${row.values.first}';
    if (result != 'ok') {
      driver.close();
      throw RepositoryError('corrupt', 'integrity_check failed at open.', {
        'result': result ?? '(no row)',
      });
    }
  }

  final migrations = migrateMount(
    driver,
    extraMigrations: options.extraMigrations,
  );
  final outbox = OutboxRepository(driver);
  final pendingOps = OutboxPendingOperationSource(outbox);
  final objects = options.objectStore ??
      (options.objectRoot == null
          ? throw RepositoryError(
              'misconfigured',
              'A native object directory or platform object store is required.',
            )
          : FilesystemObjectStore(options.objectRoot!));

  return ConstructionMount(
    driver: driver,
    outbox: outbox,
    pendingOps: pendingOps,
    healthSource: ({required String accountId, required String tenantId}) =>
        OutboxSyncHealthSource(outbox, accountId, tenantId),
    credentials: credentials ?? MethodChannelSecureCredentialStore.create(),
    systemBrowser: systemBrowser ?? UrlLauncherSystemBrowserPort(),
    objects: objects,
    sourceReader: options.sourceReader ?? const FileSourceReader(),
    digest: options.digest ?? const Sha256DigestPort(),
    transport:
        transport ??
        (throw RepositoryError(
          'misconfigured',
          'SyncTransportPort requires the server sync endpoint; the host supplies HttpSyncTransport.',
        )),
    drainTriggers: SyncDrainTriggers(
      drain: (_) async {}, // the M04-T03 orchestrator port replaces this
      environment: environment ?? const ForegroundOnlyEnvironment(),
      isDraining: () => false,
    ),
    migrations: migrations,
  );
}
