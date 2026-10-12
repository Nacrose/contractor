import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BaselineSnapshotEngine,
  ScheduleVarianceAnalyzer,
  ScheduleRevisionExplainer,
  BaselineImmutableError,
} from '../src/baseline_and_variance.js';
import { TenantScheduleProject } from '../src/models.js';
import { TenantScheduleCalculationRecord } from '../src/calculation_record.js';

function createFixtureProject(): TenantScheduleProject {
  return {
    projectId: 'proj-kathmandu-tower',
    tenantId: 'tenant-himalaya',
    name: 'Kathmandu Commercial Complex',
    dataDate: '2026-11-01',
    calendars: [
      {
        calendarId: 'cal-nepal-6day',
        name: 'Nepal Standard 6-Day Calendar',
        workingDays: [0, 1, 2, 3, 4, 5],
        holidays: [],
      },
    ],
    tasks: [
      {
        taskId: 'task-site-prep',
        wbsCode: '1.1',
        name: 'Site Clearing',
        durationDays: 10,
        calendarId: 'cal-nepal-6day',
        isMilestone: false,
        progressPercent: 100,
        actualStartDate: '2026-11-01',
        actualFinishDate: '2026-11-12',
      },
      {
        taskId: 'task-substructure',
        wbsCode: '1.2',
        name: 'Raft Foundation',
        durationDays: 20,
        calendarId: 'cal-nepal-6day',
        isMilestone: false,
        progressPercent: 50,
      },
      {
        taskId: 'task-superstructure',
        wbsCode: '1.3',
        name: 'RCC Superstructure',
        durationDays: 30,
        calendarId: 'cal-nepal-6day',
        isMilestone: false,
        progressPercent: 0,
      },
    ],
    dependencies: [
      {
        dependencyId: 'dep-1-2',
        predTaskId: 'task-site-prep',
        succTaskId: 'task-substructure',
        type: 'FS',
        lagDays: 0,
      },
      {
        dependencyId: 'dep-2-3',
        predTaskId: 'task-substructure',
        succTaskId: 'task-superstructure',
        type: 'FS',
        lagDays: 0,
      },
    ],
  };
}

function createBaselineCalculation(): TenantScheduleCalculationRecord {
  return {
    calculationId: 'calc-base-001',
    projectId: 'proj-kathmandu-tower',
    revisionId: 'rev-001',
    tenantId: 'tenant-himalaya',
    dataDate: '2026-11-01',
    engineRelease: '0.4.0b1',
    inputSchemaVersion: 1,
    inputDigest: 'sha256:baseline-mock',
    calculatedAtUtc: '2026-11-01T00:00:00Z',
    projectFinishDate: '2027-01-10',
    criticalPathTaskIds: ['task-site-prep', 'task-substructure', 'task-superstructure'],
    totalTasksCount: 3,
    taskResults: {
      'task-site-prep': {
        taskId: 'task-site-prep',
        earlyStart: '2026-11-01',
        earlyFinish: '2026-11-12',
        lateStart: '2026-11-01',
        lateFinish: '2026-11-12',
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
        plannedDurationDays: 10,
      },
      'task-substructure': {
        taskId: 'task-substructure',
        earlyStart: '2026-11-13',
        earlyFinish: '2026-12-06',
        lateStart: '2026-11-13',
        lateFinish: '2026-12-06',
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
        plannedDurationDays: 20,
      },
      'task-superstructure': {
        taskId: 'task-superstructure',
        earlyStart: '2026-12-07',
        earlyFinish: '2027-01-10',
        lateStart: '2026-12-07',
        lateFinish: '2027-01-10',
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
        plannedDurationDays: 30,
      },
    },
  };
}

