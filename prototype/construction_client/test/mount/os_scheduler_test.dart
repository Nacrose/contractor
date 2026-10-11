import 'dart:io';

import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/os_scheduler.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_health.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:construction_client/workflows/field_expansion_substrate.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeCredentials implements SecureCredentialStore {
  @override
  SecureStorageBinding get binding => SecureStorageBinding.linuxSecretService;

  @override
  Future<void> delete(CredentialRef ref) async {}

  @override
  Future<String?> load(CredentialRef ref) async => 'mock-token';

  @override
  Future<void> save(CredentialRef ref, String value) async {}

  @override
  Future<void> wipeAll() async {}
}

class _RecordingTransport implements SyncTransportPort {
  final List<SyncEnvelope> sent = [];

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async {
    sent.add(envelope);
    return SyncOutcome(
      kind: SyncOutcomeKind.accepted,
      opId: envelope.opId,
      receipt: 'rcpt-sched-${envelope.opId}',
      serverSeq: 501,
    );
  }
}

void main() {
  late Directory tmp;
  late _RecordingTransport transport;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('os_scheduler_test');
    transport = _RecordingTransport();
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  ConstructionMount open({
    ExecutionEnvironmentPort? environment,
  }) => openMount(
    options: MountOptions(
      dbPath: '${tmp.path}/outbox.db',
      objectRoot: Directory('${tmp.path}/objects'),
      extraMigrations: const [
        kDailyReportLocalMigration,
        kFieldExpansionLocalMigration,
        kDurableSchedulerMigration,
      ],
    ),
    credentials: _FakeCredentials(),
    transport: transport,
    environment: environment,
  );

  test('durable scheduling state persists across process restart', () async {
    // 1. Initial process: Record deferral
    final mount1 = open();
    final store1 = DurableSchedulerStateStore(
      driver: mount1.driver,
      nowMs: () => 100000,
    );

    store1.recordDeferral(
      taskId: 'bg-sync-task',
      accountId: 'acct-1',
      reason: 'battery_low',
      nextWindowDelayMs: 60000,
    );

    final rec1 = store1.get('bg-sync-task', 'acct-1');
    expect(rec1, isNotNull);
    expect(rec1!.lastStatus, 'deferred');
    expect(rec1.deferredReason, 'battery_low');
    expect(rec1.backoffCount, 1);
    expect(rec1.nextWindowEarliestMs, 160000);

    // 2. Process death: Close mount1
    mount1.driver.close();

    // 3. Process restart: Reopen mount2 from same database file
    final mount2 = open();
    final store2 = DurableSchedulerStateStore(
      driver: mount2.driver,
      nowMs: () => 170000,
    );

    final rec2 = store2.get('bg-sync-task', 'acct-1');
    expect(rec2, isNotNull);
    expect(rec2!.lastStatus, 'deferred');
    expect(rec2.deferredReason, 'battery_low');
    expect(rec2.backoffCount, 1);
    expect(rec2.nextWindowEarliestMs, 160000);

    // Record success upon successful window
    store2.recordSuccess(
      taskId: 'bg-sync-task',
      accountId: 'acct-1',
      nextPeriodicIntervalMs: 900000, // 15 mins
    );

    final recSuccess = store2.get('bg-sync-task', 'acct-1');
    expect(recSuccess!.lastStatus, 'success');
    expect(recSuccess.deferredReason, isNull);
    expect(recSuccess.backoffCount, 0);

    mount2.driver.close();
  });

  test('adaptive execution environment detects OS constraints and records deferrals', () async {
    final mount = open();
    final schedulerStore = DurableSchedulerStateStore(driver: mount.driver);

    final env = AdaptiveExecutionEnvironment(
      store: schedulerStore,
      defaultTaskId: 'bg-sync',
      defaultAccountId: 'acct-1',
      batteryPercentage: 10,
      isCharging: false,
    );

    // Battery low -> not suitable
    final verdict1 = env.suitableForBackgroundSync();
    expect(verdict1.ok, isFalse);
    expect(verdict1.reason, 'battery_low');

    final deferredList = schedulerStore.listDeferred('acct-1');
    expect(deferredList.length, 1);
    expect(deferredList.first.deferredReason, 'battery_low');

    // Plug in charger -> suitable
    env.isCharging = true;
    final verdict2 = env.suitableForBackgroundSync();
    expect(verdict2.ok, isTrue);
    expect(verdict2.reason, isNull);

    // Power saver activated -> not suitable
    env.isPowerSaveMode = true;
    final verdict3 = env.suitableForBackgroundSync();
    expect(verdict3.ok, isFalse);
    expect(verdict3.reason, 'os_power_saver_active');

    mount.driver.close();
  });

  test('honest health read model: deferred background sync surfaces in reasons and marks synced false', () {
    final mount = open();
    final schedulerStore = DurableSchedulerStateStore(driver: mount.driver);

    // Record a deferral due to OS quota
    schedulerStore.recordDeferral(
      taskId: 'periodic-sync',
      accountId: 'acct-1',
      reason: 'os_quota_exceeded',
    );

    final healthSource = mount.healthSource(accountId: 'acct-1', tenantId: 'tenant-1');
    final health = buildDeviceSyncHealth(
      healthSource,
      const HealthOptions(nowMs: 200000),
      schedulerStore: schedulerStore,
    );

    // Even if no pending ops exist, the deferred background sync is surfaced honestly!
    expect(health.synced, isFalse);
    expect(health.reasons, contains('background sync deferred: os_quota_exceeded'));

    mount.driver.close();
  });

  test('foreground recovery invariant: device with background execution NEVER ran fully reconciles on launch', () async {
    // Environment configured with background execution permanently disabled
    final env = AdaptiveExecutionEnvironment(
      backgroundExecutionDisabled: true,
    );

    final mount = open(environment: env);
    final store = FieldExpansionLocalStore(mount);

    // 1. User queues several expansion workflow submissions while offline
    store.saveAttendance(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field_supervisor',
      draft: AttendanceSubmissionDraft(
        clientUuid: 'attend-uuid-001',
        projectId: 'proj-1',
        attendanceDate: '2026-10-12',
        records: const [
          AttendanceRecordItem(
            staffId: 'staff-1',
            staffName: 'Hari Prasad',
            trade: 'Mason',
          ),
        ],
      ),
    );

    store.saveSiteExpense(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field_supervisor',
      draft: SiteExpenseSubmissionDraft(
        clientUuid: 'expense-uuid-001',
        projectId: 'proj-1',
        expenseDate: '2026-10-12',
        category: 'fuel',
        amount: '3500.00',
        currency: 'NPR',
        payee: 'Universal Fuel Center',
      ),
    );

    store.saveMaterialDelivery(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'site_engineer',
      draft: MaterialDeliverySubmissionDraft(
        clientUuid: 'delivery-uuid-001',
        projectId: 'proj-1',
        deliveryDate: '2026-10-12',
        supplierName: 'Gorakhkali Rubber',
        challanNumber: 'GK-4011',
        items: const [
          MaterialDeliveryItem(
            materialCode: 'MAT-TYRE',
            materialName: 'Loader Tyres',
            quantity: 4,
            unit: 'pcs',
          ),
        ],
      ),
    );

    // Verify 3 pending operations exist in outbox
    final ops = mount.driver.prepare('SELECT id, state FROM pending_op').all(const []);
    expect(ops.length, 3);
    expect(transport.sent.length, 0);

    // 2. Simulate OS background sync trigger attempt -> REJECTED by environment gate!
    await mount.drainTriggers.maybeBackgroundDrain();
    // Transport has still sent 0 items because background drain was skipped!
    expect(transport.sent.length, 0);

    // 3. Process death simulation: close driver and reopen
    mount.driver.close();

    final mountRestarted = open(environment: env);
    final orchestrator = DailyLogSyncOrchestrator(
      mount: mountRestarted,
      deviceId: 'device-test-01',
    );
    orchestrator.bindDrainTriggers(() => 'acct-1');

    // 4. Foreground Launch trigger: onLaunch() or resumed lifecycle
    await mountRestarted.drainTriggers.onLaunch();

    // 5. Complete reconciliation: all 3 operations drained and accepted!
    expect(transport.sent.length, 3);
    final finalOps = mountRestarted.driver.prepare('SELECT id, state FROM pending_op').all(const []);
    expect(finalOps.every((o) => o['state'] == 'accepted'), isTrue);

    final health = mountRestarted.healthSource(accountId: 'acct-1', tenantId: 'tenant-1');
    final finalHealth = buildDeviceSyncHealth(health, const HealthOptions(nowMs: 300000));
    expect(finalHealth.synced, isTrue);
    expect(finalHealth.pendingOperationCount, 0);

    mountRestarted.driver.close();
  });

  test('OS scheduler port bindings: schedule, verify active, and cancel', () async {
    final scheduler = SimulatedOsScheduler();
    final workManager = AndroidWorkManagerSchedulerBinding(delegate: scheduler);
    final bgScheduler = IosBGTaskSchedulerBinding(delegate: scheduler);

    // Test Android WorkManager facade
    await workManager.schedule(
      taskId: 'sync-workmanager',
      accountId: 'acct-1',
      minDelay: const Duration(minutes: 15),
      constraints: const OsSchedulerConstraints(
        requiresBatteryNotLow: true,
        requiresCharging: false,
      ),
    );

    expect(await workManager.isScheduled('sync-workmanager'), isTrue);
    expect(scheduler.activeTasks['sync-workmanager']?.constraints.requiresBatteryNotLow, isTrue);

    // Test iOS BGTaskScheduler facade
    await bgScheduler.schedule(
      taskId: 'sync-bgtask',
      accountId: 'acct-1',
      minDelay: const Duration(minutes: 30),
      constraints: const OsSchedulerConstraints(
        requiresUnmeteredNetwork: true,
      ),
    );

    expect(await bgScheduler.isScheduled('sync-bgtask'), isTrue);

    // Cancel tasks
    await workManager.cancel('sync-workmanager');
    expect(await workManager.isScheduled('sync-workmanager'), isFalse);
    expect(await bgScheduler.isScheduled('sync-bgtask'), isTrue);
  });
}
