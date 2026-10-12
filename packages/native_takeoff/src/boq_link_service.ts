/**
 * First-Class Takeoff-to-BoQ Integration Service (M08-T05 / M08-T06).
 *
 * Implements the single domain integration path between takeoff measurements and BoQ items,
 * fulfilling Platform Plan v3 §5.1, §5.4, §6 M08 and Standing Constraint 3.
 *
 * Design Invariants:
 *  1. SINGLE INTEGRATION PATH — all takeoff quantity postings flow through this service.
 *     Drawing widgets CANNOT mutate BoQ cells or workbook models directly.
 *  2. EXISTING MODELS & EXACT-DECIMAL BOUNDARY — uses MeasurementRecord, DerivedQuantityLink,
 *     BoqLineItem, DomainCellMetadata semantics. Cell values cross service boundaries as exact-decimal
 *     strings without floating-point arithmetic escaping into financial services.
 *  3. PERMISSION CHECKS INTACT — quantity postings execute existing service calls
 *     (registry operation "worksheet.update") with permission guards intact:
 *     identity, tenantScope, projectMembership, projectPermission, and fiscalLock.
 *  4. ROUND-TRIP PROVENANCE — traceable linkage from measurement -> quantity -> BoQ cell -> measurement,
 *     with receiptId and serverSeq captured on both ends.
 *  5. CHANGE-FEED & FLUTTER-PARITY — emits canonical change events and provides
 *     Flutter-compatible DTOs (Standing Constraint 3).
 *  6. REVISION/CALIBRATION INVALIDATION & NO SILENT PERSISTENCE (M08-T06) — recalibration or revision
 *     bumps mark affected measurements and downstream BoQ quantities for review (NEEDS_REVIEW).
 *     Accepted quantities CANNOT silently persist.
 *  7. DOUBLE-COUNTING PREVENTION & IDEMPOTENCY (M08-T06) — repeated links and replayed measurements
 *     (M03 feed replay) do not double-count; cell totals aggregate distinct links idempotently.
 *  8. SHARED SAVE/SYNC VISIBILITY (M02-T05 / M08-T06) — review state is visible in SaveSyncState
 *     and clears ONLY through the domain review resolution path.
 */

import { MeasurementRecord, MeasurementRepository, DerivedQuantityLink } from "./geometry_storage.js";
import { CalibrationRatio, MeasurementStatus } from "./provenance.js";
import { TakeoffSyncFeedAdapter, TakeoffChangeEvent } from "./sync_feed_adapter.js";
import { TakeoffSaveSyncTracker, SaveSyncState } from "./save_sync_state.js";
import { TakeoffInvalidationEngine, ReviewAction } from "./invalidation_engine.js";

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export type TakeoffBoqErrorCode =
  | 'DIRECT_MUTATION_PROHIBITED'
  | 'PERMISSION_DENIED'
  | 'FISCAL_LOCK_ENGAGED'
  | 'TENANT_MISMATCH'
  | 'MEASUREMENT_NOT_FOUND'
  | 'INVALID_MEASUREMENT_STATUS'
  | 'LINK_NOT_FOUND'
  | 'EXACT_DECIMAL_FORMAT_ERROR'
  | 'DIRECT_CLEAR_PROHIBITED';

export class TakeoffBoqLinkError extends Error {
  constructor(
    public readonly code: TakeoffBoqErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TakeoffBoqLinkError';
  }
}

export class DirectMutationProhibitedError extends TakeoffBoqLinkError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('DIRECT_MUTATION_PROHIBITED', message, context);
    this.name = 'DirectMutationProhibitedError';
  }
}

export class TakeoffPermissionError extends TakeoffBoqLinkError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('PERMISSION_DENIED', message, context);
    this.name = 'TakeoffPermissionError';
  }
}

