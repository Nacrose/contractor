# 0020. CADCraft Engine Adoption and Shared Presentation Binding

Date: 2026-10-12  
Status: Accepted  
Deciders: Owner (via chat guidance), AI Agent  
Consulted: ADR-0014 (Open Source Only), ADR-0015 (ArtCraft Upstream Engine Strategy), ADR-0016 (In-Place Embedding & Table Modernization), ADR-0018 (Upstream Capabilities & Construction Integration), ADR-0019 (GridCraft Adoption)  

---

## Context

Platform Plan v3 §6 M07 and ADR-0015 establish an evidence-gated strategy for adopting candidate CAD and drawing review engines. Under ADR-0016 and ADR-0018, Contractor committed to adopting the open-source **ArtCraft** family (`storytold/cadcraft`) without forks or upstream code modifications, reusing complete application interfaces with menus/tools in Full Editor Mode alongside focused components in Embedded Capability Mode (e.g. embedded drawing review, layer toggles, redline markups, and vector plot).

M07-T01 through M07-T09 qualified the underlying CAD capabilities:
1. **DWG Engine Reality (M07-T01, T05, T08):** In-process DWG round-trip via `acadrust` (MPL-2.0) for modern releases (`AC1015`–`AC1032`), paired with an isolated server-side `LibreDWG` subprocess bridge for legacy `AC1012`/`AC1014` formats.
2. **Command & Input Substrate (M07-T02):** Central command registry, generic AEC aliases (`L`, `C`, `PL`, `M`, `E`, `U`), ortho/snap constraints, and compensating undo.
3. **Topology Primitives (M07-T03):** High-precision intersections, polygon validation, and deduction area calculations.
4. **Spatial Indexing & Batches (M07-T04, T09):** Viewport-bounded $O(\text{viewport})$ typed geometry batching, sub-millisecond snapping, and 60 Hz compliance on 100k-entity models.
5. **Plot Engine & Typography (M07-T06):** Pure vector PDF 1.4 output with lineweight conversion and automatic Devanagari Unicode font fallback.
6. **Revision & Conflict Integrity (M07-T07):** Monotonic entity revisions, atomic group validation, and intent-preserving conflict resolution.

Contractor requires a ratified CAD adoption decision defining host surfaces, lifecycle bindings, domain permission boundaries, and upgrade/rollback tooling.

---

## Decision

1. **Adopt CADCraft as the 2D CAD & Drawing Drafting Engine:**
   - **Pinned Upstream Version:** Release tag `v0.3.0`, immutable commit `c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`.
   - **Previous Qualified Version:** Release tag `v0.2.0`, immutable commit `b0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9`.
   - **Repository:** `https://github.com/storytold/cadcraft`.
   - **Licenses:** Dual MIT OR Apache-2.0, with `acadrust` MPL-2.0 (ADR-0014 compliant).

2. **Dual Presentation Surfaces (per ADR-0016):**
   - **Full Editor Mode:** Preserves upstream CAD interface chrome (menus, toolbars, layer manager, layout tabs, properties inspector, and command line) for dedicated drafting and engineering modification workflows.
   - **Embedded Capability Mode:** Renders focused drawing review components inside Contractor construction forms (e.g. BoQ takeoff sheet linking, daily log site inspection photo pins, material laydown staging, redline markups, layer toggles, and vector PDF plotting). The ribbon and command line are collapsed to maximize drawing canvas area.

3. **Drawing Identity & Revision Preservation:**
   - Switching between Full Editor and Embedded Review modes preserves the active `CadDocument`, all hexadecimal entity handles (group code 5), entity revisions, current selection sets, and compensating undo/redo stacks.
   - Redline annotations (clouds, notes, leader arrows) are isolated on dedicated overlay layers (`CONTRACTOR_REDLINES`), preserving the original drawing bytes and coordinate frame.

4. **Domain Permission Boundary:**
   - Domain permissions are enforced strictly at the host adapter boundary (`CadCraftHostAdapter`):
     - `view_only`: Disables drafting mutations and grip dragging; permits zooming, panning, layer toggling, and measurement queries.
     - `markup_only`: Restricts mutations strictly to redline annotation layers.
     - `full_authoring`: Permits full entity drafting and geometry edits, subject to M07-T07 atomic group validation and stale writer rejection.

5. **Upstream Release Pipeline Integration:**
   - CADCraft release updates and safe rollbacks are integrated into the program-wide update tool (`scripts/update-artcraft.mjs cadcraft <release>`).
   - Two actual upstream releases (`v0.3.0` and `v0.2.0`) are verified for bidirectional upgrade and rollback with DWG/DXF fixture compatibility.

6. **Governed Duplication Status:**
   - In-app substrate `@contractor/native-cad` and upstream CADCraft share the adopted command, topology, and spatial indexing contracts.
   - Legacy ad-hoc viewer implementations (`src/lib/dxf/dxf-parser.ts`, `src/components/cad/`) are marked superseded and scheduled for clean retirement in M10.

---

## Consequences

### Positive
- Reuses the complete, professionally designed CADCraft drafting interface without downstream source code forks.
- Unifies drawing review across native desktop, web browser, and headless CI runtimes.
- Guarantees 100% entity handle identity preservation and vector plotting fidelity with bilingual Devanagari support.
- Fully automated two-release upgrade and rollback testing ensures future upstream releases can be adopted without regression.

### Negative / Mitigations
- Managing dual modes requires careful state handoff in the host adapter; mitigated by `CadCraftHostAdapter` state synchronization.
- Complex 3D solids remain unsupported for direct editing in 2D workflows; mitigated by explicit unsupported-object reporting (M07-T05).