test('approved schedule baselines are strictly immutable (fail-closed protection)', () => {
  const engine = new BaselineSnapshotEngine();
  const project = createFixtureProject();
  const calc = createBaselineCalculation();

  // 1. Create draft baseline
  const draft = engine.createBaseline({
    baselineId: 'base-target-01',
    name: 'Contractual Target Baseline',
    description: 'Initial tender baseline approved by client',
    project,
    calculationRecord: calc,
    approveImmediately: false,
  });

  assert.equal(draft.isApproved, false);
  assert.equal(draft.name, 'Contractual Target Baseline');

  // Can modify draft
  const modifiedDraft = engine.modifyDraftBaseline('base-target-01', {
    description: 'Updated draft notes',
  });
  assert.equal(modifiedDraft.description, 'Updated draft notes');

  // 2. Approve baseline (freezes permanently)
  const approved = engine.approveBaseline('base-target-01', 'user-lead-pm');
  assert.equal(approved.isApproved, true);
  assert.equal(approved.approvedByUserId, 'user-lead-pm');
  assert.ok(approved.approvedAtUtc);

  // 3. Attempting to modify approved baseline throws BaselineImmutableError
  assert.throws(
    () => engine.modifyDraftBaseline('base-target-01', { name: 'Illegal Renaming' }),
    (err: any) => {
      assert.ok(err instanceof BaselineImmutableError);
      assert.equal(err.baselineId, 'base-target-01');
      assert.match(err.message, /Cannot modify baseline/);
      return true;
    }
  );

  // 4. Attempting to overwrite approved baseline throws BaselineImmutableError
  assert.throws(
    () =>
      engine.createBaseline({
        baselineId: 'base-target-01',
        name: 'Overwritten Baseline',
        project,
        calculationRecord: calc,
      }),
    (err: any) => {
      assert.ok(err instanceof BaselineImmutableError);
      assert.match(err.message, /Cannot overwrite baseline/);
      return true;
    }
  );

  // 5. Attempting to delete approved baseline throws BaselineImmutableError
  assert.throws(
    () => engine.deleteBaseline('base-target-01'),
    (err: any) => {
      assert.ok(err instanceof BaselineImmutableError);
      assert.match(err.message, /Cannot delete baseline/);
      return true;
    }
  );

  // Verify baseline remains completely intact
  const persisted = engine.getBaseline('base-target-01');
  assert.ok(persisted);
  assert.equal(persisted.isApproved, true);
  assert.equal(persisted.name, 'Contractual Target Baseline');
});

test('schedule revision variance engine computes exact slippage and acceleration deltas', () => {
  const engine = new BaselineSnapshotEngine();
  const project = createFixtureProject();
  const baselineCalc = createBaselineCalculation();

  const baseline = engine.createBaseline({
    baselineId: 'base-target-01',
    name: 'Tender Target Baseline',
    project,
    calculationRecord: baselineCalc,
    approveImmediately: true,
  });

  // Current calculation with 5-day slippage on substructure, pushing superstructure by 5 days
  const currentCalc: TenantScheduleCalculationRecord = {
    ...baselineCalc,
    revisionId: 'rev-002',
    projectFinishDate: '2027-01-15',
    taskResults: {
      'task-site-prep': {
        ...baselineCalc.taskResults['task-site-prep'],
      },
      'task-substructure': {
        ...baselineCalc.taskResults['task-substructure'],
        earlyFinish: '2026-12-11', // +5 days delay
        totalFloat: 0,
      },
      'task-superstructure': {
        ...baselineCalc.taskResults['task-superstructure'],
        earlyStart: '2026-12-12', // +5 days start delay
        earlyFinish: '2027-01-15', // +5 days finish delay
        totalFloat: 0,
      },
    },
  };

  const varianceReport = ScheduleVarianceAnalyzer.computeVariance(baseline, currentCalc, project);

  assert.equal(varianceReport.baselineId, 'base-target-01');
  assert.equal(varianceReport.comparisonRevisionId, 'rev-002');
  assert.equal(varianceReport.projectFinishVarianceDays, 5); // 5 days overall project slippage
  assert.equal(varianceReport.delayedActivitiesCount, 2);
  assert.equal(varianceReport.onTrackActivitiesCount, 1);
  assert.equal(varianceReport.aheadActivitiesCount, 0);

  // Activity-level checks
  const sitePrepVar = varianceReport.activityVariances['task-site-prep'];
  assert.equal(sitePrepVar.status, 'on_track');
  assert.equal(sitePrepVar.startVarianceDays, 0);
  assert.equal(sitePrepVar.finishVarianceDays, 0);

  const subVar = varianceReport.activityVariances['task-substructure'];
  assert.equal(subVar.status, 'delayed');
  assert.equal(subVar.startVarianceDays, 0);
  assert.equal(subVar.finishVarianceDays, 5);

  const superVar = varianceReport.activityVariances['task-superstructure'];
  assert.equal(superVar.status, 'delayed');
  assert.equal(superVar.startVarianceDays, 5);
  assert.equal(superVar.finishVarianceDays, 5);
});