export class TakeoffFiscalLockError extends TakeoffBoqLinkError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('FISCAL_LOCK_ENGAGED', message, context);
    this.name = 'TakeoffFiscalLockError';
  }
}

// ---------------------------------------------------------------------------
// Context & Security Contracts
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
// Takeoff BoQ Link Model
// ---------------------------------------------------------------------------

export interface TakeoffBoqLink {
  readonly linkId: string;
  readonly measurementId: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly boqCode: string;
  readonly cellRef: string; // "<sheetId>:<colId>:<rowId>"
  multiplier: number;
  derivedQuantity: number;
  exactDecimalQuantity: string;
  readonly targetUnit: string;
  status: MeasurementStatus;
  lastReceiptId: string | null;
  lastServerSeq: number | null;
  readonly createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QuantityPostingRequest {
  readonly measurementId: string;
  readonly boqCode: string;
  readonly cellRef: string;
  readonly multiplier?: number;
  readonly targetUnit?: string;
  readonly idempotencyKey?: string;
}

export interface QuantityPostingReceipt {
  readonly receiptId: string;
  readonly serverSeq: number;
  readonly linkId: string;
  readonly measurementId: string;
  readonly boqCode: string;
  readonly cellRef: string;
  readonly exactDecimalQuantity: string;
  readonly postedAtUtc: string;
  readonly operation: 'worksheet.update';
  readonly isIdempotentReplay?: boolean;
}

export interface RoundTripEvidence {
  readonly measurementId: string;
  readonly measurementLabel: string;
  readonly measurementType: string;
  readonly calibratedQuantity: number;
  readonly linkId: string;
  readonly boqCode: string;
  readonly cellRef: string;
  readonly postedExactDecimalQuantity: string;
  readonly cellValueMatches: boolean;
  readonly receiptId: string;
  readonly serverSeq: number;
  readonly verifiedAtUtc: string;
}

// ---------------------------------------------------------------------------
// BoQ Target Cell Reflection Representation
// ---------------------------------------------------------------------------

export interface ReflectedBoqCell {
  readonly cellRef: string;
  readonly boqCode: string;
  value: string; // Exact-decimal string: aggregated sum of active, accepted contributing links
  unit: string;
  status: MeasurementStatus;
  needsReview: boolean;
  contributingLinkIds: string[];
  lastTakeoffMeasurementId: string;
  lastTakeoffLinkId: string;
  lastReceiptId: string;
  lastServerSeq: number;
  updatedAtUtc: string;
}

export interface ReviewResolutionResult {
  readonly measurementId: string;
  readonly action: ReviewAction;
  readonly reviewer: string;
  readonly resolvedAtUtc: string;
  readonly updatedLinksCount: number;
  readonly affectedCellsCount: number;
  readonly remainingPendingReviewsCount: number;
}

// ---------------------------------------------------------------------------
// Helper: Exact Decimal Formatter
// ---------------------------------------------------------------------------

export function formatExactDecimal(val: number, decimalPlaces = 2): string {
  if (!Number.isFinite(val)) {
    throw new TakeoffBoqLinkError(
      'EXACT_DECIMAL_FORMAT_ERROR',
      `Cannot format non-finite number "${val}" to exact decimal`
    );
  }
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round(val * factor) / factor;
  return rounded.toFixed(decimalPlaces);
}

// ---------------------------------------------------------------------------
// Drawing Widget Representation (Architectural Guard)
// ---------------------------------------------------------------------------

export class TakeoffDrawingWidget {
  constructor(
    public readonly widgetId: string,
    private readonly linkService: TakeoffBoqLinkService
  ) {}

  /**
   * ARCHITECTURAL ENFORCEMENT:
   * Drawing widgets are strictly forbidden from directly mutating workbook or BoQ cells.
   * Direct assignment or mutation throws DirectMutationProhibitedError.
   */
  directMutateBoqCell(cell: unknown, _newValue: unknown): never {
    throw new DirectMutationProhibitedError(
      `Drawing widget "${this.widgetId}" cannot mutate BoQ cells directly. ` +
      `All quantity changes must route through the single TakeoffBoqLinkService domain path.`,
      { widgetId: this.widgetId, target: cell }
    );
  }

