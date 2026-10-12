/**
 * TruePPM Scheduler Bidirectional Data Bridge (M09-T02).
 *
 * Implements bidirectional translation between Contractor tenant models
 * and TruePPM JSON schema:
 *  - Maps stable entity IDs without data loss or re-indexing
 *  - Enforces date-only ISO strings (YYYY-MM-DD)
 *  - Computes deterministic input digests for auditability
 *  - Captures schema version and engine release
 */

import { createHash } from 'node:crypto';
import { DateOnly } from './date_only.js';
import { TenantScheduleProject } from './models.js';
import { TenantScheduleCalculationRecord, ScheduledTaskResult } from './calculation_record.js';

export const CURRENT_INPUT_SCHEMA_VERSION = 1;
export const DEFAULT_TRUEPPM_RELEASE = '0.4.0b1';

export interface TruePpmTaskInput {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly calendar_id: string;
  readonly snet_constraint?: string;
}

export interface TruePpmDependencyInput {
  readonly pred_id: string;
  readonly succ_id: string;
  readonly type: string;
  readonly lag: number;
}

export interface TruePpmCalendarInput {
  readonly id: string;
  readonly working_days: readonly number[];
  readonly holidays: readonly string[];
}

export interface TruePpmInputPayload {
  readonly data_date: string;
  readonly calendars: readonly TruePpmCalendarInput[];
  readonly tasks: readonly TruePpmTaskInput[];
  readonly dependencies: readonly TruePpmDependencyInput[];
}

export interface TruePpmOutputTask {
  readonly early_start: string;
  readonly early_finish: string;
  readonly late_start: string;
  readonly late_finish: string;
  readonly total_float: number;
  readonly free_float: number;
  readonly is_critical: boolean;
  readonly duration: number;
}

export interface TruePpmOutputPayload {
  readonly status: string;
  readonly data_date: string;
  readonly project_finish: string;
  readonly critical_path: readonly string[];
  readonly total_tasks: number;
  readonly tasks: Readonly<Record<string, TruePpmOutputTask>>;
}

export interface TruePpmCalculationPackage {
  readonly schemaVersion: number;
  readonly inputDigest: string;
  readonly payload: TruePpmInputPayload;
}

export class SchedulingBridge {
  /**
   * Translates Contractor project domain model into TruePPM calculation payload.
   */
  static toTruePpmPayload(
    project: TenantScheduleProject,
    schemaVersion = CURRENT_INPUT_SCHEMA_VERSION
  ): TruePpmCalculationPackage {
    DateOnly.assertValid(project.dataDate);

    // Map calendars (translating Sunday=0 to TruePPM standard where Monday=0, Sunday=6)
    const calendars: TruePpmCalendarInput[] = project.calendars.map(cal => {
      // In Contractor: 0 = Sun, 1 = Mon, ..., 6 = Sat
      // In TruePPM Python weekday(): 0 = Mon, 1 = Tue, ..., 5 = Sat, 6 = Sun
      const truePpmWorkingDays = cal.workingDays.map(wd => {
        return wd === 0 ? 6 : wd - 1;
      });

      return {
        id: cal.calendarId,
        working_days: truePpmWorkingDays,
        holidays: cal.holidays.map(h => DateOnly.assertValid(h))
      };
    });

    // Map tasks
    const tasks: TruePpmTaskInput[] = project.tasks.map(t => {
      const taskInput: {
        id: string;
        name: string;
        duration: number;
        calendar_id: string;
        snet_constraint?: string;
      } = {
        id: t.taskId,
        name: t.name,
        duration: t.durationDays,
        calendar_id: t.calendarId
      };

      if (t.constraintType === 'SNET' && t.constraintDate) {
        taskInput.snet_constraint = DateOnly.assertValid(t.constraintDate);
      }

      return taskInput;
    });

    // Map dependencies
    const dependencies: TruePpmDependencyInput[] = project.dependencies.map(d => ({
      pred_id: d.predTaskId,
      succ_id: d.succTaskId,
      type: d.type,
      lag: d.lagDays
    }));

    const payload: TruePpmInputPayload = {
      data_date: project.dataDate,
      calendars,
      tasks,
      dependencies
    };

    // Calculate deterministic SHA-256 digest
    const jsonStr = JSON.stringify(payload);
    const inputDigest = `sha256:${createHash('sha256').update(jsonStr).digest('hex')}`;

    return {
      schemaVersion,
      inputDigest,
      payload
    };
  }

  /**
   * Translates TruePPM calculation output into an immutable Contractor calculation record.
   */
  static fromTruePpmResult(
    result: TruePpmOutputPayload,
    project: TenantScheduleProject,
    revisionId: string,
    engineRelease = DEFAULT_TRUEPPM_RELEASE,
    inputDigest = 'sha256:unknown'
  ): TenantScheduleCalculationRecord {
    if (result.status !== 'success') {
      throw new Error(`TruePPM calculation failed with status "${result.status}"`);
    }

    const taskResults: Record<string, ScheduledTaskResult> = {};

    for (const tenantTask of project.tasks) {
      const tid = tenantTask.taskId;
      const res = result.tasks[tid];

      if (!res) {
        throw new Error(`Integrity error: TruePPM omitted result for task "${tid}"`);
      }

      DateOnly.assertValid(res.early_start);
      DateOnly.assertValid(res.early_finish);
      DateOnly.assertValid(res.late_start);
      DateOnly.assertValid(res.late_finish);

      taskResults[tid] = {
        taskId: tid,
        earlyStart: res.early_start,
        earlyFinish: res.early_finish,
        lateStart: res.late_start,
        lateFinish: res.late_finish,
        totalFloat: res.total_float,
        freeFloat: res.free_float,
        isCritical: res.is_critical,
        plannedDurationDays: tenantTask.durationDays
      };
    }

    DateOnly.assertValid(result.project_finish);

    return {
      calculationId: `calc-${project.projectId}-${revisionId}-${Date.now()}`,
      projectId: project.projectId,
      revisionId,
      tenantId: project.tenantId,
      dataDate: result.data_date,
      engineRelease,
      inputSchemaVersion: CURRENT_INPUT_SCHEMA_VERSION,
      inputDigest,
      calculatedAtUtc: new Date().toISOString(),
      projectFinishDate: result.project_finish,
      criticalPathTaskIds: result.critical_path,
      totalTasksCount: project.tasks.length,
      taskResults
    };
  }
}
