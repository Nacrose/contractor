/**
 * Scheduling Service Adapter, Financial Separation & Security Guards (M09-T03).
 *
 * Implements:
 *  1. Caller security context & authorization guards:
 *     - Identity, tenant scope, project membership, permissions, and fiscal year locks.
 *  2. Idempotent daily progress posting (replayed messages cannot double-count progress).
 *  3. Strict financial separation:
 *     - Contractual BoQ client billing rates vs internal Running Account (RA) cost rates.
 *     - Exact-decimal financial serialization preventing floating-point accumulation.
 *  4. Single authorized acceptance path for schedule calculation and baseline governance.
 */

import { DateOnlyString, DateOnly } from './date_only.js';
import { TenantScheduleProject, TenantTask } from './models.js';
import { TenantScheduleCalculationRecord } from './calculation_record.js';
import { SchedulingBridge, TruePpmOutputPayload } from './trueppm_bridge.js';
import { SchedulingSyncFeedAdapter } from './sync_feed_adapter.js';

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export type SchedulingErrorCode =
  | 'PERMISSION_DENIED'
  | 'TENANT_MISMATCH'
  | 'PROJECT_MISMATCH'
  | 'FISCAL_LOCK_ENGAGED'
  | 'TASK_NOT_FOUND'
  | 'INVALID_PROGRESS_PERCENT'
  | 'EXACT_DECIMAL_FORMAT_ERROR';

export class SchedulingSecurityError extends Error {
  constructor(
    public readonly code: SchedulingErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SchedulingSecurityError';
  }
}

// ---------------------------------------------------------------------------
// Security Context
// ---------------------------------------------------------------------------

export interface CallerContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly isFiscalLocked?: boolean;
}

// ---------------------------------------------------------------------------
// Exact Decimal Formatter Helper
// ---------------------------------------------------------------------------

export function formatExactDecimal(val: number, decimalPlaces = 2): string {
  if (!Number.isFinite(val)) {
    throw new SchedulingSecurityError(
      'EXACT_DECIMAL_FORMAT_ERROR',
      `Cannot format non-finite number "${val}" to exact decimal`
    );
  }
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round(val * factor) / factor;
  return rounded.toFixed(decimalPlaces);
}

// ---------------------------------------------------------------------------
// Progress Posting Models
// ---------------------------------------------------------------------------

export interface ProgressPostingRequest {
  readonly taskId: string;
  readonly progressDate: DateOnlyString;
  readonly progressPercent: number; // 0 to 100
  readonly actualQuantity?: number;
  readonly actualStartDate?: DateOnlyString;
  readonly actualFinishDate?: DateOnlyString;
  readonly idempotencyKey: string;
  readonly source: 'daily_log' | 'site_inspection' | 'subcontractor_claim';
}

export interface ProgressPostingReceipt {
  readonly receiptId: string;
  readonly taskId: string;
  readonly idempotencyKey: string;
  readonly postedProgressPercent: number;
  readonly actualStartDate?: DateOnlyString;
  readonly actualFinishDate?: DateOnlyString;
  readonly postedAtUtc: string;
  readonly isIdempotentReplay: boolean;
}

// ---------------------------------------------------------------------------
// Financial Separation Models (BoQ Billing vs RA Cost)
// ---------------------------------------------------------------------------

export interface ActivityFinancialAllocation {
  readonly taskId: string;
  readonly plannedQuantity: number;
  readonly contractualBoqRate: string; // Exact decimal client billing unit rate (e.g. "125.00")
  readonly runningAccountCostRate: string; // Exact decimal internal cost rate (e.g. "80.00")
  readonly currency: string;
}

export interface ActivityFinancialEvaluation {
  readonly taskId: string;
  readonly currency: string;
  readonly plannedValueBoq: string; // plannedQuantity * contractualBoqRate
  readonly plannedCostRA: string; // plannedQuantity * runningAccountCostRate
  readonly earnedValueBoq: string; // (progressPercent / 100) * plannedValueBoq
  readonly actualCostRA: string; // actualQuantity * runningAccountCostRate or progress-driven
  readonly costVariance: string; // earnedValueBoq - actualCostRA (or EV - AC)
}

// ---------------------------------------------------------------------------
// Scheduling Service Adapter
// ---------------------------------------------------------------------------

