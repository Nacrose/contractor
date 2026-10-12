/**
 * Revision & Calibration Invalidation Engine (M08-T03).
 *
 * Implements Platform Plan v3 §5.4 constraint:
 * "Version measurement and calibration together; revision changes invalidate/review
 * derived quantities rather than silently rebasing."
 */

import { MeasurementRepository } from "./geometry_storage.js";
import { CalibrationRecord, CalibrationRatio, CropBox, InvalidationReason, RotationDegrees } from "./provenance.js";

export interface InvalidationSummary {
  readonly documentId: string;
  readonly reason: InvalidationReason;
  readonly invalidatedMeasurementIds: readonly string[];
  readonly affectedDerivedQuantitiesCount: number;
  readonly timestampUtc: string;
}

export type ReviewAction = 'CONFIRM_AS_IS' | 'RECALCULATE_QUANTITY' | 'DISCARD';

export class TakeoffInvalidationEngine {
  constructor(private readonly repository: MeasurementRepository) {}

  /**
   * Invalidates measurements when a new drawing revision is issued (e.g. REV-A -> REV-B).
   * Strict Rule: NEVER silently rebase geometry or derived quantities onto the new revision.
   */
  invalidateForDocumentRevisionBump(
    documentId: string,
    oldRevisionId: string,
    newRevisionId: string
  ): InvalidationSummary {
    const measurements = this.repository.query({
      documentId,
      revisionId: oldRevisionId,
      status: 'ACCEPTED'
    });

    const affectedIds: string[] = [];
    let derivedCount = 0;
    const now = new Date().toISOString();

    for (const m of measurements) {
      m.provenance.status = 'NEEDS_REVIEW';
      m.provenance.invalidationReason = 'SOURCE_REVISION_BUMPED';
      m.provenance.invalidatedAtUtc = now;

      // Invalidate all downstream BoQ links
      for (const link of m.derivedQuantities) {
        link.status = 'NEEDS_REVIEW';
        derivedCount++;
      }

      this.repository.save(m);
      affectedIds.push(m.id);
    }

    return {
      documentId,
      reason: 'SOURCE_REVISION_BUMPED',
      invalidatedMeasurementIds: affectedIds,
      affectedDerivedQuantitiesCount: derivedCount,
      timestampUtc: now
    };
  }

  /**
   * Invalidates measurements when a drawing page is recalibrated.
   */
  invalidateForPageRecalibration(
    documentId: string,
    pageIndex: number,
    newCalibration: CalibrationRecord
  ): InvalidationSummary {
    const measurements = this.repository.query({
      documentId,
      pageIndex,
      status: 'ACCEPTED'
    });

    const affectedIds: string[] = [];
    let derivedCount = 0;
    const now = new Date().toISOString();

    for (const m of measurements) {
      if (m.provenance.calibrationVersion !== newCalibration.version) {
        m.provenance.status = 'NEEDS_REVIEW';
        m.provenance.invalidationReason = 'PAGE_RECALIBRATED';
        m.provenance.invalidatedAtUtc = now;

        for (const link of m.derivedQuantities) {
          link.status = 'NEEDS_REVIEW';
          derivedCount++;
        }

        this.repository.save(m);
        affectedIds.push(m.id);
      }
    }

    return {
      documentId,
      reason: 'PAGE_RECALIBRATED',
      invalidatedMeasurementIds: affectedIds,
      affectedDerivedQuantitiesCount: derivedCount,
      timestampUtc: now
    };
  }

  /**
   * Invalidates measurements if drawing crop box or rotation changes.
   */
  invalidateForCropOrRotationChange(
    documentId: string,
    pageIndex: number,
    newCrop: CropBox,
    newRotation: RotationDegrees
  ): InvalidationSummary {
    const measurements = this.repository.query({
      documentId,
      pageIndex,
      status: 'ACCEPTED'
    });

    const affectedIds: string[] = [];
    let derivedCount = 0;
    const now = new Date().toISOString();

    for (const m of measurements) {
      const p = m.provenance;
      const cropChanged =
        p.cropBox.x !== newCrop.x ||
        p.cropBox.y !== newCrop.y ||
        p.cropBox.width !== newCrop.width ||
        p.cropBox.height !== newCrop.height;
      const rotationChanged = p.rotationDegrees !== newRotation;

      if (cropChanged || rotationChanged) {
        p.status = 'NEEDS_REVIEW';
        p.invalidationReason = 'CROP_OR_ROTATION_CHANGED';
        p.invalidatedAtUtc = now;

        for (const link of m.derivedQuantities) {
          link.status = 'NEEDS_REVIEW';
          derivedCount++;
        }

        this.repository.save(m);
        affectedIds.push(m.id);
      }
    }

    return {
      documentId,
      reason: 'CROP_OR_ROTATION_CHANGED',
      invalidatedMeasurementIds: affectedIds,
      affectedDerivedQuantitiesCount: derivedCount,
      timestampUtc: now
    };
  }

  /**
   * Applies an explicit human review decision to an invalidated measurement.
   */
  applyHumanReview(
    measurementId: string,
    action: ReviewAction,
    reviewer: string,
    newCalibrationRatio?: CalibrationRatio
  ): boolean {
    const m = this.repository.getById(measurementId);
    if (!m) return false;

    const now = new Date().toISOString();

    switch (action) {
      case 'CONFIRM_AS_IS': {
        m.provenance.status = 'ACCEPTED';
        m.provenance.reviewedAtUtc = now;
        m.provenance.reviewedBy = reviewer;
        for (const link of m.derivedQuantities) {
          link.status = 'ACCEPTED';
        }
        break;
      }

      case 'RECALCULATE_QUANTITY': {
        if (newCalibrationRatio) {
          const factor =
            m.type === 'POLYGON_AREA'
              ? Math.pow(newCalibrationRatio.scaleFactor, 2)
              : newCalibrationRatio.scaleFactor;

          m.calibratedQuantity = parseFloat((m.rawDocumentQuantity * factor).toFixed(4));
          (m.provenance as { calibrationRatio: CalibrationRatio }).calibrationRatio = newCalibrationRatio;
        }
        m.provenance.status = 'ACCEPTED';
        m.provenance.reviewedAtUtc = now;
        m.provenance.reviewedBy = reviewer;
        for (const link of m.derivedQuantities) {
          link.derivedQuantity = parseFloat((m.calibratedQuantity * link.factor).toFixed(4));
          link.status = 'ACCEPTED';
        }
        break;
      }

      case 'DISCARD': {
        m.provenance.status = 'INVALIDATED';
        m.provenance.reviewedAtUtc = now;
        m.provenance.reviewedBy = reviewer;
        for (const link of m.derivedQuantities) {
          link.status = 'INVALIDATED';
        }
        break;
      }
    }

    this.repository.save(m);
    return true;
  }
}
