/**
 * TruePPM Presentation Host Adapter (M09-T04).
 *
 * Implements:
 *  - Dual presentation surfaces: Full Editor Mode vs Embedded Capability Mode vs Headless CLI (ADR-0016 / ADR-0017)
 *  - Session state preservation across mode transitions (selections, zoom, scroll, filters)
 *  - Fail-closed pre-dispatch validation: DFS dependency cycle detection & impossible constraint checks
 *  - Offline typed local proposals (LocalScheduleProposal) with visual preview labeling
 *  - Deterministic proposal reconciliation rules against server-accepted revisions
 *  - Domain permission boundaries: view_only, progress_update_only, full_authoring
 */

import { DateOnly, DateOnlyString } from './date_only.js';
import {
  TenantScheduleProject,
  TenantTask,
  TenantDependency,
  TenantCalendar,
  DependencyType,
  ConstraintType,
} from './models.js';
import {
  TenantScheduleCalculationRecord,
  ScheduledTaskResult,
} from './calculation_record.js';
import { SchedulingBridge, TruePpmOutputPayload } from './trueppm_bridge.js';

export type TruePpmPresentationMode = 'full_editor' | 'embedded_scheduling' | 'headless_cli';
export type TruePpmDomainPermission = 'view_only' | 'progress_update_only' | 'full_authoring';
export type TimelineZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export class ScheduleCycleDetectedError extends Error {
  readonly cyclePath: readonly string[];
  constructor(cyclePath: readonly string[]) {
    super(`Circular dependency cycle detected in schedule: ${cyclePath.join(' -> ')}`);
    this.name = 'ScheduleCycleDetectedError';
    this.cyclePath = cyclePath;
  }
}

export class ScheduleConstraintConflictError extends Error {
  readonly taskId: string;
  readonly reason: string;
  constructor(taskId: string, reason: string) {
    super(`Impossible schedule constraint conflict for task '${taskId}': ${reason}`);
    this.name = 'ScheduleConstraintConflictError';
    this.taskId = taskId;
    this.reason = reason;
  }
}

export class HostPermissionDeniedError extends Error {
  readonly permission: TruePpmDomainPermission;
  readonly action: string;
  constructor(permission: TruePpmDomainPermission, action: string) {
    super(`Action '${action}' denied under domain permission '${permission}'`);
    this.name = 'HostPermissionDeniedError';
    this.permission = permission;
    this.action = action;
  }
}

export interface TruePpmChromeConfig {
  readonly ribbonVisible: boolean;
  readonly sidebarVisible: boolean;
  readonly ganttCanvasVisible: boolean;
  readonly wbsInspectorVisible: boolean;
  readonly dependencyInspectorVisible: boolean;
  readonly criticalPathHighlightVisible: boolean;
  readonly baselineToolbarVisible: boolean;
  readonly progressPostingControlsVisible: boolean;
  readonly canvasInteractionEnabled: boolean;
}

export interface ScheduleViewState {
  readonly selectedTaskIds: readonly string[];
  readonly expandedWbsNodes: readonly string[];
  readonly zoomLevel: TimelineZoomLevel;
  readonly scrollOffsetX: number;
  readonly scrollOffsetY: number;
  readonly activeFilter: {
    readonly criticalOnly?: boolean;
    readonly wbsPrefix?: string;
  };
}

export interface ProposedTaskUpdate {
  readonly taskId: string;
  readonly durationDays?: number;
  readonly progressPercent?: number;
  readonly actualStartDate?: DateOnlyString;
  readonly actualFinishDate?: DateOnlyString;
  readonly constraintType?: ConstraintType;
  readonly constraintDate?: DateOnlyString;
}

export interface ProposedDependencyChange {
  readonly action: 'add' | 'remove';
  readonly dependency: TenantDependency;
}

export interface ProposedScheduleChanges {
  readonly taskUpdates?: readonly ProposedTaskUpdate[];
  readonly dependencyChanges?: readonly ProposedDependencyChange[];
}

