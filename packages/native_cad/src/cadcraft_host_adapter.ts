/**
 * CADCraft Engine Host Adapter & Presentation Binding (M07-T11).
 *
 * Implements:
 *  - Dual presentation surfaces: Full Editor Mode vs Embedded Capability Mode (ADR-0016 / ADR-0020)
 *  - Headless CLI mode for CI, automated conversions, and background vector plotting
 *  - 100% drawing identity preservation (entity handles, revisions, selections, undo stack)
 *  - Redline annotation isolation on dedicated overlay layer (CONTRACTOR_REDLINES)
 *  - Domain permission boundaries: view_only, markup_only, full_authoring
 *  - Upstream release compatibility (v0.3.0 and v0.2.0) with bidirectional upgrade and rollback
 *  - Vector PDF 1.4 plotting with lineweights and bilingual typography fallback
 */

import { CadDocument } from './cad_document.js';
import { CadCommandRegistry } from './command_registry.js';
import { CadSelectionEngine } from './selection_and_grips.js';
import { CadBatchRendererFeed, type ViewportQuery } from './batch_renderer.js';
import { CadLayoutPlotEngine } from './layout_plot_engine.js';
import { CadRevisionEngine } from './revision_and_conflict.js';
import type {
  CadEntity,
  LineEntity,
  CircleEntity,
  LwPolylineEntity,
  TextEntity,
  DimensionEntity,
  Point2D,
  PlotOptions,
  PlotResult,
  CadGroupOperation,
  GroupOperationResult,
  ConflictResolutionStrategy,
  CadCraftPresentationMode,
  CadCraftDomainPermission,
  CadCraftHostState,
  RedlineMarkupSpec,
  CompensatingUndoAction,
} from './types.js';

export interface CadCraftChromeConfig {
  ribbonVisible: boolean;
  commandLineVisible: boolean;
  layerManagerVisible: boolean;
  propertiesInspectorVisible: boolean;
  redlineToolbarVisible: boolean;
  measurementToolsVisible: boolean;
  plotButtonVisible: boolean;
  canvasInteractionEnabled: boolean;
}

export interface SerializedCadDocument {
  formatVersion: 2 | 3;
  documentId: string;
  revision: number;
  sourceVersion: string;
  units: import('./types.js').UnitSettings;
  layoutState: import('./types.js').LayoutState;
  layers: string[];
  entities: CadEntity[];
  conflictRecords?: import('./types.js').CadConflictRecord[];
}

export class CadCraftHostAdapter {
  readonly document: CadDocument;
  readonly commandRegistry: CadCommandRegistry;
  readonly selectionEngine: CadSelectionEngine;

  private mode: CadCraftPresentationMode;
  private permission: CadCraftDomainPermission;
  readonly redlineLayer: string;
  activeUser: string;

  constructor(
    document?: CadDocument,
    initialMode: CadCraftPresentationMode = 'full_editor',
    initialPermission: CadCraftDomainPermission = 'full_authoring',
    redlineLayer: string = 'CONTRACTOR_REDLINES',
    activeUser: string = 'engineer-1'
  ) {
    this.document = document ?? new CadDocument();
    this.commandRegistry = new CadCommandRegistry();
    this.selectionEngine = new CadSelectionEngine();
    this.mode = initialMode;
    this.permission = initialPermission;
    this.redlineLayer = redlineLayer;
    this.activeUser = activeUser;

    // Ensure redline layer exists in document
    this.document.addLayer(this.redlineLayer);
  }

  // --- Presentation Modes & Chrome Configuration ---

  getMode(): CadCraftPresentationMode {
    return this.mode;
  }

  setMode(newMode: CadCraftPresentationMode): CadCraftHostState {
    // Mode transitions preserve document identity, handle sequences, revisions, and selections
    const prevHandleCount = this.document.getEntityCount();
    const prevRevision = this.document.revision;
    const prevSelection = this.selectionEngine.getSelectedHandles();

    this.mode = newMode;

    // Invariants verification
    if (this.document.getEntityCount() !== prevHandleCount) {
      throw new Error('Integrity violation: Mode switch altered document entity count');
    }
    if (this.document.revision !== prevRevision) {
      throw new Error('Integrity violation: Mode switch altered document revision');
    }

    // Re-verify selection preserved
    for (const h of prevSelection) {
      if (!this.selectionEngine.isSelected(h)) {
        this.selectionEngine.select(h);
      }
    }

    return this.getHostState();
  }

