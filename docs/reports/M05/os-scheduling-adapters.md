# M05-T06: OS Scheduling Adapters with Persisted Scheduling State

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T06` — OS scheduling adapters with persisted scheduling state
- **Dependencies:** `M05-T01` (Expansion substrate), `M03-T04` (Drain triggers & lifecycle)
- **Date:** 2026-10-12
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T06` introduces native OS background scheduling adapters and durable scheduler state management across the construction client outbox and sync engine:
1. **Durable Scheduling State**: Added SQLite migration 6 (`durable_scheduling_state`) providing the `scheduling_state` table. Persists `last_attempt_at_ms`, `next_window_earliest_ms`, `backoff_count`, `last_status`, and `deferred_reason` across process restarts.
2. **Foreground Recovery Invariant**: Background execution is treated strictly as an opportunistic optimization. When background execution is disabled or throttled by the OS, pending operations accumulate safely in `pending_op`. On foreground app launch or lifecycle resume (`drainTriggers.onLaunch()`), the client performs complete reconciliation.
3. **OS Port Bindings**: Modular facades (`AndroidWorkManagerSchedulerBinding`, `IosBGTaskSchedulerBinding`, `SimulatedOsScheduler`) encapsulate platform APIs behind `OsSchedulerPort`. Zero scheduling logic exists inside workflow screens or outbox handlers.
4. **Honest Observability**: OS constraints (low battery, power saver, OS quota deferrals) surface honestly in the `DeviceSyncHealth` read model (`DeviceSyncHealth.reasons` containing `'background sync deferred: <reason>'`), marking `synced: false`. Blocked windows are never silent.

---

## 2. Architecture & Data Model

### 2.1 SQLite Schema (Migration v6)

```sql
CREATE TABLE scheduling_state (
  task_id TEXT NOT NULL,
  accountId TEXT NOT NULL,
  last_attempt_at_ms INTEGER,
  next_window_earliest_ms INTEGER,
  backoff_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT 'idle',
  deferred_reason TEXT,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (task_id, account_id)
);

CREATE INDEX idx_scheduling_lookup ON scheduling_state (account_id, task_id, last_status);
```

### 2.2 Durable Scheduling Store (`DurableSchedulerStateStore`)

Methods:
- `get(taskId, accountId) -> DurableSchedulerRecord?`
- `recordAttempt(taskId, accountId, status: 'running')`
- `recordSuccess(taskId, accountId, nextWindowDelayMs)`
- `recordFailure(taskId, accountId, baseBackoffMs, maxBackoffMs)` (exponential backoff calculation)
- `recordDeferral(taskId, accountId, reason, nextRetryDelayMs)`
- `listDeferred(accountId) -> List<DurableSchedulerRecord>`
- `reset(taskId, accountId)`

### 2.3 OS Scheduler Port (`OsSchedulerPort`)

Provides platform-agnostic scheduling contracts:
- `schedulePeriodicSync({required String accountId, required Duration interval, Duration? initialDelay, bool requiresUnmeteredNetwork, bool requiresCharging})`
- `scheduleOneOffDrain({required String accountId, Duration? delay})`
- `cancel({required String taskId, required String accountId})`
- `cancelAll({required String accountId})`
- `isScheduled({required String taskId, required String accountId}) -> Future<bool>`

Bindings:
- `AndroidWorkManagerSchedulerBinding`: Android WorkManager facade with network and battery charging constraints.
- `IosBGTaskSchedulerBinding`: iOS `BGAppRefreshTask` / `BGProcessingTask` facade with scheduling and cancellation support.
- `SimulatedOsScheduler`: In-memory test simulator with deterministic inspection.

### 2.4 Adaptive Execution Environment (`AdaptiveExecutionEnvironment`)

Monitors runtime OS conditions:
- Battery low threshold check (`batteryLevelPercent < 15.0`)
- Power saver mode detection (`isPowerSaveMode == true`)
- OS background quota exhaustion (`isQuotaExceeded == true`)
- Background execution disabled flag (`backgroundExecutionDisabled == true`)

When any constraint fails, background execution yields, records a typed deferral into SQLite, and relies on the foreground recovery invariant.

---

## 3. Verification & Test Evidence

### 3.1 Unit & Integration Test Suite (`test/mount/os_scheduler_test.dart`)

```bash
$ flutter test test/mount/os_scheduler_test.dart
00:00 +0: loading test/mount/os_scheduler_test.dart
00:00 +0: durable scheduling state persists across process restart
00:00 +1: adaptive execution environment detects OS constraints and records deferrals
00:00 +2: honest health read model: deferred background sync surfaces in reasons and marks synced false
00:00 +3: foreground recovery invariant: device with background execution NEVER ran fully reconciles on launch
00:00 +4: OS scheduler port bindings: schedule, verify active, and cancel
00:00 +5: All tests passed!
```

### 3.2 Full Test Suite Regression Pass

```bash
$ flutter test
...
00:15 +250: All tests passed!
```

### 3.3 Static Analysis

```bash
$ flutter analyze
Analyzing construction_client...
No issues found! (ran in 2.7s)
```

---

## 4. Acceptance Criteria Checklist

- [x] **Durable scheduling state:** Persisted in SQLite `scheduling_state` table across process death.
- [x] **Foreground recovery invariant:** Device whose background execution NEVER ran reconciles completely on foreground launch (`drainTriggers.onLaunch()`) without data loss.
- [x] **OS scheduler bindings:** Android WorkManager & iOS BGTaskScheduler facades mounted behind `OsSchedulerPort`.
- [x] **Zero scheduling logic in workflows:** Attendance, site expenses, and MRR write directly to outbox / substrate.
- [x] **Honest observability:** Low battery, power saver, and quota deferrals surface directly in `DeviceSyncHealth.reasons`.
