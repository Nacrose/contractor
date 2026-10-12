/**
 * Baseline Snapshot Engine, Schedule Variance Analyzer & Revision Explainer (M09-T05).
 *
 * Implements:
 *  - Immutable approved schedule baselines (frozen provenance, engine release, and inputs)
 *  - Fail-closed immutability enforcement: attempts to overwrite approved baselines throw BaselineImmutableError
 *  - Deterministic date, duration, and float variance analysis (DateOnly arithmetic without timezone drift)
 *  - Structured revision explanation model categorizing causes:
 *      PROGRESS_ACTUALS | DURATION_MODIFICATION | DEPENDENCY_MODIFICATION | CALENDAR_CHANGE | CONSTRAINT_CHANGE
 *  - Historical queryable baseline comparisons across revisions
 */

import { DateOnly, DateOnlyString } from './date_only.js';
import { TenantScheduleProject, TenantTask } from './models.js';
import {
  TenantScheduleCalculationRecord,
  ScheduledTaskResult,
} from './calculation_record.js';

export class BaselineImmutableError extends Error {
  readonly baselineId: string;
  constructor(baselineId: string, action: string) {
    super(`Cannot ${action} baseline '${baselineId}': Approved baselines are strictly immutable`);
    this.name = 'BaselineImmutableError';
    this.baselineId = baselineId;
  }
}

export class BaselineNotFoundError extends Error {
  readonly baselineId: string;
  constructor(baselineId: string) {
    super(`Baseline '${baselineId}' was not found`);
    this.name = 'BaselineNotFoundError';
    this.baselineId = baselineId;
  }
}

export interface BaselineTaskSnapshot {
  readonly taskId: string;
  readonly name: string;
  readonly plannedDurationDays: number;
  readonly earlyStart: DateOnlyString;
  readonly earlyFinish: DateOnlyString;
  readonly lateStart: DateOnlyString;
  readonly lateFinish: DateOnlyString;
  readonly totalFloat: number;
  readonly isCritical: boolean;
}

export interface ScheduleBaselineSnapshot {
  readonly baselineId: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string;
  readonly targetRevisionId: string;
  readonly engineRelease: string;
  readonly inputSchemaVersion: number;
  readonly approvedByUserId?: string;
  readonly approvedAtUtc?: string;
  readonly isApproved: boolean; // Once true, strictly immutable
  readonly snapshotDataDate: DateOnlyString;
  readonly projectFinishDate: DateOnlyString;
  readonly tasks: Readonly<Record<string, BaselineTaskSnapshot>>;
  readonly createdAtUtc: string;
}

export interface ActivityVarianceRecord {
  readonly taskId: string;
  readonly taskName: string;
  readonly baselineEarlyStart: DateOnlyString;
  readonly currentEarlyStart: DateOnlyString;
  readonly startVarianceDays: number; // positive = slippage (delay), negative = acceleration
  readonly baselineEarlyFinish: DateOnlyString;
  readonly currentEarlyFinish: DateOnlyString;
  readonly finishVarianceDays: number; // positive = slippage (delay), negative = acceleration
  readonly baselineDurationDays: number;
  readonly currentDurationDays: number;
  readonly durationVarianceDays: number;
  readonly baselineTotalFloat: number;
  readonly currentTotalFloat: number;
  readonly floatVarianceDays: number; // positive = float gain, negative = float loss
  readonly status: 'ahead' | 'on_track' | 'delayed';
  readonly criticalStatusChanged: boolean;
  readonly isCurrentlyCritical: boolean;
  readonly wasBaselineCritical: boolean;
}

export interface ScheduleVarianceReport {
  readonly reportId: string;
  readonly projectId: string;
  readonly baselineId: string;
  readonly comparisonRevisionId: string;
  readonly dataDate: DateOnlyString;
  readonly projectFinishVarianceDays: number; // current - baseline
  readonly baselineProjectFinish: DateOnlyString;
  readonly currentProjectFinish: DateOnlyString;
  readonly totalActivitiesCount: number;
  readonly delayedActivitiesCount: number;
  readonly aheadActivitiesCount: number;
  readonly onTrackActivitiesCount: number;
  readonly activityVariances: Readonly<Record<string, ActivityVarianceRecord>>;
  readonly generatedAtUtc: string;
}

export type RevisionShiftCauseCategory =
  | 'PROGRESS_ACTUALS'
  | 'DURATION_MODIFICATION'
  | 'DEPENDENCY_MODIFICATION'
  | 'CALENDAR_CHANGE'
  | 'CONSTRAINT_CHANGE';

export interface ActivityShiftExplanation {
  readonly taskId: string;
  readonly taskName: string;
  readonly causeCategory: RevisionShiftCauseCategory;
  readonly description: string;
  readonly daysShifted: number;
  readonly previousFinish: DateOnlyString;
  readonly newFinish: DateOnlyString;
}