export interface LocalScheduleProposal {
  readonly proposalId: string;
  readonly projectId: string;
  readonly baseRevisionId: string;
  readonly proposedChanges: ProposedScheduleChanges;
  readonly status: 'draft_local' | 'reconciled' | 'rejected';
  readonly isProposal: true; // Visual preview flag
  readonly rejectionReason?: string;
  readonly createdAtUtc: string;
}

export interface EffectiveDisplayTask extends TenantTask {
  readonly isDraftProposal: boolean;
  readonly localProposalId?: string;
  readonly hasPendingChanges: boolean;
  readonly earlyStart?: DateOnlyString;
  readonly earlyFinish?: DateOnlyString;
  readonly isCritical?: boolean;
  readonly totalFloat?: number;
}

export interface TruePpmHostState {
  readonly mode: TruePpmPresentationMode;
  readonly permission: TruePpmDomainPermission;
  readonly projectId: string;
  readonly revisionId: string;
  readonly chromeConfig: TruePpmChromeConfig;
  readonly viewState: ScheduleViewState;
  readonly pendingProposalsCount: number;
  readonly isMounted: boolean;
  readonly containerId?: string;
  readonly latestCalculation?: TenantScheduleCalculationRecord;
}

export class TruePpmHostAdapter {
  private project: TenantScheduleProject;
  private mode: TruePpmPresentationMode;
  private permission: TruePpmDomainPermission;
  private revisionId: string;

  private viewState: ScheduleViewState = {
    selectedTaskIds: [],
    expandedWbsNodes: [],
    zoomLevel: 'week',
    scrollOffsetX: 0,
    scrollOffsetY: 0,
    activeFilter: {},
  };

  private proposals: LocalScheduleProposal[] = [];
  private isMountedState = false;
  private currentContainerId?: string;
  private latestCalculation?: TenantScheduleCalculationRecord;

  constructor(
    project: TenantScheduleProject,
    options?: {
      readonly initialMode?: TruePpmPresentationMode;
      readonly initialPermission?: TruePpmDomainPermission;
      readonly initialRevisionId?: string;
      readonly latestCalculation?: TenantScheduleCalculationRecord;
    }
  ) {
    this.project = project;
    this.mode = options?.initialMode ?? 'full_editor';
    this.permission = options?.initialPermission ?? 'full_authoring';
    this.revisionId = options?.initialRevisionId ?? 'rev-001';
    this.latestCalculation = options?.latestCalculation;
  }

  // --- Presentation Modes & State Preservation (ADR-0016) ---

  getMode(): TruePpmPresentationMode {
    return this.mode;
  }

  getPermission(): TruePpmDomainPermission {
    return this.permission;
  }

  setPermission(newPermission: TruePpmDomainPermission): void {
    this.permission = newPermission;
  }

  setMode(newMode: TruePpmPresentationMode): TruePpmHostState {
    // Mode transitions must strictly preserve session view state & active proposals
    const previousViewState = { ...this.viewState };
    const previousProposals = [...this.proposals];

    this.mode = newMode;

    // Verify preservation invariants
    this.viewState = previousViewState;
    this.proposals = previousProposals;

    return this.getHostState();
  }

  getChromeConfig(): TruePpmChromeConfig {
    switch (this.mode) {
      case 'full_editor':
        return {
          ribbonVisible: true,
          sidebarVisible: true,
          ganttCanvasVisible: true,
          wbsInspectorVisible: true,
          dependencyInspectorVisible: true,
          criticalPathHighlightVisible: true,
          baselineToolbarVisible: true,
          progressPostingControlsVisible: true,
          canvasInteractionEnabled: true,
        };

      case 'embedded_scheduling':
        return {
          ribbonVisible: false,
          sidebarVisible: false,
          ganttCanvasVisible: true,
          wbsInspectorVisible: true,
          dependencyInspectorVisible: true,
          criticalPathHighlightVisible: true,
          baselineToolbarVisible: false,
          progressPostingControlsVisible: true,
          canvasInteractionEnabled: true,
        };

      case 'headless_cli':
        return {
          ribbonVisible: false,
          sidebarVisible: false,
          ganttCanvasVisible: false,
          wbsInspectorVisible: false,
          dependencyInspectorVisible: false,
          criticalPathHighlightVisible: false,
          baselineToolbarVisible: false,
          progressPostingControlsVisible: false,
          canvasInteractionEnabled: false,
        };
    }
  }

