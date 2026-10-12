/**
 * Document Session Implementation (M08-T02).
 *
 * Coordinates renderer adapters, viewport tiling, bounded decoded-page cache,
 * active cancellation, and explicit resource disposal.
 */

import { BoundedDecodedPageCache } from "./page_cache.js";
import { RendererAdapter, DocumentInitResult } from "./renderer_adapter.js";
import {
  DecodedTile,
  DocumentSessionConfig,
  PageCacheMetrics,
  PageDimensions,
  SessionDisposedError,
  ViewportRect
} from "./types.js";
import { ViewportTilingCalculator } from "./viewport_tiling.js";

export class DocumentSession {
  readonly documentId: string;
  readonly revisionId: string;
  readonly uri: string;
  readonly defaultTileSize: number;

  private readonly adapter: RendererAdapter;
  private readonly cache: BoundedDecodedPageCache;
  private readonly byteSource: Uint8Array | string;

  private _isDisposed = false;
  private _isInitialized = false;
  private _pageCount = 0;
  private _pages: PageDimensions[] = [];
  private activeAbortController: AbortController | null = null;

  constructor(config: DocumentSessionConfig, adapter: RendererAdapter) {
    this.documentId = config.documentId;
    this.revisionId = config.revisionId;
    this.uri = config.uri;
    this.byteSource = config.byteSource ?? "";
    this.defaultTileSize = config.defaultTileSize ?? ViewportTilingCalculator.DEFAULT_TILE_SIZE;

    this.adapter = adapter;
    this.cache = new BoundedDecodedPageCache({
      maxPages: config.maxCachedPages ?? 3,
      maxMemoryBytes: config.maxCacheMemoryBytes ?? 64 * 1024 * 1024
    });

    // Enforce M01 authority rule immediately at construction
    this.adapter.assertAuthorityBoundary();
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get pageCount(): number {
    this.assertNotDisposed();
    return this._pageCount;
  }

  get rendererKind(): string {
    return this.adapter.kind;
  }

  async initialize(): Promise<DocumentInitResult> {
    this.assertNotDisposed();
    if (this._isInitialized) {
      return {
        pageCount: this._pageCount,
        pages: this._pages,
        rendererKind: this.adapter.kind
      };
    }

    const initResult = await this.adapter.initializeDocument(this.documentId, this.byteSource);
    this._pageCount = initResult.pageCount;
    this._pages = initResult.pages;
    this._isInitialized = true;

    return initResult;
  }

  getPageDimensions(pageIndex: number): PageDimensions {
    this.assertNotDisposed();
    if (!this._isInitialized) throw new Error("Document session is not initialized");
    const dims = this._pages[pageIndex];
    if (!dims) throw new Error(`Invalid page index ${pageIndex}; document has ${this._pageCount} pages`);
    return dims;
  }

  getCacheMetrics(): PageCacheMetrics {
    this.assertNotDisposed();
    return this.cache.getMetrics();
  }

  cancelPendingRenders(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  /**
   * Requests decoded tiles intersecting the current viewport.
   * Cancels previous in-flight tile decodes for this session.
   * Never rasterizes non-visible tiles or entire pages eagerly.
   */
  async requestViewportTiles(
    pageIndex: number,
    viewport: ViewportRect,
    externalSignal?: AbortSignal
  ): Promise<DecodedTile[]> {
    this.assertNotDisposed();
    if (!this._isInitialized) throw new Error("Document session is not initialized");

    const dimensions = this.getPageDimensions(pageIndex);

    // Cancel prior in-flight renders on viewport shift
    this.cancelPendingRenders();

    const currentController = new AbortController();
    this.activeAbortController = currentController;

    // Combine internal cancellation controller with external caller signal
    const combinedSignal = externalSignal
      ? this.createCombinedSignal(currentController.signal, externalSignal)
      : currentController.signal;

    const descriptors = ViewportTilingCalculator.calculateVisibleTiles(
      pageIndex,
      dimensions,
      viewport,
      this.defaultTileSize
    );

    const tiles: DecodedTile[] = [];

    // Parallel fetch of visible tiles
    await Promise.all(
      descriptors.map(async (desc) => {
        if (combinedSignal.aborted) return;

        // Check cache first
        const cached = this.cache.getTile(pageIndex, desc.id);
        if (cached) {
          tiles.push(cached);
          return;
        }

        // Render on cache miss
        try {
          const rendered = await this.adapter.renderTile(desc.coords, combinedSignal);
          this.cache.putTile(pageIndex, dimensions, rendered);
          tiles.push(rendered);
        } catch (err) {
          if (combinedSignal.aborted || (err as Error)?.name === "RenderCancelledError") {
            return;
          }
          throw err;
        }
      })
    );

    if (this.activeAbortController === currentController) {
      this.activeAbortController = null;
    }

    return tiles;
  }

  async dispose(): Promise<void> {
    if (this._isDisposed) return;
    this.cancelPendingRenders();
    this.cache.clear();
    await this.adapter.dispose();
    this._pages = [];
    this._pageCount = 0;
    this._isInitialized = false;
    this._isDisposed = true;
  }

  private assertNotDisposed(): void {
    if (this._isDisposed) {
      throw new SessionDisposedError();
    }
  }

  private createCombinedSignal(s1: AbortSignal, s2: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (s1.aborted || s2.aborted) {
      controller.abort();
      return controller.signal;
    }
    s1.addEventListener("abort", onAbort, { once: true });
    s2.addEventListener("abort", onAbort, { once: true });
    return controller.signal;
  }
}
