import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CutoverGateway,
  SupersededClientError,
  ClientUpgradeRequiredError,
  ConcurrentMutationConflictError,
  EntityWriteLockManager,
  LockAcquisitionTimeoutError,
} from '../src/index.js';

test('CutoverGateway: routes mutations exclusively to the single active writer and increments sequence', async () => {
  const gateway = new CutoverGateway();

  gateway.registerRoute({
    routePath: '/procurement/requisitions',
    activeTarget: 'FLUTTER_NATIVE',
    minProtocolVersion: 2,
    supportedEntities: ['MaterialRequisition'],
    lastCutoverTimestamp: new Date().toISOString(),
  });

  gateway.setEntitySequence('req-101', 5);

  let nativeHandlerCalled = false;
  gateway.registerHandler('FLUTTER_NATIVE', async (ctx) => {
    nativeHandlerCalled = true;
    return {
      success: true,
      entityId: ctx.entityId,
      newRevisionId: 'rev-6',
      newServerSeq: 6,
      handledBy: 'FLUTTER_NATIVE',
      data: { status: 'APPROVED' },
    };
  });

  const result = await gateway.dispatchWrite({
    routePath: '/procurement/requisitions',
    entityType: 'MaterialRequisition',
    entityId: 'req-101',
    clientPlatform: 'flutter_native',
    clientVersion: '2.5.0',
    clientProtocolVersion: 2,
    lastServerSeq: 5,
    payload: { action: 'APPROVE' },
  });

  assert.equal(nativeHandlerCalled, true);
  assert.equal(result.success, true);
  assert.equal(result.handledBy, 'FLUTTER_NATIVE');
  assert.equal(result.newServerSeq, 6);
  assert.equal(gateway.getEntitySequence('req-101'), 6);
});

test('CutoverGateway: rejects writes from superseded clients fail-closed with structured upgrade prompt', async () => {
  const gateway = new CutoverGateway();

  gateway.registerRoute({
    routePath: '/billing/ipc',
    activeTarget: 'FLUTTER_NATIVE',
    minProtocolVersion: 2,
    supportedEntities: ['InterimPaymentCertificate'],
    lastCutoverTimestamp: new Date().toISOString(),
  });

  gateway.setEntitySequence('ipc-501', 10);
  gateway.registerHandler('FLUTTER_NATIVE', () => ({
    success: true,
    entityId: 'ipc-501',
    newRevisionId: 'rev-11',
    newServerSeq: 11,
    handledBy: 'FLUTTER_NATIVE',
  }));

  // Old Next.js client attempts to write to cut-over route
  await assert.rejects(
    async () => {
      await gateway.dispatchWrite({
        routePath: '/billing/ipc',
        entityType: 'InterimPaymentCertificate',
        entityId: 'ipc-501',
        clientPlatform: 'nextjs_web',
        clientVersion: '1.2.0',
        clientProtocolVersion: 2,
        lastServerSeq: 10,
        payload: { amount: 100000 },
      });
    },
    (err: any) => {
      assert.ok(err instanceof SupersededClientError);
      assert.equal(err.code, 'SUPERSEDED_CLIENT_WRITE');
      assert.equal(err.routePath, '/billing/ipc');
      assert.equal(err.targetPlatform, 'FLUTTER_NATIVE');
      assert.equal(err.upgradePrompt.requiredAction, 'REFRESH_OR_UPGRADE_CLIENT');
      return true;
    }
  );
});

test('CutoverGateway: rejects obsolete client protocol version without silent downgrading', async () => {
  const gateway = new CutoverGateway();

  gateway.registerRoute({
    routePath: '/workforce/attendance',
    activeTarget: 'FLUTTER_NATIVE',
    minProtocolVersion: 3,
    supportedEntities: ['DailyWorkforce'],
    lastCutoverTimestamp: new Date().toISOString(),
  });

  gateway.setEntitySequence('wf-01', 1);
  gateway.registerHandler('FLUTTER_NATIVE', () => ({
    success: true,
    entityId: 'wf-01',
    newRevisionId: 'rev-2',
    newServerSeq: 2,
    handledBy: 'FLUTTER_NATIVE',
  }));

  await assert.rejects(
    async () => {
      await gateway.dispatchWrite({
        routePath: '/workforce/attendance',
        entityType: 'DailyWorkforce',
        entityId: 'wf-01',
        clientPlatform: 'flutter_web',
        clientVersion: '2.0.0',
        clientProtocolVersion: 2, // Outdated! Required is 3
        lastServerSeq: 1,
        payload: { count: 42 },
      });
    },
    (err: any) => {
      assert.ok(err instanceof ClientUpgradeRequiredError);
      assert.equal(err.code, 'CLIENT_UPGRADE_REQUIRED');
      assert.equal(err.currentProtocol, 2);
      assert.equal(err.requiredProtocol, 3);
      return true;
    }
  );
});

