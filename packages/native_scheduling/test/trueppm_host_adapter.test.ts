import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TruePpmHostAdapter,
  ScheduleCycleDetectedError,
  ScheduleConstraintConflictError,
  HostPermissionDeniedError,
} from '../src/trueppm_host_adapter.js';
import { TenantScheduleProject } from '../src/models.js';

function createSampleProject(): TenantScheduleProject {
  return {
    projectId: 'proj-kathmandu-01',
    tenantId: 'tenant-himalaya',
    name: 'Kathmandu Commercial Complex',
    dataDate: '2026-11-01',
    calendars: [
      {
        calendarId: 'cal-nepal-6day',
        name: 'Nepal Standard 6-Day Calendar',
        workingDays: [0, 1, 2, 3, 4, 5], // Sun-Fri
        holidays: ['2026-11-07'],
      },
    ],
    tasks: [
      {
        taskId: 'task-site-prep',
        wbsCode: '1.1',
        name: 'Site Clearing and Boundary Wall',
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
        name: 'Excavation and Raft Foundation',
        durationDays: 20,
        calendarId: 'cal-nepal-6day',
        isMilestone: false,
        progressPercent: 25,
        actualStartDate: '2026-11-13',
      },
      {
        taskId: 'task-superstructure',
        wbsCode: '1.3',
        name: 'RCC Frame Columns and Slabs',
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

test('dual presentation surfaces: Full Editor vs Embedded Capability vs Headless CLI', () => {
  const project = createSampleProject();
  const host = new TruePpmHostAdapter(project, { initialMode: 'full_editor' });

  // 1. Full Editor Mode
  assert.equal(host.getMode(), 'full_editor');
  const fullChrome = host.getChromeConfig();
  assert.equal(fullChrome.ribbonVisible, true);
  assert.equal(fullChrome.sidebarVisible, true);
  assert.equal(fullChrome.ganttCanvasVisible, true);
  assert.equal(fullChrome.baselineToolbarVisible, true);
  assert.equal(fullChrome.canvasInteractionEnabled, true);

  host.mount('desktop-main-viewport');
  assert.equal(host.isMounted(), true);
  assert.equal(host.getHostState().containerId, 'desktop-main-viewport');

  // 2. Embedded Capability Mode
  const embeddedState = host.setMode('embedded_scheduling');
  assert.equal(embeddedState.mode, 'embedded_scheduling');
  const embeddedChrome = host.getChromeConfig();
  assert.equal(embeddedChrome.ribbonVisible, false);
  assert.equal(embeddedChrome.sidebarVisible, false);
  assert.equal(embeddedChrome.ganttCanvasVisible, true);
  assert.equal(embeddedChrome.criticalPathHighlightVisible, true);
  assert.equal(embeddedChrome.progressPostingControlsVisible, true);
  assert.equal(embeddedChrome.baselineToolbarVisible, false);
  assert.equal(embeddedChrome.canvasInteractionEnabled, true);

  // 3. Headless CLI Mode
  const headlessState = host.setMode('headless_cli');
  assert.equal(headlessState.mode, 'headless_cli');
  const headlessChrome = host.getChromeConfig();
  assert.equal(headlessChrome.ribbonVisible, false);
  assert.equal(headlessChrome.sidebarVisible, false);
  assert.equal(headlessChrome.ganttCanvasVisible, false);
  assert.equal(headlessChrome.canvasInteractionEnabled, false);

  assert.throws(
    () => host.mount('container-cli'),
    /Cannot mount UI in headless_cli presentation mode/
  );
});

test('session state and view settings are strictly preserved across mode transitions', () => {
  const project = createSampleProject();
  const host = new TruePpmHostAdapter(project, { initialMode: 'full_editor' });

  // User sets selections, zoom, scroll, and filters in full editor
  host.updateViewState({
    selectedTaskIds: ['task-substructure'],
    expandedWbsNodes: ['1.1', '1.2'],
    zoomLevel: 'month',
    scrollOffsetX: 450,
    scrollOffsetY: 120,
    activeFilter: { criticalOnly: true, wbsPrefix: '1.' },
  });

  const originalViewState = host.getViewState();

  // Transition to embedded scheduling mode
  host.setMode('embedded_scheduling');
  const transitionedViewState = host.getViewState();

  assert.deepEqual(transitionedViewState.selectedTaskIds, ['task-substructure']);
  assert.deepEqual(transitionedViewState.expandedWbsNodes, ['1.1', '1.2']);
  assert.equal(transitionedViewState.zoomLevel, 'month');
  assert.equal(transitionedViewState.scrollOffsetX, 450);
  assert.equal(transitionedViewState.scrollOffsetY, 120);
  assert.deepEqual(transitionedViewState.activeFilter, { criticalOnly: true, wbsPrefix: '1.' });

  // Transition to headless CLI and back to full editor
  host.setMode('headless_cli');
  host.setMode('full_editor');

  assert.deepEqual(host.getViewState(), originalViewState);
});

test('pre-dispatch validation detects circular dependencies and impossible constraints (fail-closed)', () => {
  const project = createSampleProject();
  const host = new TruePpmHostAdapter(project);

  // Normal graph passes pre-dispatch validation without error
  host.validateScheduleGraph();

  // 1. Dependency Cycle Detection: add dep-3-1 creating cycle task-1 -> task-2 -> task-3 -> task-1
  const cyclicProject: TenantScheduleProject = {
    ...project,
    dependencies: [
      ...project.dependencies,
      {
        dependencyId: 'dep-3-1',
        predTaskId: 'task-superstructure',
        succTaskId: 'task-site-prep',
        type: 'FS',
        lagDays: 0,
      },
    ],
  };

  assert.throws(
    () => host.validateScheduleGraph(cyclicProject),
    (err: any) => {
      assert.ok(err instanceof ScheduleCycleDetectedError);
      assert.deepEqual(err.cyclePath, [
        'task-site-prep',
        'task-substructure',
        'task-superstructure',
        'task-site-prep',
      ]);
      return true;
    }
  );

  // 2. Immediate Self-loop Cycle: task-1 -> task-1
  const selfLoopProject: TenantScheduleProject = {
    ...project,
    dependencies: [
      {
        dependencyId: 'dep-self',
        predTaskId: 'task-site-prep',
        succTaskId: 'task-site-prep',
        type: 'FS',
        lagDays: 0,
      },
    ],
  };

  assert.throws(
    () => host.validateScheduleGraph(selfLoopProject),
    (err: any) => {
      assert.ok(err instanceof ScheduleCycleDetectedError);
      assert.deepEqual(err.cyclePath, ['task-site-prep', 'task-site-prep']);
      return true;
    }
  );

  // 3. Broken Dependency Reference: referencing non-existent task
  const brokenDepProject: TenantScheduleProject = {
    ...project,
    dependencies: [
      {
        dependencyId: 'dep-broken',
        predTaskId: 'task-site-prep',
        succTaskId: 'task-non-existent-99',
        type: 'FS',
        lagDays: 0,
      },
    ],
  };

  assert.throws(
    () => host.validateScheduleGraph(brokenDepProject),
    (err: any) => {
      assert.ok(err instanceof ScheduleConstraintConflictError);
      assert.match(err.message, /non-existent successor task/);
      return true;
    }
  );

  // 4. Impossible Constraint: negative duration
  const negativeDurationProject: TenantScheduleProject = {
    ...project,
    tasks: project.tasks.map(t =>
      t.taskId === 'task-substructure' ? { ...t, durationDays: -10 } : t
    ),
  };

  assert.throws(
    () => host.validateScheduleGraph(negativeDurationProject),
    (err: any) => {
      assert.ok(err instanceof ScheduleConstraintConflictError);
      assert.match(err.message, /Negative duration/);
      return true;
    }
  );

  // 5. Impossible Constraint: actual finish precedes actual start
  const reversedDatesProject: TenantScheduleProject = {
    ...project,
    tasks: project.tasks.map(t =>
      t.taskId === 'task-site-prep'
        ? { ...t, actualStartDate: '2026-11-15', actualFinishDate: '2026-11-10' }
        : t
    ),
  };

  assert.throws(
    () => host.validateScheduleGraph(reversedDatesProject),
    (err: any) => {
      assert.ok(err instanceof ScheduleConstraintConflictError);
      assert.match(err.message, /cannot precede actual start date/);
      return true;
    }
  );
});

test('offline typed local proposals flag visual preview tasks and reconcile against server revisions', () => {
  const project = createSampleProject();
  const host = new TruePpmHostAdapter(project, { initialRevisionId: 'rev-001' });

  // 1. Submit local offline proposal (e.g. extending superstructure duration from 30 to 45 days)
  const proposal = host.createProposal({
    taskUpdates: [
      {
        taskId: 'task-superstructure',
        durationDays: 45,
      },
    ],
  });

  assert.equal(proposal.isProposal, true);
  assert.equal(proposal.status, 'draft_local');
  assert.equal(proposal.baseRevisionId, 'rev-001');

  // 2. Verify effective display tasks carry visual preview labels
  const displayTasks = host.getEffectiveDisplayTasks();
  const superTask = displayTasks.find(t => t.taskId === 'task-superstructure');
  assert.ok(superTask);
  assert.equal(superTask.durationDays, 45);
  assert.equal(superTask.isDraftProposal, true);
  assert.equal(superTask.localProposalId, proposal.proposalId);
  assert.equal(superTask.hasPendingChanges, true);

  const prepTask = displayTasks.find(t => t.taskId === 'task-site-prep');
  assert.ok(prepTask);
  assert.equal(prepTask.isDraftProposal, false);
  assert.equal(prepTask.hasPendingChanges, false);

  // 3. Server Reconciliation: Accepted
  host.reconcileProposal(proposal.proposalId, 'rev-002', true);
  assert.equal(host.getHostState().revisionId, 'rev-002');
  assert.equal(host.getHostState().pendingProposalsCount, 0);

  const reconciledDisplayTasks = host.getEffectiveDisplayTasks();
  const committedSuperTask = reconciledDisplayTasks.find(t => t.taskId === 'task-superstructure');
  assert.ok(committedSuperTask);
  assert.equal(committedSuperTask.durationDays, 45);
  assert.equal(committedSuperTask.isDraftProposal, false); // No longer a draft proposal

  // 4. Server Reconciliation: Rejection
  const proposal2 = host.createProposal({
    taskUpdates: [{ taskId: 'task-site-prep', durationDays: 12 }],
  });
  assert.equal(host.getHostState().pendingProposalsCount, 1);

  host.reconcileProposal(proposal2.proposalId, 'rev-002', false, 'Baseline locked');
  assert.equal(host.getHostState().pendingProposalsCount, 0);
  const p2 = host.getProposals().find(p => p.proposalId === proposal2.proposalId);
  assert.equal(p2?.status, 'rejected');
  assert.equal(p2?.rejectionReason, 'Baseline locked');

  // Rejected proposal is not applied to base project
  const tasksAfterReject = host.getEffectiveDisplayTasks();
  const sitePrepTask = tasksAfterReject.find(t => t.taskId === 'task-site-prep');
  assert.equal(sitePrepTask?.durationDays, 10); // remains original 10
});

test('domain permissions enforce view_only, progress_update_only, and full_authoring boundaries', () => {
  const project = createSampleProject();

  // 1. view_only blocks all proposals
  const viewOnlyHost = new TruePpmHostAdapter(project, { initialPermission: 'view_only' });
  assert.throws(
    () => viewOnlyHost.createProposal({ taskUpdates: [{ taskId: 'task-substructure', durationDays: 25 }] }),
    (err: any) => {
      assert.ok(err instanceof HostPermissionDeniedError);
      assert.equal(err.permission, 'view_only');
      return true;
    }
  );

  // 2. progress_update_only allows progressPercent and actual dates, but blocks duration & dependency changes
  const progressHost = new TruePpmHostAdapter(project, { initialPermission: 'progress_update_only' });

  // Dependency change rejected
  assert.throws(
    () =>
      progressHost.createProposal({
        dependencyChanges: [
          {
            action: 'add',
            dependency: {
              dependencyId: 'dep-new',
              predTaskId: 'task-site-prep',
              succTaskId: 'task-superstructure',
              type: 'FS',
              lagDays: 0,
            },
          },
        ],
      }),
    (err: any) => {
      assert.ok(err instanceof HostPermissionDeniedError);
      assert.equal(err.permission, 'progress_update_only');
      return true;
    }
  );

  // Duration modification rejected
  assert.throws(
    () =>
      progressHost.createProposal({
        taskUpdates: [{ taskId: 'task-substructure', durationDays: 25 }],
      }),
    (err: any) => {
      assert.ok(err instanceof HostPermissionDeniedError);
      assert.equal(err.permission, 'progress_update_only');
      return true;
    }
  );

  // Progress update allowed
  const validProgressProp = progressHost.createProposal({
    taskUpdates: [
      {
        taskId: 'task-substructure',
        progressPercent: 40,
        actualStartDate: '2026-11-13',
      },
    ],
  });
  assert.equal(validProgressProp.status, 'draft_local');
  assert.equal(progressHost.getHostState().pendingProposalsCount, 1);
});
