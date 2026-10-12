/**
 * CAD Browser Viewport Controller and Canvas Binding (M07-T09).
 *
 * Implements:
 *  - Browser DOM / Canvas 2D / WebGL rendering bridge for `@contractor/native-cad`
 *  - Screen-to-model and model-to-screen coordinate projection
 *  - Viewport-bounded batch rendering feed consumption
 *  - Separate measurement and profiling of Render, Snap, and Selection latencies
 *  - Bounded memory monitoring for browser client runtimes
 */

import type { Point2D, Box2D, CadEntity } from './types.js';
import type { CadDocument } from './cad_document.js';
import { CadBatchRendererFeed, type BatchRenderResult } from './batch_renderer.js';
import { CadInputStateMachine } from './input_state_machine.js';
import { CadSelectionEngine } from './selection_and_grips.js';

export interface BrowserCanvasContext {
  canvasWidth: number;
  canvasHeight: number;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arc: (x: number, y: number, r: number, s: number, e: number) => void;
  stroke: () => void;
  fill: () => void;
  strokeRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  clearRect: (x: number, y: number, w: number, h: number) => void;
}

export interface FrameMetrics {
  renderLatencyMs: number;
  snapLatencyMs?: number;
  selectLatencyMs?: number;
  visibleEntityCount: number;
  culledEntityCount: number;
  batchMemoryBytes: number;
  isWithinBudget: boolean; // 60 Hz budget: <= 16.7 ms
}

/**
 * Headless mock canvas for reproducible Node.js and CI benchmark runs.
 */
export class HeadlessMockCanvasContext implements BrowserCanvasContext {
  canvasWidth: number;
  canvasHeight: number;
  drawOperationCount: number = 0;

  constructor(width: number = 1920, height: number = 1080) {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  beginPath(): void { this.drawOperationCount++; }
  moveTo(x: number, y: number): void { this.drawOperationCount++; }
  lineTo(x: number, y: number): void { this.drawOperationCount++; }
  arc(x: number, y: number, r: number, s: number, e: number): void { this.drawOperationCount++; }
  stroke(): void { this.drawOperationCount++; }
  fill(): void { this.drawOperationCount++; }
  strokeRect(x: number, y: number, w: number, h: number): void { this.drawOperationCount++; }
  fillText(text: string, x: number, y: number): void { this.drawOperationCount++; }
  clearRect(x: number, y: number, w: number, h: number): void { this.drawOperationCount = 0; }
}

export class CadBrowserViewportController {
  readonly doc: CadDocument;
  readonly canvas: BrowserCanvasContext;
  readonly stateMachine: CadInputStateMachine = new CadInputStateMachine();
  readonly selectionEngine: CadSelectionEngine = new CadSelectionEngine();

  // Viewport camera parameters
  centerModel: Point2D = { x: 250000, y: 250000 };
  zoomFactor: number = 0.002; // pixels per drawing unit

  constructor(doc: CadDocument, canvas?: BrowserCanvasContext) {
    this.doc = doc;
    this.canvas = canvas || new HeadlessMockCanvasContext();
  }

  setCamera(centerModel: Point2D, zoomFactor: number): void {
    this.centerModel = { ...centerModel };
    this.zoomFactor = zoomFactor;
  }

  screenToModel(screenX: number, screenY: number): Point2D {
    const halfW = this.canvas.canvasWidth / 2;
    const halfH = this.canvas.canvasHeight / 2;
    const modelX = this.centerModel.x + (screenX - halfW) / this.zoomFactor;
    const modelY = this.centerModel.y - (screenY - halfH) / this.zoomFactor;
    return { x: modelX, y: modelY };
  }

  modelToScreen(modelX: number, modelY: number): Point2D {
    const halfW = this.canvas.canvasWidth / 2;
    const halfH = this.canvas.canvasHeight / 2;
    const screenX = halfW + (modelX - this.centerModel.x) * this.zoomFactor;
    const screenY = halfH - (modelY - this.centerModel.y) * this.zoomFactor;
    return { x: screenX, y: screenY };
  }

  getCurrentVisibleModelBounds(): Box2D {
    const topLeft = this.screenToModel(0, 0);
    const bottomRight = this.screenToModel(this.canvas.canvasWidth, this.canvas.canvasHeight);

    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxX: Math.max(topLeft.x, bottomRight.x),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
  }

