import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SchedulingScaleBenchmark,
  CashFlowEvmEngine,
  SchedulingServiceAdapter,
  CallerContext,
  DateOnly,
} from '../src/index.js';

test('10,000 tasks and 50,000 dependencies scale calculation completes within latency budget (<= 1500 ms)', () => {
  const t0 = performance.now();
  const project = SchedulingScaleBenchmark.generateScaleProject(10000, 50000);
  const genMs = performance.now() - t0;

  assert.equal(project.tasks.length, 10000);
  assert.equal(project.dependencies.length, 50000);

  const tCalc0 = performance.now();
  const calculation = SchedulingScaleBenchmark.executeScaleCalculation(project);
  const calcMs = performance.now() - tCalc0;

  // Latency budget check: must complete in <= 1500 ms
  assert.ok(calcMs <= 1500, `Scale calculation took ${calcMs}ms, exceeding 1500ms budget`);
  assert.equal(calculation.totalTasksCount, 10000);
  assert.ok(calculation.criticalPathTaskIds.length > 0);
  assert.ok(DateOnly.isValid(calculation.projectFinishDate));
});

test('virtualized Gantt viewport slice extractor maintains <= 16.7 ms frame budget on 10,000 tasks', () => {
  const project = SchedulingScaleBenchmark.generateScaleProject(10000, 50000);
  const calculation = SchedulingScaleBenchmark.executeScaleCalculation(project);

  // Extract a 100-row slice over a 90-day viewport window
  const sliceResult = SchedulingScaleBenchmark.extractVirtualizedViewportSlice(calculation, {
    startRow: 100,
    endRow: 200,
    startDate: '2026-10-12',
    endDate: '2027-01-10',
  });

  assert.equal(sliceResult.totalTasks, 10000);
  assert.ok(sliceResult.slicedTasksCount <= 100);
  assert.ok(sliceResult.meets60HzBudget, `Extraction took ${sliceResult.extractionDurationMs}ms, exceeding 16.7ms 60Hz budget`);
  assert.ok(sliceResult.extractionDurationMs <= 16.7);
});

test('Earned Value Management (EVM) metrics and cash-flow S-curves calculate with exact decimal separation', () => {
  const project = {
    projectId: 'proj-evm-01',
    tenantId: 'tenant-infra',
    name: 'Bridge Pier Construction',
    dataDate: '2026-10-12',
    calendars: [
      {
        calendarId: 'cal-default',
        name: 'Default',
        workingDays: [0, 1, 2, 3, 4, 5],
        holidays: [],
      },
    ],
    tasks: [
      {
        taskId: 't-pier-1',
        wbsCode: '1.1',
        name: 'Pier 1 Construction',
        durationDays: 10,
        calendarId: 'cal-default',
        isMilestone: false,
        progressPercent: 50,
      },
      {
        taskId: 't-pier-2',
        wbsCode: '1.2',
        name: 'Pier 2 Construction',
        durationDays: 20,
        calendarId: 'cal-default',
        isMilestone: false,
        progressPercent: 25,
      },
    ],
    dependencies: [],
    rates: [
      {
        rateId: 'r-p1',
        taskId: 't-pier-1',
        resourceType: 'SUBCONTRACTOR' as const,
        unitRate: '1000.00', // RA Cost: 1000/day, BoQ Billing: 1250/day (25% markup)
        currency: 'NPR',
      },
      {
        rateId: 'r-p2',
        taskId: 't-pier-2',
        resourceType: 'SUBCONTRACTOR' as const,
        unitRate: '2000.00', // RA Cost: 2000/day, BoQ Billing: 2500/day
        currency: 'NPR',
      },
    ],
  };

  const calculation = {
    calculationId: 'calc-evm',
    projectId: 'proj-evm-01',
    revisionId: 'rev-01',
    tenantId: 'tenant-infra',
    dataDate: '2026-10-12',
    engineRelease: '0.4.0b1',
    inputSchemaVersion: 1,
    inputDigest: 'sha256:digest',
    calculatedAtUtc: '2026-10-12T00:00:00Z',
    projectFinishDate: '2026-11-05',
    criticalPathTaskIds: ['t-pier-1', 't-pier-2'],
    totalTasksCount: 2,
    taskResults: {
      't-pier-1': {
        taskId: 't-pier-1',
        earlyStart: '2026-10-12',
        earlyFinish: '2026-10-23',
        lateStart: '2026-10-12',
        lateFinish: '2026-10-23',
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
        plannedDurationDays: 10,
      },
      't-pier-2': {
        taskId: 't-pier-2',
        earlyStart: '2026-10-24',
        earlyFinish: '2026-11-15',
        lateStart: '2026-10-24',
        lateFinish: '2026-11-15',
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
        plannedDurationDays: 20,
      },
    },
  };

  // 1. EVM metrics
  const evmSummary = CashFlowEvmEngine.computeProjectEvm(project, calculation);

  // Task 1: Planned Value (BCWS) = 10 * 1250 = 12500.00
  // Earned Value (BCWP) = 50% * 12500 = 6250.00
  // Actual Cost (ACWP) = 50% * (10 * 1000) = 5000.00
  const m1 = evmSummary.taskMetrics.find(m => m.taskId === 't-pier-1');
  assert.ok(m1);
  assert.equal(m1.plannedValue, '12500.00');
  assert.equal(m1.earnedValue, '6250.00');
  assert.equal(m1.actualCost, '5000.00');
  assert.equal(m1.costVariance, '1250.00'); // 6250 - 5000 = +1250 (favorable)
  assert.equal(m1.cpi, 1.25); // 6250 / 5000 = 1.25

  // 2. Monthly S-Curve
  const sCurve = CashFlowEvmEngine.generateCashFlowSCurve(project, calculation);
  assert.ok(sCurve.monthlyPoints.length > 0);
  assert.equal(sCurve.currency, 'NPR');
  assert.ok(parseFloat(sCurve.totalPlannedBilling) > parseFloat(sCurve.totalPlannedCost));
});

test('high-concurrency idempotent stress test guarantees zero double-counting', async () => {
  const project = {
    projectId: 'proj-stress-01',
    tenantId: 'tenant-stress',
    name: 'Stress Test Network',
    dataDate: '2026-10-12',
    calendars: [
      {
        calendarId: 'cal-default',
        name: 'Default',
        workingDays: [0, 1, 2, 3, 4, 5],
        holidays: [],
      },
    ],
    tasks: [
      {
        taskId: 'task-stress-pier',
        wbsCode: '1.1',
        name: 'Pier Foundation',
        durationDays: 10,
        calendarId: 'cal-default',
        isMilestone: false,
        progressPercent: 0,
      },
    ],
    dependencies: [],
  };

  const caller: CallerContext = {
    userId: 'user-field-eng-1',
    tenantId: 'tenant-stress',
    projectId: 'proj-stress-01',
    roles: ['field_engineer'],
    permissions: ['daily_log.progress'],
  };

  const adapter = new SchedulingServiceAdapter(project);

  const stressResult = await SchedulingScaleBenchmark.executeConcurrencyStressTest(
    adapter,
    caller,
    'task-stress-pier',
    50 // 50 concurrent requests
  );

  assert.equal(stressResult.totalRequests, 50);
  assert.equal(stressResult.successfulReceipts, 1); // Exactly 1 initial write
  assert.equal(stressResult.replayedReceipts, 49);   // Exactly 49 idempotent replays
  assert.equal(stressResult.doubleCountingOccurred, false);
  assert.equal(stressResult.finalTaskProgressPercent, 65);
});
