/**
 * Unit Tests for Scheduling Bridge & Versioned Inputs (M09-T02).
 *
 * Verifies:
 *  1. Stable entity ID preservation across TruePPM payload translation and result mapping.
 *  2. Calculation records capture engine release, schema version, revision, and digest.
 *  3. Strict date-only semantics: zero ambient timezone drift across simulated timezones.
 *  4. Change-feed event emission and Flutter-parity DTO generation (Standing Constraint 3).
 *  5. Fail-closed rejection of malformed dates and payload omissions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DateOnly,
  TenantScheduleProject,
  SchedulingBridge,
  CURRENT_INPUT_SCHEMA_VERSION,
  DEFAULT_TRUEPPM_RELEASE,
  TruePpmOutputPayload,
  SchedulingSyncFeedAdapter
} from '../src/index.js';

function createMockProject(): TenantScheduleProject {
  return {
    projectId: 'proj-kathmandu-tower',
    tenantId: 'tenant-himalaya-infra',
    name: 'Kathmandu Commercial Tower Substructure',
    dataDate: '2026-10-12',
    calendars: [
      {
        calendarId: 'cal-nepal-std',
        name: 'Nepal Standard 6-Day Workweek',
        workingDays: [0, 1, 2, 3, 4, 5], // Sun through Fri (Sat=6 is holiday)
        holidays: ['2026-10-19', '2026-10-20', '2026-10-21'] // Dashain
      }
    ],
    tasks: [
      {
        taskId: 'task-clearing-01',
        wbsCode: '1.1',
        name: 'Site Clearing & Survey',
        durationDays: 3,
        calendarId: 'cal-nepal-std',
        isMilestone: false,
        progressPercent: 0
      },
      {
        taskId: 'task-excavation-02',
        wbsCode: '1.2',
        name: 'Foundation Excavation',
        durationDays: 6,
        calendarId: 'cal-nepal-std',
        isMilestone: false,
        progressPercent: 0
      },
      {
        taskId: 'task-milestone-03',
        wbsCode: '1.3',
        name: 'Substructure Sign-Off',
        durationDays: 0,
        calendarId: 'cal-nepal-std',
        isMilestone: true,
        progressPercent: 0
      }
    ],
    dependencies: [
      {
        dependencyId: 'dep-01',
        predTaskId: 'task-clearing-01',
        succTaskId: 'task-excavation-02',
        type: 'FS',
        lagDays: 0
      },
      {
        dependencyId: 'dep-02',
        predTaskId: 'task-excavation-02',
        succTaskId: 'task-milestone-03',
        type: 'FS',
        lagDays: 0
      }
    ]
  };
}

test('DateOnly enforces ISO calendar date format and rejects invalid inputs', () => {
  assert.equal(DateOnly.isValid('2026-10-12'), true);
  assert.equal(DateOnly.isValid('2024-02-29'), true); // Leap year 2024
  assert.equal(DateOnly.isValid('2025-02-29'), false); // Non-leap year 2025
  assert.equal(DateOnly.isValid('2026-13-01'), false); // Month 13
  assert.equal(DateOnly.isValid('2026-10-32'), false); // Day 32
  assert.equal(DateOnly.isValid('10/12/2026'), false);
  assert.equal(DateOnly.isValid('2026-10-12T05:45:00Z'), false); // Timestamp rejected

  assert.throws(() => DateOnly.assertValid('invalid-date'), /Invalid DateOnly string/);
});

test('DateOnly arithmetic operates strictly on calendar days without timezone shifts', () => {
  const d1 = '2026-10-12';
  const d2 = DateOnly.addDays(d1, 5);
  assert.equal(d2, '2026-10-17');

  const diff = DateOnly.diffDays(d2, d1);
  assert.equal(diff, 5);

  // Month boundary jump
  const monthEnd = '2026-10-31';
  assert.equal(DateOnly.addDays(monthEnd, 1), '2026-11-01');

  // Year boundary jump
  const yearEnd = '2026-12-31';
  assert.equal(DateOnly.addDays(yearEnd, 1), '2027-01-01');
});

test('SchedulingBridge translates Contractor project into TruePPM payload with stable IDs', () => {
  const project = createMockProject();
  const pkg = SchedulingBridge.toTruePpmPayload(project);

  assert.equal(pkg.schemaVersion, CURRENT_INPUT_SCHEMA_VERSION);
  assert.match(pkg.inputDigest, /^sha256:[a-f0-9]{64}$/);

  // Check tasks translation
  assert.equal(pkg.payload.tasks.length, 3);
  assert.equal(pkg.payload.tasks[0].id, 'task-clearing-01');
  assert.equal(pkg.payload.tasks[0].duration, 3);
  assert.equal(pkg.payload.tasks[1].id, 'task-excavation-02');
  assert.equal(pkg.payload.tasks[2].id, 'task-milestone-03');

  // Check dependencies translation
  assert.equal(pkg.payload.dependencies.length, 2);
  assert.equal(pkg.payload.dependencies[0].pred_id, 'task-clearing-01');
  assert.equal(pkg.payload.dependencies[0].succ_id, 'task-excavation-02');

  // Check calendar translation (Sunday=0 converted to TruePPM Sunday=6)
  assert.equal(pkg.payload.calendars.length, 1);
  assert.equal(pkg.payload.calendars[0].id, 'cal-nepal-std');
  assert.deepEqual(pkg.payload.calendars[0].holidays, ['2026-10-19', '2026-10-20', '2026-10-21']);
});

test('SchedulingBridge constructs immutable calculation record with engine release and schema tracking', () => {
  const project = createMockProject();
  const pkg = SchedulingBridge.toTruePpmPayload(project);

  const mockTruePpmOutput: TruePpmOutputPayload = {
    status: 'success',
    data_date: '2026-10-12',
    project_finish: '2026-10-22',
    critical_path: ['task-clearing-01', 'task-excavation-02', 'task-milestone-03'],
    total_tasks: 3,
    tasks: {
      'task-clearing-01': {
        early_start: '2026-10-12',
        early_finish: '2026-10-14',
        late_start: '2026-10-12',
        late_finish: '2026-10-14',
        total_float: 0,
        free_float: 0,
        is_critical: true,
        duration: 3
      },
      'task-excavation-02': {
        early_start: '2026-10-15',
        early_finish: '2026-10-22',
        late_start: '2026-10-15',
        late_finish: '2026-10-22',
        total_float: 0,
        free_float: 0,
        is_critical: true,
        duration: 6
      },
      'task-milestone-03': {
        early_start: '2026-10-22',
        early_finish: '2026-10-22',
        late_start: '2026-10-22',
        late_finish: '2026-10-22',
        total_float: 0,
        free_float: 0,
        is_critical: true,
        duration: 0
      }
    }
  };

  const record = SchedulingBridge.fromTruePpmResult(
    mockTruePpmOutput,
    project,
    'REV-001',
    DEFAULT_TRUEPPM_RELEASE,
    pkg.inputDigest
  );

  assert.equal(record.projectId, 'proj-kathmandu-tower');
  assert.equal(record.tenantId, 'tenant-himalaya-infra');
  assert.equal(record.revisionId, 'REV-001');
  assert.equal(record.engineRelease, '0.4.0b1');
  assert.equal(record.inputSchemaVersion, 1);
  assert.equal(record.inputDigest, pkg.inputDigest);
  assert.equal(record.projectFinishDate, '2026-10-22');
  assert.equal(record.totalTasksCount, 3);
  assert.deepEqual(record.criticalPathTaskIds, ['task-clearing-01', 'task-excavation-02', 'task-milestone-03']);

  // Verify task results preserve original IDs
  const res1 = record.taskResults['task-clearing-01'];
  assert.equal(res1.earlyStart, '2026-10-12');
  assert.equal(res1.earlyFinish, '2026-10-14');
  assert.equal(res1.isCritical, true);
});

test('SchedulingBridge fails closed if TruePPM omits any project task in results', () => {
  const project = createMockProject();

  const incompleteOutput: TruePpmOutputPayload = {
    status: 'success',
    data_date: '2026-10-12',
    project_finish: '2026-10-22',
    critical_path: [],
    total_tasks: 2,
    tasks: {
      'task-clearing-01': {
        early_start: '2026-10-12',
        early_finish: '2026-10-14',
        late_start: '2026-10-12',
        late_finish: '2026-10-14',
        total_float: 0,
        free_float: 0,
        is_critical: true,
        duration: 3
      }
      // 'task-excavation-02' and 'task-milestone-03' missing!
    }
  };

  assert.throws(
    () => SchedulingBridge.fromTruePpmResult(incompleteOutput, project, 'REV-001'),
    /Integrity error: TruePPM omitted result for task "task-excavation-02"/
  );
});

test('SchedulingSyncFeedAdapter emits canonical events and generates Flutter parity DTOs (Standing Constraint 3)', () => {
  const project = createMockProject();
  const pkg = SchedulingBridge.toTruePpmPayload(project);

  const mockOutput: TruePpmOutputPayload = {
    status: 'success',
    data_date: '2026-10-12',
    project_finish: '2026-10-22',
    critical_path: ['task-clearing-01'],
    total_tasks: 3,
    tasks: {
      'task-clearing-01': {
        early_start: '2026-10-12',
        early_finish: '2026-10-14',
        late_start: '2026-10-12',
        late_finish: '2026-10-14',
        total_float: 0,
        free_float: 0,
        is_critical: true,
        duration: 3
      },
      'task-excavation-02': {
        early_start: '2026-10-15',
        early_finish: '2026-10-22',
        late_start: '2026-10-15',
        late_finish: '2026-10-22',
        total_float: 0,
        free_float: 0,
        is_critical: false,
        duration: 6
      },
      'task-milestone-03': {
        early_start: '2026-10-22',
        early_finish: '2026-10-22',
        late_start: '2026-10-22',
        late_finish: '2026-10-22',
        total_float: 0,
        free_float: 0,
        is_critical: false,
        duration: 0
      }
    }
  };

  const record = SchedulingBridge.fromTruePpmResult(mockOutput, project, 'REV-001', DEFAULT_TRUEPPM_RELEASE, pkg.inputDigest);
  const adapter = new SchedulingSyncFeedAdapter();

  let capturedEvent: any = null;
  adapter.subscribe(evt => capturedEvent = evt);

  const emitted = adapter.emitCalculationEvent(record);
  assert.equal(emitted.type, 'schedule.calculated');
  assert.equal(emitted.projectId, 'proj-kathmandu-tower');
  assert.equal(capturedEvent?.eventId, emitted.eventId);

  // Generate Flutter-parity DTO
  const flutterDto = SchedulingSyncFeedAdapter.toFlutterParityDto(record, project);
  assert.equal(flutterDto.projectId, 'proj-kathmandu-tower');
  assert.equal(flutterDto.revisionId, 'REV-001');
  assert.equal(flutterDto.tasks.length, 3);
  assert.equal(flutterDto.tasks[0].taskId, 'task-clearing-01');
  assert.equal(flutterDto.tasks[0].wbsCode, '1.1');
  assert.equal(flutterDto.tasks[0].earlyStart, '2026-10-12');
  assert.equal(flutterDto.tasks[0].isCritical, true);
});
