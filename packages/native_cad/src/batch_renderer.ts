/**
 * CAD Bounded Visible Geometry Batch Engine (M07-T04).
 *
 * Implements:
 *  - Compact typed-array draw batches for GPU / WebGL / Canvas / IPC feeds
 *  - Zero per-entity bridge calls (flat memory structures)
 *  - Viewport-bounded query via R-tree spatial index
 *  - Screen-space culling and Level of Detail (LOD) policy
 *  - Instanced block rendering feed (cad-viewer prior-art pattern)
 *  - Scoped invalidation cache bypass for static viewports
 */

import type {
  CadEntity,
  Box2D,
  Point2D,
  LineEntity,
  CircleEntity,
  ArcEntity,
  LwPolylineEntity,
  DimensionEntity,
  HatchEntity,
  InsertEntity,
  TextEntity,
} from './types.js';
import type { CadDocument } from './cad_document.js';
import { computeEntityBounds, type SpatialItem } from './spatial_index.js';

export interface ViewportQuery {
  bounds: Box2D;
  zoomFactor: number; // Pixels per model drawing unit
  cullingPixelThreshold?: number; // Minimum pixel dimension to be rendered (default: 1.0 px)
  maxBatchEntities?: number; // Hard ceiling to guarantee bounded memory frame budget
}

export interface LineBatch {
  // [x1, y1, x2, y2, colorInt, lineweight, layerIdx] * N
  buffer: Float32Array;
  count: number;
}

export interface ArcCircleBatch {
  // [cx, cy, radius, startAngle, endAngle, colorInt, lineweight, layerIdx] * N
  buffer: Float32Array;
  count: number;
}

export interface PolylineBatch {
  vertexCoordinates: Float32Array; // Flattened [x, y] coordinates
  polylineOffsets: Uint32Array;    // Offset index in vertexCoordinates
  polylineLengths: Uint32Array;    // Number of vertices per polyline
  metadata: Float32Array;           // [closed, colorInt, lineweight, layerIdx] * N
  count: number;
}

export interface DimensionBatch {
  // [def1X, def1Y, def2X, def2Y, textX, textY, measurement, colorInt, layerIdx] * N
  buffer: Float32Array;
  count: number;
  textOverrides: (string | undefined)[];
}

export interface HatchBatch {
  boundaryOffsets: Uint32Array;
  boundaryLengths: Uint32Array;
  boundaryVertices: Float32Array;
  patterns: string[];
  count: number;
}

export interface TextBatch {
  // [x, y, height, rotation, colorInt, layerIdx] * N
  positions: Float32Array;
  strings: string[];
  count: number;
}

export interface BlockInstanceBatch {
  // Instanced rendering payload: [x, y, scaleX, scaleY, rotation, colorInt, layerIdx] * N
  transforms: Float32Array;
  blockNames: string[];
  count: number;
}

export interface CompactGeometryBatches {
  lines: LineBatch;
  arcsAndCircles: ArcCircleBatch;
  polylines: PolylineBatch;
  dimensions: DimensionBatch;
  hatches: HatchBatch;
  texts: TextBatch;
  instances: BlockInstanceBatch;
}

export interface BatchRenderResult {
  batches: CompactGeometryBatches;
  stats: {
    queriedCount: number;
    culledCount: number;
    batchedCount: number;
    estimatedMemoryBytes: number;
    queryTimeMs: number;
    batchTimeMs: number;
    isBounded: boolean;
  };
  viewport: ViewportQuery;
  revision: number;
  layerMap: Record<string, number>;
}

export class CadBatchRendererFeed {
  private static parseColor(color?: string | number): number {
    if (typeof color === 'number') return color;
    if (typeof color === 'string') {
      if (color.startsWith('#')) {
        return parseInt(color.slice(1), 16) || 0xffffff;
      }
      return 0xffffff;
    }
    return 0xffffff;
  }

