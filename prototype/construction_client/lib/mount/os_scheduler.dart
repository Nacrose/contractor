import 'dart:math';

import 'ports.dart';

/// Database migration adding durable scheduling state.
const Migration kDurableSchedulerMigration = Migration(
  6,
  'durable_scheduling_state',
  [
    'CREATE TABLE scheduling_state ('
        ' task_id TEXT NOT NULL,'
        ' account_id TEXT NOT NULL,'
        ' last_attempt_at_ms INTEGER,'
        ' next_window_earliest_ms INTEGER,'
        ' backoff_count INTEGER NOT NULL DEFAULT 0,'
        ' last_status TEXT NOT NULL DEFAULT \'idle\','
        ' deferred_reason TEXT,'
        ' updated_at_ms INTEGER NOT NULL,'
        ' PRIMARY KEY (task_id, account_id)'
        ')',
    'CREATE INDEX idx_scheduling_lookup ON scheduling_state (account_id, task_id, last_status)',
  ],
);

/// Persisted scheduling state surviving process restarts (M05-T06).
class DurableSchedulerRecord {
  final String taskId;
  final String accountId;
  final int? lastAttemptAtMs;
  final int? nextWindowEarliestMs;
  final int backoffCount;
  final String lastStatus; // 'idle' | 'running' | 'deferred' | 'success' | 'failed'
  final String? deferredReason;
  final int updatedAtMs;

  const DurableSchedulerRecord({
    required this.taskId,
    required this.accountId,
    this.lastAttemptAtMs,
    this.nextWindowEarliestMs,
    required this.backoffCount,
    required this.lastStatus,
    this.deferredReason,
    required this.updatedAtMs,
  });

  bool get isDeferred => lastStatus == 'deferred';
}

/// Durable store for OS scheduling state backed by SQLite.
class DurableSchedulerStateStore {
  final SqlDriver driver;
  final int Function() nowMs;

