/// Mount port mirrors (M04-T02).
///
/// Dart mirrors of the M03 contract packages' port surfaces — the shapes the
/// mount binds device implementations to. The TS packages
/// (packages/native_*) remain the SEMANTIC AUTHORITY; this file mirrors
/// structure only, per the M02 platform-contracts generation pattern. No
/// package code is forked or edited; the M03 suites keep pinning semantics.
library;

import 'dart:typed_data';

/// ---------------------------------------------------------------------------
/// SQLite driver port — mirrors packages/native_outbox/src/driver.ts
/// (SqlStatement / SqlDriver / OUTBOX_PRAGMAS / error kinds).
/// ---------------------------------------------------------------------------

abstract class SqlStatement {
  /// Executes and returns {changes, lastInsertRowid} like driver.ts.
  ({int changes, int lastInsertRowid}) run(List<Object?> params);

  List<Map<String, Object?>> all(List<Object?> params);

  Map<String, Object?>? get(List<Object?> params);
}

abstract class SqlDriver {
  void exec(String sql);

  SqlStatement prepare(String sql);
}

/// The mount's own handle over the native SQLite driver: the driver port
/// plus the open/close lifecycle and PRAGMA introspection used by tests and
/// open-verification. Declared in ports.dart so every platform branch of
/// the conditional factory (sqlite_driver.dart) exposes the SAME static
/// surface — the web branch throws at RUNTIME (fail-closed), never at the
/// type level.
abstract interface class MountSqliteDriver implements SqlDriver {
  /// The database file this driver opened (durability evidence).
  String get path;

  /// PRAGMA introspection used by tests and open-verification only.
  Object? pragmaValue(String pragma);

  void close();

  /// Waits until committed writes have reached the platform's durable store.
  /// Native SQLite completes this during transaction commit; browser VFS
  /// bindings must flush their async IndexedDB journal before acknowledging.
  Future<void> flushDurability();
}

/// Durability policy from driver.ts: WAL alone is NOT durability evidence —
/// WAL + synchronous=FULL + foreign_keys=ON, enforced at open.
const String kOutboxPragmaJournalMode = 'PRAGMA journal_mode=WAL';
const String kOutboxPragmaSynchronous = 'PRAGMA synchronous=FULL';
const String kOutboxPragmaForeignKeys = 'PRAGMA foreign_keys=ON';

/// Typed repository error kinds (driver.ts mapSqliteError + contract.ts
/// RepositoryErrorKind: busy, locked, full, corrupt, notadb, constraint,
/// misconfigured, not_found, illegal_transition, migration_failed, internal).
class RepositoryError implements Exception {
  final String kind;
  final String message;
  final Map<String, String> detail;

  RepositoryError(this.kind, this.message, [Map<String, String>? detail])
      : detail = detail ?? const {};

  @override
  String toString() => '[$kind] $message';
}

/// SQLite result-code mapping from driver.ts (primary codes after masking
/// extended codes with 0xff): 5=BUSY, 6=LOCKED, 11=CORRUPT, 13=FULL,
/// 19=CONSTRAINT, 26=NOTADB. The native driver feeds primary codes into
/// this mapper; unknown codes fall to `internal`.
RepositoryError mapSqlitePrimaryCode(int primaryCode, String message) {
  switch (primaryCode) {
    case 5:
      return RepositoryError('busy',
          'SQLite busy: another writer holds the database beyond busy_timeout.', {'sqlite': message});
    case 6:
      return RepositoryError(
          'locked', 'SQLite locked: a competing connection holds the needed lock.', {'sqlite': message});
    case 11:
      return RepositoryError('corrupt', 'SQLite reported database corruption.', {'sqlite': message});
    case 13:
      return RepositoryError(
          'full', 'SQLite database or disk is full; the write was not acknowledged.', {'sqlite': message});
    case 19:
      return RepositoryError('constraint', 'SQLite constraint violation.', {'sqlite': message});
    case 26:
      return RepositoryError('notadb', 'File is not a SQLite database (header invalid).', {'sqlite': message});
    default:
      return RepositoryError('internal', 'SQLite driver error: $message');
  }
}

/// ---------------------------------------------------------------------------
/// Versioned migrations — mirrors packages/native_outbox/src/migrations.ts
/// (Migration shape, contiguity validation, per-version transactions).
/// ---------------------------------------------------------------------------

class Migration {
  final int version;
  final String name;
  final List<String> statements;

  const Migration(this.version, this.name, this.statements);
}

class MigrateResult {
  final List<int> applied;
  final int currentVersion;

  const MigrateResult(this.applied, this.currentVersion);
}

/// ---------------------------------------------------------------------------
/// Secure credential store — mirrors
/// packages/native_identity/src/credentials.ts (SecureCredentialStore,
/// CredentialRef, SecureStorageBinding, CredentialStoreUnavailable).
/// ---------------------------------------------------------------------------