  // --- View State & Navigation ---

  getViewState(): ScheduleViewState {
    return { ...this.viewState };
  }

  updateViewState(delta: Partial<ScheduleViewState>): ScheduleViewState {
    this.viewState = {
      ...this.viewState,
      ...delta,
      selectedTaskIds: delta.selectedTaskIds ? [...delta.selectedTaskIds] : this.viewState.selectedTaskIds,
      expandedWbsNodes: delta.expandedWbsNodes ? [...delta.expandedWbsNodes] : this.viewState.expandedWbsNodes,
      activeFilter: delta.activeFilter ? { ...delta.activeFilter } : this.viewState.activeFilter,
    };
    return this.getViewState();
  }

  getHostState(): TruePpmHostState {
    const pendingProposalsCount = this.proposals.filter(p => p.status === 'draft_local').length;
    return {
      mode: this.mode,
      permission: this.permission,
      projectId: this.project.projectId,
      revisionId: this.revisionId,
      chromeConfig: this.getChromeConfig(),
      viewState: this.getViewState(),
      pendingProposalsCount,
      isMounted: this.isMountedState,
      containerId: this.currentContainerId,
      latestCalculation: this.latestCalculation,
    };
  }

  // --- Lifecycle & Shell Mounting ---

  mount(containerId: string): void {
    if (this.mode === 'headless_cli') {
      throw new Error('Cannot mount UI in headless_cli presentation mode');
    }
    this.isMountedState = true;
    this.currentContainerId = containerId;
  }

  unmount(): void {
    this.isMountedState = false;
    this.currentContainerId = undefined;
  }

  dispose(): void {
    this.unmount();
    this.proposals = [];
    this.latestCalculation = undefined;
  }

  isMounted(): boolean {
    return this.isMountedState;
  }

  // --- Graph Validation & Constraint Conflict Detection ---

  /**
   * Pre-dispatch validation for circular dependencies and impossible constraints.
   * Throws ScheduleCycleDetectedError or ScheduleConstraintConflictError on failure.
   */
  validateScheduleGraph(projectToValidate?: TenantScheduleProject): void {
    const proj = projectToValidate ?? this.getEffectiveProject();
    const taskMap = new Map<string, TenantTask>();
    for (const t of proj.tasks) {
      taskMap.set(t.taskId, t);
    }

    // 1. Validate individual task constraints
    for (const task of proj.tasks) {
      if (task.durationDays < 0) {
        throw new ScheduleConstraintConflictError(task.taskId, `Negative duration (${task.durationDays} days) is invalid`);
      }
      if (task.durationHours !== undefined && task.durationHours < 0) {
        throw new ScheduleConstraintConflictError(task.taskId, `Negative duration hours (${task.durationHours}) is invalid`);
      }

      if (task.progressPercent < 0 || task.progressPercent > 100) {
        throw new ScheduleConstraintConflictError(task.taskId, `Progress percent (${task.progressPercent}%) must be between 0 and 100`);
      }

      if (task.actualStartDate && task.actualFinishDate) {
        DateOnly.assertValid(task.actualStartDate);
        DateOnly.assertValid(task.actualFinishDate);
        if (DateOnly.compare(task.actualFinishDate, task.actualStartDate) < 0) {
          throw new ScheduleConstraintConflictError(
            task.taskId,
            `Actual finish date (${task.actualFinishDate}) cannot precede actual start date (${task.actualStartDate})`
          );
        }
      }

      if (task.constraintType && task.constraintDate) {
        DateOnly.assertValid(task.constraintDate); // Asserts format YYYY-MM-DD
      }
    }

    // 2. Validate dependency integrity & broken references
    const adjacency = new Map<string, string[]>();
    for (const task of proj.tasks) {
      adjacency.set(task.taskId, []);
    }

    for (const dep of proj.dependencies) {
      if (!taskMap.has(dep.predTaskId)) {
        throw new ScheduleConstraintConflictError(
          dep.predTaskId,
          `Dependency '${dep.dependencyId}' references non-existent predecessor task '${dep.predTaskId}'`
        );
      }
      if (!taskMap.has(dep.succTaskId)) {
        throw new ScheduleConstraintConflictError(
          dep.succTaskId,
          `Dependency '${dep.dependencyId}' references non-existent successor task '${dep.succTaskId}'`
        );
      }

      // Self-dependency cycle
      if (dep.predTaskId === dep.succTaskId) {
        throw new ScheduleCycleDetectedError([dep.predTaskId, dep.succTaskId]);
      }

      adjacency.get(dep.predTaskId)!.push(dep.succTaskId);
    }

    // 3. DFS cycle detection
    // 0 = unvisited, 1 = visiting (current path), 2 = visited
    const state = new Map<string, number>();
    const parent = new Map<string, string | null>();

    for (const task of proj.tasks) {
      state.set(task.taskId, 0);
    }

    const dfs = (node: string, path: string[]): boolean => {
      state.set(node, 1);
      path.push(node);

      const neighbors = adjacency.get(node) || [];
      for (const next of neighbors) {
        const nextState = state.get(next) ?? 0;
        if (nextState === 1) {
          // Cycle found! Extract cycle path
          const cycleStartIndex = path.indexOf(next);
          const cycle = path.slice(cycleStartIndex);
          cycle.push(next);
          throw new ScheduleCycleDetectedError(cycle);
        }
        if (nextState === 0) {
          parent.set(next, node);
          if (dfs(next, path)) {
            return true;
          }
        }
      }

      path.pop();
      state.set(node, 2);
      return false;
    };

    for (const task of proj.tasks) {
      if (state.get(task.taskId) === 0) {
        dfs(task.taskId, []);
      }
    }
  }

