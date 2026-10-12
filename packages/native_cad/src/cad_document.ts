/**
 * In-Memory CAD Document Model (M07-T02).
 *
 * Holds drawing database, entity tables, layers, layouts, and revision state.
 * Direct entity modifications outside the command boundary are restricted.
 */

import type { CadEntity, LayoutState, UnitSettings, OrthoSettings } from './types.js';
import {
  CadSpatialIndex,
  CadInvalidationTracker,
  computeEntityBounds,
  type SpatialItem,
} from './spatial_index.js';

export class CadDocument {
  readonly id: string;
  revision: number = 0;
  private entitiesByHandle: Map<string, CadEntity> = new Map();
  private layers: Set<string> = new Set(['0']);
  private handleCounter: number = 1;

  readonly spatialIndex: CadSpatialIndex = new CadSpatialIndex();
  readonly invalidationTracker: CadInvalidationTracker = new CadInvalidationTracker();

  units: UnitSettings = {
    format: 'decimal',
    precision: 2,
    insertionUnits: 'millimeters',
  };

  ortho: OrthoSettings = {
    enabled: false,
  };

  layoutState: LayoutState = {
    activeSpace: 'model',
    activeLayoutName: 'Model',
    layouts: ['Model', 'Layout1'],
    layoutDefinitions: {
      Model: {
        name: 'Model',
        paperSize: 'CUSTOM',
        widthMm: 0,
        heightMm: 0,
        orientation: 'landscape',
        viewports: [],
      },
      Layout1: {
        name: 'Layout1',
        paperSize: 'ISO_A1',
        widthMm: 841,
        heightMm: 594,
        orientation: 'landscape',
        viewports: [
          {
            id: 'VP1',
            boundsOnPaperMm: { minX: 20, minY: 20, maxX: 821, maxY: 574 },
            modelCenter: { x: 0, y: 0 },
            scale: 0.01, // 1:100
            targetSpace: 'model',
          },
        ],
      },
    },
    viewports: [],
  };

  sourceVersion: string = 'AC1015';
  unsupportedObjects: import('./types.js').UnsupportedObjectRecord[] = [];

  setActiveSpace(space: import('./types.js').SpaceMode): void {
    this.layoutState.activeSpace = space;
    this.revision++;
  }

  setActiveLayout(layoutName: string): void {
    if (!this.layoutState.layouts.includes(layoutName)) {
      this.layoutState.layouts.push(layoutName);
    }
    this.layoutState.activeLayoutName = layoutName;
    this.layoutState.activeSpace = layoutName === 'Model' ? 'model' : 'paper';
    this.revision++;
  }

  addLayout(layout: import('./types.js').LayoutDefinition): void {
    if (!this.layoutState.layoutDefinitions) {
      this.layoutState.layoutDefinitions = {};
    }
    this.layoutState.layoutDefinitions[layout.name] = layout;
    if (!this.layoutState.layouts.includes(layout.name)) {
      this.layoutState.layouts.push(layout.name);
    }
    this.revision++;
  }

  getLayout(name: string): import('./types.js').LayoutDefinition | undefined {
    return this.layoutState.layoutDefinitions?.[name];
  }

  constructor(id: string = `cad_doc_${Math.random().toString(36).slice(2, 9)}`) {
    this.id = id;
  }

  nextHandle(): string {
    const handleHex = this.handleCounter.toString(16).toUpperCase();
    this.handleCounter++;
    return handleHex;
  }

  ensureHandleSeed(handleHex: string): void {
    const parsed = parseInt(handleHex, 16);
    if (!Number.isNaN(parsed) && parsed >= this.handleCounter) {
      this.handleCounter = parsed + 1;
    }
  }

  // --- Entity queries (safe read-only) ---

  getEntity(handle: string): CadEntity | undefined {
    return this.entitiesByHandle.get(handle);
  }

  getAllEntities(): CadEntity[] {
    return Array.from(this.entitiesByHandle.values());
  }

  getEntityCount(): number {
    return this.entitiesByHandle.size;
  }

  getLayers(): string[] {
    return Array.from(this.layers);
  }

  hasLayer(layer: string): boolean {
    return this.layers.has(layer);
  }

  addLayer(layer: string): void {
    this.layers.add(layer);
  }

  /**
   * Bulk loads a collection of entities, utilizing STR R-tree bulk loading.
   */
  bulkLoad(entities: CadEntity[]): void {
    const spatialItems: SpatialItem[] = [];
    for (const e of entities) {
      this.entitiesByHandle.set(e.handle, e);
      if (e.layer) this.layers.add(e.layer);
      const b = computeEntityBounds(e);
      if (b) {
        spatialItems.push({
          id: e.handle,
          box: b,
          type: e.type,
          layer: e.layer,
        });
      }
    }
    this.spatialIndex.load(spatialItems);
    const bounds = this.spatialIndex.getBounds();
    if (bounds) {
      this.invalidationTracker.markDirty(bounds);
    }
    this.revision++;
  }

  // --- Internal mutations dispatched strictly via command boundary ---

  _insertEntity(entity: CadEntity): void {
    this.entitiesByHandle.set(entity.handle, entity);
    if (entity.layer) {
      this.layers.add(entity.layer);
    }
    const box = computeEntityBounds(entity);
    if (box) {
      this.spatialIndex.insert({
        id: entity.handle,
        box,
        type: entity.type,
        layer: entity.layer,
      });
      this.invalidationTracker.markDirty(box, entity.handle);
    }
    this.revision++;
  }

  _removeEntity(handle: string): CadEntity | undefined {
    const existing = this.entitiesByHandle.get(handle);
    if (existing) {
      const box = computeEntityBounds(existing);
      this.entitiesByHandle.delete(handle);
      this.spatialIndex.remove(handle);
      if (box) {
        this.invalidationTracker.markDirty(box, handle);
      }
      this.revision++;
    }
    return existing;
  }

  _updateEntity(entity: CadEntity): void {
    const old = this.entitiesByHandle.get(entity.handle);
    if (!old) {
      throw new Error(`Cannot update non-existent entity with handle ${entity.handle}`);
    }
    const oldBox = computeEntityBounds(old);
    const newBox = computeEntityBounds(entity);

    this.entitiesByHandle.set(entity.handle, entity);

    if (newBox) {
      this.spatialIndex.update({
        id: entity.handle,
        box: newBox,
        type: entity.type,
        layer: entity.layer,
      });
    } else {
      this.spatialIndex.remove(entity.handle);
    }

    if (oldBox) this.invalidationTracker.markDirty(oldBox, entity.handle);
    if (newBox) this.invalidationTracker.markDirty(newBox, entity.handle);

    this.revision++;
  }
}