export class SchedulingServiceAdapter {
  private readonly receiptsByIdempotencyKey = new Map<string, ProgressPostingReceipt>();
  private readonly financialAllocations = new Map<string, ActivityFinancialAllocation>();
  private currentProject: TenantScheduleProject;
  private readonly syncFeed: SchedulingSyncFeedAdapter;

  constructor(
    initialProject: TenantScheduleProject,
    syncFeed?: SchedulingSyncFeedAdapter
  ) {
    this.currentProject = initialProject;
    this.syncFeed = syncFeed ?? new SchedulingSyncFeedAdapter();
  }

  getProject(): TenantScheduleProject {
    return this.currentProject;
  }

  setFinancialAllocation(allocation: ActivityFinancialAllocation): void {
    formatExactDecimal(parseFloat(allocation.contractualBoqRate));
    formatExactDecimal(parseFloat(allocation.runningAccountCostRate));
    this.financialAllocations.set(allocation.taskId, allocation);
  }

  // -------------------------------------------------------------------------
  // Security Guards
  // -------------------------------------------------------------------------

  private assertPermissions(caller: CallerContext, operation: string, requiresBaselineUnlocked = false): void {
    if (!caller.userId || caller.userId.trim() === '') {
      throw new SchedulingSecurityError(
        'PERMISSION_DENIED',
        'Anonymous callers cannot modify schedules: identity guard failed'
      );
    }

    if (caller.tenantId !== this.currentProject.tenantId) {
      throw new SchedulingSecurityError(
        'TENANT_MISMATCH',
        `Tenant mismatch: caller tenant "${caller.tenantId}" cannot access project tenant "${this.currentProject.tenantId}"`,
        { callerTenant: caller.tenantId, targetTenant: this.currentProject.tenantId }
      );
    }

    if (caller.projectId !== this.currentProject.projectId) {
      throw new SchedulingSecurityError(
        'PROJECT_MISMATCH',
        `Project mismatch: caller project "${caller.projectId}" cannot access target project "${this.currentProject.projectId}"`,
        { callerProject: caller.projectId, targetProject: this.currentProject.projectId }
      );
    }

    if (requiresBaselineUnlocked && caller.isFiscalLocked) {
      throw new SchedulingSecurityError(
        'FISCAL_LOCK_ENGAGED',
        `Cannot perform "${operation}": project "${caller.projectId}" is under fiscal year lock`,
        { projectId: caller.projectId }
      );
    }

    const hasPermission =
      caller.permissions.includes('schedule.update') ||
      caller.permissions.includes('daily_log.progress') ||
      caller.roles.includes('scheduler') ||
      caller.roles.includes('project_manager') ||
      caller.roles.includes('admin');

    if (!hasPermission) {
      throw new SchedulingSecurityError(
        'PERMISSION_DENIED',
        `Caller "${caller.userId}" lacks required permission for operation "${operation}"`,
        { roles: caller.roles, permissions: caller.permissions }
      );
    }
  }

  // -------------------------------------------------------------------------
  // Idempotent Daily Progress Posting
  // -------------------------------------------------------------------------

