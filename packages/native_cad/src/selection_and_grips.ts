/**
 * CAD Selection and Grip State Engines (M07-T02).
 *
 * Implements:
 *  - Window selection (left-to-right box: fully enclosed entities)
 *  - Crossing selection (right-to-left box: enclosed or intersecting entities)
 *  - Point pick hit testing
 *  - Grip extraction (endpoints, midpoints, centers, quadrants)
 *  - Hot grip manipulation and stretching
 */

import type {
  CadEntity,
  Box2D,
  Point2D,
  GripPoint,
  LineEntity,
  CircleEntity,
  ArcEntity,
  LwPolylineEntity,
} from './types.js';
import type { CadDocument } from './cad_document.js';

export class CadSelectionEngine {
  private selectedHandles: Set<string> = new Set();

  select(handles: string[] | string): void {
    if (Array.isArray(handles)) {
      for (const h of handles) this.selectedHandles.add(h);
    } else {
      this.selectedHandles.add(handles);
    }
  }

  deselect(handles: string[] | string): void {
    if (Array.isArray(handles)) {
      for (const h of handles) this.selectedHandles.delete(h);
    } else {
      this.selectedHandles.delete(handles);
    }
  }

  clear(): void {
    this.selectedHandles.clear();
  }

  getSelectedHandles(): string[] {
    return Array.from(this.selectedHandles);
  }

  isSelected(handle: string): boolean {
    return this.selectedHandles.has(handle);
  }

  /**
   * Evaluates window or crossing box selection over drawing entities.
   *
   * Convention:
   *  p1.x <= p2.x -> Window selection (left-to-right): entity must be fully enclosed
   *  p1.x > p2.x  -> Crossing selection (right-to-left): entity can be enclosed or intersect
   */
  selectByBox(doc: CadDocument, p1: Point2D, p2: Point2D): string[] {
    const isCrossing = p2.x < p1.x;
    const box: Box2D = {
      minX: Math.min(p1.x, p2.x),
      minY: Math.min(p1.y, p2.y),
      maxX: Math.max(p1.x, p2.x),
      maxY: Math.max(p1.y, p2.y),
    };

    const newlySelected: string[] = [];

    // Fast-path: use spatial index if populated
    if (doc.spatialIndex && doc.spatialIndex.size() > 0) {
      const candidateHandles = doc.spatialIndex.search(box);
      for (const handle of candidateHandles) {
        const entity = doc.getEntity(handle);
        if (!entity) continue;
        const eBox = this.computeEntityBounds(entity);
        if (!eBox) continue;

        if (isCrossing) {
          if (this.boxesIntersect(box, eBox)) {
            this.selectedHandles.add(entity.handle);
            newlySelected.push(entity.handle);
          }
        } else {
          if (this.boxContains(box, eBox)) {
            this.selectedHandles.add(entity.handle);
            newlySelected.push(entity.handle);
          }
        }
      }
      return newlySelected;
    }

    // Fallback: full document linear scan
    for (const entity of doc.getAllEntities()) {
      const eBox = this.computeEntityBounds(entity);
      if (!eBox) continue;

      if (isCrossing) {
        // Intersects or inside
        if (this.boxesIntersect(box, eBox)) {
          this.selectedHandles.add(entity.handle);
          newlySelected.push(entity.handle);
        }
      } else {
        // Fully enclosed
        if (this.boxContains(box, eBox)) {
          this.selectedHandles.add(entity.handle);
          newlySelected.push(entity.handle);
        }
      }
    }

    return newlySelected;
  }

  /**
   * Point pick selection.
   */
  selectAtPoint(doc: CadDocument, pt: Point2D, tolerance: number = 0.5): string | null {
    if (doc.spatialIndex && doc.spatialIndex.size() > 0) {
      const candidateHandles = doc.spatialIndex.searchPoint(pt, tolerance);
      for (const handle of candidateHandles) {
        const entity = doc.getEntity(handle);
        if (!entity) continue;
        const eBox = this.computeEntityBounds(entity);
        if (!eBox) continue;
        if (
          pt.x >= eBox.minX - tolerance &&
          pt.x <= eBox.maxX + tolerance &&
          pt.y >= eBox.minY - tolerance &&
          pt.y <= eBox.maxY + tolerance
        ) {
          this.selectedHandles.add(entity.handle);
          return entity.handle;
        }
      }
      return null;
    }

    for (const entity of doc.getAllEntities()) {
      const eBox = this.computeEntityBounds(entity);
      if (!eBox) continue;
      // Broad phase
      if (
        pt.x >= eBox.minX - tolerance &&
        pt.x <= eBox.maxX + tolerance &&
        pt.y >= eBox.minY - tolerance &&
        pt.y <= eBox.maxY + tolerance
      ) {
        this.selectedHandles.add(entity.handle);
        return entity.handle;
      }
    }
    return null;
  }

