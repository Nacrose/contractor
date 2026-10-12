/**
 * Abstract Renderer Adapter Interface & M01 Authority Boundary (M08-T02).
 */

import { PageDimensions, TileCoordinates, DecodedTile, RendererKind } from "./types.js";

export interface DocumentInitResult {
  readonly pageCount: number;
  readonly pages: PageDimensions[];
  readonly rendererKind: RendererKind;
}

/**
 * RendererAdapter defines the strict pluggable boundary for PDF rendering.
 *
 * M01 Authority Policy:
 * The renderer adapter MUST NEVER own:
 * - Calibration data (/Measure dictionaries or real-world scales)
 * - Markup or annotation persistence
 * - Authorization or tenant isolation
 * - Takeoff quantities or BoQ links
 *
 * All of those concerns are strictly owned by Contractor's domain services and document sessions.
 */
export interface RendererAdapter {
  readonly kind: RendererKind;
  readonly isDisposed: boolean;

  /**
   * Initializes the document with byte source. Does NOT eagerly rasterize pages.
   */
  initializeDocument(documentId: string, byteSource: Uint8Array | string): Promise<DocumentInitResult>;

  /**
   * Returns page dimension metrics in PDF points.
   */
  getPageMetrics(pageIndex: number): PageDimensions;

  /**
   * Renders a single discrete viewport tile with cancellation support.
   */
  renderTile(coords: TileCoordinates, signal?: AbortSignal): Promise<DecodedTile>;

  /**
   * Releases renderer resources, worker handles, or canvas contexts.
   */
  dispose(): Promise<void>;

  /**
   * Validates that forbidden authority domains cannot be attached to the adapter.
   */
  assertAuthorityBoundary(): void;
}

export abstract class BaseRendererAdapter implements RendererAdapter {
  abstract readonly kind: RendererKind;
  protected _isDisposed = false;
  protected _pages: PageDimensions[] = [];

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  abstract initializeDocument(documentId: string, byteSource: Uint8Array | string): Promise<DocumentInitResult>;

  getPageMetrics(pageIndex: number): PageDimensions {
    if (this._isDisposed) throw new Error("Renderer adapter is disposed");
    const p = this._pages[pageIndex];
    if (!p) throw new Error(`Invalid page index: ${pageIndex}`);
    return p;
  }

  abstract renderTile(coords: TileCoordinates, signal?: AbortSignal): Promise<DecodedTile>;

  async dispose(): Promise<void> {
    this._isDisposed = true;
    this._pages = [];
  }

  /**
   * Enforces that callers cannot leak domain logic into the low-level renderer.
   */
  assertAuthorityBoundary(): void {
    const forbiddenProperties = ['calibration', 'annotations', 'markups', 'boqLinks', 'auth', 'permissions'];
    for (const prop of forbiddenProperties) {
      if (prop in (this as Record<string, unknown>)) {
        throw new Error(
          `Authority Violation: Renderer adapter must never own '${prop}'. Violates M01 architecture boundary.`
        );
      }
    }
  }
}
