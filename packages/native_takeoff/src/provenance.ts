/**
 * Takeoff Measurement Provenance & Calibration Models (M08-T03).
 *
 * Implements strict provenance tracking: every measurement records its source revision,
 * page index, crop/rotation state, and calibration version.
 *
 * In accordance with Platform Plan v3 §5.4: measurement and calibration are versioned
 * together; revision changes invalidate/review derived quantities rather than silently rebasing.
 */

export type InvalidationReason =
  | 'SOURCE_REVISION_BUMPED'
  | 'PAGE_RECALIBRATED'
  | 'CROP_OR_ROTATION_CHANGED'
  | 'MANUAL_REVIEW_REQUESTED';

export type MeasurementStatus = 'ACCEPTED' | 'NEEDS_REVIEW' | 'INVALIDATED';

export interface CropBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type RotationDegrees = 0 | 90 | 180 | 270;

export interface CalibrationRatio {
  readonly unit: 'mm' | 'm' | 'cm' | 'in' | 'ft';
  readonly scaleFactor: number; // Real physical units per PDF document point (1/72 in)
  readonly referenceDistance: number;
  readonly calibratedAtUtc: string;
}

export interface CalibrationRecord {
  readonly calibrationId: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly pageIndex: number;
  readonly version: number;
  readonly pointA: { readonly x: number; readonly y: number };
  readonly pointB: { readonly x: number; readonly y: number };
  readonly physicalDistance: number;
  readonly unit: 'mm' | 'm' | 'cm' | 'in' | 'ft';
  readonly scaleFactor: number;
  readonly createdAtUtc: string;
  readonly createdBy: string;
}

export interface MeasurementProvenance {
  readonly documentId: string;
  readonly sourceRevisionId: string;
  readonly pageIndex: number;
  readonly cropBox: CropBox;
  readonly rotationDegrees: RotationDegrees;
  readonly calibrationId: string;
  readonly calibrationVersion: number;
  readonly calibrationRatio: CalibrationRatio;
  status: MeasurementStatus;
  invalidationReason: InvalidationReason | null;
  invalidatedAtUtc: string | null;
  reviewedAtUtc: string | null;
  reviewedBy: string | null;
}

export class ProvenanceBuilder {
  static createDefault(
    documentId: string,
    revisionId: string,
    pageIndex: number,
    calibration: CalibrationRecord,
    cropBox: CropBox = { x: 0, y: 0, width: 1190.55, height: 841.89 },
    rotationDegrees: RotationDegrees = 0
  ): MeasurementProvenance {
    return {
      documentId,
      sourceRevisionId: revisionId,
      pageIndex,
      cropBox,
      rotationDegrees,
      calibrationId: calibration.calibrationId,
      calibrationVersion: calibration.version,
      calibrationRatio: {
        unit: calibration.unit,
        scaleFactor: calibration.scaleFactor,
        referenceDistance: calibration.physicalDistance,
        calibratedAtUtc: calibration.createdAtUtc
      },
      status: 'ACCEPTED',
      invalidationReason: null,
      invalidatedAtUtc: null,
      reviewedAtUtc: null,
      reviewedBy: null
    };
  }
}
