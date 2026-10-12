# M08-T02: Document-Session Renderer Adapters, Viewport Tiling & Bounded Cache Report

- **Task:** M08-T02 — Document-session renderer adapters: viewport tiling, bounded decoded-page cache, cancellation, explicit disposal
- **Milestone:** M08 PDF and BoQ-linked takeoff engine
- **Package:** `@contractor/native-takeoff` (`packages/native_takeoff/`)
- **Status:** Complete (8/8 tests passing, clean compile)
- **Normative References:** Platform Plan v3 §3 Document/Takeoff row, §6 M08; M01 Authority Map ([ADR-0013](../../adr/0013-m01-stack-decision.md), `docs/reports/M01/gate-evidence.md`); ADR-0015 §6.
- **Date:** 2026-10-12

---

## 1. Executive Summary & Architecture Boundary

Task **M08-T02** establishes the core document-session renderer adapter layer in `@contractor/native-takeoff`, extending Contractor's document session model with viewport tiling, bounded memory caching, cooperative cancellation, and explicit lifecycle disposal.

In strict compliance with the M01 authority map and Platform Plan v3:
1. **Renderer Isolation:** The renderer adapter is purely a rendering and tile rasterization provider. It **NEVER owns**:
   - Calibration data (`/Measure` dictionaries or real-world physical ratios).
   - Markup or annotation persistence.
   - Authorization, multi-tenant scoping, or access controls.
   - Takeoff quantities or BoQ linking.
   Any attempt to leak these domain concerns into the adapter triggers an explicit `Authority Violation` failure (`assertAuthorityBoundary()`).
2. **Explicit Renderer Choice:** Supports both the verified web reference renderer (`PdfJsReferenceRendererAdapter`) and the candidate native engine (`PdfCraftRendererAdapter`) without silent or implicit renderer substitution.

---

## 2. Component Design & Contracts

### 2.1 Component Taxonomy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DocumentSession                                 │
│  - documentId, revisionId, uri                                         │
│  - ViewportTilingCalculator (512x512 discrete tiles, frustum culling)  │
│  - BoundedDecodedPageCache (maxPages: 3, maxMemory: 64MB, LRU)        │
│  - In-flight AbortController (rapid pan/zoom cancellation)             │
│  - Explicit Lifecycle & Disposal (SessionDisposedError)                │
└───────────────────┬────────────────────────────────────────────────────┘
                    │ delegates visible tile decode
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        RendererAdapter                                 │
│  - initializeDocument(documentId, byteSource)                          │
│  - getPageMetrics(pageIndex)                                           │
│  - renderTile(coords, signal?)                                         │
│  - dispose()                                                           │
│  - assertAuthorityBoundary()                                           │
├───────────────────────────────────┬────────────────────────────────────┤
│   PdfJsReferenceRendererAdapter   │      PdfCraftRendererAdapter       │
│   (Web Reference - Mozilla PDF.js)│   (Native Candidate - PdfCraft)    │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 2.2 Authority Map Compliance Table

| Architecture Responsibility | Owner Component | Renderer Adapter Allowed? |
|---|---|---|
| PDF decoding & tile rasterization | `RendererAdapter` (`PdfJs`, `PdfCraft`) | **YES** (Core responsibility) |
| Viewport tiling & frustum culling | `ViewportTilingCalculator` / `DocumentSession` | **NO** (Orchestrated by session) |
| Decoded tile memory caching & LRU | `BoundedDecodedPageCache` / `DocumentSession` | **NO** (Managed across renderers) |
| Calibration & `/Measure` scale | Contractor Domain Model / Measurement Engine | **STRICTLY PROHIBITED** |
| Markup & annotation persistence | Contractor Central Outbox & SQLite/Prisma | **STRICTLY PROHIBITED** |
| Project authorization & access | Contractor Identity & Security Keystore | **STRICTLY PROHIBITED** |
| Takeoff-to-BoQ financial links | Contractor BoQ Domain Service (M06/M08-T05) | **STRICTLY PROHIBITED** |

