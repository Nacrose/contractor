/**
 * CAD Command Registry & Input State Machine Types (M07-T02).
 */

export interface Point2D {
  x: number;
  y: number;
  z?: number;
}

export interface Vector2D {
  dx: number;
  dy: number;
}

export interface Box2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type CadEntityType =
  | 'LINE'
  | 'CIRCLE'
  | 'ARC'
  | 'LWPOLYLINE'
  | 'DIMENSION'
  | 'HATCH'
  | 'INSERT'
  | 'TEXT'
  | 'MTEXT';

export interface BaseCadEntity {
  handle: string;
  type: CadEntityType;
  layer: string;
  color?: string | number; // ACI or hex
  linetype?: string;
  lineweight?: number; // mm in hundredths (e.g. 25 = 0.25mm)
  visible?: boolean;
}

export interface LineEntity extends BaseCadEntity {
  type: 'LINE';
  start: Point2D;
  end: Point2D;
}

export interface CircleEntity extends BaseCadEntity {
  type: 'CIRCLE';
  center: Point2D;
  radius: number;
}

export interface ArcEntity extends BaseCadEntity {
  type: 'ARC';
  center: Point2D;
  radius: number;
  startAngle: number; // radians CCW
  endAngle: number;   // radians CCW
}

export interface LwPolylineEntity extends BaseCadEntity {
  type: 'LWPOLYLINE';
  vertices: Point2D[];
  bulges?: number[]; // arc curvature per segment
  closed: boolean;
}

export interface DimensionEntity extends BaseCadEntity {
  type: 'DIMENSION';
  defPoint1: Point2D;
  defPoint2: Point2D;
  textPosition: Point2D;
  measurement: number;
  textOverride?: string;
}

export interface HatchEntity extends BaseCadEntity {
  type: 'HATCH';
  patternName: string;
  solid: boolean;
  boundaryHandles: string[];
  boundaryVertices?: Point2D[];
  bounds?: Box2D;
}

export interface InsertEntity extends BaseCadEntity {
  type: 'INSERT';
  blockName: string;
  insertionPoint: Point2D;
  scale?: { x: number; y: number; z: number };
  rotation?: number; // radians
}

export interface TextEntity extends BaseCadEntity {
  type: 'TEXT' | 'MTEXT';
  text: string;
  position: Point2D;
  height: number;
  rotation?: number;
}

export type CadEntity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | LwPolylineEntity
  | DimensionEntity
  | HatchEntity
  | InsertEntity
  | TextEntity;

export type SnapMode =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'intersection'
  | 'quadrant'
  | 'perpendicular'
  | 'nearest';

export interface SnapResult {
  point: Point2D;
  mode: SnapMode;
  distance: number;
  entityHandle: string;
}

export type GripType = 'endpoint' | 'midpoint' | 'center' | 'quadrant';

export interface GripPoint {
  id: string;
  point: Point2D;
  type: GripType;
  entityHandle: string;
  index?: number;
  isHot: boolean;
}

export type UnitFormat = 'decimal' | 'architectural' | 'engineering';

export interface UnitSettings {
  format: UnitFormat;
  precision: number;
  insertionUnits: 'millimeters' | 'meters' | 'inches' | 'feet';
}

export interface OrthoSettings {
  enabled: boolean;
}

export type SpaceMode = 'model' | 'paper';

export type PaperSizeName =
  | 'ISO_A0'
  | 'ISO_A1'
  | 'ISO_A2'
  | 'ISO_A3'
  | 'ISO_A4'
  | 'ANSI_A'
  | 'ANSI_B'
  | 'ANSI_C'
  | 'ANSI_D'
  | 'ANSI_E'
  | 'ARCH_C'
  | 'ARCH_D'
  | 'ARCH_E'
  | 'CUSTOM';

export interface ViewportConfig {
  id: string;
  boundsOnPaperMm: Box2D; // Position on paper sheet in mm [minX, minY, maxX, maxY]
  modelCenter: Point2D;   // Center coordinate in model space
  scale: number;          // Drawing scale e.g. 0.01 = 1:100, 0.02 = 1:50, 1.0 = 1:1
  rotation?: number;      // Radians
  frozenLayers?: string[];
  clipped?: boolean;
  targetSpace: SpaceMode;
}

export interface LayoutDefinition {
  name: string;
  paperSize: PaperSizeName;
  widthMm: number;
  heightMm: number;
  orientation: 'landscape' | 'portrait';
  viewports: ViewportConfig[];
  plotStyleTable?: string; // e.g. "monochrome.ctb", "acad.ctb"
}

export interface LayoutState {
  activeSpace: SpaceMode;
  activeLayoutName: string;
  layouts: string[];
  layoutDefinitions?: Record<string, LayoutDefinition>;
  viewports: ViewportConfig[];
}

export interface PlotOptions {
  layoutName?: string;
  paperSize?: PaperSizeName;
  orientation?: 'landscape' | 'portrait';
  monochrome?: boolean;
  scaleLineweights?: boolean;
  fallbackMode?: 'vector_with_raster_fallback' | 'strict_vector';
  targetDpi?: number;
}

export interface PlotResult {
  pdfBytes: Uint8Array;
  pageCount: number;
  widthPt: number;
  heightPt: number;
  layoutName: string;
  vectorEntityCount: number;
  rasterFallbackEntities: string[];
  fontsUsed: string[];
  devanagariFallbackApplied: boolean;
}

export interface PlotOutputResult {
  success: boolean;
  destination: string;
  bytesEmitted: number;
  platform: 'web' | 'desktop' | 'headless';
  error?: string;
}

export interface CommandContext {
  userId?: string;
  timestamp?: number;
  sourceMode?: 'full_editor' | 'embedded_review' | 'headless_cli';
}

export interface CommandExecutionResult {
  success: boolean;
  commandName: string;
  createdEntities?: CadEntity[];
  modifiedEntities?: CadEntity[];
  deletedHandles?: string[];
  prompt?: string;
  errorMessage?: string;
  undoable: boolean;
}

export interface CompensatingUndoAction {
  id: string;
  commandName: string;
  revert: (doc: any) => void;
  reapply: (doc: any) => void;
  description: string;
}

export interface UnsupportedObjectRecord {
  type: string;
  handle?: string;
  layer?: string;
  lineNumber?: number;
  reason: string;
  rawPayloadSnippet?: string;
}

export interface ImportReport {
  format: 'DXF' | 'DWG';
  version: string;
  totalEntitiesRead: number;
  importedEntityCount: number;
  unsupportedEntityCount: number;
  unsupportedObjects: UnsupportedObjectRecord[];
  warnings: string[];
  units: string;
  handSeed?: string;
}

export interface RoundTripFidelityReport {
  originalEntityCount: number;
  exportedEntityCount: number;
  preservedHandlesCount: number;
  idPreservationRate: number; // 0.0 to 1.0 (1.0 = 100%)
  unsupportedPreservedCount: number;
  divergences: string[];
  isFidelityPreserved: boolean;
}