export interface ScheduleRevisionExplanation {
  readonly explanationId: string;
  readonly projectId: string;
  readonly fromRevisionId: string;
  readonly toRevisionId: string;
  readonly primaryCause: RevisionShiftCauseCategory;
  readonly overallFinishShiftDays: number;
  readonly itemizedShifts: readonly ActivityShiftExplanation[];
  readonly criticalPathChanges: {
    readonly newlyCriticalTaskIds: readonly string[];
    readonly noLongerCriticalTaskIds: readonly string[];
  };
  readonly generatedAtUtc: string;
}

/**
 * Baseline Snapshot Engine
 * Manages creation, approval, and immutability of schedule baselines.
 */
export class BaselineSnapshotEngine {
  private baselines = new Map<string, ScheduleBaselineSnapshot>();

  /**
   * Creates a new baseline snapshot from an approved calculation record.
   */
  createBaseline(params: {
    readonly baselineId: string;
    readonly name: string;
    readonly description?: string;
    readonly project: TenantScheduleProject;
    readonly calculationRecord: TenantScheduleCalculationRecord;
    readonly approvedByUserId?: string;
    readonly approveImmediately?: boolean;
  }): ScheduleBaselineSnapshot {
    if (this.baselines.has(params.baselineId)) {
      const existing = this.baselines.get(params.baselineId)!;
      if (existing.isApproved) {
        throw new BaselineImmutableError(params.baselineId, 'overwrite');
      }
    }

    const tasks: Record<string, BaselineTaskSnapshot> = {};
    for (const tenantTask of params.project.tasks) {
      const calcResult = params.calculationRecord.taskResults[tenantTask.taskId];
      if (!calcResult) {
        throw new Error(`Calculation record missing result for task '${tenantTask.taskId}'`);
      }

      tasks[tenantTask.taskId] = {
        taskId: tenantTask.taskId,
        name: tenantTask.name,
        plannedDurationDays: tenantTask.durationDays,
        earlyStart: calcResult.earlyStart,
        earlyFinish: calcResult.earlyFinish,
        lateStart: calcResult.lateStart,
        lateFinish: calcResult.lateFinish,
        totalFloat: calcResult.totalFloat,
        isCritical: calcResult.isCritical,
      };
    }

    const isApproved = params.approveImmediately ?? false;
    const nowUtc = new Date().toISOString();

    const snapshot: ScheduleBaselineSnapshot = {
      baselineId: params.baselineId,
      projectId: params.project.projectId,
      tenantId: params.project.tenantId,
      name: params.name,
      description: params.description,
      targetRevisionId: params.calculationRecord.revisionId,
      engineRelease: params.calculationRecord.engineRelease,
      inputSchemaVersion: params.calculationRecord.inputSchemaVersion,
      approvedByUserId: isApproved ? (params.approvedByUserId ?? 'system-approval') : undefined,
      approvedAtUtc: isApproved ? nowUtc : undefined,
      isApproved,
      snapshotDataDate: params.project.dataDate,
      projectFinishDate: params.calculationRecord.projectFinishDate,
      tasks,
      createdAtUtc: nowUtc,
    };

    this.baselines.set(params.baselineId, snapshot);
    return snapshot;
  }

  /**
   * Approves an existing draft baseline, freezing it permanently.
   */
  approveBaseline(baselineId: string, approvedByUserId: string): ScheduleBaselineSnapshot {
    const existing = this.baselines.get(baselineId);
    if (!existing) {
      throw new BaselineNotFoundError(baselineId);
    }

    if (existing.isApproved) {
      return existing; // Already approved & immutable
    }

    const approved: ScheduleBaselineSnapshot = {
      ...existing,
      isApproved: true,
      approvedByUserId,
      approvedAtUtc: new Date().toISOString(),
    };

    this.baselines.set(baselineId, approved);
    return approved;
  }

  /**
   * Attempting to modify or overwrite an approved baseline throws BaselineImmutableError.
   */
  modifyDraftBaseline(
    baselineId: string,
    updates: { name?: string; description?: string }
  ): ScheduleBaselineSnapshot {
    const existing = this.baselines.get(baselineId);
    if (!existing) {
      throw new BaselineNotFoundError(baselineId);
    }

    if (existing.isApproved) {
      throw new BaselineImmutableError(baselineId, 'modify');
    }

    const updated: ScheduleBaselineSnapshot = {
      ...existing,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
    };

    this.baselines.set(baselineId, updated);
    return updated;
  }

