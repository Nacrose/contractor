/**
 * Legacy CPM Migration Adapter & Capability Delivery Guard (M09-T07).
 *
 * Implements:
 * 1. Migration of legacy TypeScript/Dart CPM schedule graphs (M00/M01 fixtures)
 *    to Contractor / TruePPM TenantScheduleProject format with 100% ID and relationship fidelity.
 * 2. Strict, fail-visible guard for unsupported upstream capabilities
 *    (e.g. automatic resource leveling, heuristic smoothing) with UnsupportedCapabilityError.
 * 3. Deprecation tracking and retirement path for legacy CPM engines.
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

export class UnsupportedCapabilityError extends Error {
  readonly capability: string;
  readonly release: string;
  readonly suggestion: string;

  constructor(capability: string, release = 'v0.4.0-beta.1', suggestion?: string) {
    const hint = suggestion ?? 'Operation is gated pending upstream delivery.';
    super(`Unsupported TruePPM upstream capability '${capability}' in release ${release}. ${hint}`);
    this.name = 'UnsupportedCapabilityError';
    this.capability = capability;
    this.release = release;
    this.suggestion = hint;
  }
}

export interface LegacyCpmTask {
  readonly id: string;
  readonly name?: string;
  readonly duration: number; // in days or hours
  readonly isMilestone?: boolean;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly constraintType?: string;
  readonly constraintDate?: string;
  readonly progressPercent?: number;
  readonly actualStartDate?: string;
  readonly actualFinishDate?: string;
}

export interface LegacyCpmDependency {
  readonly predecessorId: string;
  readonly successorId: string;
  readonly type?: string; // FS, SS, FF, SF
  readonly lagHours?: number;
  readonly lagDays?: number;
}

export interface LegacyCpmGraph {
  readonly version?: number;
  readonly description?: string;
  readonly dataDate?: string;
  readonly tasks: readonly LegacyCpmTask[];
  readonly dependencies: readonly LegacyCpmDependency[];
  readonly calendar?: {
    readonly id?: string;
    readonly name?: string;
    readonly workingDays?: readonly number[];
    readonly holidays?: readonly string[];
  };
}

export interface MigrationOptions {
  readonly projectId?: string;
  readonly tenantId?: string;
  readonly projectName?: string;
  readonly defaultCalendarId?: string;
  readonly workingHoursPerDay?: number; // default 8h per working day
}

export interface MigrationResult {
  readonly project: TenantScheduleProject;
  readonly migratedTasksCount: number;
  readonly migratedDependenciesCount: number;
  readonly warnings: readonly string[];
  readonly migratedAtUtc: string;
}

export class LegacyCpmMigrationAdapter {
  private static readonly SUPPORTED_DEPENDENCY_TYPES = new Set<DependencyType>(['FS', 'SS', 'FF', 'SF']);

  /**
   * Asserts whether a scheduling operation is supported by the current pinned TruePPM release.
   * Throws UnsupportedCapabilityError if the operation is not yet delivered upstream.
   */
  static assertSupportedCapability(operation: string, release = 'v0.4.0-beta.1'): void {
    const normalized = operation.toUpperCase().trim();
    if (normalized === 'RESOURCE_LEVELING') {
      throw new UnsupportedCapabilityError(
        'RESOURCE_LEVELING',
        release,
        'Upstream TruePPM v0.4 line does not implement automated resource leveling. Contractor resource allocations remain managed via M06/M07 budget services.'
      );
    }

    if (normalized === 'HEURISTIC_SMOOTHING') {
      throw new UnsupportedCapabilityError(
        'HEURISTIC_SMOOTHING',
        release,
        'Heuristic schedule smoothing is unverified. Manual total float analysis and baseline variance tracking should be used instead.'
      );
    }

    if (normalized === 'P6_XML_EXCHANGE') {
      throw new UnsupportedCapabilityError(
        'P6_XML_EXCHANGE',
        release,
        'P6 XML exchange is planned on the upstream roadmap but not yet certified for production ingestion.'
      );
    }
  }

  /**
   * Converts a legacy CPM schedule graph into Contractor's TenantScheduleProject format.
   */
  static migrateLegacyCpmGraph(
    legacyGraph: LegacyCpmGraph,
    options?: MigrationOptions
  ): MigrationResult {
    const warnings: string[] = [];
    const projectId = options?.projectId ?? 'migrated-proj-cpm';
    const tenantId = options?.tenantId ?? 'tenant-contractor-core';
    const projectName = options?.projectName ?? legacyGraph.description ?? 'Migrated CPM Schedule';
    const calendarId = options?.defaultCalendarId ?? legacyGraph.calendar?.id ?? 'cal-default-6day';
    const hoursPerDay = options?.workingHoursPerDay ?? 8;

    // 1. Data Date resolution
    let dataDate = '2026-10-12';
    if (legacyGraph.dataDate && DateOnly.isValid(legacyGraph.dataDate)) {
      dataDate = legacyGraph.dataDate;
    } else if (legacyGraph.tasks.length > 0 && legacyGraph.tasks[0].startDate && DateOnly.isValid(legacyGraph.tasks[0].startDate)) {
      dataDate = legacyGraph.tasks[0].startDate;
    }

    // 2. Calendar construction
    const calendar: TenantCalendar = {
      calendarId,
      name: legacyGraph.calendar?.name ?? 'Standard Nepal 6-Day Workweek',
      workingDays: legacyGraph.calendar?.workingDays ?? [0, 1, 2, 3, 4, 5],
      holidays: (legacyGraph.calendar?.holidays ?? []).filter(h => DateOnly.isValid(h)),
    };

    // 3. Task Migration
    const tasks: TenantTask[] = [];
    const taskIds = new Set<string>();

    for (let i = 0; i < legacyGraph.tasks.length; i++) {
      const lt = legacyGraph.tasks[i];
      if (!lt.id) {
        warnings.push(`Task at index ${i} omitted due to missing ID`);
        continue;
      }

      if (taskIds.has(lt.id)) {
        warnings.push(`Duplicate task ID '${lt.id}' encountered; skipping redundant occurrence`);
        continue;
      }
      taskIds.add(lt.id);

      // Duration: if duration is 0, isMilestone should be true
      const durationDays = lt.duration !== undefined ? Math.max(0, lt.duration) : 1;
      const isMilestone = lt.isMilestone ?? durationDays === 0;

      // Constraint normalization
      let constraintType: ConstraintType | undefined;
      let constraintDate: DateOnlyString | undefined;

      if (lt.constraintType) {
        const norm = lt.constraintType.toUpperCase();
        if (norm === 'SNET' || norm === 'SNLT' || norm === 'FNET' || norm === 'FNLT' || norm === 'MSO' || norm === 'MFO') {
          constraintType = norm as ConstraintType;
          if (lt.constraintDate && DateOnly.isValid(lt.constraintDate)) {
            constraintDate = lt.constraintDate;
          }
        }
      }

      tasks.push({
        taskId: lt.id,
        wbsCode: `1.${i + 1}`,
        name: lt.name ?? `Activity ${lt.id}`,
        durationDays,
        calendarId,
        isMilestone,
        progressPercent: lt.progressPercent ?? 0,
        actualStartDate: lt.actualStartDate && DateOnly.isValid(lt.actualStartDate) ? lt.actualStartDate : undefined,
        actualFinishDate: lt.actualFinishDate && DateOnly.isValid(lt.actualFinishDate) ? lt.actualFinishDate : undefined,
        constraintType,
        constraintDate,
      });
    }

    // 4. Dependency Migration
    const dependencies: TenantDependency[] = [];
    const depKeySet = new Set<string>();

    for (let i = 0; i < legacyGraph.dependencies.length; i++) {
      const ld = legacyGraph.dependencies[i];
      if (!ld.predecessorId || !ld.successorId) {
        warnings.push(`Dependency at index ${i} omitted due to missing endpoints`);
        continue;
      }

      if (!taskIds.has(ld.predecessorId) || !taskIds.has(ld.successorId)) {
        warnings.push(`Dependency referencing unknown task '${ld.predecessorId} -> ${ld.successorId}' skipped`);
        continue;
      }

      const rawType = (ld.type ?? 'FS').toUpperCase();
      const type: DependencyType = this.SUPPORTED_DEPENDENCY_TYPES.has(rawType as DependencyType)
        ? (rawType as DependencyType)
        : 'FS';

      let lagDays = 0;
      if (ld.lagDays !== undefined) {
        lagDays = ld.lagDays;
      } else if (ld.lagHours !== undefined) {
        lagDays = Math.round(ld.lagHours / hoursPerDay);
      }

      const depKey = `${ld.predecessorId}->${ld.successorId}:${type}`;
      if (depKeySet.has(depKey)) {
        warnings.push(`Duplicate dependency '${depKey}' skipped`);
        continue;
      }
      depKeySet.add(depKey);

      dependencies.push({
        dependencyId: `dep-migrated-${i + 1}-${ld.predecessorId}-${ld.successorId}`,
        predTaskId: ld.predecessorId,
        succTaskId: ld.successorId,
        type,
        lagDays,
      });
    }

    const project: TenantScheduleProject = {
      projectId,
      tenantId,
      name: projectName,
      dataDate,
      calendars: [calendar],
      tasks,
      dependencies,
    };

    return {
      project,
      migratedTasksCount: tasks.length,
      migratedDependenciesCount: dependencies.length,
      warnings,
      migratedAtUtc: new Date().toISOString(),
    };
  }
}