  getChromeConfig(): CadCraftChromeConfig {
    switch (this.mode) {
      case 'full_editor':
        return {
          ribbonVisible: true,
          commandLineVisible: true,
          layerManagerVisible: true,
          propertiesInspectorVisible: true,
          redlineToolbarVisible: true,
          measurementToolsVisible: true,
          plotButtonVisible: true,
          canvasInteractionEnabled: true,
        };
      case 'embedded_review':
        return {
          ribbonVisible: false, // Collapsed to maximize drawing viewport area
          commandLineVisible: false, // Collapsed in embedded form review
          layerManagerVisible: true, // Layer visibility toggling active
          propertiesInspectorVisible: false, // Collapsed
          redlineToolbarVisible: true, // Redline annotation tools active
          measurementToolsVisible: true, // Measurement tools active
          plotButtonVisible: true, // Vector PDF plot trigger active
          canvasInteractionEnabled: true,
        };
      case 'headless_cli':
        return {
          ribbonVisible: false,
          commandLineVisible: false,
          layerManagerVisible: false,
          propertiesInspectorVisible: false,
          redlineToolbarVisible: false,
          measurementToolsVisible: false,
          plotButtonVisible: false,
          canvasInteractionEnabled: false,
        };
    }
  }

  // --- Domain Permission Boundary ---

  getPermission(): CadCraftDomainPermission {
    return this.permission;
  }

  setPermission(permission: CadCraftDomainPermission): void {
    this.permission = permission;
  }

  getHostState(): CadCraftHostState {
    const redlineCount = this.getRedlineEntities().length;
    const entityCount = this.document.getEntityCount();

    return {
      mode: this.mode,
      permission: this.permission,
      documentId: this.document.id,
      entityCount,
      redlineCount,
      revision: this.document.revision,
      activeLayout: this.document.layoutState.activeLayoutName,
      selectedCount: this.selectionEngine.getSelectedHandles().length,
      undoDepth: this.commandRegistry.undoEngine.canUndo() ? 1 : 0,
      canUndo: this.commandRegistry.undoEngine.canUndo(),
      canRedo: this.commandRegistry.undoEngine.canRedo(),
    };
  }

  // --- Command Execution & Drafting Dispatch ---

  executeCommand(
    cmdLine: string,
    layerOverride?: string
  ): { success: boolean; message?: string; undoAction?: CompensatingUndoAction } {
    const trimmed = cmdLine.trim();
    if (!trimmed) {
      return { success: true };
    }

    const commandWord = trimmed.split(/\s+/)[0].toUpperCase();
    const isModifyingCommand = [
      'LINE', 'L', 'CIRCLE', 'C', 'ARC', 'A', 'PLINE', 'PL',
      'MOVE', 'M', 'COPY', 'CP', 'ERASE', 'E', 'RECTANGLE', 'REC'
    ].includes(commandWord);

    // Permission checks
    if (this.permission === 'view_only' && isModifyingCommand) {
      return {
        success: false,
        message: `Permission denied: '${commandWord}' rejected in view_only mode. Drafting mutations are restricted.`,
      };
    }

    if (this.permission === 'markup_only' && isModifyingCommand) {
      // In markup_only mode, drafting must occur strictly on the redline layer
      layerOverride = this.redlineLayer;
    }

    const targetLayer = layerOverride ?? (this.permission === 'markup_only' ? this.redlineLayer : '0');

    const result = this.commandRegistry.execute(this.document, cmdLine, {
      sourceMode: this.mode,
      activeLayer: targetLayer,
      userId: this.activeUser,
    });

    return {
      success: result.success,
      message: result.errorMessage ?? result.prompt,
    };
  }


  // --- Redline Overlay Annotation Operations ---