  // --- Offline Typed Local Proposals & Visual Preview ---

  createProposal(changes: ProposedScheduleChanges): LocalScheduleProposal {
    if (this.permission === 'view_only') {
      throw new HostPermissionDeniedError('view_only', 'create_schedule_proposal');
    }

    if (this.permission === 'progress_update_only') {
      if (changes.dependencyChanges && changes.dependencyChanges.length > 0) {
        throw new HostPermissionDeniedError(
          'progress_update_only',
          'modify_dependencies'
        );
      }
      if (changes.taskUpdates) {
        for (const update of changes.taskUpdates) {
          if (update.durationDays !== undefined || update.constraintType !== undefined || update.constraintDate !== undefined) {
            throw new HostPermissionDeniedError(
              'progress_update_only',
              'modify_duration_or_constraints'
            );
          }
        }
      }
    }

    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const proposal: LocalScheduleProposal = {
      proposalId,
      projectId: this.project.projectId,
      baseRevisionId: this.revisionId,
      proposedChanges: changes,
      status: 'draft_local',
      isProposal: true,
      createdAtUtc: new Date().toISOString(),
    };

    // Pre-validate that applying this proposal does not induce cycle or constraint error
    const testProject = this.buildProjectWithProposal(this.project, proposal);
    this.validateScheduleGraph(testProject);

    this.proposals.push(proposal);
    return proposal;
  }

  getProposals(): readonly LocalScheduleProposal[] {
    return [...this.proposals];
  }

  /**
   * Reconcile local proposal against server-accepted revision.
   */
  reconcileProposal(
    proposalId: string,
    serverRevisionId: string,
    accepted: boolean,
    rejectionReason?: string
  ): void {
    const proposalIndex = this.proposals.findIndex(p => p.proposalId === proposalId);
    if (proposalIndex === -1) {
      throw new Error(`Proposal '${proposalId}' not found in host session`);
    }

    const proposal = this.proposals[proposalIndex];
    if (accepted) {
      // Apply accepted changes to the base project
      this.project = this.buildProjectWithProposal(this.project, proposal);
      this.revisionId = serverRevisionId;
      this.proposals[proposalIndex] = {
        ...proposal,
        status: 'reconciled',
      };
    } else {
      this.proposals[proposalIndex] = {
        ...proposal,
        status: 'rejected',
        rejectionReason: rejectionReason ?? 'Rejected by server authority or baseline lock',
      };
    }
  }