  /**
   * Executes a full browser render cycle and records latency and memory metrics.
   */
  renderFrame(): FrameMetrics {
    const t0 = performance.now();
    const visibleBounds = this.getCurrentVisibleModelBounds();

    const cullingThreshold = this.zoomFactor < 0.005 ? 2.5 : 1.0;
    const batchResult: BatchRenderResult = CadBatchRendererFeed.generateBatches(this.doc, {
      bounds: visibleBounds,
      zoomFactor: this.zoomFactor,
      cullingPixelThreshold: cullingThreshold,
      maxBatchEntities: 12000,
    });

    // 2. Dispatch draw batches to Canvas 2D / WebGL pipeline
    this.canvas.clearRect(0, 0, this.canvas.canvasWidth, this.canvas.canvasHeight);

    // Draw lines as a single batched path
    const lineBuf = batchResult.batches.lines.buffer;
    const lineCount = batchResult.batches.lines.count;
    if (lineCount > 0) {
      this.canvas.beginPath();
      for (let i = 0; i < lineCount; i++) {
        const offset = i * 7;
        const x1 = lineBuf[offset];
        const y1 = lineBuf[offset + 1];
        const x2 = lineBuf[offset + 2];
        const y2 = lineBuf[offset + 3];

        const p1 = this.modelToScreen(x1, y1);
        const p2 = this.modelToScreen(x2, y2);

        this.canvas.moveTo(p1.x, p1.y);
        this.canvas.lineTo(p2.x, p2.y);
      }
      this.canvas.stroke();
    }

    // Draw arcs and circles as a batched path
    const arcBuf = batchResult.batches.arcsAndCircles.buffer;
    const arcCount = batchResult.batches.arcsAndCircles.count;
    if (arcCount > 0) {
      this.canvas.beginPath();
      for (let i = 0; i < arcCount; i++) {
        const offset = i * 8;
        const cx = arcBuf[offset];
        const cy = arcBuf[offset + 1];
        const r = arcBuf[offset + 2];
        const sAngle = arcBuf[offset + 3];
        const eAngle = arcBuf[offset + 4];

        const p = this.modelToScreen(cx, cy);
        const screenRadius = r * this.zoomFactor;

        this.canvas.arc(p.x, p.y, screenRadius, sAngle, eAngle);
      }
      this.canvas.stroke();
    }

    // Draw text strings
    const textPositions = batchResult.batches.texts.positions;
    const textStrings = batchResult.batches.texts.strings;
    const textCount = batchResult.batches.texts.count;
    for (let i = 0; i < textCount; i++) {
      const offset = i * 6;
      const tx = textPositions[offset];
      const ty = textPositions[offset + 1];
      const p = this.modelToScreen(tx, ty);
      this.canvas.fillText(textStrings[i] || '', p.x, p.y);
    }

    // Draw block markers
    const blockBuf = batchResult.batches.instances.transforms;
    const blockCount = batchResult.batches.instances.count;
    for (let i = 0; i < blockCount; i++) {
      const offset = i * 7;
      const bx = blockBuf[offset];
      const by = blockBuf[offset + 1];
      const p = this.modelToScreen(bx, by);
      this.canvas.strokeRect(p.x - 4, p.y - 4, 8, 8);
    }

    const renderLatencyMs = performance.now() - t0;

    return {
      renderLatencyMs,
      visibleEntityCount: batchResult.stats.batchedCount,
      culledEntityCount: batchResult.stats.culledCount,
      batchMemoryBytes: batchResult.stats.estimatedMemoryBytes,
      isWithinBudget: renderLatencyMs <= 16.7, // 60 Hz frame budget
    };
  }

  /**
   * Performs an object snapping query at screen coordinates and records snap latency.
   */
  snapAtScreenPoint(screenX: number, screenY: number, tolerancePx: number = 10): {
    snapPoint: Point2D | null;
    snapLatencyMs: number;
  } {
    const t0 = performance.now();
    const modelPoint = this.screenToModel(screenX, screenY);
    const modelTolerance = tolerancePx / this.zoomFactor;

    const snap = this.stateMachine.findSnap(this.doc, modelPoint, modelTolerance);
    const snapLatencyMs = performance.now() - t0;

    return {
      snapPoint: snap ? snap.point : null,
      snapLatencyMs,
    };
  }

  /**
   * Performs a window or crossing selection in screen coordinates and records select latency.
   */
  selectAtScreenBox(
    screenX1: number,
    screenY1: number,
    screenX2: number,
    screenY2: number
  ): {
    selectedHandles: string[];
    selectLatencyMs: number;
  } {
    const t0 = performance.now();
    const m1 = this.screenToModel(screenX1, screenY1);
    const m2 = this.screenToModel(screenX2, screenY2);

    const handles = this.selectionEngine.selectByBox(this.doc, m1, m2);
    const selectLatencyMs = performance.now() - t0;

    return {
      selectedHandles: handles,
      selectLatencyMs,
    };
  }
}