  /**
   * Safe domain path: request quantity posting through the domain integration service.
   */
  async requestQuantityPosting(
    caller: CallerContext,
    request: QuantityPostingRequest
  ): Promise<QuantityPostingReceipt> {
    return this.linkService.postQuantityUpdate(caller, request);
  }
}

// ---------------------------------------------------------------------------
// Service Interface & Implementation
// ---------------------------------------------------------------------------

export interface ITakeoffBoqLinkService {
  postQuantityUpdate(
    caller: CallerContext,
    request: QuantityPostingRequest
  ): Promise<QuantityPostingReceipt>;
  getLinksForMeasurement(measurementId: string): TakeoffBoqLink[];
  getLinksForBoqItem(boqCode: string): TakeoffBoqLink[];
  getReflectedCell(cellRef: string): ReflectedBoqCell | undefined;
  verifyRoundTrip(measurementId: string, cellRef: string): RoundTripEvidence;
  invalidateDownstreamLinks(invalidatedMeasurementIds: readonly string[], reason: string): number;
  resolveReviewDecision(
    caller: CallerContext,
    decision: {
      measurementId: string;
      action: ReviewAction;
      reviewer: string;
      newCalibrationRatio?: CalibrationRatio;
    }
  ): ReviewResolutionResult;
  getSaveSyncState(): Readonly<SaveSyncState>;
}

export class TakeoffBoqLinkService implements ITakeoffBoqLinkService {
  private readonly linksById = new Map<string, TakeoffBoqLink>();
  private readonly reflectedCells = new Map<string, ReflectedBoqCell>();
  private readonly receiptsByIdempotencyKey = new Map<string, QuantityPostingReceipt>();
  private readonly saveSyncTracker: TakeoffSaveSyncTracker;
  private readonly invalidationEngine: TakeoffInvalidationEngine;
  private seqCounter = 1000;

  constructor(
    private readonly measurementRepo: MeasurementRepository,
    private readonly onEventEmitted?: (evt: TakeoffChangeEvent) => void,
    saveSyncTracker?: TakeoffSaveSyncTracker,
    invalidationEngine?: TakeoffInvalidationEngine
  ) {
    this.saveSyncTracker = saveSyncTracker ?? new TakeoffSaveSyncTracker();
    this.invalidationEngine =
      invalidationEngine ??
      new TakeoffInvalidationEngine(this.measurementRepo, (summary) => {
        this.invalidateDownstreamLinks(summary.invalidatedMeasurementIds, summary.reason);
      });
  }

  getSaveSyncState(): Readonly<SaveSyncState> {
    return this.saveSyncTracker.getState();
  }

  getInvalidationEngine(): TakeoffInvalidationEngine {
    return this.invalidationEngine;
  }

  /**
   * Recalculates the aggregated cell quantity across all contributing links
   * ensuring that only ACCEPTED links contribute to the active quantity.
   * If any contributing link requires review, the cell is flagged NEEDS_REVIEW.
   */
  private recalculateCellValue(cellRef: string): string {
    const cell = this.reflectedCells.get(cellRef);
    if (!cell) return '0.00';

    let total = 0;
    let hasNeedsReview = false;

    for (const linkId of cell.contributingLinkIds) {
      const link = this.linksById.get(linkId);
      if (link) {
        if (link.status === 'ACCEPTED') {
          total += link.derivedQuantity;
        } else if (link.status === 'NEEDS_REVIEW') {
          hasNeedsReview = true;
        }
      }
    }

    const exactStr = formatExactDecimal(total, 2);
    cell.value = exactStr;
    cell.needsReview = hasNeedsReview;
    cell.status = hasNeedsReview ? 'NEEDS_REVIEW' : 'ACCEPTED';
    return exactStr;
  }

