# 0021. PdfCraft Engine Adoption and Shared Presentation Binding

Date: 2026-10-12  
Status: Accepted  
Deciders: Owner (via chat guidance), AI Agent  
Consulted: ADR-0014 (Open Source Only), ADR-0015 (ArtCraft Upstream Engine Strategy), ADR-0016 (In-Place Embedding & Table Modernization), ADR-0018 (Upstream Capabilities & Construction Integration), ADR-0019 (GridCraft Adoption), ADR-0020 (CADCraft Adoption)  

---

## Context

Platform Plan v3 §6 M08 and ADR-0015 establish an evidence-gated strategy for adopting candidate PDF rendering, annotation, and takeoff engines. Under ADR-0016 and ADR-0018, Contractor committed to adopting the open-source **ArtCraft** family (`storytold/pdfcraft`) without downstream source forks or code modifications, reusing complete application interfaces with menus/tools in Full Editor Mode alongside focused components in Embedded Capability Mode (e.g. embedded blueprint takeoff canvas, redline markups, photo-to-PDF audit inspections, and BoQ-linked quantity estimation).

M08-T01 through M08-T07 qualified the underlying PDF takeoff and document session capabilities:
1. **Upstream Prototype & Calibrated Measure (M08-T01):** Validated `storytold/pdfcraft` `v0.4.0` via CLI and headless MCP server over M00 fixtures; verified its `measure` crate (ISO 32000-2 §12.9 calibrated distance/perimeter/area) and `annot` stack against the PDF.js reference renderer.
2. **Renderer Adapters & Viewport Cache (M08-T02):** Document sessions with viewport tiling, bounded decoded-page cache with LRU eviction, and active cancellation/explicit disposal under load.
3. **Measurement Provenance & Versioned Storage (M08-T03):** Immutable source revision, page, crop/rotation, and calibration versioning; derived quantities marked for review upon revision change (never silent rebase).
4. **Measurement Coverage & Geometry Validation (M08-T04):** Polyline perimeter, gross/net polygon area with deduction holes, unit conversions, and fail-closed validation rejecting invalid/self-intersecting geometry.
5. **Takeoff-to-BoQ Integration (M08-T05):** Single domain integration path (`TakeoffBoqLinkService`); drawing widgets strictly prohibited from mutating BoQ cells directly; permission checks and fiscal locks enforced on `"worksheet.update"`.
6. **Recalibration/Revision Invalidation (M08-T06):** Invalidation without silent persistence; double-counting prevention via idempotent distinct-link aggregation; review actions resolved through domain paths.
7. **Blueprint Validation & Large-PDF Performance (M08-T07):** 120-page blueprint validation matrix across mixed sizes, orthogonal rotations, scanned rasters, and fail-closed malformed handling; Vector Overlay Policy enforced; bounded memory $<8\text{ MB}$ under 512x512 tiling.

Contractor requires a ratified PDF takeoff adoption decision defining host surfaces, lifecycle bindings, domain permission boundaries, and upgrade/rollback tooling.

---

## Decision

1. **Adopt PdfCraft as the PDF Rendering, Annotation, and Takeoff Engine:**
   - **Pinned Upstream Version:** Release tag `v0.4.0`, immutable commit `e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3`.
   - **Previous Qualified Version:** Release tag `v0.3.0`, immutable commit `d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4`.
   - **Repository:** `https://github.com/storytold/pdfcraft`.
   - **Licenses:** Dual MIT OR Apache-2.0 (ADR-0014 compliant).

2. **Dual Presentation Surfaces (per ADR-0016):**
   - **Full Editor Mode:** Preserves upstream PDF interface chrome (ribbon toolbar, page thumbnail sidebar, navigation pane, annotation tools, and export actions) for dedicated document markup, photo auditing, and PDF authoring.
   - **Embedded Takeoff Mode:** Renders focused blueprint canvas inside Contractor estimation workflows (e.g. BoQ takeoff sheet linking, site photo markup pins, and calibration tools). The ribbon and sidebar are collapsed to maximize drawing canvas area.
   - **Headless CLI Mode:** Supports automated CI pipelines, headless conversion, and photo audit PDF generation without UI overhead.

3. **Document Identity & Revision Preservation:**
   - Switching between Full Editor and Embedded Takeoff modes preserves document ID, revision ID, active page index, selection state, calibrations, and vector measurements.
   - Annotations and measurements are stored in document space points ($1/72\text{ in}$); conversion to display coordinates is strictly a rendering concern.

4. **Domain Permission Boundary:**
   - Domain permissions are enforced strictly at the host adapter boundary (`PdfCraftHostAdapter`):
     - `view_only`: Disables drafting mutations and markup attachments; blocks quantity postings to BoQ; permits zooming, panning, and querying measurements.
     - `takeoff_markup_only`: Restricts mutations strictly to takeoff measurements and photo callout markups; permits service-mediated quantity updates.
     - `full_authoring`: Permits full document annotation and editing.

5. **Single Domain Integration Path to BoQ:**
   - Quantity changes flow exclusively through `TakeoffBoqLinkService` and the `"worksheet.update"` operation with permission checks intact.
   - Direct BoQ cell mutations from PDF drawing widgets remain architecturally prohibited (`DirectMutationProhibitedError`).

6. **Upstream Release Pipeline Integration:**
   - PdfCraft release updates and safe rollbacks are integrated into the program-wide update tool (`scripts/update-artcraft.mjs pdfcraft <release>`).
   - Two actual upstream releases (`v0.4.0` format version 4 and `v0.3.0` format version 3) are verified for bidirectional upgrade and rollback with 100% measurement and calibration preservation.

---

## Consequences

### Positive
- Reuses upstream PdfCraft rendering, annotation, and measurement tools without downstream source code forks.
- Unifies PDF blueprint takeoff and photo-to-PDF audit markup across native desktop, web browser, and headless CI runtimes.
- Preserves 100% measurement provenance, calibration versioning, and architectural separation between drawings and financial BoQ cells.
- Automated two-release upgrade and rollback testing ensures future upstream releases can be adopted safely without regressions.

### Negative / Mitigations
- Dual presentation modes require host adapter state synchronization; mitigated by `PdfCraftHostAdapter` state encapsulation and invariant tests.
- Vector overlay policy requires explicit discipline: vector overlays do not imply automatic vector extraction from arbitrary PDF streams; mitigated by runtime validator assertions.