  /**
   * Deleting an approved baseline throws BaselineImmutableError.
   */
  deleteBaseline(baselineId: string): void {
    const existing = this.baselines.get(baselineId);
    if (!existing) {
      throw new BaselineNotFoundError(baselineId);
    }

    if (existing.isApproved) {
      throw new BaselineImmutableError(baselineId, 'delete');
    }

    this.baselines.delete(baselineId);
  }

  getBaseline(baselineId: string): ScheduleBaselineSnapshot | undefined {
    return this.baselines.get(baselineId);
  }

  listBaselines(projectId: string): readonly ScheduleBaselineSnapshot[] {
    return Array.from(this.baselines.values()).filter(b => b.projectId === projectId);
  }
}

/**
 * Schedule Variance Analyzer
 * Computes deterministic date, duration, and float variances between
 * active schedule calculations and target approved baselines.
 */
export class ScheduleVarianceAnalyzer {
  /**
   * Computes variance report comparing active calculation to target approved baseline.
   */
  static computeVariance(
    baseline: ScheduleBaselineSnapshot,
    currentCalculation: TenantScheduleCalculationRecord,
    currentProject: TenantScheduleProject
  ): ScheduleVarianceReport {
    DateOnly.assertValid(baseline.projectFinishDate);
    DateOnly.assertValid(currentCalculation.projectFinishDate);

    const projectFinishVarianceDays = DateOnly.diffDays(
      currentCalculation.projectFinishDate,
      baseline.projectFinishDate
    );

    const activityVariances: Record<string, ActivityVarianceRecord> = {};
    let delayedActivitiesCount = 0;
    let aheadActivitiesCount = 0;
    let onTrackActivitiesCount = 0;

    const currentTasksMap = new Map<string, TenantTask>();
    for (const t of currentProject.tasks) {
      currentTasksMap.set(t.taskId, t);
    }

    for (const [taskId, baseTask] of Object.entries(baseline.tasks)) {
      const currentResult = currentCalculation.taskResults[taskId];
      const currentTask = currentTasksMap.get(taskId);

      if (!currentResult || !currentTask) {
        continue;
      }

      const startVarianceDays = DateOnly.diffDays(
        currentResult.earlyStart,
        baseTask.earlyStart
      );

      const finishVarianceDays = DateOnly.diffDays(
        currentResult.earlyFinish,
        baseTask.earlyFinish
      );

      const durationVarianceDays = currentTask.durationDays - baseTask.plannedDurationDays;
      const floatVarianceDays = currentResult.totalFloat - baseTask.totalFloat;

      let status: 'ahead' | 'on_track' | 'delayed' = 'on_track';
      if (finishVarianceDays > 0) {
        status = 'delayed';
        delayedActivitiesCount++;
      } else if (finishVarianceDays < 0) {
        status = 'ahead';
        aheadActivitiesCount++;
      } else {
        onTrackActivitiesCount++;
      }

      const criticalStatusChanged = currentResult.isCritical !== baseTask.isCritical;

      activityVariances[taskId] = {
        taskId,
        taskName: baseTask.name,
        baselineEarlyStart: baseTask.earlyStart,
        currentEarlyStart: currentResult.earlyStart,
        startVarianceDays,
        baselineEarlyFinish: baseTask.earlyFinish,
        currentEarlyFinish: currentResult.earlyFinish,
        finishVarianceDays,
        baselineDurationDays: baseTask.plannedDurationDays,
        currentDurationDays: currentTask.durationDays,
        durationVarianceDays,
        baselineTotalFloat: baseTask.totalFloat,
        currentTotalFloat: currentResult.totalFloat,
        floatVarianceDays,
        status,
        criticalStatusChanged,
        isCurrentlyCritical: currentResult.isCritical,
        wasBaselineCritical: baseTask.isCritical,
      };
    }

    return {
      reportId: `var-${baseline.baselineId}-${currentCalculation.revisionId}-${Date.now()}`,
      projectId: currentProject.projectId,
      baselineId: baseline.baselineId,
      comparisonRevisionId: currentCalculation.revisionId,
      dataDate: currentCalculation.dataDate,
      projectFinishVarianceDays,
      baselineProjectFinish: baseline.projectFinishDate,
      currentProjectFinish: currentCalculation.projectFinishDate,
      totalActivitiesCount: Object.keys(activityVariances).length,
      delayedActivitiesCount,
      aheadActivitiesCount,
      onTrackActivitiesCount,
      activityVariances,
      generatedAtUtc: new Date().toISOString(),
    };
  }
}

/**
 * Schedule Revision Explainer
 * Generates structured explanations of schedule shifts between revisions.
 */
