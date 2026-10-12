/**
 * Viewport Tiling Calculator & Frustum Culling (M08-T02).
 *
 * Decomposes high-resolution pages (A0-A3 blueprints at up to 400%+ zoom) into discrete
 * bounded tiles, preventing eager rasterization of non-visible page areas.
 */

import { PageDimensions, TileCoordinates, ViewportRect } from "./types.js";

export interface TileDescriptor {
  readonly id: string;
  readonly coords: TileCoordinates;
  readonly boundsPt: {
    readonly minXPt: number;
    readonly minYPt: number;
    readonly maxXPt: number;
    readonly maxYPt: number;
  };
}

export class ViewportTilingCalculator {
  static readonly DEFAULT_TILE_SIZE = 512; // 512x512 pixels per tile buffer

  /**
   * Generates unique deterministic tile identifier.
   */
  static getTileId(coords: TileCoordinates): string {
    return `p${coords.pageIndex}_s${coords.scale.toFixed(2)}_tx${coords.tileX}_ty${coords.tileY}`;
  }

  /**
   * Computes visible tile descriptors for a page intersecting the current viewport frustum.
   */
  static calculateVisibleTiles(
    pageIndex: number,
    pageDimensions: PageDimensions,
    viewport: ViewportRect,
    tileSize = ViewportTilingCalculator.DEFAULT_TILE_SIZE
  ): TileDescriptor[] {
    const scale = Math.max(0.1, viewport.scale);
    const scaledPageWidthPx = pageDimensions.widthPt * scale;
    const scaledPageHeightPx = pageDimensions.heightPt * scale;

    // Viewport bounds in scaled display pixels
    const vpMinX = Math.max(0, viewport.x);
    const vpMinY = Math.max(0, viewport.y);
    const vpMaxX = Math.min(scaledPageWidthPx, viewport.x + viewport.width);
    const vpMaxY = Math.min(scaledPageHeightPx, viewport.y + viewport.height);

    // If viewport does not intersect the page, return empty list (complete culling)
    if (vpMinX >= vpMaxX || vpMinY >= vpMaxY) {
      return [];
    }

    const colMin = Math.max(0, Math.floor(vpMinX / tileSize));
    const colMax = Math.min(Math.ceil(scaledPageWidthPx / tileSize) - 1, Math.floor(vpMaxX / tileSize));
    const rowMin = Math.max(0, Math.floor(vpMinY / tileSize));
    const rowMax = Math.min(Math.ceil(scaledPageHeightPx / tileSize) - 1, Math.floor(vpMaxY / tileSize));

    const tiles: TileDescriptor[] = [];

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const coords: TileCoordinates = {
          pageIndex,
          tileX: col,
          tileY: row,
          tileSize,
          scale
        };

        // Convert tile pixel boundaries back to PDF point coordinates
        const minXPt = (col * tileSize) / scale;
        const minYPt = (row * tileSize) / scale;
        const maxXPt = Math.min(pageDimensions.widthPt, ((col + 1) * tileSize) / scale);
        const maxYPt = Math.min(pageDimensions.heightPt, ((row + 1) * tileSize) / scale);

        tiles.push({
          id: ViewportTilingCalculator.getTileId(coords),
          coords,
          boundsPt: {
            minXPt,
            minYPt,
            maxXPt,
            maxYPt
          }
        });
      }
    }

    return tiles;
  }
}