  private computeEntityBounds(entity: CadEntity): Box2D | null {
    switch (entity.type) {
      case 'LINE':
        return {
          minX: Math.min(entity.start.x, entity.end.x),
          minY: Math.min(entity.start.y, entity.end.y),
          maxX: Math.max(entity.start.x, entity.end.x),
          maxY: Math.max(entity.start.y, entity.end.y),
        };
      case 'CIRCLE':
        return {
          minX: entity.center.x - entity.radius,
          minY: entity.center.y - entity.radius,
          maxX: entity.center.x + entity.radius,
          maxY: entity.center.y + entity.radius,
        };
      case 'ARC':
        return {
          minX: entity.center.x - entity.radius,
          minY: entity.center.y - entity.radius,
          maxX: entity.center.x + entity.radius,
          maxY: entity.center.y + entity.radius,
        };
      case 'LWPOLYLINE': {
        if (!entity.vertices || entity.vertices.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of entity.vertices) {
          if (v.x < minX) minX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.x > maxX) maxX = v.x;
          if (v.y > maxY) maxY = v.y;
        }
        return { minX, minY, maxX, maxY };
      }
      default:
        return null;
    }
  }

  private boxContains(container: Box2D, target: Box2D): boolean {
    return (
      container.minX <= target.minX &&
      container.maxX >= target.maxX &&
      container.minY <= target.minY &&
      container.maxY >= target.maxY
    );
  }

  private boxesIntersect(b1: Box2D, b2: Box2D): boolean {
    return !(
      b2.minX > b1.maxX ||
      b2.maxX < b1.minX ||
      b2.minY > b1.maxY ||
      b2.maxY < b1.minY
    );
  }
}

export class CadGripEngine {
  /**
   * Extracts grip points for selected entities.
   */
  extractGrips(entities: CadEntity[]): GripPoint[] {
    const grips: GripPoint[] = [];

    for (const ent of entities) {
      switch (ent.type) {
        case 'LINE': {
          grips.push({
            id: `${ent.handle}_start`,
            point: { ...ent.start },
            type: 'endpoint',
            entityHandle: ent.handle,
            index: 0,
            isHot: false,
          });
          grips.push({
            id: `${ent.handle}_mid`,
            point: {
              x: (ent.start.x + ent.end.x) / 2,
              y: (ent.start.y + ent.end.y) / 2,
            },
            type: 'midpoint',
            entityHandle: ent.handle,
            index: 1,
            isHot: false,
          });
          grips.push({
            id: `${ent.handle}_end`,
            point: { ...ent.end },
            type: 'endpoint',
            entityHandle: ent.handle,
            index: 2,
            isHot: false,
          });
          break;
        }
        case 'CIRCLE': {
          grips.push({
            id: `${ent.handle}_center`,
            point: { ...ent.center },
            type: 'center',
            entityHandle: ent.handle,
            index: 0,
            isHot: false,
          });
          // Quadrants
          const r = ent.radius;
          const quads: [number, number][] = [[r, 0], [0, r], [-r, 0], [0, -r]];
          quads.forEach(([dx, dy], i) => {
            grips.push({
              id: `${ent.handle}_quad_${i}`,
              point: { x: ent.center.x + dx, y: ent.center.y + dy },
              type: 'quadrant',
              entityHandle: ent.handle,
              index: i + 1,
              isHot: false,
            });
          });
          break;
        }
        case 'LWPOLYLINE': {
          ent.vertices.forEach((v, idx) => {
            grips.push({
              id: `${ent.handle}_v_${idx}`,
              point: { ...v },
              type: 'endpoint',
              entityHandle: ent.handle,
              index: idx,
              isHot: false,
            });
          });
          break;
        }
      }
    }

    return grips;
  }

  /**
   * Stretches or moves an entity via hot grip translation.
   */
  applyGripMove(entity: CadEntity, grip: GripPoint, newPoint: Point2D): CadEntity {
    switch (entity.type) {
      case 'LINE': {
        const updated: LineEntity = { ...entity };
        if (grip.index === 0) {
          // Move start endpoint
          updated.start = { ...newPoint };
        } else if (grip.index === 2) {
          // Move end endpoint
          updated.end = { ...newPoint };
        } else if (grip.index === 1) {
          // Move line by midpoint delta
          const dx = newPoint.x - (entity.start.x + entity.end.x) / 2;
          const dy = newPoint.y - (entity.start.y + entity.end.y) / 2;
          updated.start = { x: entity.start.x + dx, y: entity.start.y + dy };
          updated.end = { x: entity.end.x + dx, y: entity.end.y + dy };
        }
        return updated;
      }
      case 'CIRCLE': {
        const updated: CircleEntity = { ...entity };
        if (grip.type === 'center') {
          updated.center = { ...newPoint };
        } else if (grip.type === 'quadrant') {
          // Adjust radius to distance from center
          const dist = Math.hypot(newPoint.x - entity.center.x, newPoint.y - entity.center.y);
          updated.radius = dist;
        }
        return updated;
      }
      case 'LWPOLYLINE': {
        const updated: LwPolylineEntity = {
          ...entity,
          vertices: entity.vertices.map((v, i) => (i === grip.index ? { ...newPoint } : v)),
        };
        return updated;
      }
      default:
        return entity;
    }
  }
}
