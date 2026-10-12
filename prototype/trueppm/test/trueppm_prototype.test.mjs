/**
 * TruePPM Scheduler Prototype & Contract Tests (M09-T01).
 *
 * Verifies:
 *  1. Pinned TruePPM v0.4.0 Python scheduler execution.
 *  2. Nepal 6-day construction calendar & holiday arithmetic.
 *  3. Critical Path Method (CPM) forward/backward passes, early/late dates, floats.
 *  4. Parallel branch scheduling and critical path determination.
 *  5. Strict cycle detection fail-closed handling.
 *  6. Subprocess execution performance (< 250 ms for project networks).
 *  7. Headless MCP tool inventory and JSON-RPC dispatch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TruePpmSchedulerDriver } from '../lib/trueppm_scheduler_driver.mjs';
import { NepalConstructionCalendar } from '../lib/nepal_calendar.mjs';
import { TsCpmBaselineEngine } from '../lib/ts_cpm_baseline.mjs';
import { TruePpmMcpServer } from '../lib/mcp_server.mjs';

test('TruePPM driver reports pinned engine release version', async () => {
  const driver = new TruePpmSchedulerDriver();
  const version = await driver.getVersion();
  assert.match(version, /trueppm-scheduler 0\.4\.0b1/i);
});

test('Nepal calendar correctly handles 6-day workweek and public holidays', () => {
  const cal = new NepalConstructionCalendar({
    holidays: ['2026-10-19', '2026-10-20', '2026-10-21'] // Dashain
  });

  // 2026-10-16 is Friday (working)
  assert.equal(cal.isWorkingDay('2026-10-16'), true);
  // 2026-10-17 is Saturday (non-working in Nepal)
  assert.equal(cal.isWorkingDay('2026-10-17'), false);
  // 2026-10-18 is Sunday (working in Nepal)
  assert.equal(cal.isWorkingDay('2026-10-18'), true);
  // 2026-10-19 is Dashain Monday (holiday)
  assert.equal(cal.isWorkingDay('2026-10-19'), false);

  // Inclusive duration: 1-day task on Sunday Oct 18 finishes on Sunday Oct 18
  assert.equal(cal.calculateFinishDate('2026-10-18', 1), '2026-10-18');

  // 2-day task starting on Friday Oct 16:
  // Day 1: Fri Oct 16. (Sat Oct 17 non-working). Day 2: Sun Oct 18.
  assert.equal(cal.calculateFinishDate('2026-10-16', 2), '2026-10-18');
});

test('CPM calculation matches expected dates and floats on linear sequence', async () => {
  const driver = new TruePpmSchedulerDriver();

  const project = {
    data_date: '2026-10-12', // Monday
    tasks: [
      { id: 'T1', name: 'Site Clearing', duration: 3, calendar_id: 'default' },
      { id: 'T2', name: 'Excavation', duration: 4, calendar_id: 'default' },
      { id: 'T3', name: 'Foundation', duration: 5, calendar_id: 'default' }
    ],
    dependencies: [
      { pred_id: 'T1', succ_id: 'T2', type: 'FS', lag: 0 },
      { pred_id: 'T2', succ_id: 'T3', type: 'FS', lag: 0 }
    ]
  };

  const result = await driver.calculateSchedule(project);

  assert.equal(result.status, 'success');
  assert.equal(result.total_tasks, 3);

  // All tasks on single chain are critical
  assert.deepEqual(result.critical_path, ['T1', 'T2', 'T3']);

  const t1 = result.tasks['T1'];
  const t2 = result.tasks['T2'];
  const t3 = result.tasks['T3'];

  assert.equal(t1.early_start, '2026-10-12');
  assert.equal(t1.total_float, 0);
  assert.equal(t1.is_critical, true);

  // T2 starts after T1 finishes
  assert.ok(t2.early_start > t1.early_start);
  assert.equal(t2.total_float, 0);

  // T3 starts after T2 finishes
  assert.ok(t3.early_start > t2.early_start);
  assert.equal(t3.total_float, 0);
});

test('CPM correctly identifies critical path among parallel construction branches', async () => {
  const driver = new TruePpmSchedulerDriver();

  const project = {
    data_date: '2026-10-12',
    tasks: [
      // Branch 1: Critical Long Branch (Duration: 5 + 10 = 15 days)
      { id: 'A1', name: 'Mobilization & Earthwork', duration: 5 },
      { id: 'A2', name: 'RCC Superstructure', duration: 10 },
      // Branch 2: Non-Critical Short Branch (Duration: 2 + 3 = 5 days)
      { id: 'B1', name: 'Procure Plumbing', duration: 2 },
      { id: 'B2', name: 'Plumbing Rough-In', duration: 3 },
      // Convergence Milestone
      { id: 'M1', name: 'Handover Review', duration: 0 }
    ],
    dependencies: [
      { pred_id: 'A1', succ_id: 'A2', type: 'FS', lag: 0 },
      { pred_id: 'A2', succ_id: 'M1', type: 'FS', lag: 0 },
      { pred_id: 'B1', succ_id: 'B2', type: 'FS', lag: 0 },
      { pred_id: 'B2', succ_id: 'M1', type: 'FS', lag: 0 }
    ]
  };

  const result = await driver.calculateSchedule(project);

  assert.equal(result.status, 'success');

  // Critical path must contain A1, A2, and M1
  assert.ok(result.critical_path.includes('A1'));
  assert.ok(result.critical_path.includes('A2'));
  assert.ok(result.critical_path.includes('M1'));

  // Non-critical tasks B1 and B2 must have positive total float
  assert.equal(result.tasks['B1'].is_critical, false);
  assert.ok(result.tasks['B1'].total_float > 0);
  assert.equal(result.tasks['B2'].is_critical, false);
  assert.ok(result.tasks['B2'].total_float > 0);
});

test('Dependency graph cycles are detected and fail-closed with explicit error', async () => {
  const driver = new TruePpmSchedulerDriver();

  const cyclicalProject = {
    data_date: '2026-10-12',
    tasks: [
      { id: 'N1', name: 'Task One', duration: 3 },
      { id: 'N2', name: 'Task Two', duration: 2 }
    ],
    dependencies: [
      { pred_id: 'N1', succ_id: 'N2', type: 'FS' },
      { pred_id: 'N2', succ_id: 'N1', type: 'FS' } // Cycle!
    ]
  };

  await assert.rejects(
    async () => driver.calculateSchedule(cyclicalProject),
    /Cycle detected in task dependency graph/
  );
});

test('Subprocess calculation meets execution latency budget (< 250 ms)', async () => {
  const driver = new TruePpmSchedulerDriver();

  const tasks = [];
  const dependencies = [];
  for (let i = 0; i < 50; i++) {
    tasks.push({ id: `TASK_${i}`, name: `Activity ${i}`, duration: (i % 5) + 1 });
    if (i > 0) {
      dependencies.push({ pred_id: `TASK_${i - 1}`, succ_id: `TASK_${i}`, type: 'FS', lag: 0 });
    }
  }

  const result = await driver.calculateSchedule({
    data_date: '2026-10-12',
    tasks,
    dependencies
  });

  assert.equal(result.total_tasks, 50);
  assert.ok(result.execution_duration_ms < 250, `Latency was ${result.execution_duration_ms}ms, exceeding 250ms budget`);
});

test('TruePPM MCP server exposes tools and executes scheduling requests', async () => {
  const mcpServer = new TruePpmMcpServer();
  const tools = mcpServer.getTools();

  assert.ok(tools.length >= 5);
  const toolNames = tools.map(t => t.name);
  assert.ok(toolNames.includes('schedule_project'));
  assert.ok(toolNames.includes('identify_critical_path'));
  assert.ok(toolNames.includes('validate_dependency_network'));

  const validation = await mcpServer.executeTool('validate_dependency_network', {
    tasks: [{ id: 'X1', duration: 2 }],
    dependencies: []
  });
  assert.equal(validation.valid, true);
});