  addRedlineMarkup(spec: RedlineMarkupSpec): CadEntity {
    if (this.permission === 'view_only') {
      throw new Error('Permission denied: View-only mode rejects redline markup mutations.');
    }

    const now = Date.now();
    const handle = this.document.nextHandle();
    const author = spec.authorId ?? this.activeUser;
    const color = spec.color ?? 1; // Default to red (ACI 1)

    let entity: CadEntity;

    switch (spec.markupType) {
      case 'CLOUD': {
        // Revision cloud polyline
        entity = {
          handle,
          type: 'LWPOLYLINE',
          layer: this.redlineLayer,
          color,
          vertices: spec.points,
          closed: true,
          revision: 1,
          updatedBy: author,
          updatedAt: now,
        } as LwPolylineEntity;
        break;
      }
      case 'LEADER': {
        // Leader line / arrow
        entity = {
          handle,
          type: 'LWPOLYLINE',
          layer: this.redlineLayer,
          color,
          vertices: spec.points,
          closed: false,
          revision: 1,
          updatedBy: author,
          updatedAt: now,
        } as LwPolylineEntity;
        break;
      }
      case 'CALLOUT':
      case 'NOTE': {
        const insertPt = spec.points[0] ?? { x: 0, y: 0 };
        entity = {
          handle,
          type: 'TEXT',
          layer: this.redlineLayer,
          color,
          position: insertPt,
          height: 3.5,
          text: spec.text ?? (spec.comment || 'REVISION NOTE'),
          rotation: 0,
          revision: 1,
          updatedBy: author,
          updatedAt: now,
        } as TextEntity;
        break;
      }
      case 'MEASUREMENT': {
        const p1 = spec.points[0] ?? { x: 0, y: 0 };
        const p2 = spec.points[1] ?? { x: 100, y: 0 };
        const textPos = spec.points[2] ?? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 + 5 };
        const dist = spec.measurementValue ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);

        entity = {
          handle,
          type: 'DIMENSION',
          layer: this.redlineLayer,
          color,
          defPoint1: p1,
          defPoint2: p2,
          textPosition: textPos,
          measurement: dist,
          textOverride: spec.text ?? `${dist.toFixed(this.document.units.precision)} mm`,
          revision: 1,
          updatedBy: author,
          updatedAt: now,
        } as DimensionEntity;
        break;
      }
      default:
        throw new Error(`Unsupported markup type: ${(spec as any).markupType}`);
    }

    this.document.addEntity(entity);
    return entity;
  }

  getRedlineEntities(): CadEntity[] {
    return this.document.getAllEntities().filter((e) => e.layer === this.redlineLayer);
  }

  getBaseEntities(): CadEntity[] {
    return this.document.getAllEntities().filter((e) => e.layer !== this.redlineLayer);
  }

  clearRedlines(): number {
    if (this.permission === 'view_only') {
      throw new Error('Permission denied: View-only mode rejects redline removal.');
    }
    const redlines = this.getRedlineEntities();
    for (const r of redlines) {
      this.document._removeEntity(r.handle);
    }
    return redlines.length;
  }

  // --- Layer & Query Operations ---

  toggleLayer(layerName: string, visible: boolean): void {
    let affected = 0;
    for (const ent of this.document.getAllEntities()) {
      if (ent.layer === layerName) {
        ent.visible = visible;
        affected++;
      }
    }
    if (affected > 0) {
      this.document.revision++;
    }
  }

  queryMeasurement(
    p1: Point2D,
    p2: Point2D
  ): { distance: number; dx: number; dy: number; formatted: string } {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);
    const precision = this.document.units.precision ?? 2;
    const unit = this.document.units.insertionUnits ?? 'mm';

    return {
      distance,
      dx,
      dy,
      formatted: `${distance.toFixed(precision)} ${unit}`,
    };
  }

  // --- Bounded Rendering & Vector Plot ---

  generateDrawBatches(query: ViewportQuery) {
    return CadBatchRendererFeed.generateBatches(this.document, query);
  }

  plotPdf(options?: PlotOptions): PlotResult {
    return CadLayoutPlotEngine.plot(this.document, options);
  }

  // --- Revision Engine & Atomic Conflicts ---

  applyAtomicGroupOperation(op: CadGroupOperation): GroupOperationResult {
    if (this.permission === 'view_only') {
      const conflict: import('./types.js').CadConflictRecord = {
        conflictId: `conf_perm_${Math.random().toString(36).slice(2, 9)}`,
        operationId: op.id,
        authorId: op.authorId,
        timestamp: Date.now(),
        reason: 'PERMISSION_DENIED',
        conflictingHandles: op.mutations.map((m) => m.handle),
        expectedRevisions: {},
        actualRevisions: {},
        rejectedMutations: op.mutations,
        status: 'PENDING_REVIEW',
      };
      this.document.conflictRecords.push(conflict);
      return {
        success: false,
        operationId: op.id,
        affectedHandles: [],
        conflict,
      };
    }

    if (this.permission === 'markup_only') {
      // Reject any operation modifying base entities
      const illegalMutations = op.mutations.filter((m) => {
        if (m.action === 'CREATE') {
          return m.entity?.layer !== this.redlineLayer;
        }
        const existing = this.document.getEntity(m.handle);
        return existing && existing.layer !== this.redlineLayer;
      });

      if (illegalMutations.length > 0) {
        const conflict: import('./types.js').CadConflictRecord = {
          conflictId: `conf_perm_${Math.random().toString(36).slice(2, 9)}`,
          operationId: op.id,
          authorId: op.authorId,
          timestamp: Date.now(),
          reason: 'PERMISSION_DENIED',
          conflictingHandles: illegalMutations.map((m) => m.handle),
          expectedRevisions: {},
          actualRevisions: {},
          rejectedMutations: op.mutations,
          status: 'PENDING_REVIEW',
        };
        this.document.conflictRecords.push(conflict);
        return {
          success: false,
          operationId: op.id,
          affectedHandles: [],
          conflict,
        };
      }
    }

    return CadRevisionEngine.applyGroupOperation(this.document, op);
  }

  resolveConflict(
    conflictId: string,
    resolution: ConflictResolutionStrategy
  ): GroupOperationResult {
    return CadRevisionEngine.resolveConflict(this.document, conflictId, resolution);
  }

  // --- Document Serialization & Cross-Release Qualification ---

  serializeDocument(version: 'v2' | 'v3' = 'v3'): string {
    const raw: SerializedCadDocument = {
      formatVersion: version === 'v2' ? 2 : 3,
      documentId: this.document.id,
      revision: this.document.revision,
      sourceVersion: this.document.sourceVersion,
      units: this.document.units,
      layoutState: this.document.layoutState,
      layers: this.document.getLayers(),
      entities: this.document.getAllEntities(),
      conflictRecords: version === 'v3' ? this.document.conflictRecords : undefined,
    };
    return JSON.stringify(raw, null, 2);
  }

  static deserializeDocument(jsonStr: string): CadCraftHostAdapter {
    const raw = JSON.parse(jsonStr) as SerializedCadDocument;
    const doc = new CadDocument(raw.documentId);
    doc.revision = raw.revision ?? 0;
    doc.sourceVersion = raw.sourceVersion ?? 'AC1015';
    if (raw.units) doc.units = raw.units;
    if (raw.layoutState) doc.layoutState = raw.layoutState;

    if (raw.layers) {
      for (const l of raw.layers) {
        doc.addLayer(l);
      }
    }

    if (raw.entities) {
      for (const ent of raw.entities) {
        doc.ensureHandleSeed(ent.handle);
      }
      doc.bulkLoad(raw.entities);
    }

    if (raw.conflictRecords) {
      doc.conflictRecords = raw.conflictRecords;
    }

    return new CadCraftHostAdapter(doc);
  }

  /**
   * Qualifies loading a v0.2.0 (v2 format) document and smoothly upgrades to v0.3.0 (v3 format).
   */
  loadPreviousReleaseDocument(v2JsonStr: string): void {
    const parsed = JSON.parse(v2JsonStr);
    if (parsed.formatVersion !== 2 && parsed.formatVersion !== 3) {
      throw new Error(`Invalid format version for document: ${parsed.formatVersion}`);
    }

    // Ingest all entities preserving handles exactly
    if (parsed.entities && Array.isArray(parsed.entities)) {
      for (const ent of parsed.entities) {
        this.document.ensureHandleSeed(ent.handle);
      }
      this.document.bulkLoad(parsed.entities);
    }

    // If upgrading from v2 to v3, ensure redline layers and modern layout structures exist
    if (parsed.formatVersion === 2) {
      this.document.addLayer(this.redlineLayer);
      if (!this.document.layoutState.layoutDefinitions) {
        this.document.layoutState.layoutDefinitions = {
          Model: {
            name: 'Model',
            paperSize: 'CUSTOM',
            widthMm: 0,
            heightMm: 0,
            orientation: 'landscape',
            viewports: [],
          },
        };
      }
      this.document.revision++;
    }
  }
}