  /**
   * Generates bounded visible geometry batches for the requested viewport window.
   */
  static generateBatches(doc: CadDocument, viewport: ViewportQuery): BatchRenderResult {
    const startTime = performance.now();
    const cullingThreshold = viewport.cullingPixelThreshold ?? 1.0;
    const maxEntities = viewport.maxBatchEntities ?? 50000;

    // 1. Broad phase query via R-tree spatial index (bounded by maxEntities * 2)
    const spatialItems: SpatialItem[] =
      (doc as any).spatialIndex?.searchDetailed(viewport.bounds, maxEntities * 2) ?? [];
    const queryEndTime = performance.now();
    const queryTimeMs = queryEndTime - startTime;

    // Collect layers to assign compact integer layer IDs
    const layerNames = doc.getLayers();
    const layerMap: Record<string, number> = {};
    layerNames.forEach((l, idx) => {
      layerMap[l] = idx;
    });

    // Temporary collectors
    const lineEntries: number[] = [];
    const arcCircleEntries: number[] = [];
    const polylineVertices: number[] = [];
    const polylineOffsets: number[] = [];
    const polylineLengths: number[] = [];
    const polylineMeta: number[] = [];
    const dimEntries: number[] = [];
    const dimTexts: (string | undefined)[] = [];
    const hatchOffsets: number[] = [];
    const hatchLengths: number[] = [];
    const hatchVerts: number[] = [];
    const hatchPatterns: string[] = [];
    const textPositions: number[] = [];
    const textStrings: string[] = [];
    const instTransforms: number[] = [];
    const instNames: string[] = [];

    let queriedCount = 0;
    let culledCount = 0;
    let batchedCount = 0;

    for (const item of spatialItems) {
      if (batchedCount >= maxEntities) {
        break;
      }
      queriedCount++;

      // 2. Screen-space Level of Detail (LOD) & Culling Policy
      const box = item.box;
      const extentX = Math.max(0, box.maxX - box.minX);
      const extentY = Math.max(0, box.maxY - box.minY);
      const screenExtentPx = Math.max(extentX, extentY) * viewport.zoomFactor;

      if (screenExtentPx < cullingThreshold) {
        culledCount++;
        continue;
      }

      const entity = doc.getEntity(item.id);
      if (!entity || entity.visible === false) continue;

      const colorInt = this.parseColor(entity.color);
      const lineweight = entity.lineweight ?? 25;
      const layerIdx = layerMap[entity.layer] ?? 0;

      // 3. Compact Typed Buffer Packing by Primitive
      switch (entity.type) {
        case 'LINE': {
          const l = entity as LineEntity;
          lineEntries.push(l.start.x, l.start.y, l.end.x, l.end.y, colorInt, lineweight, layerIdx);
          batchedCount++;
          break;
        }
        case 'CIRCLE': {
          const c = entity as CircleEntity;
          arcCircleEntries.push(c.center.x, c.center.y, c.radius, 0, 2 * Math.PI, colorInt, lineweight, layerIdx);
          batchedCount++;
          break;
        }
        case 'ARC': {
          const a = entity as ArcEntity;
          arcCircleEntries.push(a.center.x, a.center.y, a.radius, a.startAngle, a.endAngle, colorInt, lineweight, layerIdx);
          batchedCount++;
          break;
        }
        case 'LWPOLYLINE': {
          const p = entity as LwPolylineEntity;
          if (p.vertices && p.vertices.length > 0) {
            polylineOffsets.push(polylineVertices.length / 2);
            polylineLengths.push(p.vertices.length);
            for (const v of p.vertices) {
              polylineVertices.push(v.x, v.y);
            }
            polylineMeta.push(p.closed ? 1 : 0, colorInt, lineweight, layerIdx);
            batchedCount++;
          }
          break;
        }
        case 'DIMENSION': {
          const d = entity as DimensionEntity;
          dimEntries.push(
            d.defPoint1.x,
            d.defPoint1.y,
            d.defPoint2.x,
            d.defPoint2.y,
            d.textPosition.x,
            d.textPosition.y,
            d.measurement,
            colorInt,
            layerIdx
          );
          dimTexts.push(d.textOverride);
          batchedCount++;
          break;
        }
        case 'HATCH': {
          const h = entity as HatchEntity;
          // Hatch proxy boundary
          hatchOffsets.push(hatchVerts.length / 2);
          hatchLengths.push(4);
          hatchVerts.push(
            box.minX, box.minY,
            box.maxX, box.minY,
            box.maxX, box.maxY,
            box.minX, box.maxY
          );
          hatchPatterns.push(h.patternName || 'SOLID');
          batchedCount++;
          break;
        }
        case 'TEXT':
        case 'MTEXT': {
          const t = entity as TextEntity;
          // Sub-pixel text culling: if text glyph height is < 2.0px, cull text rendering
          if ((t.height || 2.5) * viewport.zoomFactor < 2.0) {
            culledCount++;
            continue;
          }
          textPositions.push(
            t.position.x,
            t.position.y,
            t.height || 2.5,
            t.rotation || 0,
            colorInt,
            layerIdx
          );
          textStrings.push(t.text || '');
          batchedCount++;
          break;
        }
        case 'INSERT': {
          const ins = entity as InsertEntity;
          // Instanced rendering feed (cad-viewer pattern)
          instTransforms.push(
            ins.insertionPoint.x,
            ins.insertionPoint.y,
            ins.scale?.x ?? 1,
            ins.scale?.y ?? 1,
            ins.rotation ?? 0,
            colorInt,
            layerIdx
          );
          instNames.push(ins.blockName);
          batchedCount++;
          break;
        }
      }
    }

    // 4. Construct compact TypedArrays
    const lineBatch: LineBatch = {
      buffer: new Float32Array(lineEntries),
      count: lineEntries.length / 7,
    };

    const arcCircleBatch: ArcCircleBatch = {
      buffer: new Float32Array(arcCircleEntries),
      count: arcCircleEntries.length / 8,
    };

    const polylineBatch: PolylineBatch = {
      vertexCoordinates: new Float32Array(polylineVertices),
      polylineOffsets: new Uint32Array(polylineOffsets),
      polylineLengths: new Uint32Array(polylineLengths),
      metadata: new Float32Array(polylineMeta),
      count: polylineOffsets.length,
    };

    const dimBatch: DimensionBatch = {
      buffer: new Float32Array(dimEntries),
      count: dimEntries.length / 9,
      textOverrides: dimTexts,
    };

    const hatchBatch: HatchBatch = {
      boundaryOffsets: new Uint32Array(hatchOffsets),
      boundaryLengths: new Uint32Array(hatchLengths),
      boundaryVertices: new Float32Array(hatchVerts),
      patterns: hatchPatterns,
      count: hatchOffsets.length,
    };

    const textBatch: TextBatch = {
      positions: new Float32Array(textPositions),
      strings: textStrings,
      count: textStrings.length,
    };

    const instanceBatch: BlockInstanceBatch = {
      transforms: new Float32Array(instTransforms),
      blockNames: instNames,
      count: instNames.length,
    };

    const batchEndTime = performance.now();
    const batchTimeMs = batchEndTime - queryEndTime;

    // Calculate total buffer memory footprint
    const memoryBytes =
      lineBatch.buffer.byteLength +
      arcCircleBatch.buffer.byteLength +
      polylineBatch.vertexCoordinates.byteLength +
      polylineBatch.polylineOffsets.byteLength +
      polylineBatch.polylineLengths.byteLength +
      polylineBatch.metadata.byteLength +
      dimBatch.buffer.byteLength +
      hatchBatch.boundaryOffsets.byteLength +
      hatchBatch.boundaryLengths.byteLength +
      hatchBatch.boundaryVertices.byteLength +
      textBatch.positions.byteLength +
      instanceBatch.transforms.byteLength;

    return {
      batches: {
        lines: lineBatch,
        arcsAndCircles: arcCircleBatch,
        polylines: polylineBatch,
        dimensions: dimBatch,
        hatches: hatchBatch,
        texts: textBatch,
        instances: instanceBatch,
      },
      stats: {
        queriedCount,
        culledCount,
        batchedCount,
        estimatedMemoryBytes: memoryBytes,
        queryTimeMs,
        batchTimeMs,
        isBounded: batchedCount < (viewport.maxBatchEntities ?? Infinity),
      },
      viewport,
      revision: doc.revision,
      layerMap,
    };
  }

  /**
   * Generates batches only if the requested viewport intersects a dirty invalidation region.
   * If clean, returns null to allow the client to preserve its rendered canvas/texture.
   */
  static generateDirtyBatches(
    doc: CadDocument,
    viewport: ViewportQuery,
    lastCleanRevision: number
  ): BatchRenderResult | null {
    const tracker = (doc as any).invalidationTracker;
    if (tracker && lastCleanRevision >= doc.revision) {
      return null;
    }

    if (tracker && !tracker.isRegionDirty(viewport.bounds) && lastCleanRevision > 0) {
      return null;
    }

    return this.generateBatches(doc, viewport);
  }
}