test('CutoverGateway: rejects stale optimistic concurrency sequences fail-closed', async () => {
  const gateway = new CutoverGateway();

  gateway.registerRoute({
    routePath: '/inventory/grn',
    activeTarget: 'FLUTTER_NATIVE',
    minProtocolVersion: 1,
    supportedEntities: ['GoodsReceiptNote'],
    lastCutoverTimestamp: new Date().toISOString(),
  });

  gateway.setEntitySequence('grn-88', 15);
  gateway.registerHandler('FLUTTER_NATIVE', () => ({
    success: true,
    entityId: 'grn-88',
    newRevisionId: 'rev-16',
    newServerSeq: 16,
    handledBy: 'FLUTTER_NATIVE',
  }));

  // Client provides stale seq = 14 (server is already at 15)
  await assert.rejects(
    async () => {
      await gateway.dispatchWrite({
        routePath: '/inventory/grn',
        entityType: 'GoodsReceiptNote',
        entityId: 'grn-88',
        clientPlatform: 'flutter_native',
        clientVersion: '2.4.0',
        clientProtocolVersion: 1,
        lastServerSeq: 14,
        payload: { qty: 50 },
      });
    },
    (err: any) => {
      assert.ok(err instanceof ConcurrentMutationConflictError);
      assert.equal(err.code, 'CONCURRENT_MUTATION_CONFLICT');
      assert.equal(err.entityId, 'grn-88');
      assert.equal(err.currentSeq, 15);
      assert.equal(err.providedSeq, 14);
      return true;
    }
  );
});

test('CutoverGateway: emergency rollback restores legacy target instantly and allows fallback writes', async () => {
  const gateway = new CutoverGateway();

  gateway.registerRoute({
    routePath: '/jv/distributions',
    activeTarget: 'NEXTJS_LEGACY',
    minProtocolVersion: 1,
    supportedEntities: ['JvDistribution'],
    lastCutoverTimestamp: new Date().toISOString(),
  });

  gateway.registerHandler('NEXTJS_LEGACY', () => ({
    success: true,
    entityId: 'jv-1',
    newRevisionId: 'rev-leg',
    newServerSeq: 2,
    handledBy: 'NEXTJS_LEGACY',
  }));

  gateway.registerHandler('FLUTTER_NATIVE', () => ({
    success: true,
    entityId: 'jv-1',
    newRevisionId: 'rev-nat',
    newServerSeq: 2,
    handledBy: 'FLUTTER_NATIVE',
  }));

  gateway.setEntitySequence('jv-1', 1);

  // 1. Cut over to FLUTTER_NATIVE
  gateway.cutoverRoute('/jv/distributions', 'FLUTTER_NATIVE');
  assert.equal(gateway.getRouteConfig('/jv/distributions')?.activeTarget, 'FLUTTER_NATIVE');

  // 2. Perform emergency rollback
  const restored = gateway.rollbackRoute('/jv/distributions');
  assert.equal(restored, 'NEXTJS_LEGACY');
  assert.equal(gateway.getRouteConfig('/jv/distributions')?.activeTarget, 'NEXTJS_LEGACY');

  // 3. Verify nextjs_web write is accepted again
  const result = await gateway.dispatchWrite({
    routePath: '/jv/distributions',
    entityType: 'JvDistribution',
    entityId: 'jv-1',
    clientPlatform: 'nextjs_web',
    clientVersion: '1.0.0',
    clientProtocolVersion: 1,
    lastServerSeq: 1,
    payload: { amount: 500 },
  });

  assert.equal(result.success, true);
  assert.equal(result.handledBy, 'NEXTJS_LEGACY');
});

test('EntityWriteLockManager: prevents concurrent overlapping mutations to the same entity', async () => {
  const lockManager = new EntityWriteLockManager(1000);

  const lease1 = lockManager.acquireLock('entity-404');
  assert.equal(lockManager.isLocked('entity-404'), true);

  // Competing write attempts to acquire lock while held
  assert.throws(
    () => {
      lockManager.acquireLock('entity-404');
    },
    (err: any) => {
      assert.ok(err instanceof LockAcquisitionTimeoutError);
      assert.equal(err.code, 'LOCK_ACQUISITION_TIMEOUT');
      assert.equal(err.entityId, 'entity-404');
      return true;
    }
  );

  // Release lock
  const released = lockManager.releaseLock(lease1);
  assert.equal(released, true);
  assert.equal(lockManager.isLocked('entity-404'), false);

  // Subsequent acquire succeeds
  const lease2 = lockManager.acquireLock('entity-404');
  assert.equal(lockManager.isLocked('entity-404'), true);
  lockManager.releaseLock(lease2);
});
