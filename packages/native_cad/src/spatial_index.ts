/**
 * CAD Spatial Index & Dirty Region Invalidation Engine (M07-T04).
 *
 * Implements:
 *  - 2D R-tree spatial index with Sort-Tile-Recursive (STR) bulk loader
 *  - Dynamic insertion, update, and removal of CAD entities
 *  - O(log N) bounding box range search and point pick hit queries
 *  - Full bounding box calculator for all CadEntity types (Line, Circle, Arc, Polyline, Dimension, Hatch, Insert, Text)
 *  - Scoped invalidation tracker for incremental rendering and tile cache invalidation
 */

import type {
  CadEntity,
  Box2D,
  Point2D,
  CadEntityType,
  LineEntity,
  CircleEntity,
  ArcEntity,
  LwPolylineEntity,
  DimensionEntity,
  HatchEntity,
  InsertEntity,
  TextEntity,
} from './types.js';

export interface SpatialItem {
  id: string; // Handle
  box: Box2D;
  type: CadEntityType;
  layer?: string;
}

export function boxesIntersect(a: Box2D, b: Box2D): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function boxContains(outer: Box2D, inner: Box2D): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.maxX >= inner.maxX &&
    outer.minY <= inner.minY &&
    outer.maxY >= inner.maxY
  );
}

