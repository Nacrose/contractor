/**
 * Scheduling Service Adapter, Security & Financial Guard Tests (M09-T03).
 *
 * Verifies:
 *  1. Identity, tenant, project, role, and fiscal lock authorization guards.
 *  2. Idempotent daily progress posting (replayed postings never double-count).
 *  3. Strict financial separation: contractual BoQ billing rate vs internal RA cost rate.
 *  4. Exact-decimal serialization without floating-point accumulation.
 *  5. Server schedule recalculation mediation and change-feed event emission.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TenantScheduleProject,
  CallerContext,
  SchedulingServiceAdapter,
  SchedulingSecurityError,
  TruePpmOutputPayload,
  SchedulingSyncFeedAdapter
} from '../src/index.js';

function createMockProject(): TenantScheduleProject {
  return {
    projectId: 'proj-pokhara-bridge',
    tenantId: 'tenant-annapurna-infra',
    name: 'Pokhara River Bridge Substructure',
    dataDate: '2026-10-12',
    calendars: [
      {
        calendarId: 'cal-default',
        name: 'Standard 6-Day Workweek',
        workingDays: [0, 1, 2, 3, 4, 5],
        holidays: []
      }
    ],
    tasks: [
      {
        taskId: 'task-pier-excavation',
        wbsCode: '2.1',
        name: 'Pier Foundation Excavation',
        durationDays: 10,
        calendarId: 'cal-default',
        isMilestone: false,
        progressPercent: 0
      },
      {
        taskId: 'task-pier-concreting',
        wbsCode: '2.2',
        name: 'Pier Stem Concreting',
        durationDays: 15,
        calendarId: 'cal-default',
        isMilestone: false,
        progressPercent: 0
      }
    ],
    dependencies: [
      {
        dependencyId: 'dep-01',
        predTaskId: 'task-pier-excavation',
        succTaskId: 'task-pier-concreting',
        type: 'FS',
        lagDays: 0
      }
    ]
  };
}

const validCaller: CallerContext = {
  userId: 'user-pm-shrestha',
  tenantId: 'tenant-annapurna-infra',
  projectId: 'proj-pokhara-bridge',
  roles: ['project_manager'],
  permissions: ['schedule.update', 'daily_log.progress']
};

test('authorization guards reject unauthenticated, tenant-mismatched, and unprivileged callers', async () => {
  const project = createMockProject();
  const service = new SchedulingServiceAdapter(project);

  // 1. Anonymous caller fails identity guard
  const anonCaller: CallerContext = {
    ...validCaller,
    userId: ''
  };
  await assert.rejects(
    async () => service.postDailyProgress(anonCaller, {
      taskId: 'task-pier-excavation',
      progressDate: '2026-10-15',
      progressPercent: 25,
      idempotencyKey: 'key-anon',
      source: 'daily_log'
    }),
    (err: unknown) => {
      assert.ok(err instanceof SchedulingSecurityError);
      assert.equal(err.code, 'PERMISSION_DENIED');
      assert.match(err.message, /identity guard failed/);
      return true;
    }
  );

  // 2. Tenant mismatch fails tenant guard
  const intruderCaller: CallerContext = {
    ...validCaller,
    tenantId: 'tenant-malicious-corp'
  };
  await assert.rejects(
    async () => service.postDailyProgress(intruderCaller, {
      taskId: 'task-pier-excavation',
      progressDate: '2026-10-15',
      progressPercent: 25,
      idempotencyKey: 'key-intruder',
      source: 'daily_log'
    }),
    (err: unknown) => {
      assert.ok(err instanceof SchedulingSecurityError);
      assert.equal(err.code, 'TENANT_MISMATCH');
      return true;
    }
  );

  // 3. Project mismatch fails project guard
  const foreignProjectCaller: CallerContext = {
    ...validCaller,
    projectId: 'proj-other-site'
  };
  await assert.rejects(
    async () => service.postDailyProgress(foreignProjectCaller, {
      taskId: 'task-pier-excavation',
      progressDate: '2026-10-15',
      progressPercent: 25,
      idempotencyKey: 'key-proj',
      source: 'daily_log'
    }),
    (err: unknown) => {
      assert.ok(err instanceof SchedulingSecurityError);
      assert.equal(err.code, 'PROJECT_MISMATCH');
      return true;
    }
  );

  // 4. Missing required permissions
  const readOnlyCaller: CallerContext = {
    ...validCaller,
    roles: ['viewer'],
    permissions: ['schedule.read']
  };
  await assert.rejects(
    async () => service.postDailyProgress(readOnlyCaller, {
      taskId: 'task-pier-excavation',
      progressDate: '2026-10-15',
      progressPercent: 25,
      idempotencyKey: 'key-ro',
      source: 'daily_log'
    }),
    (err: unknown) => {
      assert.ok(err instanceof SchedulingSecurityError);
      assert.equal(err.code, 'PERMISSION_DENIED');
      assert.match(err.message, /lacks required permission/);
      return true;
    }
  );
});

test('fiscal year lock blocks project schedule recalculation and baseline modifications', async () => {
  const project = createMockProject();
  const service = new SchedulingServiceAdapter(project);

  const lockedCaller: CallerContext = {
    ...validCaller,
    isFiscalLocked: true
  };

  await assert.rejects(
    async () => service.recalculateProjectSchedule(lockedCaller, 'REV-002', async () => ({} as any)),
    (err: unknown) => {
      assert.ok(err instanceof SchedulingSecurityError);
      assert.equal(err.code, 'FISCAL_LOCK_ENGAGED');
      assert.match(err.message, /fiscal year lock/);
      return true;
    }
  );
});

test('daily progress posting is strictly idempotent and prevents double counting', async () => {
  const project = createMockProject();
  const service = new SchedulingServiceAdapter(project);

  const request = {
    taskId: 'task-pier-excavation',
    progressDate: '2026-10-15',
    progressPercent: 40,
    actualStartDate: '2026-10-12',
    idempotencyKey: 'daily-log-2026-10-15-pier-exc',
    source: 'daily_log' as const
  };

  // 1. Initial post succeeds
  const receipt1 = await service.postDailyProgress(validCaller, request);
  assert.equal(receipt1.isIdempotentReplay, false);
  assert.equal(receipt1.postedProgressPercent, 40);
  assert.equal(receipt1.actualStartDate, '2026-10-12');

  const taskAfterPost = service.getProject().tasks.find(t => t.taskId === 'task-pier-excavation');
  assert.equal(taskAfterPost?.progressPercent, 40);

  // 2. Replayed post with identical idempotencyKey returns cached receipt without altering state
  const receipt2 = await service.postDailyProgress(validCaller, request);
  assert.equal(receipt2.isIdempotentReplay, true);
  assert.equal(receipt2.receiptId, receipt1.receiptId);
  assert.equal(receipt2.postedProgressPercent, 40);

  // Task percent remains strictly 40% (never accumulates or double-posts)
  const taskAfterReplay = service.getProject().tasks.find(t => t.taskId === 'task-pier-excavation');
  assert.equal(taskAfterReplay?.progressPercent, 40);
});

test('strict financial separation calculates contractual BoQ billing vs internal RA cost', () => {
  const project = createMockProject();
  const service = new SchedulingServiceAdapter(project);

  // Excavation planned quantity: 500 m3
  // Contractual BoQ client billing rate: 125.50 NPR/m3
  // Internal Running Account (RA) cost rate: 78.20 NPR/m3
  service.setFinancialAllocation({
    taskId: 'task-pier-excavation',
    plannedQuantity: 500,
    contractualBoqRate: '125.50',
    runningAccountCostRate: '78.20',
    currency: 'NPR'
  });

  // Evaluate at 0% progress
  const eval0 = service.evaluateTaskFinancials(validCaller, 'task-pier-excavation');
  assert.equal(eval0.plannedValueBoq, '62750.00'); // 500 * 125.50
  assert.equal(eval0.plannedCostRA, '39100.00');   // 500 * 78.20
  assert.equal(eval0.earnedValueBoq, '0.00');
  assert.equal(eval0.actualCostRA, '0.00');

  // Update progress to 60%
  const updatedTasks = project.tasks.map(t =>
    t.taskId === 'task-pier-excavation' ? { ...t, progressPercent: 60 } : t
  );
  const updatedService = new SchedulingServiceAdapter({ ...project, tasks: updatedTasks });
  updatedService.setFinancialAllocation({
    taskId: 'task-pier-excavation',
    plannedQuantity: 500,
    contractualBoqRate: '125.50',
    runningAccountCostRate: '78.20',
    currency: 'NPR'
  });

  const eval60 = updatedService.evaluateTaskFinancials(validCaller, 'task-pier-excavation');
  // 60% of Planned Value = 62750 * 0.6 = 37650.00
  assert.equal(eval60.earnedValueBoq, '37650.00');
  // 60% of Planned Cost = 39100 * 0.6 = 23460.00
  assert.equal(eval60.actualCostRA, '23460.00');
  // Cost Variance = 37650 - 23460 = 14190.00
  assert.equal(eval60.costVariance, '14190.00');
});

test('server recalculation executes through TruePPM bridge and emits change-feed event', async () => {
  const project = createMockProject();
  const syncFeed = new SchedulingSyncFeedAdapter();

  let capturedEvent: any = null;
  syncFeed.subscribe(evt => capturedEvent = evt);

  const service = new SchedulingServiceAdapter(project, syncFeed);

  const mockEngineResult: TruePpmOutputPayload = {
    status: 'success',
    data_date: '2026-10-12',
    project_finish: '2026-11-06',
    critical_path: ['task-pier-excavation', 'task-pier-concreting'],
    total_tasks: 2,
    tasks: {
      'task-pier-excavation': {
        early_start: '2026-10-12',
        early_finish: '2026-10-23',
        late_start: '2026-10-12',
        late_finish: '2026-10-23',
        total_float: 0,
        free_float: 0,
        is_critical: true,
        duration: 10
      },
      'task-pier-concreting': {
        early_start: '2026-10-23',
        early_finish: '2026-11-06',
        late_start: '2026-10-23',
        late_finish: '2026-11-06',
        total_float: 0,
        free_float: 0,
        is_critical: true,
        duration: 15
      }
    }
  };

  const record = await service.recalculateProjectSchedule(
    validCaller,
    'REV-001',
    async () => mockEngineResult
  );

  assert.equal(record.projectId, 'proj-pokhara-bridge');
  assert.equal(record.projectFinishDate, '2026-11-06');
  assert.equal(record.engineRelease, '0.4.0b1');
  assert.equal(capturedEvent?.type, 'schedule.calculated');
  assert.equal(capturedEvent?.projectId, 'proj-pokhara-bridge');
  assert.equal(capturedEvent?.criticalPathLength, 2);
});
