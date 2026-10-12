/**
 * Change-Feed Integration & Flutter-Parity Adapter (M08-T03).
 *
 * Fulfills Standing Constraint 3 (Platform Plan v3 §10):
 * "Every new server-side domain feature accepted from M03 onward names,
 * in its task packet, its change-feed integration and Flutter-parity path."
 */

import { MeasurementRecord } from "./geometry_storage.js";
import { CalibrationRecord } from "./provenance.js";

export type TakeoffChangeKind =
  | 'TAKEOFF_MEASUREMENT_CREATED'
  | 'TAKEOFF_MEASUREMENT_UPDATED'
  | 'TAKEOFF_MEASUREMENT_INVALIDATED'
  | 'TAKEOFF_MEASUREMENT_REVIEWED'
  | 'TAKEOFF_CALIBRATION_ESTABLISHED';

export interface TakeoffChangeEvent {
  readonly eventId: string;
  readonly changeKind: TakeoffChangeKind;
  readonly entityId: string;
  readonly tenantId: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly payload: Record<string, unknown>;
  readonly emittedAtUtc: string;
}

export interface FlutterParityTakeoffDto {
  readonly id: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly pageIndex: number;
  readonly type: string;
  readonly label: string;
  readonly status: string;
  readonly pointsDocumentSpace: Array<{ readonly dx: number; readonly dy: number }>;
  readonly holesDocumentSpace: Array<Array<{ readonly dx: number; readonly dy: number }>>;
  readonly rawQuantity: number;
  readonly calibratedQuantity: number;
  readonly declaredUnit: string;
  readonly scaleFactor: number;
  readonly version: number;
}

export class TakeoffSyncFeedAdapter {
  /**
   * Formats a change event for the M03 central sync feed outbox.
   */
  static formatMeasurementChange(
    changeKind: TakeoffChangeKind,
    tenantId: string,
    record: MeasurementRecord
  ): TakeoffChangeEvent {
    return {
      eventId: `feed-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      changeKind,
      entityId: record.id,
      tenantId,
      documentId: record.provenance.documentId,
      revisionId: record.provenance.sourceRevisionId,
      payload: {
        id: record.id,
        type: record.type,
        label: record.label,
        provenance: record.provenance,
        geometry: record.geometry,
        rawDocumentQuantity: record.rawDocumentQuantity,
        calibratedQuantity: record.calibratedQuantity,
        declaredUnit: record.declaredUnit,
        version: record.version,
        derivedQuantities: record.derivedQuantities
      },
      emittedAtUtc: new Date().toISOString()
    };
  }

  /**
   * Formats a calibration change event for the M03 central sync feed.
   */
  static formatCalibrationChange(
    tenantId: string,
    record: CalibrationRecord
  ): TakeoffChangeEvent {
    return {
      eventId: `feed-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      changeKind: 'TAKEOFF_CALIBRATION_ESTABLISHED',
      entityId: record.calibrationId,
      tenantId,
      documentId: record.documentId,
      revisionId: record.revisionId,
      payload: {
        calibrationId: record.calibrationId,
        pageIndex: record.pageIndex,
        version: record.version,
        physicalDistance: record.physicalDistance,
        unit: record.unit,
        scaleFactor: record.scaleFactor,
        pointA: record.pointA,
        pointB: record.pointB
      },
      emittedAtUtc: new Date().toISOString()
    };
  }

  /**
   * Serializes a measurement to the Flutter client contract (M10 parity path).
   *
   * Document space points (1/72 inch) map 1:1 to Flutter's Offset(dx, dy) in CustomPainter,
   * completely eliminating coordinate translation drift between web and native apps.
   */
  static toFlutterDto(record: MeasurementRecord): FlutterParityTakeoffDto {
    const points: Array<{ dx: number; dy: number }> = [];
    const holes: Array<Array<{ dx: number; dy: number }>> = [];

    const geom = record.geometry;
    if (geom.type === 'linear') {
      points.push({ dx: geom.start.x, dy: geom.start.y });
      points.push({ dx: geom.end.x, dy: geom.end.y });
    } else if (geom.type === 'polyline') {
      for (const pt of geom.vertices) {
        points.push({ dx: pt.x, dy: pt.y });
      }
    } else if (geom.type === 'polygon') {
      for (const pt of geom.outerLoop) {
        points.push({ dx: pt.x, dy: pt.y });
      }
      for (const h of geom.holes) {
        holes.push(h.map((pt) => ({ dx: pt.x, dy: pt.y })));
      }
    } else if (geom.type === 'count') {
      points.push({ dx: geom.location.x, dy: geom.location.y });
    }

    return {
      id: record.id,
      documentId: record.provenance.documentId,
      revisionId: record.provenance.sourceRevisionId,
      pageIndex: record.provenance.pageIndex,
      type: record.type,
      label: record.label,
      status: record.provenance.status,
      pointsDocumentSpace: points,
      holesDocumentSpace: holes,
      rawQuantity: record.rawDocumentQuantity,
      calibratedQuantity: record.calibratedQuantity,
      declaredUnit: record.declaredUnit,
      scaleFactor: record.provenance.calibrationRatio.scaleFactor,
      version: record.version
    };
  }
}
