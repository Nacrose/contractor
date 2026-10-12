/**
 * Takeoff Measurement Calculation & Geometry Validation Engine (M08-T04).
 *
 * Implements full measurement coverage:
 * - Linear distance & open polyline length
 * - Closed perimeter
 * - Polygon gross, deduction holes, and net area
 * - Count markers
 * - Calibrated unit conversions versioned with measurements (no ambient unit state)
 * - Strict rejection of invalid geometries (self-intersection, zero area, degenerate polylines)
 */

import {
  calculateDistance,
  calculatePolygonAreaWithHoles,
  calculatePolylineLength,
  validatePolygon
} from "./cad_topology_bridge.js";
import {
  CountGeometry,
  LinearGeometry,
  MeasurementGeometry,
  MeasurementRecord,
  MeasurementType,
  Point2D,
  PolygonGeometry,
  PolylineGeometry
} from "./geometry_storage.js";
import { CalibrationRecord, ProvenanceBuilder } from "./provenance.js";

export class InvalidGeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGeometryError";
  }
}

export type LengthUnit = 'm' | 'mm' | 'cm' | 'in' | 'ft';
export type AreaUnit = 'm²' | 'mm²' | 'cm²' | 'in²' | 'ft²' | 'sqft';

export interface MeasurementComputeInput {
  readonly id: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly pageIndex: number;
  readonly calibration: CalibrationRecord;
  readonly type: MeasurementType;
  readonly label: string;
  readonly geometry: MeasurementGeometry;
  readonly targetUnit?: string;
}

export interface ComputedMeasurementResult {
  readonly record: MeasurementRecord;
  readonly rawDocumentQuantity: number;
  readonly calibratedQuantity: number;
  readonly declaredUnit: string;
  readonly grossQuantity?: number;
  readonly deductionsQuantity?: number;
  readonly perimeter?: number;
  readonly holesCount?: number;
}

export class TakeoffMeasurementEngine {
  /**
   * Evaluates conversion factor between calibration unit and target declared unit.
   * No ambient unit state — conversion is fully derived from calibrated parameters.
   */
  static getLinearUnitConversionFactor(fromUnit: LengthUnit, toUnit: LengthUnit): number {
    const toMeters: Record<LengthUnit, number> = {
      m: 1.0,
      mm: 0.001,
      cm: 0.01,
      in: 0.0254,
      ft: 0.3048
    };

    const fromFactor = toMeters[fromUnit];
    const toFactor = toMeters[toUnit];
    if (!fromFactor || !toFactor) {
      throw new Error(`Unsupported unit conversion from '${fromUnit}' to '${toUnit}'`);
    }

    return fromFactor / toFactor;
  }

  static getAreaUnitConversionFactor(fromUnit: LengthUnit, toUnit: AreaUnit): number {
    const toSquareMeters: Record<string, number> = {
      'm²': 1.0,
      'mm²': 0.000001,
      'cm²': 0.0001,
      'in²': 0.00064516,
      'ft²': 0.09290304,
      'sqft': 0.09290304
    };

    const fromLinearToMeters = {
      m: 1.0,
      mm: 0.001,
      cm: 0.01,
      in: 0.0254,
      ft: 0.3048
    }[fromUnit];

    const fromSquareMeters = fromLinearToMeters * fromLinearToMeters;
    const toSqFactor = toSquareMeters[toUnit];
    if (!toSqFactor) {
      throw new Error(`Unsupported target area unit '${toUnit}'`);
    }

    return fromSquareMeters / toSqFactor;
  }