---

## 3. Viewport Tiling & Frustum Culling

High-density architectural blueprints (A0, A1, A3 at 1:100 scale) cannot be rasterized as monolithic bitmaps without causing catastrophic out-of-memory crashes on mobile and web environments (e.g. rendering A0 at 400% zoom requires $> 700\text{ MB}$ of uncompressed VRAM).

### Tiling Policy:
- **Discrete Tile Grid:** Pages are partitioned into uniform $512 \times 512\text{ px}$ tiles at current viewport scale.
- **Frustum Culling:** `ViewportTilingCalculator.calculateVisibleTiles()` calculates bounding box intersections. Only tiles intersecting the current screen window are requested.
- **Off-screen Elimination:** When viewing a section of an A3 drawing ($1190.55 \times 841.89\text{ pt}$) inside an $800 \times 600\text{ px}$ viewport, exactly **4 tiles** are requested instead of rasterizing the entire drawing. Viewports outside the page boundary yield **0 tiles**.

---

## 4. Bounded Decoded-Page Cache & LRU Eviction

The `BoundedDecodedPageCache` enforces strict resource boundaries:
- **Page Limit (`maxPages`):** Default 3 pages concurrently in memory.
- **Memory Budget (`maxMemoryBytes`):** Default $64\text{ MB}$ budget.
- **Eviction Order:** Uses an incremental access sequence counter (`accessSequence`) guaranteeing deterministic LRU eviction independent of sub-millisecond clock resolution.
- **Eviction Hierarchy:**
  1. If cached page count exceeds `maxPages`, the least recently accessed page and all its tile buffers are evicted.
  2. If memory exceeds `maxMemoryBytes`, LRU pages are purged; if single-page tiles exceed the budget, individual oldest tiles within the active page are evicted.

---

## 5. Cancellation & Rapid Interaction Handling

When users pan or pinch-zoom across a blueprint, in-flight render operations become obsolete immediately.

- **Cooperative Cancellation:** `requestViewportTiles()` creates an `AbortController` combined with any caller-supplied `AbortSignal`.
- **Immediate Abort on Viewport Shift:** Initiating a new viewport request automatically aborts superseded tile decodes via `cancelPendingRenders()`.
- **Zero Resource Leakage:** Active job counters return to 0 immediately upon abort without orphan workers or memory leaks.

---

## 6. Explicit Lifecycle Disposal

Calling `session.dispose()`:
1. Cancels all in-flight render jobs.
2. Clears the tile cache and frees memory buffers.
3. Disposes the underlying renderer adapter.
4. Transitions session state to `isDisposed = true`.
5. Any subsequent access to `pageCount`, `getPageDimensions()`, or `requestViewportTiles()` immediately throws `SessionDisposedError`.

---

## 7. Conformance Suite Results

Automated verification in `packages/native_takeoff/test/document_session.test.ts`:

```
✔ document session never eagerly decodes all pages on initialization (1.029875ms)
✔ viewport tiling decomposes page into discrete tiles and culls non-visible regions (0.205291ms)
✔ bounded decoded-page cache enforces maxPages and maxMemory limits with LRU eviction (0.973292ms)
✔ cancellation aborts in-flight tile decode without leaking active jobs or memory (0.734667ms)
✔ rapid viewport panning cancels superseded in-flight renders cleanly (9.62525ms)
✔ explicit disposal clears all cache, cancels pending renders, and rejects subsequent calls (11.686375ms)
✔ adapter asserts authority boundary and rejects domain property leakage (0.1435ms)
✔ session operates with PDF.js reference adapter and PdfCraft candidate adapter cleanly (20.460417ms)

native_takeoff: all document session, renderer adapter, viewport tiling, bounded page cache, cancellation, and disposal tests PASSED (M08-T02)
```