  async postDailyProgress(
    caller: CallerContext,
    request: ProgressPostingRequest
  ): Promise<ProgressPostingReceipt> {
    this.assertPermissions(caller, 'progress.post');

    // 1. Idempotency Check: if identical idempotency key was previously processed, return cached receipt
    const existing = this.receiptsByIdempotencyKey.get(request.idempotencyKey);
    if (existing) {
      return {
        ...existing,
        isIdempotentReplay: true
      };
    }

    // 2. Validate task existence
    const taskIndex = this.currentProject.tasks.findIndex(t => t.taskId === request.taskId);
    if (taskIndex === -1) {
      throw new SchedulingSecurityError(
        'TASK_NOT_FOUND',
        `Task with ID "${request.taskId}" was not found in project "${this.currentProject.projectId}"`,
        { taskId: request.taskId }
      );
    }

    // 3. Validate progress percentage
    if (request.progressPercent < 0 || request.progressPercent > 100) {
      throw new SchedulingSecurityError(
        'INVALID_PROGRESS_PERCENT',
        `Invalid progress percent "${request.progressPercent}". Must be between 0 and 100.`
      );
    }

    DateOnly.assertValid(request.progressDate);
    if (request.actualStartDate) DateOnly.assertValid(request.actualStartDate);
    if (request.actualFinishDate) DateOnly.assertValid(request.actualFinishDate);

    // 4. Update task state in project model
    const existingTask = this.currentProject.tasks[taskIndex];
    const updatedTask: TenantTask = {
      ...existingTask,
      progressPercent: request.progressPercent,
      actualStartDate: request.actualStartDate || existingTask.actualStartDate,
      actualFinishDate: request.actualFinishDate || existingTask.actualFinishDate
    };

    const newTasks = [...this.currentProject.tasks];
    newTasks[taskIndex] = updatedTask;

    this.currentProject = {
      ...this.currentProject,
      tasks: newTasks
    };

    const receipt: ProgressPostingReceipt = {
      receiptId: `rcpt-prog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      taskId: request.taskId,
      idempotencyKey: request.idempotencyKey,
      postedProgressPercent: request.progressPercent,
      actualStartDate: updatedTask.actualStartDate,
      actualFinishDate: updatedTask.actualFinishDate,
      postedAtUtc: new Date().toISOString(),
      isIdempotentReplay: false
    };

    this.receiptsByIdempotencyKey.set(request.idempotencyKey, receipt);
    return receipt;
  }

  // -------------------------------------------------------------------------
  // Financial Evaluation (Contractual BoQ Rate vs RA Cost Rate)
  // -------------------------------------------------------------------------

  evaluateTaskFinancials(caller: CallerContext, taskId: string): ActivityFinancialEvaluation {
    this.assertPermissions(caller, 'financial.read');

    const task = this.currentProject.tasks.find(t => t.taskId === taskId);
    if (!task) {
      throw new SchedulingSecurityError(
        'TASK_NOT_FOUND',
        `Task with ID "${taskId}" not found`,
        { taskId }
      );
    }

    const alloc = this.financialAllocations.get(taskId);
    if (!alloc) {
      throw new SchedulingSecurityError(
        'TASK_NOT_FOUND',
        `No financial allocation defined for task "${taskId}"`,
        { taskId }
      );
    }

    const boqRateNum = parseFloat(alloc.contractualBoqRate);
    const raCostRateNum = parseFloat(alloc.runningAccountCostRate);

    // Planned Value (PV) = Planned Quantity * Contractual BoQ Billing Rate
    const plannedValueBoqNum = alloc.plannedQuantity * boqRateNum;
    // Planned Cost = Planned Quantity * Internal RA Cost Rate
    const plannedCostRaNum = alloc.plannedQuantity * raCostRateNum;

    // Earned Value (EV) = (Progress Percent / 100) * Planned Value (BoQ)
    const earnedValueBoqNum = (task.progressPercent / 100) * plannedValueBoqNum;

    // Actual Cost (AC) = (Progress Percent / 100) * Planned Cost (RA)
    const actualCostRaNum = (task.progressPercent / 100) * plannedCostRaNum;

    // Cost Variance = Earned Value - Actual Cost
    const costVarianceNum = earnedValueBoqNum - actualCostRaNum;

    return {
      taskId,
      currency: alloc.currency,
      plannedValueBoq: formatExactDecimal(plannedValueBoqNum, 2),
      plannedCostRA: formatExactDecimal(plannedCostRaNum, 2),
      earnedValueBoq: formatExactDecimal(earnedValueBoqNum, 2),
      actualCostRA: formatExactDecimal(actualCostRaNum, 2),
      costVariance: formatExactDecimal(costVarianceNum, 2)
    };
  }

  // -------------------------------------------------------------------------
  // Server Schedule Recalculation Mediation
  // -------------------------------------------------------------------------

  async recalculateProjectSchedule(
    caller: CallerContext,
    revisionId: string,
    executeTruePpm: (input: any) => Promise<TruePpmOutputPayload>
  ): Promise<TenantScheduleCalculationRecord> {
    this.assertPermissions(caller, 'schedule.calculate', true);

    const calcPackage = SchedulingBridge.toTruePpmPayload(this.currentProject);
    const engineResult = await executeTruePpm(calcPackage.payload);

    const calculationRecord = SchedulingBridge.fromTruePpmResult(
      engineResult,
      this.currentProject,
      revisionId,
      '0.4.0b1',
      calcPackage.inputDigest
    );

    this.syncFeed.emitCalculationEvent(calculationRecord);
    return calculationRecord;
  }
}