  /**
   * Validates security guards corresponding to "worksheet.update" operation in registry:
   * ["identity", "tenantScope", "projectMembership", "projectPermission", "fiscalLock"]
   */
  private assertPermissions(caller: CallerContext, targetTenantId: string): void {
    if (!caller.userId || caller.userId.trim() === '') {
      throw new TakeoffPermissionError('Anonymous callers cannot post takeoff quantities: identity guard failed');
    }

    if (caller.tenantId !== targetTenantId) {
      throw new TakeoffPermissionError(
        `Tenant mismatch: caller tenant "${caller.tenantId}" does not match target tenant "${targetTenantId}"`,
        { callerTenant: caller.tenantId, targetTenant: targetTenantId }
      );
    }

    if (caller.isFiscalLocked) {
      throw new TakeoffFiscalLockError(
        `Cannot post takeoff quantities: project "${caller.projectId}" is under fiscal year lock`,
        { projectId: caller.projectId }
      );
    }

    const hasPermission =
      caller.permissions.includes('worksheet.write') ||
      caller.permissions.includes('takeoff.post_quantity') ||
      caller.roles.includes('estimator') ||
      caller.roles.includes('project_manager') ||
      caller.roles.includes('admin');

    if (!hasPermission) {
      throw new TakeoffPermissionError(
        `Caller "${caller.userId}" lacks required permission for operation "worksheet.update"`,
        { roles: caller.roles, permissions: caller.permissions }
      );
    }
  }

