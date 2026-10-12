import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DocumentSession,
  PdfJsReferenceRendererAdapter,
  PdfCraftRendererAdapter,
  ViewportTilingCalculator,
  BoundedDecodedPageCache,
  SessionDisposedError,
  RenderCancelledError,
  ViewportRect
} from "../src/index.js";

test("document session never eagerly decodes all pages on initialization", async () => {
  const adapter = new PdfJsReferenceRendererAdapter();
  const session = new DocumentSession(
    {
      documentId: "doc-multipage-01",
      revisionId: "rev-01",
      uri: "file://fixtures/multipage.pdf",
      byteSource: "multipage"
    },
    adapter
  );

  assert.equal(session.isInitialized, false);
  const initResult = await session.initialize();

  // Document has 12 pages, but NO pages or tiles are rasterized eagerly!
  assert.equal(initResult.pageCount, 12);
  assert.equal(session.pageCount, 12);
  assert.equal(adapter.getActiveJobCount(), 0);

  const metrics = session.getCacheMetrics();
  assert.equal(metrics.cachedPagesCount, 0);
  assert.equal(metrics.currentMemoryBytes, 0);
  assert.equal(metrics.hits, 0);
  assert.equal(metrics.misses, 0);

  await session.dispose();
});

test("viewport tiling decomposes page into discrete tiles and culls non-visible regions", () => {
  const pageDims = { widthPt: 1190.55, heightPt: 841.89 }; // A3 Landscape

  // Viewport showing only top-left corner at 1.0x scale (800x600 px window)
  const viewportTopLeft: ViewportRect = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    scale: 1.0
  };

  const tiles = ViewportTilingCalculator.calculateVisibleTiles(0, pageDims, viewportTopLeft, 512);

  // Scaled dimensions: 1190.55 x 841.89 px
  // Cols: 0 (0..512), 1 (512..1024). Rows: 0 (0..512), 1 (512..841)
  // Visible tiles should be 2 cols x 2 rows = 4 tiles out of 6 total page tiles
  assert.equal(tiles.length, 4);

  const tileIds = tiles.map((t) => t.id);
  assert.ok(tileIds.includes("p0_s1.00_tx0_ty0"));
  assert.ok(tileIds.includes("p0_s1.00_tx1_ty0"));
  assert.ok(tileIds.includes("p0_s1.00_tx0_ty1"));
  assert.ok(tileIds.includes("p0_s1.00_tx1_ty1"));

  // Viewport far outside page boundaries should be completely culled (0 tiles)
  const viewportOffscreen: ViewportRect = {
    x: 5000,
    y: 5000,
    width: 800,
    height: 600,
    scale: 1.0
  };
  const offscreenTiles = ViewportTilingCalculator.calculateVisibleTiles(0, pageDims, viewportOffscreen, 512);
  assert.equal(offscreenTiles.length, 0);
});

test("bounded decoded-page cache enforces maxPages and maxMemory limits with LRU eviction", () => {
  // Setup cache with max 2 pages and 3 MB memory limit
  const cache = new BoundedDecodedPageCache({
    maxPages: 2,
    maxMemoryBytes: 3 * 1024 * 1024
  });

  const dims = { widthPt: 1000, heightPt: 1000 };
  const createTile = (pageIndex: number, tileX: number, tileY: number) => ({
    id: `tile_p${pageIndex}_${tileX}_${tileY}`,
    coords: { pageIndex, tileX, tileY, tileSize: 512, scale: 1.0 },
    buffer: new Uint8Array(1024 * 1024), // 1 MB
    byteSize: 1024 * 1024,
    renderedAtUtc: new Date().toISOString()
  });

  // Page 0: add 1 tile (1 MB)
  cache.putTile(0, dims, createTile(0, 0, 0));
  assert.equal(cache.getMetrics().cachedPagesCount, 1);
  assert.equal(cache.getMetrics().currentMemoryBytes, 1024 * 1024);

  // Page 1: add 1 tile (1 MB) -> total 2 MB across 2 pages
  cache.putTile(1, dims, createTile(1, 0, 0));
  assert.equal(cache.getMetrics().cachedPagesCount, 2);
  assert.equal(cache.getMetrics().currentMemoryBytes, 2 * 1024 * 1024);

  // Touch Page 0 to make it more recently used than Page 1
  assert.ok(cache.getTile(0, "tile_p0_0_0"));

  // Page 2: add 1 tile (1 MB) -> exceeds maxPages (2), Page 1 must be evicted!
  cache.putTile(2, dims, createTile(2, 0, 0));
  assert.equal(cache.getMetrics().cachedPagesCount, 2);
  assert.equal(cache.hasPage(1), false, "Page 1 should have been evicted by LRU");
  assert.equal(cache.hasPage(0), true, "Page 0 was accessed and should stay cached");
  assert.equal(cache.hasPage(2), true, "Page 2 was just added and should be cached");
  assert.equal(cache.getMetrics().evictions, 1);

  // Add 2 more tiles to Page 2 (2 MB) -> total 3 MB + 1 MB = 4 MB (exceeds 3 MB limit)
  cache.putTile(2, dims, createTile(2, 1, 0));
  cache.putTile(2, dims, createTile(2, 2, 0));

  // Memory budget must be preserved: total memory should be <= 3 MB
  assert.ok(cache.getMetrics().currentMemoryBytes <= 3 * 1024 * 1024);
});

