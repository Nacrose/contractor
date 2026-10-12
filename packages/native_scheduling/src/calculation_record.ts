/**
 * Versioned Schedule Calculation Records (M09-T02).
 *
 * Implements immutable records of CPM calculations, persisting:
 *  - Engine release tag and commit hash
 *  - Input schema version
 *  - Input payload digest (SHA-256) for auditability and idempotency
 *  - Exact date-only early/late dates and floats
 *  - Critical path membership
 */

import { DateOnlyString } from './date_only.js';

export interface ScheduledTaskResult {
  readonly taskId: string;
  readonly earlyStart: DateOnlyString;
  readonly earlyFinish: DateOnlyString;
  readonly lateStart: DateOnlyString;
  readonly lateFinish: DateOnlyString;
  readonly totalFloat: number;
  readonly freeFloat: number;
  readonly isCritical: boolean;
  readonly plannedDurationDays: number;
}

export interface TenantScheduleCalculationRecord {
  readonly calculationId: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly tenantId: string;
  readonly dataDate: DateOnlyString;
  readonly engineRelease: string; // e.g. "0.4.0b1"
  readonly inputSchemaVersion: number; // e.g. 1
  readonly inputDigest: string; // SHA-256 hash of inputs
  readonly calculatedAtUtc: string;
  readonly projectFinishDate: DateOnlyString;
  readonly criticalPathTaskIds: readonly string[];
  readonly totalTasksCount: number;
  readonly taskResults: Readonly<Record<string, ScheduledTaskResult>>;
}