/// Logical references, never raw secrets. Stable across app upgrades.
enum CredentialRef {
  sessionTokens('session.tokens'),
  sessionAccountHint('session.accountHint'),
  deviceRegistration('device.registration'),
  pkceInflight('pkce.inflight');

  final String ref;

  const CredentialRef(this.ref);
}

/// Which OS backing a mount selected. Recorded, testable, never plaintext.
enum SecureStorageBinding {
  iosKeychain('ios.keychain'),
  androidKeystore('android.keystore'),
  macosKeychain('macos.keychain'),
  windowsCredentialManager('windows.credential-manager'),
  linuxSecretService('linux.secret-service');

  final String id;

  const SecureStorageBinding(this.id);
}

abstract interface class SecureCredentialStore {
  /// The OS backing this mount selected (declared so tests can assert it is
  /// not a file path or other non-secure surface).
  SecureStorageBinding get binding;

  Future<void> save(CredentialRef ref, String value);

  Future<String?> load(CredentialRef ref);

  Future<void> delete(CredentialRef ref);

  /// Wipe every credential this app owns (logout / account switch / reuse
  /// detection). NEVER touches pending work — the outbox is a different store.
  Future<void> wipeAll();
}

/// Fail-closed: when the OS store is unavailable, callers get this typed
/// error — never a fallback to disk (credentials.ts CredentialStoreUnavailable).
class CredentialStoreUnavailable implements Exception {
  final String message;
  final Map<String, String> detail;

  CredentialStoreUnavailable([Map<String, String>? detail])
      : message = 'Secure credential store is unavailable; refusing to fall back to non-secure storage.',
        detail = detail ?? const {};

  @override
  String toString() => 'CredentialStoreUnavailable: $message';
}

/// ---------------------------------------------------------------------------
/// System browser — mirrors packages/native_identity/src/lifecycle.ts
/// (SystemBrowserPort: the ONLY launch mechanism; no WebView surface).
/// ---------------------------------------------------------------------------

abstract interface class SystemBrowserPort {
  /// Launch the OS browser (ASWebAuthenticationSession / Custom Tabs /
  /// desktop browser).
  Future<void> open(String authorizeUrl);

  /// Resolve with the deep-link callback URL once the browser redirects back.
  Future<String> awaitCallback();
}

/// ---------------------------------------------------------------------------
/// Attachments — mirrors packages/native_attachment/src/contract.ts
/// (ObjectStore / SourceReaderPort / DigestPort, lines 174-206).
/// ---------------------------------------------------------------------------

/// Durable byte storage. Implementations MUST make putBytes
/// durable-before-return (write + flush + rename semantics); renameBytes
/// must be an atomic same-filesystem move tolerating an already-moved source
/// (crash re-entry); quota/disk-full MUST surface as the typed 'full' kind.
abstract interface class ObjectStore {
  void putBytes(String key, Uint8List bytes);

  Uint8List getBytes(String key);

  /// Byte length of the object, or null when absent.
  int? statBytes(String key);

  void removeBytes(String key);

  /// Atomic move; no-op when source is gone and destination exists.
  void renameBytes(String fromKey, String toKey);

  /// All keys with the given prefix (orphan sweep input).
  List<String> listKeys(String prefix);
}

/// Reads source bytes back from a device path (re-staging input).
/// Throws when the source is gone.
abstract interface class SourceReaderPort {
  Uint8List readBytes(String path);
}

/// sha-256 digest port (fail-closed; same discipline as M03-T06 — the
/// attachment manager refuses to open without a real implementation).
abstract interface class DigestPort {
  String get algorithm; // always 'sha-256'

  /// Lowercase hex over the input bytes.
  String digest(List<int> bytes);
}

/// Typed object-store failure kinds (attachment contract TransferErrorKind
/// 'storage' input; 'full' = quota/disk full).
class ObjectStoreError implements Exception {
  final String kind; // 'full' | 'io'
  final String message;

  ObjectStoreError(this.kind, this.message);

  @override
  String toString() => '[$kind] $message';
}

/// ---------------------------------------------------------------------------
/// Sync orchestration — mirrors packages/native_orchestrator/src/contract.ts
/// (SYNC_PROTOCOL_VERSION, ScopeClaims, SyncEnvelope, the eight outcome
/// kinds, PendingOpRecord 12-field shape, PendingOperationSource surface,
/// SyncTransportPort, ExecutionEnvironmentPort — lines 47-245).
/// ---------------------------------------------------------------------------

/// Sync-layer protocol version. Bumped only via a [PLAN-AMEND] decision.
const int kSyncProtocolVersion = 1;

class ScopeClaims {
  final String tenantId;
  final String? projectId;
  final String role;