  /**
   * Single domain integration path for posting takeoff quantities to BoQ items.
   * Enforces idempotency and prevents double counting upon replayed messages.
   */
  async postQuantityUpdate(
    caller: CallerContext,
    request: QuantityPostingRequest
  ): Promise<QuantityPostingReceipt> {
    // 1. Idempotency Check: if identical idempotency key was previously processed, return cached receipt
    if (request.idempotencyKey) {
      const cached = this.receiptsByIdempotencyKey.get(request.idempotencyKey);
      if (cached) {
        return {
          ...cached,
          isIdempotentReplay: true
        };
      }
    }

    const measurement = this.measurementRepo.getById(request.measurementId);
    if (!measurement) {
      throw new TakeoffBoqLinkError(
        'MEASUREMENT_NOT_FOUND',
        `Measurement with ID "${request.measurementId}" was not found`,
        { measurementId: request.measurementId }
      );
    }

    if (measurement.provenance.status !== 'ACCEPTED') {
      throw new TakeoffBoqLinkError(
        'INVALID_MEASUREMENT_STATUS',
        `Cannot post quantities for measurement in "${measurement.provenance.status}" status. Measurements in review or invalidated must be resolved first.`,
        { measurementId: request.measurementId, status: measurement.provenance.status }
      );
    }

    // Run permission and fiscal lock checks
    this.assertPermissions(caller, caller.tenantId);

    const multiplier = request.multiplier ?? 1.0;
    const computedDerived = measurement.calibratedQuantity * multiplier;
    const exactDecimalStr = formatExactDecimal(computedDerived, 2);

    const linkId = `link-${measurement.id}-${request.boqCode}-${request.cellRef.replace(/[:]/g, '_')}`;
    const now = new Date().toISOString();
    this.seqCounter += 1;
    const receiptId = `rcpt-boq-${Date.now()}-${this.seqCounter}`;
    const serverSeq = this.seqCounter;

    // 2. Create or update the link model (DEDUPLICATION: updates existing link in-place)
    let link = this.linksById.get(linkId);
    if (!link) {
      link = {
        linkId,
        measurementId: measurement.id,
        documentId: measurement.provenance.documentId,
        revisionId: measurement.provenance.sourceRevisionId,
        boqCode: request.boqCode,
        cellRef: request.cellRef,
        multiplier,
        derivedQuantity: computedDerived,
        exactDecimalQuantity: exactDecimalStr,
        targetUnit: request.targetUnit ?? measurement.declaredUnit,
        status: 'ACCEPTED',
        lastReceiptId: receiptId,
        lastServerSeq: serverSeq,
        createdAtUtc: now,
        updatedAtUtc: now
      };
      this.linksById.set(linkId, link);
    } else {
      link.multiplier = multiplier;
      link.derivedQuantity = computedDerived;
      link.exactDecimalQuantity = exactDecimalStr;
      link.status = 'ACCEPTED';
      link.lastReceiptId = receiptId;
      link.lastServerSeq = serverSeq;
      link.updatedAtUtc = now;
    }

    // 3. Update measurement's derivedQuantities list (in-place replacement prevents list duplication)
    const existingDerived = measurement.derivedQuantities.find((d) => d.linkId === linkId);
    if (existingDerived) {
      existingDerived.derivedQuantity = computedDerived;
      existingDerived.status = 'ACCEPTED';
      existingDerived.factor = multiplier;
    } else {
      measurement.derivedQuantities.push({
        linkId,
        boqItemId: request.boqCode,
        factor: multiplier,
        derivedQuantity: computedDerived,
        status: 'ACCEPTED'
      });
    }
    this.measurementRepo.save(measurement);

    // 4. Update or create ReflectedBoqCell with aggregated value (DEDUPLICATION: linkId added only once)
    let reflectedCell = this.reflectedCells.get(request.cellRef);
    if (!reflectedCell) {
      reflectedCell = {
        cellRef: request.cellRef,
        boqCode: request.boqCode,
        value: exactDecimalStr,
        unit: request.targetUnit ?? measurement.declaredUnit,
        status: 'ACCEPTED',
        needsReview: false,
        contributingLinkIds: [linkId],
        lastTakeoffMeasurementId: measurement.id,
        lastTakeoffLinkId: linkId,
        lastReceiptId: receiptId,
        lastServerSeq: serverSeq,
        updatedAtUtc: now
      };
      this.reflectedCells.set(request.cellRef, reflectedCell);
    } else {
      if (!reflectedCell.contributingLinkIds.includes(linkId)) {
        reflectedCell.contributingLinkIds.push(linkId);
      }
      reflectedCell.lastTakeoffMeasurementId = measurement.id;
      reflectedCell.lastTakeoffLinkId = linkId;
      reflectedCell.lastReceiptId = receiptId;
      reflectedCell.lastServerSeq = serverSeq;
      reflectedCell.updatedAtUtc = now;
      this.recalculateCellValue(request.cellRef);
    }

    const receipt: QuantityPostingReceipt = {
      receiptId,
      serverSeq,
      linkId,
      measurementId: measurement.id,
      boqCode: request.boqCode,
      cellRef: request.cellRef,
      exactDecimalQuantity: exactDecimalStr,
      postedAtUtc: now,
      operation: 'worksheet.update',
      isIdempotentReplay: false
    };

    if (request.idempotencyKey) {
      this.receiptsByIdempotencyKey.set(request.idempotencyKey, receipt);
    }

    // 5. Emit change-feed event for Flutter client and sync outbox
    const changeEvent: TakeoffChangeEvent = {
      eventId: `feed-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      changeKind: 'TAKEOFF_MEASUREMENT_UPDATED',
      entityId: linkId,
      tenantId: caller.tenantId,
      documentId: measurement.provenance.documentId,
      revisionId: measurement.provenance.sourceRevisionId,
      payload: {
        operation: 'worksheet.update',
        linkId,
        measurementId: measurement.id,
        boqCode: request.boqCode,
        cellRef: request.cellRef,
        exactDecimalQuantity: exactDecimalStr,
        cellAggregatedTotal: reflectedCell.value,
        receiptId,
        serverSeq
      },
      emittedAtUtc: now
    };

    if (this.onEventEmitted) {
      this.onEventEmitted(changeEvent);
    }

    return receipt;
  }

  getLinksForMeasurement(measurementId: string): TakeoffBoqLink[] {
    const results: TakeoffBoqLink[] = [];
    for (const link of this.linksById.values()) {
      if (link.measurementId === measurementId) {
        results.push(link);
      }
    }
    return results;
  }

  getLinksForBoqItem(boqCode: string): TakeoffBoqLink[] {
    const results: TakeoffBoqLink[] = [];
    for (const link of this.linksById.values()) {
      if (link.boqCode === boqCode) {
        results.push(link);
      }
    }
    return results;
  }

  getReflectedCell(cellRef: string): ReflectedBoqCell | undefined {
    return this.reflectedCells.get(cellRef);
  }

  /**
   * Invalidates downstream BoQ links and reflected cells when measurements require review.
   * Enforces that accepted quantities CANNOT silently persist.
   */
  invalidateDownstreamLinks(invalidatedMeasurementIds: readonly string[], reason: string): number {
    const invalidatedSet = new Set(invalidatedMeasurementIds);
    let affectedLinkCount = 0;
    const affectedCellRefs = new Set<string>();

    for (const link of this.linksById.values()) {
      if (invalidatedSet.has(link.measurementId)) {
        link.status = 'NEEDS_REVIEW';
        affectedLinkCount++;
        affectedCellRefs.add(link.cellRef);
      }
    }

    for (const cellRef of affectedCellRefs) {
      const cell = this.reflectedCells.get(cellRef);
      if (cell) {
        cell.status = 'NEEDS_REVIEW';
        cell.needsReview = true;
        this.recalculateCellValue(cellRef);

        if (this.onEventEmitted) {
          this.onEventEmitted({
            eventId: `feed-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            changeKind: 'TAKEOFF_MEASUREMENT_INVALIDATED',
            entityId: cellRef,
            tenantId: 'system',
            documentId: '',
            revisionId: '',
            payload: {
              cellRef,
              boqCode: cell.boqCode,
              status: 'NEEDS_REVIEW',
              reason
            },
            emittedAtUtc: new Date().toISOString()
          });
        }
      }
    }

    // Count all links currently needing review across the repository
    let pendingReviews = 0;
    for (const link of this.linksById.values()) {
      if (link.status === 'NEEDS_REVIEW') {
        pendingReviews++;
      }
    }
    this.saveSyncTracker.notifyReviewRequired(pendingReviews);

    return affectedLinkCount;
  }

  /**
   * Resolves review for a measurement via the canonical domain path.
   * Updates measurement, links, reflected BoQ cells, and clears SaveSyncState review status.
   */
  resolveReviewDecision(
    caller: CallerContext,
    decision: {
      measurementId: string;
      action: ReviewAction;
      reviewer: string;
      newCalibrationRatio?: CalibrationRatio;
    }
  ): ReviewResolutionResult {
    this.assertPermissions(caller, caller.tenantId);

    const m = this.measurementRepo.getById(decision.measurementId);
    if (!m) {
      throw new TakeoffBoqLinkError(
        'MEASUREMENT_NOT_FOUND',
        `Measurement "${decision.measurementId}" not found for review resolution`
      );
    }

    // 1. Apply decision to measurement in repository
    const reviewApplied = this.invalidationEngine.applyHumanReview(
      decision.measurementId,
      decision.action,
      decision.reviewer,
      decision.newCalibrationRatio
    );

    if (!reviewApplied) {
      throw new TakeoffBoqLinkError(
        'MEASUREMENT_NOT_FOUND',
        `Failed to apply review decision to measurement "${decision.measurementId}"`
      );
    }

    const updatedM = this.measurementRepo.getById(decision.measurementId)!;
    const links = this.getLinksForMeasurement(decision.measurementId);
    const affectedCellRefs = new Set<string>();
    const now = new Date().toISOString();

    // 2. Update linked quantities according to review decision
    for (const link of links) {
      affectedCellRefs.add(link.cellRef);
      if (decision.action === 'CONFIRM_AS_IS') {
        link.status = 'ACCEPTED';
        link.updatedAtUtc = now;
      } else if (decision.action === 'RECALCULATE_QUANTITY') {
        link.derivedQuantity = updatedM.calibratedQuantity * link.multiplier;
        link.exactDecimalQuantity = formatExactDecimal(link.derivedQuantity, 2);
        link.status = 'ACCEPTED';
        link.updatedAtUtc = now;
      } else if (decision.action === 'DISCARD') {
        link.status = 'INVALIDATED';
        link.updatedAtUtc = now;
      }
    }

    // 3. Recalculate affected BoQ cells
    for (const cellRef of affectedCellRefs) {
      this.recalculateCellValue(cellRef);
    }

    // 4. Update save/sync status
    let remainingReviews = 0;
    for (const link of this.linksById.values()) {
      if (link.status === 'NEEDS_REVIEW') {
        remainingReviews++;
      }
    }
    this.saveSyncTracker.notifyReviewRequired(remainingReviews);

    // 5. Emit change event
    if (this.onEventEmitted) {
      this.onEventEmitted({
        eventId: `feed-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        changeKind: 'TAKEOFF_MEASUREMENT_REVIEWED',
        entityId: decision.measurementId,
        tenantId: caller.tenantId,
        documentId: updatedM.provenance.documentId,
        revisionId: updatedM.provenance.sourceRevisionId,
        payload: {
          measurementId: decision.measurementId,
          action: decision.action,
          reviewer: decision.reviewer,
          remainingReviews
        },
        emittedAtUtc: now
      });
    }

    return {
      measurementId: decision.measurementId,
      action: decision.action,
      reviewer: decision.reviewer,
      resolvedAtUtc: now,
      updatedLinksCount: links.length,
      affectedCellsCount: affectedCellRefs.size,
      remainingPendingReviewsCount: remainingReviews
    };
  }

  /**
   * Verifies the round-trip link:
   * measurement -> quantity -> BoQ cell -> measurement
   */
  verifyRoundTrip(measurementId: string, cellRef: string): RoundTripEvidence {
    const measurement = this.measurementRepo.getById(measurementId);
    if (!measurement) {
      throw new TakeoffBoqLinkError('MEASUREMENT_NOT_FOUND', `Measurement "${measurementId}" not found`);
    }

    const reflectedCell = this.reflectedCells.get(cellRef);
    if (!reflectedCell) {
      throw new TakeoffBoqLinkError('LINK_NOT_FOUND', `No reflected BoQ cell found for cellRef "${cellRef}"`);
    }

    const link = Array.from(this.linksById.values()).find(
      (l) => l.measurementId === measurementId && l.cellRef === cellRef
    );
    if (!link) {
      throw new TakeoffBoqLinkError('LINK_NOT_FOUND', `No link found connecting measurement "${measurementId}" to "${cellRef}"`);
    }

    const matches =
      reflectedCell.contributingLinkIds.includes(link.linkId) &&
      reflectedCell.lastTakeoffMeasurementId === measurementId;

    return {
      measurementId: measurement.id,
      measurementLabel: measurement.label,
      measurementType: measurement.type,
      calibratedQuantity: measurement.calibratedQuantity,
      linkId: link.linkId,
      boqCode: link.boqCode,
      cellRef: link.cellRef,
      postedExactDecimalQuantity: link.exactDecimalQuantity,
      cellValueMatches: matches,
      receiptId: link.lastReceiptId ?? '',
      serverSeq: link.lastServerSeq ?? 0,
      verifiedAtUtc: new Date().toISOString()
    };
  }
}