export function boxUnion(a: Box2D, b: Box2D): Box2D {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function boxArea(b: Box2D): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

export function boxMargin(b: Box2D): number {
  return (b.maxX - b.minX) + (b.maxY - b.minY);
}

/**
 * Computes tight axis-aligned 2D bounding boxes for all CAD entity types.
 */
export function computeEntityBounds(entity: CadEntity): Box2D | null {
  switch (entity.type) {
    case 'LINE': {
      const line = entity as LineEntity;
      return {
        minX: Math.min(line.start.x, line.end.x),
        minY: Math.min(line.start.y, line.end.y),
        maxX: Math.max(line.start.x, line.end.x),
        maxY: Math.max(line.start.y, line.end.y),
      };
    }
    case 'CIRCLE': {
      const circle = entity as CircleEntity;
      return {
        minX: circle.center.x - circle.radius,
        minY: circle.center.y - circle.radius,
        maxX: circle.center.x + circle.radius,
        maxY: circle.center.y + circle.radius,
      };
    }
    case 'ARC': {
      const arc = entity as ArcEntity;
      // Exact arc bounding box: check start, end, and quadrant extreme points
      let minX = Math.min(
        arc.center.x + arc.radius * Math.cos(arc.startAngle),
        arc.center.x + arc.radius * Math.cos(arc.endAngle)
      );
      let maxX = Math.max(
        arc.center.x + arc.radius * Math.cos(arc.startAngle),
        arc.center.x + arc.radius * Math.cos(arc.endAngle)
      );
      let minY = Math.min(
        arc.center.y + arc.radius * Math.sin(arc.startAngle),
        arc.center.y + arc.radius * Math.sin(arc.endAngle)
      );
      let maxY = Math.max(
        arc.center.y + arc.radius * Math.sin(arc.startAngle),
        arc.center.y + arc.radius * Math.sin(arc.endAngle)
      );

      // Normalize angles into [0, 2pi)
      const TWO_PI = 2 * Math.PI;
      const normalizeAngle = (a: number) => {
        let n = a % TWO_PI;
        if (n < 0) n += TWO_PI;
        return n;
      };

      const start = normalizeAngle(arc.startAngle);
      const end = normalizeAngle(arc.endAngle);

      const angleInSweep = (angle: number) => {
        if (start <= end) {
          return angle >= start && angle <= end;
        }
        return angle >= start || angle <= end;
      };

      // Check quadrant extremes: 0 (right), pi/2 (top), pi (left), 3pi/2 (bottom)
      if (angleInSweep(0)) maxX = Math.max(maxX, arc.center.x + arc.radius);
      if (angleInSweep(Math.PI / 2)) maxY = Math.max(maxY, arc.center.y + arc.radius);
      if (angleInSweep(Math.PI)) minX = Math.min(minX, arc.center.x - arc.radius);
      if (angleInSweep((3 * Math.PI) / 2)) minY = Math.min(minY, arc.center.y - arc.radius);

      return { minX, minY, maxX, maxY };
    }
    case 'LWPOLYLINE': {
      const poly = entity as LwPolylineEntity;
      if (!poly.vertices || poly.vertices.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const v of poly.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      return { minX, minY, maxX, maxY };
    }
    case 'DIMENSION': {
      const dim = entity as DimensionEntity;
      const xs = [dim.defPoint1.x, dim.defPoint2.x, dim.textPosition.x];
      const ys = [dim.defPoint1.y, dim.defPoint2.y, dim.textPosition.y];
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    }
    case 'HATCH': {
      const hatch = entity as HatchEntity;
      if (hatch.bounds) return { ...hatch.bounds };
      if (hatch.boundaryVertices && hatch.boundaryVertices.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const v of hatch.boundaryVertices) {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }
        return { minX, minY, maxX, maxY };
      }
      return null;
    }
    case 'INSERT': {
      const ins = entity as InsertEntity;
      const scaleX = ins.scale?.x ?? 1;
      const scaleY = ins.scale?.y ?? 1;
      const radius = Math.max(Math.abs(scaleX), Math.abs(scaleY), 1) * 10;
      return {
        minX: ins.insertionPoint.x - radius,
        minY: ins.insertionPoint.y - radius,
        maxX: ins.insertionPoint.x + radius,
        maxY: ins.insertionPoint.y + radius,
      };
    }
    case 'TEXT':
    case 'MTEXT': {
      const txt = entity as TextEntity;
      const height = txt.height || 2.5;
      const width = (txt.text?.length || 1) * height * 0.6;
      return {
        minX: txt.position.x,
        minY: txt.position.y,
        maxX: txt.position.x + width,
        maxY: txt.position.y + height,
      };
    }
    default:
      return null;
  }
}

interface RTreeNode {
  box: Box2D;
  children: (RTreeNode | SpatialItem)[];
  isLeaf: boolean;
  parent: RTreeNode | null;
}

/**
 * 2D R-Tree Spatial Index for high-performance CAD viewports, selection, and snapping.
 */
export class CadSpatialIndex {
  private root: RTreeNode;
  private readonly maxEntries: number;
  private readonly minEntries: number;
  private itemMap: Map<string, { item: SpatialItem; node: RTreeNode }> = new Map();

  constructor(maxEntries: number = 16) {
    this.maxEntries = Math.max(4, maxEntries);
    this.minEntries = Math.max(2, Math.floor(this.maxEntries / 2));
    this.root = this.createEmptyNode(true, null);
  }

  private createEmptyNode(isLeaf: boolean, parent: RTreeNode | null): RTreeNode {
    return {
      box: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      children: [],
      isLeaf,
      parent,
    };
  }

  size(): number {
    return this.itemMap.size;
  }

  getBounds(): Box2D | null {
    if (this.itemMap.size === 0) return null;
    return { ...this.root.box };
  }

  clear(): void {
    this.root = this.createEmptyNode(true, null);
    this.itemMap.clear();
  }

  /**
   * Sort-Tile-Recursive (STR) Bulk Loader.
   * Builds an optimally packed, balanced R-Tree in O(N log N) time.
   */
  load(items: SpatialItem[]): void {
    this.clear();
    if (items.length === 0) return;

    for (const it of items) {
      if (!it.box) continue;
      this.itemMap.set(it.id, { item: it, node: null as any });
    }

    const validItems = items.filter((it) => it.box != null);
    if (validItems.length === 0) return;

    this.root = this.buildSTR(validItems, true);
    this.root.parent = null;
  }

  private buildSTR(items: SpatialItem[], isBottomLeaf: boolean): RTreeNode {
    const N = items.length;
    if (N <= this.maxEntries) {
      const leaf = this.createEmptyNode(true, null);
      for (const it of items) {
        leaf.children.push(it);
        this.updateNodeBoundsWithItem(leaf, it.box);
        const entry = this.itemMap.get(it.id);
        if (entry) entry.node = leaf;
      }
      return leaf;
    }

    // Number of leaf nodes needed
    const numLeaves = Math.ceil(N / this.maxEntries);
    // Grid side dimension
    const numTiles = Math.ceil(Math.sqrt(numLeaves));
    const itemsPerTile = numTiles * this.maxEntries;

    // Sort items along X-axis center
    items.sort((a, b) => (a.box.minX + a.box.maxX) / 2 - (b.box.minX + b.box.maxX) / 2);

    const leafNodes: RTreeNode[] = [];

    // Slice along X into tiles, then sort each tile along Y
    for (let i = 0; i < N; i += itemsPerTile) {
      const tile = items.slice(i, i + itemsPerTile);
      tile.sort((a, b) => (a.box.minY + a.box.maxY) / 2 - (b.box.minY + b.box.maxY) / 2);

      for (let j = 0; j < tile.length; j += this.maxEntries) {
        const chunk = tile.slice(j, j + this.maxEntries);
        const leaf = this.createEmptyNode(true, null);
        for (const it of chunk) {
          leaf.children.push(it);
          this.updateNodeBoundsWithItem(leaf, it.box);
          const entry = this.itemMap.get(it.id);
          if (entry) entry.node = leaf;
        }
        leafNodes.push(leaf);
      }
    }

    // Recursively build upper internal levels
    return this.buildUpperLevels(leafNodes);
  }

  private buildUpperLevels(nodes: RTreeNode[]): RTreeNode {
    if (nodes.length <= this.maxEntries) {
      const parent = this.createEmptyNode(false, null);
      for (const node of nodes) {
        parent.children.push(node);
        node.parent = parent;
        this.updateNodeBoundsWithItem(parent, node.box);
      }
      return parent;
    }

    const N = nodes.length;
    const numParents = Math.ceil(N / this.maxEntries);
    const numTiles = Math.ceil(Math.sqrt(numParents));
    const nodesPerTile = numTiles * this.maxEntries;

    nodes.sort((a, b) => (a.box.minX + a.box.maxX) / 2 - (b.box.minX + b.box.maxX) / 2);

    const upperNodes: RTreeNode[] = [];

    for (let i = 0; i < N; i += nodesPerTile) {
      const tile = nodes.slice(i, i + nodesPerTile);
      tile.sort((a, b) => (a.box.minY + a.box.maxY) / 2 - (b.box.minY + b.box.maxY) / 2);

      for (let j = 0; j < tile.length; j += this.maxEntries) {
        const chunk = tile.slice(j, j + this.maxEntries);
        const parent = this.createEmptyNode(false, null);
        for (const child of chunk) {
          parent.children.push(child);
          child.parent = parent;
          this.updateNodeBoundsWithItem(parent, child.box);
        }
        upperNodes.push(parent);
      }
    }

    return this.buildUpperLevels(upperNodes);
  }

  private updateNodeBoundsWithItem(node: RTreeNode, box: Box2D): void {
    if (node.box.minX > box.minX) node.box.minX = box.minX;
    if (node.box.minY > box.minY) node.box.minY = box.minY;
    if (node.box.maxX < box.maxX) node.box.maxX = box.maxX;
    if (node.box.maxY < box.maxY) node.box.maxY = box.maxY;
  }

  private recomputeNodeBounds(node: RTreeNode): void {
    node.box.minX = Infinity;
    node.box.minY = Infinity;
    node.box.maxX = -Infinity;
    node.box.maxY = -Infinity;

    for (const child of node.children) {
      const childBox = node.isLeaf ? (child as SpatialItem).box : (child as RTreeNode).box;
      if (childBox) {
        if (node.box.minX > childBox.minX) node.box.minX = childBox.minX;
        if (node.box.minY > childBox.minY) node.box.minY = childBox.minY;
        if (node.box.maxX < childBox.maxX) node.box.maxX = childBox.maxX;
        if (node.box.maxY < childBox.maxY) node.box.maxY = childBox.maxY;
      }
    }
  }

  /**
   * Inserts an item into the R-Tree.
   */
  insert(item: SpatialItem): void {
    if (!item.box) return;
    if (this.itemMap.has(item.id)) {
      this.remove(item.id);
    }

    const leaf = this.chooseLeaf(this.root, item.box);
    leaf.children.push(item);
    this.updateNodeBoundsWithItem(leaf, item.box);
    this.itemMap.set(item.id, { item, node: leaf });

    if (leaf.children.length > this.maxEntries) {
      this.split(leaf);
    } else {
      this.adjustBoundsUp(leaf);
    }
  }

  /**
   * Updates an existing entity's bounding box in the index.
   */
  update(item: SpatialItem): void {
    this.remove(item.id);
    this.insert(item);
  }

  /**
   * Removes an entity by handle.
   */
  remove(id: string): boolean {
    const entry = this.itemMap.get(id);
    if (!entry) return false;

    const node = entry.node;
    const idx = node.children.findIndex((c) => (c as SpatialItem).id === id);
    if (idx !== -1) {
      node.children.splice(idx, 1);
      this.itemMap.delete(id);
      this.recomputeNodeBounds(node);
      this.adjustBoundsUp(node);
      return true;
    }
    this.itemMap.delete(id);
    return false;
  }

  private chooseLeaf(node: RTreeNode, box: Box2D): RTreeNode {
    if (node.isLeaf) return node;

    let bestChild = node.children[0] as RTreeNode;
    let minEnlargement = Infinity;
    let minArea = Infinity;

    for (const child of node.children as RTreeNode[]) {
      const area = boxArea(child.box);
      const enlargedArea = boxArea(boxUnion(child.box, box));
      const enlargement = enlargedArea - area;

      if (enlargement < minEnlargement) {
        minEnlargement = enlargement;
        minArea = area;
        bestChild = child;
      } else if (enlargement === minEnlargement && area < minArea) {
        minArea = area;
        bestChild = child;
      }
    }

    return this.chooseLeaf(bestChild, box);
  }

  private split(node: RTreeNode): void {
    // Quadratic split
    const children = node.children;
    node.children = [];

    // Find seeds with maximum dead area
    let seed1 = 0;
    let seed2 = 1;
    let maxD = -1;

    for (let i = 0; i < children.length - 1; i++) {
      const boxA = node.isLeaf ? (children[i] as SpatialItem).box : (children[i] as RTreeNode).box;
      for (let j = i + 1; j < children.length; j++) {
        const boxB = node.isLeaf ? (children[j] as SpatialItem).box : (children[j] as RTreeNode).box;
        const d = boxArea(boxUnion(boxA, boxB)) - boxArea(boxA) - boxArea(boxB);
        if (d > maxD) {
          maxD = d;
          seed1 = i;
          seed2 = j;
        }
      }
    }

    const newNode = this.createEmptyNode(node.isLeaf, node.parent);

    const itemA = children[seed1];
    const itemB = children[seed2];

    node.children.push(itemA);
    newNode.children.push(itemB);

    if (node.isLeaf) {
      this.itemMap.get((itemA as SpatialItem).id)!.node = node;
      this.itemMap.get((itemB as SpatialItem).id)!.node = newNode;
    } else {
      (itemA as RTreeNode).parent = node;
      (itemB as RTreeNode).parent = newNode;
    }

    this.recomputeNodeBounds(node);
    this.recomputeNodeBounds(newNode);

    // Distribute remaining children
    const remaining = children.filter((_, i) => i !== seed1 && i !== seed2);
    for (const child of remaining) {
      const childBox = node.isLeaf ? (child as SpatialItem).box : (child as RTreeNode).box;
      const enlA = boxArea(boxUnion(node.box, childBox)) - boxArea(node.box);
      const enlB = boxArea(boxUnion(newNode.box, childBox)) - boxArea(newNode.box);

      if (enlA < enlB) {
        node.children.push(child);
        this.updateNodeBoundsWithItem(node, childBox);
        if (node.isLeaf) this.itemMap.get((child as SpatialItem).id)!.node = node;
        else (child as RTreeNode).parent = node;
      } else {
        newNode.children.push(child);
        this.updateNodeBoundsWithItem(newNode, childBox);
        if (node.isLeaf) this.itemMap.get((child as SpatialItem).id)!.node = newNode;
        else (child as RTreeNode).parent = newNode;
      }
    }

    if (node === this.root) {
      const newRoot = this.createEmptyNode(false, null);
      newRoot.children.push(node, newNode);
      node.parent = newRoot;
      newNode.parent = newRoot;
      this.recomputeNodeBounds(newRoot);
      this.root = newRoot;
    } else if (node.parent) {
      node.parent.children.push(newNode);
      newNode.parent = node.parent;
      this.recomputeNodeBounds(node.parent);
      if (node.parent.children.length > this.maxEntries) {
        this.split(node.parent);
      } else {
        this.adjustBoundsUp(node.parent);
      }
    }
  }

  private adjustBoundsUp(node: RTreeNode | null): void {
    let curr = node;
    while (curr) {
      this.recomputeNodeBounds(curr);
      curr = curr.parent;
    }
  }

  /**
   * Spatial range search: returns entity handles whose bounding box intersects `box`.
   */
  search(box: Box2D): string[] {
    const results: string[] = [];
    if (this.itemMap.size === 0 || !boxesIntersect(this.root.box, box)) {
      return results;
    }
    this.searchRecursive(this.root, box, results);
    return results;
  }

  /**
   * Detailed spatial range search returning complete `SpatialItem` objects.
   */
  searchDetailed(box: Box2D): SpatialItem[] {
    const results: SpatialItem[] = [];
    if (this.itemMap.size === 0 || !boxesIntersect(this.root.box, box)) {
      return results;
    }
    this.searchDetailedRecursive(this.root, box, results);
    return results;
  }

  /**
   * Point pick search: returns entity handles within `tolerance` of `pt`.
   */
  searchPoint(pt: Point2D, tolerance: number = 0.5): string[] {
    const box: Box2D = {
      minX: pt.x - tolerance,
      minY: pt.y - tolerance,
      maxX: pt.x + tolerance,
      maxY: pt.y + tolerance,
    };
    return this.search(box);
  }

  private searchRecursive(node: RTreeNode, box: Box2D, results: string[]): void {
    if (!boxesIntersect(node.box, box)) return;

    if (node.isLeaf) {
      for (const child of node.children as SpatialItem[]) {
        if (boxesIntersect(child.box, box)) {
          results.push(child.id);
        }
      }
    } else {
      for (const child of node.children as RTreeNode[]) {
        if (boxesIntersect(child.box, box)) {
          this.searchRecursive(child, box, results);
        }
      }
    }
  }

  private searchDetailedRecursive(node: RTreeNode, box: Box2D, results: SpatialItem[]): void {
    if (!boxesIntersect(node.box, box)) return;

    if (node.isLeaf) {
      for (const child of node.children as SpatialItem[]) {
        if (boxesIntersect(child.box, box)) {
          results.push(child);
        }
      }
    } else {
      for (const child of node.children as RTreeNode[]) {
        if (boxesIntersect(child.box, box)) {
          this.searchDetailedRecursive(child, box, results);
        }
      }
    }
  }
}

/**
 * Dirty Region and Invalidation Tracker (M07-T04).
 * Scopes invalidation to changed spatial bounds, preventing expensive full-scene rebuilds.
 */
export interface DirtyRegion {
  box: Box2D;
  entityHandle?: string;
  revision: number;
}

export class CadInvalidationTracker {
  private dirtyRegions: DirtyRegion[] = [];
  private aggregatedEnvelope: Box2D | null = null;
  private currentRevision: number = 0;

  markDirty(box: Box2D, entityHandle?: string): void {
    if (!box) return;
    this.currentRevision++;
    const region: DirtyRegion = {
      box: { ...box },
      entityHandle,
      revision: this.currentRevision,
    };
    this.dirtyRegions.push(region);

    if (!this.aggregatedEnvelope) {
      this.aggregatedEnvelope = { ...box };
    } else {
      this.aggregatedEnvelope = boxUnion(this.aggregatedEnvelope, box);
    }
  }

  getDirtyRegions(): DirtyRegion[] {
    return [...this.dirtyRegions];
  }

  getAggregatedDirtyEnvelope(): Box2D | null {
    return this.aggregatedEnvelope ? { ...this.aggregatedEnvelope } : null;
  }

  isRegionDirty(queryBox: Box2D): boolean {
    if (!this.aggregatedEnvelope || !boxesIntersect(this.aggregatedEnvelope, queryBox)) {
      return false;
    }
    for (const r of this.dirtyRegions) {
      if (boxesIntersect(r.box, queryBox)) {
        return true;
      }
    }
    return false;
  }

  isDirty(): boolean {
    return this.dirtyRegions.length > 0;
  }

  getRevision(): number {
    return this.currentRevision;
  }

  reset(): void {
    this.dirtyRegions = [];
    this.aggregatedEnvelope = null;
  }
}