  const ScopeClaims({required this.tenantId, required this.projectId, required this.role});

  Map<String, Object?> toJson() => {
        'tenantId': tenantId,
        'projectId': projectId,
        'role': role,
      };

  static ScopeClaims fromJson(Map<String, Object?> json) => ScopeClaims(
        tenantId: json['tenantId'] as String,
        projectId: json['projectId'] as String?,
        role: json['role'] as String,
      );
}

class SyncEnvelope {
  final int syncProtocolVersion;
  final String opId;
  final String deviceId;
  final String accountId;
  final String kind;
  final ScopeClaims scopeClaims;

  /// sha-256 lowercase hex of [payload].
  final String payloadDigest;
  final String payload;
  final List<String> dependsOnOpIds;
  final int attempt;
  final int sentAtMs;

  const SyncEnvelope({
    required this.syncProtocolVersion,
    required this.opId,
    required this.deviceId,
    required this.accountId,
    required this.kind,
    required this.scopeClaims,
    required this.payloadDigest,
    required this.payload,
    required this.dependsOnOpIds,
    required this.attempt,
    required this.sentAtMs,
  });

  Map<String, Object?> toJson() => {
        'syncProtocolVersion': syncProtocolVersion,
        'opId': opId,
        'deviceId': deviceId,
        'accountId': accountId,
        'kind': kind,
        'scopeClaims': scopeClaims.toJson(),
        'payloadDigest': payloadDigest,
        'payload': payload,
        'dependsOnOpIds': dependsOnOpIds,
        'attempt': attempt,
        'sentAtMs': sentAtMs,
      };
}

/// The eight v3 §5.3 outcome states, exactly as in orchestrator contract.ts.
enum SyncOutcomeKind {
  accepted('accepted'),
  previouslyAccepted('previously_accepted'),
  conflict('conflict'),
  rejected('rejected'),
  revoked('revoked'),
  authenticationRequired('authentication_required'),
  dependencyBlocked('dependency_blocked'),
  retryable('retryable');

  final String wire;

  const SyncOutcomeKind(this.wire);

  static SyncOutcomeKind fromWire(String value) =>
      SyncOutcomeKind.values.firstWhere((k) => k.wire == value,
          orElse: () => throw ArgumentError('unknown outcome kind: $value'));
}

class SyncOutcome {
  final SyncOutcomeKind kind;
  final String opId;

  /// Server receipt; present ONLY for accepted/previously_accepted.
  final String? receipt;

  /// Commit-order feed cursor (M03-T04 continuation); present on acceptances.
  final int? serverSeq;

  /// SANITIZED detail (no payloads).
  final String? detail;

  /// Server-suggested retry delay for retryable outcomes.
  final int? retryAfterMs;

  const SyncOutcome({
    required this.kind,
    required this.opId,
    this.receipt,
    this.serverSeq,
    this.detail,
    this.retryAfterMs,
  });
}

/// The orchestrator's op lifecycle view (orchestrator contract.ts lines
/// 156-193; the mount maps onto the outbox + its app extension).
class PendingOpRecord {
  final String opId;
  final String accountId;
  final String? projectId;
  final String kind;
  final String payload;
  final String? digest;
  final List<String> dependsOnOpIds;

  /// Six-value lifecycle (pending/in_flight/accepted/rejected/blocked/conflict).
  final String state;

  /// Number of dispatches so far; markInFlight increments it.
  final int attempts;
  final int? nextAttemptAtMs;
  final String? lastError;
  final String? acceptedReceipt;

  /// Commit-order feed cursor recorded with the acceptance (M03-T04).
  final int? serverSeq;

  /// Scope claims the mount stores with the op (revalidated server-side).
  final String? tenantId;
  final String? role;

  const PendingOpRecord({
    required this.opId,
    required this.accountId,
    required this.projectId,
    required this.kind,
    required this.payload,
    required this.digest,
    required this.dependsOnOpIds,
    required this.state,
    required this.attempts,
    required this.nextAttemptAtMs,
    required this.lastError,
    required this.acceptedReceipt,
    required this.serverSeq,
    this.tenantId,
    this.role,
  });
}

/// Pending-operation persistence — the surface the mount adapts onto the
/// outbox 1:1 (listDue/listInFlight/getOp/markInFlight/recordAccepted/
/// recordRejected/requeue/markBlocked/markConflict).
abstract interface class PendingOperationSource {
  /// Due pending ops (next_attempt_at_ms <= nowMs), oldest first.
  List<PendingOpRecord> listDue(String accountId, int nowMs);

  /// In-flight ops (lost-ack recovery input).
  List<PendingOpRecord> listInFlight(String accountId);

  PendingOpRecord? getOp(String accountId, String opId);

  PendingOpRecord markInFlight(String opId);

  PendingOpRecord recordAccepted(String opId, String receipt, int? serverSeq);

