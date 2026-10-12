/**
 * Bounded Decoded-Page Cache with LRU Eviction & Memory Tracking (M08-T02).
 */

import { DecodedPage, DecodedTile, PageCacheMetrics, PageDimensions } from "./types.js";

export interface CacheOptions {
  readonly maxPages?: number;
  readonly maxMemoryBytes?: number;
}

export class BoundedDecodedPageCache {
  private readonly maxPages: number;
  private readonly maxMemoryBytes: number;
  private readonly pages = new Map<number, DecodedPage>();

  private accessSequence = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private currentMemoryBytes = 0;

  constructor(options: CacheOptions = {}) {
    this.maxPages = options.maxPages ?? 3;
    // Default 64 MB budget for decoded tile buffers
    this.maxMemoryBytes = options.maxMemoryBytes ?? 64 * 1024 * 1024;
  }

  getMetrics(): PageCacheMetrics {
    return {
      cachedPagesCount: this.pages.size,
      currentMemoryBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      maxPages: this.maxPages,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions
    };
  }

  getTile(pageIndex: number, tileId: string): DecodedTile | undefined {
    const page = this.pages.get(pageIndex);
    if (!page) {
      this.misses++;
      return undefined;
    }

    const tile = page.tiles.get(tileId);
    if (tile) {
      this.hits++;
      page.lastAccessedAt = ++this.accessSequence;
      return tile;
    }

    this.misses++;
    return undefined;
  }

  putTile(pageIndex: number, dimensions: PageDimensions, tile: DecodedTile): void {
    let page = this.pages.get(pageIndex);
    if (!page) {
      // Check if adding a new page would exceed maxPages
      while (this.pages.size >= this.maxPages) {
        this.evictLeastRecentlyUsedPage();
      }

      page = {
        pageIndex,
        dimensions,
        tiles: new Map(),
        totalByteSize: 0,
        lastAccessedAt: ++this.accessSequence
      };
      this.pages.set(pageIndex, page);
    }

    // Check if replacing existing tile
    const existingTile = page.tiles.get(tile.id);
    if (existingTile) {
      page.totalByteSize -= existingTile.byteSize;
      this.currentMemoryBytes -= existingTile.byteSize;
    }

    // Ensure memory budget by evicting LRU pages if needed
    while (this.currentMemoryBytes + tile.byteSize > this.maxMemoryBytes && this.pages.size > 0) {
      // If the only page is the current one, evict LRU tiles within it
      if (this.pages.size === 1 && this.pages.has(pageIndex)) {
        if (!this.evictOldestTileFromPage(page)) {
          break; // Page has no tiles left to evict
        }
      } else {
        this.evictLeastRecentlyUsedPage(pageIndex);
      }
    }

    page.tiles.set(tile.id, tile);
    page.totalByteSize += tile.byteSize;
    page.lastAccessedAt = ++this.accessSequence;
    this.currentMemoryBytes += tile.byteSize;
  }

  hasPage(pageIndex: number): boolean {
    return this.pages.has(pageIndex);
  }

  invalidatePage(pageIndex: number): void {
    const page = this.pages.get(pageIndex);
    if (page) {
      this.currentMemoryBytes -= page.totalByteSize;
      this.pages.delete(pageIndex);
    }
  }

  clear(): void {
    this.pages.clear();
    this.currentMemoryBytes = 0;
  }

  private evictLeastRecentlyUsedPage(exemptPageIndex?: number): void {
    let oldestPageIndex: number | undefined;
    let oldestTime = Infinity;

    for (const [idx, page] of this.pages.entries()) {
      if (exemptPageIndex !== undefined && idx === exemptPageIndex) {
        continue;
      }
      if (page.lastAccessedAt < oldestTime) {
        oldestTime = page.lastAccessedAt;
        oldestPageIndex = idx;
      }
    }

    if (oldestPageIndex !== undefined) {
      const evicted = this.pages.get(oldestPageIndex);
      if (evicted) {
        this.currentMemoryBytes -= evicted.totalByteSize;
        this.pages.delete(oldestPageIndex);
        this.evictions++;
      }
    }
  }

  private evictOldestTileFromPage(page: DecodedPage): boolean {
    const firstKey = page.tiles.keys().next().value;
    if (firstKey !== undefined) {
      const tile = page.tiles.get(firstKey);
      if (tile) {
        page.totalByteSize -= tile.byteSize;
        this.currentMemoryBytes -= tile.byteSize;
        page.tiles.delete(firstKey);
        this.evictions++;
        return true;
      }
    }
    return false;
  }
}