export class ScheduleRevisionExplainer {
  /**
   * Explains schedule shifts between two sequential project calculation revisions.
   */
  static explainRevision(
    fromProject: TenantScheduleProject,
    fromCalculation: TenantScheduleCalculationRecord,
    toProject: TenantScheduleProject,
    toCalculation: TenantScheduleCalculationRecord
  ): ScheduleRevisionExplanation {
    const overallFinishShiftDays = DateOnly.diffDays(
      toCalculation.projectFinishDate,
      fromCalculation.projectFinishDate
    );

    const fromTasksMap = new Map<string, TenantTask>();
    for (const t of fromProject.tasks) fromTasksMap.set(t.taskId, t);

    const fromDepSet = new Set(
      fromProject.dependencies.map(d => `${d.predTaskId}->${d.succTaskId}:${d.type}:${d.lagDays}`)
    );
    const toDepSet = new Set(
      toProject.dependencies.map(d => `${d.predTaskId}->${d.succTaskId}:${d.type}:${d.lagDays}`)
    );

    const dependenciesChanged =
      fromDepSet.size !== toDepSet.size ||
      Array.from(fromDepSet).some(d => !toDepSet.has(d));

    const itemizedShifts: ActivityShiftExplanation[] = [];
    let progressShiftCount = 0;
    let durationShiftCount = 0;
    let dependencyShiftCount = 0;
    let constraintShiftCount = 0;

    for (const toTask of toProject.tasks) {
      const fromTask = fromTasksMap.get(toTask.taskId);
      const fromRes = fromCalculation.taskResults[toTask.taskId];
      const toRes = toCalculation.taskResults[toTask.taskId];

      if (!fromTask || !fromRes || !toRes) continue;

      const finishDiff = DateOnly.diffDays(toRes.earlyFinish, fromRes.earlyFinish);

      if (finishDiff !== 0) {
        let cause: RevisionShiftCauseCategory = 'PROGRESS_ACTUALS';
        let desc = 'Actual site progress caused date shift';

        if (
          toTask.progressPercent !== fromTask.progressPercent ||
          toTask.actualStartDate !== fromTask.actualStartDate ||
          toTask.actualFinishDate !== fromTask.actualFinishDate
        ) {
          cause = 'PROGRESS_ACTUALS';
          desc = `Site progress updated: percent ${fromTask.progressPercent}% -> ${toTask.progressPercent}%`;
          progressShiftCount++;
        } else if (toTask.durationDays !== fromTask.durationDays) {
          cause = 'DURATION_MODIFICATION';
          desc = `Planned duration modified: ${fromTask.durationDays} days -> ${toTask.durationDays} days`;
          durationShiftCount++;
        } else if (toTask.constraintType !== fromTask.constraintType || toTask.constraintDate !== fromTask.constraintDate) {
          cause = 'CONSTRAINT_CHANGE';
          desc = `Date constraint changed on activity`;
          constraintShiftCount++;
        } else if (dependenciesChanged) {
          cause = 'DEPENDENCY_MODIFICATION';
          desc = `Predecessor logic or network lag altered`;
          dependencyShiftCount++;
        }

        itemizedShifts.push({
          taskId: toTask.taskId,
          taskName: toTask.name,
          causeCategory: cause,
          description: desc,
          daysShifted: finishDiff,
          previousFinish: fromRes.earlyFinish,
          newFinish: toRes.earlyFinish,
        });
      }
    }

    // Determine primary cause
    let primaryCause: RevisionShiftCauseCategory = 'PROGRESS_ACTUALS';
    const maxCount = Math.max(progressShiftCount, durationShiftCount, dependencyShiftCount, constraintShiftCount);
    if (maxCount > 0) {
      if (maxCount === durationShiftCount) primaryCause = 'DURATION_MODIFICATION';
      else if (maxCount === dependencyShiftCount) primaryCause = 'DEPENDENCY_MODIFICATION';
      else if (maxCount === constraintShiftCount) primaryCause = 'CONSTRAINT_CHANGE';
      else primaryCause = 'PROGRESS_ACTUALS';
    }

    // Critical path shifts
    const fromCrit = new Set(fromCalculation.criticalPathTaskIds);
    const toCrit = new Set(toCalculation.criticalPathTaskIds);

    const newlyCriticalTaskIds = Array.from(toCrit).filter(id => !fromCrit.has(id));
    const noLongerCriticalTaskIds = Array.from(fromCrit).filter(id => !toCrit.has(id));

    return {
      explanationId: `exp-${fromCalculation.revisionId}-${toCalculation.revisionId}-${Date.now()}`,
      projectId: toProject.projectId,
      fromRevisionId: fromCalculation.revisionId,
      toRevisionId: toCalculation.revisionId,
      primaryCause,
      overallFinishShiftDays,
      itemizedShifts,
      criticalPathChanges: {
        newlyCriticalTaskIds,
        noLongerCriticalTaskIds,
      },
      generatedAtUtc: new Date().toISOString(),
    };
  }
}