  PendingOpRecord recordRejected(String opId, String reason);

  /// Requeue with backoff (or null for immediately eligible).
  PendingOpRecord requeue(String opId, int? nextAttemptAtMs);

  /// Mark dependency-blocked (terminal for this op; data preserved).
  void markBlocked(String opId, String reason);

  /// Conflict surface — op stays pending-with-conflict for app resolution.
  void markConflict(String opId, String reason);
}

/// Transport to the sync service. Network failures THROW (mapped to
/// retryable by the orchestrator); typed server responses come back as
/// outcomes. One envelope in, one outcome out.
///
/// Deliberate Dart-shape deviation from the TS port (documented in the
/// M04-T02 report): the TS `send` is synchronous because the M03 test
/// fixtures were; Dart IO is async, so the binding's port is
/// `Future<SyncOutcome> send(...)`. The throw-on-network-failure and
/// typed-outcome disciplines are unchanged; the Dart orchestrator port
/// (M04-T03) consumes the async shape.
abstract interface class SyncTransportPort {
  Future<SyncOutcome> send(SyncEnvelope envelope);
}

/// Execution environment for background attempts. Foreground drains do NOT
/// consult it; background drains refuse to run while constraints are unmet —
/// pending work is untouched.
abstract interface class ExecutionEnvironmentPort {
  ({bool ok, String? reason}) suitableForBackgroundSync();
}

/// ---------------------------------------------------------------------------
/// Sync health — mirrors packages/native_observability/src/contract.ts
/// (ScopeCursor, RejectionSurface, DeviceSyncHealth, SyncHealthSource,
/// lines 130-177).
/// ---------------------------------------------------------------------------

class ScopeCursor {
  final String scope;
  final int lastAcceptedSeq;
  final int checkpointAgeMs;

  const ScopeCursor(this.scope, this.lastAcceptedSeq, this.checkpointAgeMs);
}

class RejectionSurface {
  final String opId;
  final String kind;
  final String reason; // sanitized
  final int atMs;

  const RejectionSurface(this.opId, this.kind, this.reason, this.atMs);
}

/// Health-state rows the mount derives from the outbox (observability
/// contract.ts SyncHealthSource).
class PendingHealthRow {
  final String opId;
  final String kind;
  final int createdAtMs;
  final String state; // pending | in_flight | blocked | conflict | rejected
  final String? lastError;
  final int updatedAtMs;

  const PendingHealthRow(this.opId, this.kind, this.createdAtMs, this.state,
      this.lastError, this.updatedAtMs);
}

/// The honest device sync-health read model. `synced` is TRUE only when no
/// pending work exists, no recent rejection is unsurfaced, and no scope is
/// short a checkpoint — anything else is `synced: false` with reasons.
class DeviceSyncHealth {
  final String accountId;
  final bool synced;
  final List<String> reasons;
  final int pendingOperationCount;
  final int? oldestPendingAgeMs;
  final int conflicts;
  final int blocked;
  final List<ScopeCursor> lastAcceptedCursors;
  final List<RejectionSurface> rejections;
  final int generatedAtMs;

  const DeviceSyncHealth({
    required this.accountId,
    required this.synced,
    required this.reasons,
    required this.pendingOperationCount,
    required this.oldestPendingAgeMs,
    required this.conflicts,
    required this.blocked,
    required this.lastAcceptedCursors,
    required this.rejections,
    required this.generatedAtMs,
  });
}

abstract interface class SyncHealthSource {
  String get accountId;

  List<PendingHealthRow> pendingOps();

  List<ScopeCursor> acceptedCursors();
}

class HealthOptions {
  /// Clock for age computations.
  final int nowMs;

  /// A rejection older than this no longer blocks `synced`.
  final int? rejectionFreshMs;

  const HealthOptions({required this.nowMs, this.rejectionFreshMs});
}

/// ---------------------------------------------------------------------------
/// Crash sanitization — mirrors packages/native_observability/src/contract.ts
/// (RawCrashContext / SanitizedCrashReport / CRASH_SAFE_ATTRIBUTE_KEYS /
/// CRASH_ATTRIBUTE_MAX_LEN, lines 43-78). See crash_sanitizer.dart.
/// ---------------------------------------------------------------------------

/// Allow-listed attribute keys (drop-first rule): anything else is dropped.
const Set<String> kCrashSafeAttributeKeys = {
  'component', 'errorKind', 'opId', 'attachmentId', 'accountId', 'projectId',
  'tenantId', 'scope', 'cursorSeq', 'serverSeq', 'attempt', 'state', 'kind',
  'deviceModel', 'osVersion', 'battery', 'network', 'storageFreeBytes',
};

/// Attribute values are reduced to short, non-secret summaries.
const int kCrashAttributeMaxLen = 64;
