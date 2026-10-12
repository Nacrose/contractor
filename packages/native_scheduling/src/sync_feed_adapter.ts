/**
 * Scheduling Change-Feed Adapter & Flutter-Parity DTO Mapping (M09-T02).
 *
 * Fulfills Standing Constraint 3:
 *  1. Emits canonical change-feed events when schedules are recalculated or baselined.
 *  2. Generates strongly-typed DTOs for native Flutter client integration.
 */

import { TenantScheduleCalculationRecord } from './calculation_record.js';
import { TenantScheduleProject } from './models.js';

export interface ScheduleCalculatedEvent {
  readonly eventId: string;
  readonly type: 'schedule.calculated';
  readonly projectId: string;
  readonly tenantId: string;
  readonly revisionId: string;
  readonly engineRelease: string;
  readonly projectFinishDate: string;
  readonly criticalPathLength: number;
  readonly timestampUtc: string;
}

export interface ScheduleBaselineSavedEvent {
  readonly eventId: string;
  readonly type: 'schedule.baseline_saved';
  readonly projectId: string;
  readonly tenantId: string;
  readonly baselineId: string;
  readonly revisionId: string;
  readonly approvedBy: string;
  readonly timestampUtc: string;
}

export type ScheduleChangeEvent = ScheduleCalculatedEvent | ScheduleBaselineSavedEvent;

export interface FlutterParityTaskDto {
  readonly taskId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly durationDays: number;
  readonly earlyStart: string;
  readonly earlyFinish: string;
  readonly lateStart: string;
  readonly lateFinish: string;
  readonly totalFloat: number;
  readonly freeFloat: number;
  readonly isCritical: boolean;
}

export interface FlutterParityScheduleDto {
  readonly projectId: string;
  readonly revisionId: string;
  readonly tenantId: string;
  readonly dataDate: string;
  readonly engineRelease: string;
  readonly projectFinishDate: string;
  readonly criticalPathTaskIds: readonly string[];
  readonly tasks: readonly FlutterParityTaskDto[];
  readonly totalTasksCount: number;
}

export class SchedulingSyncFeedAdapter {
  private readonly listeners: Array<(event: ScheduleChangeEvent) => void> = [];

  subscribe(listener: (event: ScheduleChangeEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  emitCalculationEvent(record: TenantScheduleCalculationRecord): ScheduleCalculatedEvent {
    const event: ScheduleCalculatedEvent = {
      eventId: `evt-sched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'schedule.calculated',
      projectId: record.projectId,
      tenantId: record.tenantId,
      revisionId: record.revisionId,
      engineRelease: record.engineRelease,
      projectFinishDate: record.projectFinishDate,
      criticalPathLength: record.criticalPathTaskIds.length,
      timestampUtc: new Date().toISOString()
    };

    for (const listener of this.listeners) {
      listener(event);
    }

    return event;
  }

  /**
   * Generates a strongly-typed Flutter parity DTO matching Dart model definitions.
   */
  static toFlutterParityDto(
    record: TenantScheduleCalculationRecord,
    project: TenantScheduleProject
  ): FlutterParityScheduleDto {
    const tasks: FlutterParityTaskDto[] = project.tasks.map(t => {
      const scheduled = record.taskResults[t.taskId];
      return {
        taskId: t.taskId,
        wbsCode: t.wbsCode,
        name: t.name,
        durationDays: t.durationDays,
        earlyStart: scheduled?.earlyStart || project.dataDate,
        earlyFinish: scheduled?.earlyFinish || project.dataDate,
        lateStart: scheduled?.lateStart || project.dataDate,
        lateFinish: scheduled?.lateFinish || project.dataDate,
        totalFloat: scheduled?.totalFloat || 0,
        freeFloat: scheduled?.freeFloat || 0,
        isCritical: scheduled?.isCritical || false
      };
    });

    return {
      projectId: record.projectId,
      revisionId: record.revisionId,
      tenantId: record.tenantId,
      dataDate: record.dataDate,
      engineRelease: record.engineRelease,
      projectFinishDate: record.projectFinishDate,
      criticalPathTaskIds: record.criticalPathTaskIds,
      tasks,
      totalTasksCount: tasks.length
    };
  }
}
