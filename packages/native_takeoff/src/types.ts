/**
 * Document Session & Renderer Adapter Type Definitions (M08-T02).
 */

export type DocumentId = string;
export type RevisionId = string;

export interface PageDimensions {
  readonly widthPt: number;
  readonly heightPt: number;
}

export interface ViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export interface TileCoordinates {
  readonly pageIndex: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileSize: number;
  readonly scale: number;
}

export interface DecodedTile {
  readonly id: string;
  readonly coords: TileCoordinates;
  readonly buffer: Uint8Array | null;
  readonly byteSize: number;
  readonly renderedAtUtc: string;
}

export interface DecodedPage {
  readonly pageIndex: number;
  readonly dimensions: PageDimensions;
  readonly tiles: Map<string, DecodedTile>;
  totalByteSize: number;
  lastAccessedAt: number;
}

export interface PageCacheMetrics {
  readonly cachedPagesCount: number;
  readonly currentMemoryBytes: number;
  readonly maxMemoryBytes: number;
  readonly maxPages: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

export type RendererKind = 'PDFJS_REFERENCE' | 'PDFCRAFT_ENGINE' | 'TEST_MOCK';

export interface DocumentSessionConfig {
  readonly documentId: DocumentId;
  readonly revisionId: RevisionId;
  readonly uri: string;
  readonly byteSource?: Uint8Array | string;
  readonly maxCachedPages?: number;
  readonly maxCacheMemoryBytes?: number;
  readonly defaultTileSize?: number;
}

export class SessionDisposedError extends Error {
  constructor(message = "Document session has been disposed and cannot accept requests.") {
    super(message);
    this.name = "SessionDisposedError";
  }
}

export class RenderCancelledError extends Error {
  constructor(message = "Tile render operation was cancelled by caller.") {
    super(message);
    this.name = "RenderCancelledError";
  }
}
