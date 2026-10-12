import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RpoRtoBenchmarkEngine,
  KeyEscrowPolicyEngine,
  TieredRetentionEngine,
  FailedBackupAlertEngine,
  DisasterRecoveryOperatorRunbook,
} from '../src/index.js';

test('RpoRtoBenchmarkEngine: benchmarks RPO (<= 15 min) and RTO (<= 60 min) against SLA', () => {
  const disasterTime = 1760000000000;

  // 1. RPO benchmark (10 minutes old snapshot)
  const snapshotTimePassing = disasterTime - 10 * 60000;
  const rpoPass = RpoRtoBenchmarkEngine.measureRpo(disasterTime, snapshotTimePassing);
  assert.equal(rpoPass.rpoMinutes, 10.0);
  assert.equal(rpoPass.meetsRpoSla, true);

  // RPO failure (22 minutes old snapshot)
  const snapshotTimeFailing = disasterTime - 22 * 60000;
  const rpoFail = RpoRtoBenchmarkEngine.measureRpo(disasterTime, snapshotTimeFailing);
  assert.equal(rpoFail.rpoMinutes, 22.0);
  assert.equal(rpoFail.meetsRpoSla, false);

  // 2. RTO benchmark (35 minutes cold restore)
  const restoreStart = disasterTime;
  const restoreReadyPassing = restoreStart + 35 * 60000;
  const rtoPass = RpoRtoBenchmarkEngine.measureRto(restoreStart, restoreReadyPassing);
  assert.equal(rtoPass.rtoMinutes, 35.0);
  assert.equal(rtoPass.meetsRtoSla, true);

  // RTO failure (75 minutes cold restore)
  const restoreReadyFailing = restoreStart + 75 * 60000;
  const rtoFail = RpoRtoBenchmarkEngine.measureRto(restoreStart, restoreReadyFailing);
  assert.equal(rtoFail.rtoMinutes, 75.0);
  assert.equal(rtoFail.meetsRtoSla, false);
});

test('KeyEscrowPolicyEngine: verifies M-of-N threshold quorum to unlock recovery vault', () => {
  const threshold = 2;
  const total = 3;

  // Insufficient shares (1 of 3)
  const unreached = KeyEscrowPolicyEngine.verifyQuorum(threshold, total, [1]);
  assert.equal(unreached.isQuorumReached, false);

  // Duplicate share does not satisfy threshold
  const duplicates = KeyEscrowPolicyEngine.verifyQuorum(threshold, total, [1, 1]);
  assert.equal(duplicates.isQuorumReached, false);

  // Quorum reached (2 of 3)
  const reached = KeyEscrowPolicyEngine.verifyQuorum(threshold, total, [1, 3]);
  assert.equal(reached.isQuorumReached, true);
});

test('TieredRetentionEngine: audits and expires backups according to retention schedule', () => {
  const now = 1760000000000;
  const MS_DAY = 86400000;

  const sampleBackups = [
    { backupId: 'bak-d1', createdAt: now - 3 * MS_DAY, tier: 'DAILY' as const },
    { backupId: 'bak-d2', createdAt: now - 9 * MS_DAY, tier: 'DAILY' as const }, // Expired (>7d)
    { backupId: 'bak-w1', createdAt: now - 20 * MS_DAY, tier: 'WEEKLY' as const },
    { backupId: 'bak-w2', createdAt: now - 35 * MS_DAY, tier: 'WEEKLY' as const }, // Expired (>28d)
    { backupId: 'bak-a1', createdAt: now - 365 * 4 * MS_DAY, tier: 'ANNUAL' as const },
    { backupId: 'bak-a2', createdAt: now - 365 * 8 * MS_DAY, tier: 'ANNUAL' as const }, // Expired (>7y)
  ];

  const audited = TieredRetentionEngine.evaluateRetention(now, sampleBackups);
  assert.equal(audited.length, 6);

  assert.equal(audited[0].action, 'RETAIN');
  assert.equal(audited[1].action, 'PURGE'); // d2 purged
  assert.equal(audited[2].action, 'RETAIN');
  assert.equal(audited[3].action, 'PURGE'); // w2 purged
  assert.equal(audited[4].action, 'RETAIN');
  assert.equal(audited[5].action, 'PURGE'); // a2 purged
});

test('FailedBackupAlertEngine: triggers high-priority alerts within 60s upon missed cadence', () => {
  const now = 1760000000000;
  const tenantId = 'org-ktm-infra';

  // Cadence healthy (12 minutes since last snapshot, <= 15m)
  const healthy = FailedBackupAlertEngine.checkBackupCadence(tenantId, now - 12 * 60000, now, 15);
  assert.equal(healthy, null);

  // Cadence missed (20 minutes since last snapshot)
  const highAlert = FailedBackupAlertEngine.checkBackupCadence(tenantId, now - 20 * 60000, now, 15);
  assert.ok(highAlert);
  assert.equal(highAlert.severity, 'HIGH');
  assert.equal(highAlert.pagingTriggered, true);
  assert.ok(highAlert.latencySec < 60); // Alert triggered in < 60s

  // Critical overdue (45 minutes)
  const critAlert = FailedBackupAlertEngine.checkBackupCadence(tenantId, now - 45 * 60000, now, 15);
  assert.ok(critAlert);
  assert.equal(critAlert.severity, 'CRITICAL');
});

test('DisasterRecoveryOperatorRunbook: advances cleanly through all 6 disaster recovery phases', () => {
  const runbook = new DisasterRecoveryOperatorRunbook();
  assert.equal(runbook.step, '1_EMERGENCY_DECLARATION');

  runbook.advanceStep('2_KEY_ESCROW_QUORUM_ASSEMBLY');
  assert.equal(runbook.step, '2_KEY_ESCROW_QUORUM_ASSEMBLY');

  runbook.advanceStep('3_VAULT_BUNDLE_RETRIEVAL');
  assert.equal(runbook.step, '3_VAULT_BUNDLE_RETRIEVAL');

  runbook.advanceStep('4_ISOLATED_REHYDRATION');
  assert.equal(runbook.step, '4_ISOLATED_REHYDRATION');

  runbook.advanceStep('5_DATA_INTEGRITY_AUDIT');
  assert.equal(runbook.step, '5_DATA_INTEGRITY_AUDIT');

  runbook.advanceStep('6_DNS_TRAFFIC_SWAP');
  assert.equal(runbook.step, '6_DNS_TRAFFIC_SWAP');
});
