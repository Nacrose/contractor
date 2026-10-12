/**
 * Construction Schedule Tenant Domain Models (M09-T02).
 *
 * Captures stable entity identifiers, WBS hierarchy, calendar associations,
 * duration constraints, and contractual rates without leaking TruePPM internal state.
 */

import { DateOnlyString } from './date_only.js';

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';
export type ConstraintType = 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO';

export interface TenantCalendar {
  readonly calendarId: string;
  readonly name: string;
  readonly workingDays: readonly number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  readonly holidays: readonly DateOnlyString[];
}

export interface TenantTask {
  readonly taskId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly durationDays: number;
  readonly durationHours?: number;
  readonly calendarId: string;
  readonly isMilestone: boolean;
  readonly progressPercent: number; // 0 to 100
  readonly actualStartDate?: DateOnlyString;
  readonly actualFinishDate?: DateOnlyString;
  readonly constraintType?: ConstraintType;
  readonly constraintDate?: DateOnlyString;
}

export interface TenantDependency {
  readonly dependencyId: string;
  readonly predTaskId: string;
  readonly succTaskId: string;
  readonly type: DependencyType;
  readonly lagDays: number;
}

export interface TenantRate {
  readonly rateId: string;
  readonly taskId: string;
  readonly resourceType: 'LABOR' | 'EQUIPMENT' | 'MATERIAL' | 'SUBCONTRACTOR';
  readonly unitRate: string; // Exact-decimal financial string (e.g. "1250.00")
  readonly currency: string;
}

export interface TenantScheduleProject {
  readonly projectId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly dataDate: DateOnlyString;
  readonly calendars: readonly TenantCalendar[];
  readonly tasks: readonly TenantTask[];
  readonly dependencies: readonly TenantDependency[];
  readonly rates?: readonly TenantRate[];
}