  DurableSchedulerStateStore({
    required this.driver,
    int Function()? nowMs,
  }) : nowMs = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch);

  DurableSchedulerRecord? get(String taskId, String accountId) {
    final row = driver
        .prepare('SELECT * FROM scheduling_state WHERE task_id = ? AND account_id = ?')
        .get([taskId, accountId]);
    return row == null ? null : _fromRow(row);
  }

  List<DurableSchedulerRecord> listDeferred(String accountId) {
    return driver
        .prepare('SELECT * FROM scheduling_state WHERE account_id = ? AND last_status = \'deferred\'')
        .all([accountId])
        .map(_fromRow)
        .toList(growable: false);
  }

  void recordDeferral({
    required String taskId,
    required String accountId,
    required String reason,
    int? nextWindowDelayMs,
  }) {
    final now = nowMs();
    final existing = get(taskId, accountId);
    final backoff = (existing?.backoffCount ?? 0) + 1;
    final nextDelay = nextWindowDelayMs ?? _computeBackoff(backoff);
    final nextWindow = now + nextDelay;

    driver.prepare(
      'INSERT INTO scheduling_state '
      '(task_id, account_id, last_attempt_at_ms, next_window_earliest_ms, backoff_count, last_status, deferred_reason, updated_at_ms) '
      'VALUES (?, ?, ?, ?, ?, \'deferred\', ?, ?) '
      'ON CONFLICT(task_id, account_id) DO UPDATE SET '
      'last_attempt_at_ms = excluded.last_attempt_at_ms,'
      'next_window_earliest_ms = excluded.next_window_earliest_ms,'
      'backoff_count = excluded.backoff_count,'
      'last_status = \'deferred\','
      'deferred_reason = excluded.deferred_reason,'
      'updated_at_ms = excluded.updated_at_ms',
    ).run([taskId, accountId, now, nextWindow, backoff, reason, now]);
  }

  void recordSuccess({
    required String taskId,
    required String accountId,
    int? nextPeriodicIntervalMs,
  }) {
    final now = nowMs();
    final nextWindow = nextPeriodicIntervalMs != null ? now + nextPeriodicIntervalMs : null;

    driver.prepare(
      'INSERT INTO scheduling_state '
      '(task_id, account_id, last_attempt_at_ms, next_window_earliest_ms, backoff_count, last_status, deferred_reason, updated_at_ms) '
      'VALUES (?, ?, ?, ?, 0, \'success\', NULL, ?) '
      'ON CONFLICT(task_id, account_id) DO UPDATE SET '
      'last_attempt_at_ms = excluded.last_attempt_at_ms,'
      'next_window_earliest_ms = excluded.next_window_earliest_ms,'
      'backoff_count = 0,'
      'last_status = \'success\','
      'deferred_reason = NULL,'
      'updated_at_ms = excluded.updated_at_ms',
    ).run([taskId, accountId, now, nextWindow, now]);
  }

  void recordFailure({
    required String taskId,
    required String accountId,
    required String errorDetail,
  }) {
    final now = nowMs();
    final existing = get(taskId, accountId);
    final backoff = (existing?.backoffCount ?? 0) + 1;
    final nextDelay = _computeBackoff(backoff);
    final nextWindow = now + nextDelay;

    driver.prepare(
      'INSERT INTO scheduling_state '
      '(task_id, account_id, last_attempt_at_ms, next_window_earliest_ms, backoff_count, last_status, deferred_reason, updated_at_ms) '
      'VALUES (?, ?, ?, ?, ?, \'failed\', ?, ?) '
      'ON CONFLICT(task_id, account_id) DO UPDATE SET '
      'last_attempt_at_ms = excluded.last_attempt_at_ms,'
      'next_window_earliest_ms = excluded.next_window_earliest_ms,'
      'backoff_count = excluded.backoff_count,'
      'last_status = \'failed\','
      'deferred_reason = excluded.deferred_reason,'
      'updated_at_ms = excluded.updated_at_ms',
    ).run([taskId, accountId, now, nextWindow, backoff, errorDetail, now]);
  }

  int _computeBackoff(int attempt) {
    const baseMs = 30000; // 30 seconds
    const maxMs = 3600000; // 1 hour cap
    final exp = min(attempt, 6);
    return min(baseMs * (1 << exp), maxMs);
  }

  static DurableSchedulerRecord _fromRow(Map<String, Object?> row) {
    return DurableSchedulerRecord(
      taskId: row['task_id']! as String,
      accountId: row['account_id']! as String,
      lastAttemptAtMs: row['last_attempt_at_ms'] as int?,
      nextWindowEarliestMs: row['next_window_earliest_ms'] as int?,
      backoffCount: row['backoff_count']! as int,
      lastStatus: row['last_status']! as String,
      deferredReason: row['deferred_reason'] as String?,
      updatedAtMs: row['updated_at_ms']! as int,
    );
  }
}

/// OS scheduler constraints requested when registering background tasks.
class OsSchedulerConstraints {
  final bool requiresUnmeteredNetwork;
  final bool requiresCharging;
  final bool requiresBatteryNotLow;

  const OsSchedulerConstraints({
    this.requiresUnmeteredNetwork = false,
    this.requiresCharging = false,
    this.requiresBatteryNotLow = true,
  });
}

/// Port abstraction over OS background schedulers (Android WorkManager / iOS BGTaskScheduler).
abstract interface class OsSchedulerPort {
  /// Schedules a background execution window with the host OS.
  Future<void> schedule({
    required String taskId,
    required String accountId,
    required Duration minDelay,
    required OsSchedulerConstraints constraints,
  });

  /// Cancels any scheduled background execution for the task.
  Future<void> cancel(String taskId);

  /// Checks if the task is currently registered with the OS scheduler.
  Future<bool> isScheduled(String taskId);
}

/// Simulated in-memory scheduler for testing, headless runners, and desktop.
class SimulatedOsScheduler implements OsSchedulerPort {
  final Map<String, ({Duration minDelay, OsSchedulerConstraints constraints, String accountId})> _scheduled = {};

  @override
  Future<void> schedule({
    required String taskId,
    required String accountId,
    required Duration minDelay,
    required OsSchedulerConstraints constraints,
  }) async {
    _scheduled[taskId] = (minDelay: minDelay, constraints: constraints, accountId: accountId);
  }