test("cancellation aborts in-flight tile decode without leaking active jobs or memory", async () => {
  const adapter = new PdfJsReferenceRendererAdapter();
  const session = new DocumentSession(
    {
      documentId: "doc-cancel-test",
      revisionId: "rev-01",
      uri: "file://fixtures/plan.pdf"
    },
    adapter
  );

  await session.initialize();

  const controller = new AbortController();
  const renderPromise = session.requestViewportTiles(
    0,
    { x: 0, y: 0, width: 800, height: 600, scale: 1.0 },
    controller.signal
  );

  // Cancel in-flight immediately
  controller.abort();

  // The request should abort cleanly
  const tiles = await renderPromise;
  assert.equal(tiles.length, 0, "No tiles should be decoded when cancelled");
  assert.equal(adapter.getActiveJobCount(), 0, "Active job count must return to 0");

  await session.dispose();
});

test("rapid viewport panning cancels superseded in-flight renders cleanly", async () => {
  const adapter = new PdfCraftRendererAdapter();
  const session = new DocumentSession(
    {
      documentId: "doc-pan-test",
      revisionId: "rev-01",
      uri: "file://fixtures/cad_drawing.pdf"
    },
    adapter
  );

  await session.initialize();

  // Dispatch initial viewport render
  const p1 = session.requestViewportTiles(0, { x: 0, y: 0, width: 500, height: 500, scale: 1.0 });

  // Rapidly pan viewport right away (superseding p1)
  const p2 = session.requestViewportTiles(0, { x: 500, y: 500, width: 500, height: 500, scale: 1.0 });

  const [res1, res2] = await Promise.all([p1, p2]);

  // First request was superseded and cancelled; second completed
  assert.ok(res1.length <= res2.length);
  assert.ok(res2.length > 0);
  assert.equal(adapter.getActiveJobCount(), 0);

  await session.dispose();
});

test("explicit disposal clears all cache, cancels pending renders, and rejects subsequent calls", async () => {
  const adapter = new PdfJsReferenceRendererAdapter();
  const session = new DocumentSession(
    {
      documentId: "doc-dispose-test",
      revisionId: "rev-01",
      uri: "file://fixtures/site_plan.pdf"
    },
    adapter
  );

  await session.initialize();
  await session.requestViewportTiles(0, { x: 0, y: 0, width: 400, height: 400, scale: 1.0 });

  assert.ok(session.getCacheMetrics().cachedPagesCount > 0);
  assert.equal(session.isDisposed, false);

  // Explicit disposal
  await session.dispose();

  assert.equal(session.isDisposed, true);
  assert.equal(adapter.isDisposed, true);
  assert.equal(adapter.getActiveJobCount(), 0);

  // Subsequent calls must throw SessionDisposedError
  assert.throws(() => session.pageCount, SessionDisposedError);
  assert.throws(() => session.getPageDimensions(0), SessionDisposedError);
  await assert.rejects(
    async () => session.requestViewportTiles(0, { x: 0, y: 0, width: 400, height: 400, scale: 1.0 }),
    SessionDisposedError
  );
});

test("adapter asserts authority boundary and rejects domain property leakage", () => {
  const adapter = new PdfJsReferenceRendererAdapter();

  // Pure adapter passes
  adapter.assertAuthorityBoundary();

  // If a caller attempts to leak calibration or BoQ domain data into the adapter:
  const leakingAdapter = adapter as any;
  leakingAdapter.calibration = { scale: 1.0 };

  assert.throws(() => {
    adapter.assertAuthorityBoundary();
  }, /Authority Violation: Renderer adapter must never own 'calibration'/);
});

test("session operates with PDF.js reference adapter and PdfCraft candidate adapter cleanly", async () => {
  const refAdapter = new PdfJsReferenceRendererAdapter();
  const candAdapter = new PdfCraftRendererAdapter();

  const refSession = new DocumentSession({ documentId: "d1", revisionId: "r1", uri: "u1" }, refAdapter);
  const candSession = new DocumentSession({ documentId: "d2", revisionId: "r2", uri: "u2" }, candAdapter);

  assert.equal(refSession.rendererKind, "PDFJS_REFERENCE");
  assert.equal(candSession.rendererKind, "PDFCRAFT_ENGINE");

  const refInit = await refSession.initialize();
  const candInit = await candSession.initialize();

  assert.equal(refInit.pageCount, 3);
  assert.equal(candInit.pageCount, 3);

  const refTiles = await refSession.requestViewportTiles(0, { x: 0, y: 0, width: 500, height: 500, scale: 1.0 });
  const candTiles = await candSession.requestViewportTiles(0, { x: 0, y: 0, width: 500, height: 500, scale: 1.0 });

  assert.equal(refTiles.length, 1);
  assert.equal(candTiles.length, 1);
  assert.equal(refTiles[0].coords.tileSize, 512);
  assert.equal(candTiles[0].coords.tileSize, 512);

  await refSession.dispose();
  await candSession.dispose();
});
