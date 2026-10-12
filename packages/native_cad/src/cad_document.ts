/**
 * In-Memory CAD Document Model (M07-T02).
 *
 * Holds drawing database, entity tables, layers, layouts, and revision state.
 * Direct entity modifications outside the command boundary are restricted.
 */

import type { CadEntity, LayoutState, UnitSettings, OrthoSettings } from './types.js';

export class CadDocument {
  readonly id: string;
  revision: number = 0;
  private entitiesByHandle: Map<string, CadEntity> = new Map();
  private layers: Set<string> = new Set(['0']);
  private handleCounter: number = 1;

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
    viewports: [],
  };

  constructor(id: string = `cad_doc_${Math.random().toString(36).slice(2, 9)}`) {
    this.id = id;
  }

  nextHandle(): string {
    const handleHex = this.handleCounter.toString(16).toUpperCase();
    this.handleCounter++;
    return handleHex;
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

  // --- Internal mutations dispatched strictly via command boundary ---

  _insertEntity(entity: CadEntity): void {
    this.entitiesByHandle.set(entity.handle, entity);
    if (entity.layer) {
      this.layers.add(entity.layer);
    }
    this.revision++;
  }

  _removeEntity(handle: string): CadEntity | undefined {
    const existing = this.entitiesByHandle.get(handle);
    if (existing) {
      this.entitiesByHandle.delete(handle);
      this.revision++;
    }
    return existing;
  }

  _updateEntity(entity: CadEntity): void {
    if (!this.entitiesByHandle.has(entity.handle)) {
      throw new Error(`Cannot update non-existent entity with handle ${entity.handle}`);
    }
    this.entitiesByHandle.set(entity.handle, entity);
    this.revision++;
  }
}