  @override
  Future<void> cancel(String taskId) async {
    _scheduled.remove(taskId);
  }

  @override
  Future<bool> isScheduled(String taskId) async {
    return _scheduled.containsKey(taskId);
  }

  Map<String, ({Duration minDelay, OsSchedulerConstraints constraints, String accountId})> get activeTasks =>
      Map.unmodifiable(_scheduled);
}

/// Android WorkManager adapter implementation facade.
class AndroidWorkManagerSchedulerBinding implements OsSchedulerPort {
  final OsSchedulerPort _delegate;

  AndroidWorkManagerSchedulerBinding({OsSchedulerPort? delegate})
      : _delegate = delegate ?? SimulatedOsScheduler();

  @override
  Future<void> schedule({
    required String taskId,
    required String accountId,
    required Duration minDelay,
    required OsSchedulerConstraints constraints,
  }) => _delegate.schedule(
        taskId: taskId,
        accountId: accountId,
        minDelay: minDelay,
        constraints: constraints,
      );

  @override
  Future<void> cancel(String taskId) => _delegate.cancel(taskId);

  @override
  Future<bool> isScheduled(String taskId) => _delegate.isScheduled(taskId);
}

/// iOS BGTaskScheduler adapter implementation facade.
class IosBGTaskSchedulerBinding implements OsSchedulerPort {
  final OsSchedulerPort _delegate;

  IosBGTaskSchedulerBinding({OsSchedulerPort? delegate})
      : _delegate = delegate ?? SimulatedOsScheduler();

  @override
  Future<void> schedule({
    required String taskId,
    required String accountId,
    required Duration minDelay,
    required OsSchedulerConstraints constraints,
  }) => _delegate.schedule(
        taskId: taskId,
        accountId: accountId,
        minDelay: minDelay,
        constraints: constraints,
      );

  @override
  Future<void> cancel(String taskId) => _delegate.cancel(taskId);

  @override
  Future<bool> isScheduled(String taskId) => _delegate.isScheduled(taskId);
}

/// Execution environment adapter that evaluates real OS hardware and quota constraints.
/// Deferrals are recorded durably into [DurableSchedulerStateStore] and surfaced in health.
class AdaptiveExecutionEnvironment implements ExecutionEnvironmentPort {
  final DurableSchedulerStateStore? store;
  final String defaultTaskId;
  final String defaultAccountId;

  // Controllable environment inputs for testing and device sensors
  bool backgroundExecutionDisabled;
  bool isPowerSaveMode;
  bool isCharging;
  int batteryPercentage;
  bool isMeteredNetwork;
  bool quotaExceeded;

  AdaptiveExecutionEnvironment({
    this.store,
    this.defaultTaskId = 'background_sync',
    this.defaultAccountId = 'default',
    this.backgroundExecutionDisabled = false,
    this.isPowerSaveMode = false,
    this.isCharging = false,
    this.batteryPercentage = 100,
    this.isMeteredNetwork = false,
    this.quotaExceeded = false,
  });

  @override
  ({bool ok, String? reason}) suitableForBackgroundSync() {
    if (backgroundExecutionDisabled) {
      _recordDeferral('background_sync_disabled_by_policy');
      return (ok: false, reason: 'background_sync_disabled_by_policy');
    }
    if (quotaExceeded) {
      _recordDeferral('os_quota_exceeded');
      return (ok: false, reason: 'os_quota_exceeded');
    }
    if (isPowerSaveMode) {
      _recordDeferral('os_power_saver_active');
      return (ok: false, reason: 'os_power_saver_active');
    }
    if (batteryPercentage < 15 && !isCharging) {
      _recordDeferral('battery_low');
      return (ok: false, reason: 'battery_low');
    }

    return (ok: true, reason: null);
  }

  void _recordDeferral(String reason) {
    store?.recordDeferral(
      taskId: defaultTaskId,
      accountId: defaultAccountId,
      reason: reason,
    );
  }
}