test('structured revision explanation model categorizes root cause and critical path shifts', () => {
  const fromProject = createFixtureProject();
  const fromCalc = createBaselineCalculation();

  // 1. Revision where superstructure duration is extended from 30 to 45 days
  const toProjectDuration: TenantScheduleProject = {
    ...fromProject,
    tasks: fromProject.tasks.map(t =>
      t.taskId === 'task-superstructure' ? { ...t, durationDays: 45 } : t
    ),
  };

  const toCalcDuration: TenantScheduleCalculationRecord = {
    ...fromCalc,
    revisionId: 'rev-002',
    projectFinishDate: '2027-01-25',
    taskResults: {
      ...fromCalc.taskResults,
      'task-superstructure': {
        ...fromCalc.taskResults['task-superstructure'],
        earlyFinish: '2027-01-25',
        plannedDurationDays: 45,
      },
    },
  };

  const explanation1 = ScheduleRevisionExplainer.explainRevision(
    fromProject,
    fromCalc,
    toProjectDuration,
    toCalcDuration
  );

  assert.equal(explanation1.fromRevisionId, 'rev-001');
  assert.equal(explanation1.toRevisionId, 'rev-002');
  assert.equal(explanation1.overallFinishShiftDays, 15);
  assert.equal(explanation1.primaryCause, 'DURATION_MODIFICATION');
  assert.equal(explanation1.itemizedShifts.length, 1);
  assert.equal(explanation1.itemizedShifts[0].taskId, 'task-superstructure');
  assert.equal(explanation1.itemizedShifts[0].causeCategory, 'DURATION_MODIFICATION');
  assert.match(explanation1.itemizedShifts[0].description, /duration modified: 30 days -> 45 days/);

  // 2. Revision where daily site progress actuals are posted
  const toProjectProgress: TenantScheduleProject = {
    ...fromProject,
    tasks: fromProject.tasks.map(t =>
      t.taskId === 'task-substructure'
        ? { ...t, progressPercent: 75, actualStartDate: '2026-11-18' }
        : t
    ),
  };

  const toCalcProgress: TenantScheduleCalculationRecord = {
    ...fromCalc,
    revisionId: 'rev-003',
    projectFinishDate: '2027-01-14',
    taskResults: {
      ...fromCalc.taskResults,
      'task-substructure': {
        ...fromCalc.taskResults['task-substructure'],
        earlyStart: '2026-11-18',
        earlyFinish: '2026-12-10',
      },
      'task-superstructure': {
        ...fromCalc.taskResults['task-superstructure'],
        earlyStart: '2026-12-11',
        earlyFinish: '2027-01-14',
      },
    },
  };

  const explanation2 = ScheduleRevisionExplainer.explainRevision(
    fromProject,
    fromCalc,
    toProjectProgress,
    toCalcProgress
  );

  assert.equal(explanation2.primaryCause, 'PROGRESS_ACTUALS');
  assert.equal(explanation2.itemizedShifts.length, 2);
  const subShift = explanation2.itemizedShifts.find(s => s.taskId === 'task-substructure');
  assert.ok(subShift);
  assert.equal(subShift.causeCategory, 'PROGRESS_ACTUALS');
  assert.match(subShift.description, /Site progress updated/);
});

test('historical baseline comparisons remain deterministic and queryable across multiple revisions', () => {
  const engine = new BaselineSnapshotEngine();
  const project = createFixtureProject();
  const baselineCalc = createBaselineCalculation();

  const baseline = engine.createBaseline({
    baselineId: 'base-tender-v1',
    name: 'Tender Baseline v1',
    project,
    calculationRecord: baselineCalc,
    approveImmediately: true,
  });

  // Revision 2
  const calcRev2: TenantScheduleCalculationRecord = {
    ...baselineCalc,
    revisionId: 'rev-002',
    projectFinishDate: '2027-01-12',
    taskResults: {
      ...baselineCalc.taskResults,
      'task-superstructure': {
        ...baselineCalc.taskResults['task-superstructure'],
        earlyFinish: '2027-01-12',
      },
    },
  };

  // Revision 3
  const calcRev3: TenantScheduleCalculationRecord = {
    ...baselineCalc,
    revisionId: 'rev-003',
    projectFinishDate: '2027-01-08',
    taskResults: {
      ...baselineCalc.taskResults,
      'task-superstructure': {
        ...baselineCalc.taskResults['task-superstructure'],
        earlyFinish: '2027-01-08',
      },
    },
  };

  const reportRev2 = ScheduleVarianceAnalyzer.computeVariance(baseline, calcRev2, project);
  assert.equal(reportRev2.projectFinishVarianceDays, 2); // 2 days slippage

  const reportRev3 = ScheduleVarianceAnalyzer.computeVariance(baseline, calcRev3, project);
  assert.equal(reportRev3.projectFinishVarianceDays, -2); // 2 days accelerated!
  assert.equal(reportRev3.aheadActivitiesCount, 1);
});
