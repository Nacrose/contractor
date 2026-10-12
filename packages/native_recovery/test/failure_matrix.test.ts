import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FreshDeviceBootstrapEngine,
  MigrationInterruptionRecoveryEngine,
  ApplicationDowngradeProtectionEngine,
  ApplicationDowngradeRejectedError,
  LocalCorruptionDetectorAndRepairEngine,
  RevokedDeviceIsolationEngine,
  RevokedDeviceTokenError,
  ExpiredCursorProtocolEngine,
} from '../src/index.js';

test('FreshDeviceBootstrapEngine: bootstraps new device from snapshot watermark and incremental delta', () => {
  const deviceId = 'dev-rugged-android-01';
  const projectId = 'proj-tamu-dam';

  const snapshotEntities = [
    { id: 'e1', payload: { type: 'project', name: 'Tamu Dam' } },
    { id: 'e2', payload: { type: 'boq', itemCode: '1.01' } },
    { id: 'e3', payload: { type: 'schedule_task', taskId: 'TSK-10' } },
  ];

  const incrementalEvents = [
    { eventId: 'ev-1', seq: 101, entityId: 'e1' },
    { eventId: 'ev-2', seq: 102, entityId: 'e2' },
  ];

  const state = FreshDeviceBootstrapEngine.bootstrap(deviceId, projectId, snapshotEntities, incrementalEvents);

  assert.equal(state.deviceId, deviceId);
  assert.equal(state.projectId, projectId);
  assert.equal(state.totalEntities, 3);
  assert.equal(state.snapshotWatermarkSeq, 102);
  assert.equal(state.incrementalEventsApplied, 2);
  assert.ok(state.durationMs < 50);
});

test('MigrationInterruptionRecoveryEngine: performs clean atomic rollback upon simulated mid-migration crash', () => {
  // 1. Successful migration (v4 -> v5)
  const cleanResult = MigrationInterruptionRecoveryEngine.executeMigration(4, 5);
  assert.equal(cleanResult.currentVersion, 5);
  assert.equal(cleanResult.rolledBack, false);

  // 2. Interrupted migration at step 2 (simulated SIGKILL)
  const crashResult = MigrationInterruptionRecoveryEngine.executeMigration(4, 5, 2);
  assert.equal(crashResult.currentVersion, 4); // Rolled back cleanly to v4
  assert.equal(crashResult.rolledBack, true);
  assert.ok(crashResult.error?.includes('SIGKILL'));
});

test('ApplicationDowngradeProtectionEngine: rejects older binary on newer local schema fail-closed', () => {
  const localDbSchemaVersion = 5;

  // Modern binary (v5) on v5 db -> OK
  assert.doesNotThrow(() => {
    ApplicationDowngradeProtectionEngine.verifyBinaryCompatibility(localDbSchemaVersion, 5);
  });

  // Older binary (v4) on v5 db -> Throws ApplicationDowngradeRejectedError
  assert.throws(
    () => {
      ApplicationDowngradeProtectionEngine.verifyBinaryCompatibility(localDbSchemaVersion, 4);
    },
    (err: unknown) => {
      assert.ok(err instanceof ApplicationDowngradeRejectedError);
      assert.equal(err.currentSchemaVersion, 5);
      assert.equal(err.attemptedBinarySchemaVersion, 4);
      assert.ok(err.upgradePrompt.includes('upgrade your Contractor app'));
      return true;
    }
  );
});

test('LocalCorruptionDetectorAndRepairEngine: detects corruption and restores from clean remote snapshot', () => {
  // Healthy database
  const healthy = LocalCorruptionDetectorAndRepairEngine.inspectAndRepair(true, true);
  assert.equal(healthy.status, 'HEALTHY');

  // Corrupted database with remote snapshot available
  const repaired = LocalCorruptionDetectorAndRepairEngine.inspectAndRepair(false, true);
  assert.equal(repaired.status, 'REPAIRED_FROM_REMOTE_SNAPSHOT');
  assert.equal(repaired.pagesRepaired, 12);

  // Corrupted database without snapshot
  const unrecoverable = LocalCorruptionDetectorAndRepairEngine.inspectAndRepair(false, false);
  assert.equal(unrecoverable.status, 'UNRECOVERABLE');
});

test('RevokedDeviceIsolationEngine: halts sync and isolates revoked device token', () => {
  const revokedSet = new Set(['dev-stolen-ipad-09']);

  // Authorized device
  assert.doesNotThrow(() => {
    RevokedDeviceIsolationEngine.verifyDeviceAccess('dev-valid-laptop-01', revokedSet);
  });

  // Revoked device
  assert.throws(
    () => {
      RevokedDeviceIsolationEngine.verifyDeviceAccess('dev-stolen-ipad-09', revokedSet);
    },
    RevokedDeviceTokenError
  );
});

test('ExpiredCursorProtocolEngine: detects expired change-feed cursor and issues resync signal', () => {
  const now = 1760000000000;
  const MS_DAY = 86400000;

  // Active cursor (5 days old, <= 30d TTL)
  const active = ExpiredCursorProtocolEngine.evaluateCursor(now - 5 * MS_DAY, now, 30);
  assert.equal(active.resyncRequired, false);

  // Expired cursor (45 days old, > 30d TTL)
  const expired = ExpiredCursorProtocolEngine.evaluateCursor(now - 45 * MS_DAY, now, 30);
  assert.equal(expired.resyncRequired, true);
  assert.ok(expired.reason?.includes('exceeds server TTL'));
});