  /**
   * Computes a validated takeoff measurement with complete provenance.
   * Rejects invalid geometry explicitly rather than coercing it.
   */
  static computeMeasurement(input: MeasurementComputeInput): ComputedMeasurementResult {
    const { id, documentId, revisionId, pageIndex, calibration, type, label, geometry, targetUnit } = input;

    let rawDocumentQuantity = 0;
    let calibratedQuantity = 0;
    let declaredUnit = targetUnit;
    let grossQuantity: number | undefined;
    let deductionsQuantity: number | undefined;
    let perimeter: number | undefined;
    let holesCount: number | undefined;

    switch (type) {
      case "LINEAR_DISTANCE": {
        if (geometry.type !== "linear") {
          throw new InvalidGeometryError(`Expected linear geometry for LINEAR_DISTANCE, found '${geometry.type}'`);
        }
        const lin = geometry as LinearGeometry;
        const distPt = calculateDistance(lin.start, lin.end);
        if (distPt <= 1e-4) {
          throw new InvalidGeometryError("Degenerate linear distance: start and end points are coincident");
        }
        rawDocumentQuantity = parseFloat(distPt.toFixed(4));
        declaredUnit = declaredUnit || calibration.unit;
        const conv = this.getLinearUnitConversionFactor(calibration.unit, declaredUnit as LengthUnit);
        calibratedQuantity = parseFloat((rawDocumentQuantity * calibration.scaleFactor * conv).toFixed(4));
        break;
      }

      case "POLYLINE_PERIMETER": {
        if (geometry.type !== "polyline") {
          throw new InvalidGeometryError(`Expected polyline geometry for POLYLINE_PERIMETER, found '${geometry.type}'`);
        }
        const poly = geometry as PolylineGeometry;
        if (poly.vertices.length < 2) {
          throw new InvalidGeometryError(`Degenerate polyline: must have at least 2 vertices (found ${poly.vertices.length})`);
        }
        const lenPt = calculatePolylineLength(poly.vertices, false);
        if (lenPt <= 1e-4) {
          throw new InvalidGeometryError("Degenerate polyline: total length is zero");
        }
        rawDocumentQuantity = parseFloat(lenPt.toFixed(4));
        declaredUnit = declaredUnit || calibration.unit;
        const conv = this.getLinearUnitConversionFactor(calibration.unit, declaredUnit as LengthUnit);
        calibratedQuantity = parseFloat((rawDocumentQuantity * calibration.scaleFactor * conv).toFixed(4));
        break;
      }

      case "POLYGON_AREA": {
        if (geometry.type !== "polygon") {
          throw new InvalidGeometryError(`Expected polygon geometry for POLYGON_AREA, found '${geometry.type}'`);
        }
        const pgn = geometry as PolygonGeometry;
        const areaRes = calculatePolygonAreaWithHoles(pgn.outerLoop, pgn.holes);
        if (!areaRes.isValid) {
          throw new InvalidGeometryError(`Invalid polygon geometry: ${areaRes.error}`);
        }

        rawDocumentQuantity = areaRes.netArea;
        grossQuantity = areaRes.grossArea;
        deductionsQuantity = areaRes.deductionsArea;
        perimeter = areaRes.perimeter;
        holesCount = areaRes.holesCount;
        declaredUnit = declaredUnit || `${calibration.unit}²`;

        const areaConv = this.getAreaUnitConversionFactor(calibration.unit, declaredUnit as AreaUnit);
        const scaleSq = Math.pow(calibration.scaleFactor, 2);
        calibratedQuantity = parseFloat((rawDocumentQuantity * scaleSq * areaConv).toFixed(4));
        grossQuantity = parseFloat((areaRes.grossArea * scaleSq * areaConv).toFixed(4));
        deductionsQuantity = parseFloat((areaRes.deductionsArea * scaleSq * areaConv).toFixed(4));
        break;
      }

      case "COUNT_MARKER": {
        if (geometry.type !== "count") {
          throw new InvalidGeometryError(`Expected count geometry for COUNT_MARKER, found '${geometry.type}'`);
        }
        rawDocumentQuantity = 1;
        calibratedQuantity = 1;
        declaredUnit = declaredUnit || "ea";
        break;
      }

      default:
        throw new InvalidGeometryError(`Unsupported measurement type: ${type}`);
    }

    const provenance = ProvenanceBuilder.createDefault(documentId, revisionId, pageIndex, calibration);

    const record: MeasurementRecord = {
      id,
      provenance,
      type,
      label,
      geometry,
      rawDocumentQuantity,
      calibratedQuantity,
      declaredUnit,
      version: 1,
      derivedQuantities: [],
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString()
    };

    return {
      record,
      rawDocumentQuantity,
      calibratedQuantity,
      declaredUnit,
      grossQuantity,
      deductionsQuantity,
      perimeter,
      holesCount
    };
  }
}