  /**
   * Returns effective tasks combining base project state, active draft proposals,
   * visual proposal labeling, and latest calculated results.
   */
  getEffectiveDisplayTasks(): readonly EffectiveDisplayTask[] {
    const effectiveProj = this.getEffectiveProject();
    const draftProposals = this.proposals.filter(p => p.status === 'draft_local');
    const proposedTaskMap = new Map<string, string>(); // taskId -> proposalId

    for (const prop of draftProposals) {
      if (prop.proposedChanges.taskUpdates) {
        for (const u of prop.proposedChanges.taskUpdates) {
          proposedTaskMap.set(u.taskId, prop.proposalId);
        }
      }
    }

    const taskResults = this.latestCalculation?.taskResults ?? {};

    return effectiveProj.tasks.map(t => {
      const proposalId = proposedTaskMap.get(t.taskId);
      const calcResult = taskResults[t.taskId];

      return {
        ...t,
        isDraftProposal: proposalId !== undefined,
        localProposalId: proposalId,
        hasPendingChanges: proposalId !== undefined,
        earlyStart: calcResult?.earlyStart,
        earlyFinish: calcResult?.earlyFinish,
        isCritical: calcResult?.isCritical,
        totalFloat: calcResult?.totalFloat,
      };
    });
  }

  /**
   * Previews schedule calculation through the SchedulingBridge.
   */
  async calculateSchedule(
    executeTruePpm: (input: any) => Promise<TruePpmOutputPayload>,
    engineRelease = '0.4.0b1'
  ): Promise<TenantScheduleCalculationRecord> {
    const effectiveProject = this.getEffectiveProject();
    // Validate pre-conditions
    this.validateScheduleGraph(effectiveProject);

    const calcPackage = SchedulingBridge.toTruePpmPayload(effectiveProject);
    const engineResult = await executeTruePpm(calcPackage.payload);
    const calcRecord = SchedulingBridge.fromTruePpmResult(
      engineResult,
      effectiveProject,
      this.revisionId,
      engineRelease,
      calcPackage.inputDigest
    );
    this.latestCalculation = calcRecord;
    return calcRecord;
  }

  // --- Private Helpers ---

  private getEffectiveProject(): TenantScheduleProject {
    let current = this.project;
    const activeProposals = this.proposals.filter(p => p.status === 'draft_local');
    for (const prop of activeProposals) {
      current = this.buildProjectWithProposal(current, prop);
    }
    return current;
  }

  private buildProjectWithProposal(
    base: TenantScheduleProject,
    proposal: LocalScheduleProposal
  ): TenantScheduleProject {
    let tasks = [...base.tasks];
    let dependencies = [...base.dependencies];

    if (proposal.proposedChanges.taskUpdates) {
      for (const update of proposal.proposedChanges.taskUpdates) {
        const index = tasks.findIndex(t => t.taskId === update.taskId);
        if (index !== -1) {
          const original = tasks[index];
          tasks[index] = {
            ...original,
            durationDays: update.durationDays !== undefined ? update.durationDays : original.durationDays,
            progressPercent: update.progressPercent !== undefined ? update.progressPercent : original.progressPercent,
            actualStartDate: update.actualStartDate !== undefined ? update.actualStartDate : original.actualStartDate,
            actualFinishDate: update.actualFinishDate !== undefined ? update.actualFinishDate : original.actualFinishDate,
            constraintType: update.constraintType !== undefined ? update.constraintType : original.constraintType,
            constraintDate: update.constraintDate !== undefined ? update.constraintDate : original.constraintDate,
          };
        }
      }
    }

    if (proposal.proposedChanges.dependencyChanges) {
      for (const change of proposal.proposedChanges.dependencyChanges) {
        if (change.action === 'add') {
          // Avoid duplicate dependency ID
          if (!dependencies.some(d => d.dependencyId === change.dependency.dependencyId)) {
            dependencies.push(change.dependency);
          }
        } else if (change.action === 'remove') {
          dependencies = dependencies.filter(d => d.dependencyId !== change.dependency.dependencyId);
        }
      }
    }

    return {
      ...base,
      tasks,
      dependencies,
    };
  }
}
