/**
 * Versioned Vector Measurement Geometry Storage & Repository (M08-T03).
 *
 * Stores all vector geometries strictly in unscaled document space points (1/72 inch).
 * Conversion to display viewport pixels is purely a rendering concern.
 */

import { MeasurementProvenance, MeasurementStatus } from "./provenance.js";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface LinearGeometry {
  readonly type: 'linear';
  readonly start: Point2D;
  readonly end: Point2D;
}

export interface PolylineGeometry {
  readonly type: 'polyline';
  readonly vertices: readonly Point2D[];
}

export interface PolygonGeometry {
  readonly type: 'polygon';
  readonly outerLoop: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
}

export interface CountGeometry {
  readonly type: 'count';
  readonly location: Point2D;
  readonly markerShape: 'circle' | 'cross' | 'square' | 'flag';
}

export type MeasurementGeometry =
  | LinearGeometry
  | PolylineGeometry
  | PolygonGeometry
  | CountGeometry;

export type MeasurementType =
  | 'LINEAR_DISTANCE'
  | 'POLYLINE_PERIMETER'
  | 'POLYGON_AREA'
  | 'COUNT_MARKER';

export interface DerivedQuantityLink {
  readonly linkId: string;
  readonly boqItemId: string;
  factor: number;
  derivedQuantity: number;
  status: MeasurementStatus;
}

export interface MeasurementRecord {
  readonly id: string;
  readonly provenance: MeasurementProvenance;
  readonly type: MeasurementType;
  label: string;
  readonly geometry: MeasurementGeometry;
  rawDocumentQuantity: number;
  calibratedQuantity: number;
  readonly declaredUnit: string;
  version: number;
  derivedQuantities: DerivedQuantityLink[];
  readonly createdAtUtc: string;
  updatedAtUtc: string;
}

export interface MeasurementFilter {
  readonly documentId?: string;
  readonly revisionId?: string;
  readonly pageIndex?: number;
  readonly calibrationId?: string;
  readonly status?: MeasurementStatus;
}

export class MeasurementRepository {
  private readonly store = new Map<string, MeasurementRecord>();

  save(record: MeasurementRecord): void {
    const existing = this.store.get(record.id);
    if (existing) {
      record.version = existing.version + 1;
      record.updatedAtUtc = new Date().toISOString();
    }
    this.store.set(record.id, record);
  }

  getById(id: string): MeasurementRecord | undefined {
    return this.store.get(id);
  }

  query(filter: MeasurementFilter): MeasurementRecord[] {
    const results: MeasurementRecord[] = [];
    for (const m of this.store.values()) {
      if (filter.documentId && m.provenance.documentId !== filter.documentId) continue;
      if (filter.revisionId && m.provenance.sourceRevisionId !== filter.revisionId) continue;
      if (filter.pageIndex !== undefined && m.provenance.pageIndex !== filter.pageIndex) continue;
      if (filter.calibrationId && m.provenance.calibrationId !== filter.calibrationId) continue;
      if (filter.status && m.provenance.status !== filter.status) continue;
      results.push(m);
    }
    return results;
  }

  getAll(): MeasurementRecord[] {
    return Array.from(this.store.values());
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }
}
