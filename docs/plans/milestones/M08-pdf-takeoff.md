# M08 — PDF and BoQ-linked takeoff engine

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M08. Dependencies: M02, M03; the M06 BoQ linking contract; M07 reusable geometry primitives as needed (not the entire CAD UI). This milestone is refined to task level under protocol R9 (refinement PR recorded in the register).
> Candidate engine: PdfCraft (storytold) — its `measure` crate implements ISO 32000-2 §12.9 calibrated distance/perimeter/area; evidence-gated per [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md); family evaluation in [prior-art report](../../reports/prior-art-artcraft-family.md); licenses per [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md). M08-T01 is the required PdfCraft prototype task (CLI/MCP over M00 fixtures vs PDF.js reference + the TS measurement authority), including the M04 photo→PDF annotation/export evidence path (ADR-0015 §6); any adoption beyond the prototype requires a per-engine adoption ADR.

Exit (v3): identical measurement results and linked quantities across native/web/server, preserved source provenance, conflict behavior and representative large-PDF performance.

---

- [ ] **M08-T01** — PdfCraft prototype: CLI/MCP measure/annot evidence over M00 fixtures vs PDF.js reference
  - Depends on: M00-GATE (PDF fixtures + baseline), M01 PDF spike outcome · Output: prototype report `docs/reports/M08/pdfcraft-prototype.md` + fixture/driver artifacts under `prototype/`; no production code change.
  - Scope: drive PdfCraft pinned to an upstream release tag (start: `v0.4.0`) via its CLI and headless MCP server over the M00 PDF fixtures; exercise its `measure` crate (ISO 32000-2 §12.9 calibrated distance/perimeter/area) and `annot` stack, comparing against the PDF.js reference renderer and the authoritative TypeScript document-session/measurement engine. Also exercise the **photo→PDF→annotate/export path** that backs the M04 site-photo markup approach (ADR-0015 §6): embed a photo in a PDF, add shapes/comments, export — record fidelity and limits. Disposable evidence work; starts before the M02/M03 dependencies complete so its evidence shapes T02–T05 decisions.
  - Acceptance:
    - The pin (exact tag/rev) is recorded in `docs/vendor/ARTCRAFT.md` in the same PR.
    - Measurement matrix over M00 fixtures: calibrated distance/perimeter/area via PdfCraft vs the TS authority vs independently computed expected values; divergences listed with cause (renderer scaling, calibration rounding, coordinate space).
    - Annotation round-trip evidence: annotations created via `annot` survive export/reopen; forms/OCR capability noted where relevant to takeoff workflows.
    - Photo-markup evidence path recorded with fidelity findings and explicit limits, linked from the M04 header note (ADR-0015 §6).
    - The report includes the PdfCraft MCP tool inventory (tool names, inputs, outputs) and ends in an explicit recommendation: proceed toward a per-engine adoption ADR, or keep the TS engine/PDF.js reference — either way the evidence is linked from this milestone.

- [ ] **M08-T02** — Document-session renderer adapters: viewport tiling, bounded decoded-page cache, cancellation, explicit disposal
  - Depends on: M02-GATE · Output: renderer adapter layer extending existing document sessions.
  - Scope: extend existing document sessions (v3 §3) with renderer adapters, viewport tiling, bounded decoded-page cache, cancellation and explicit disposal (v3 §6 M08).
  - Acceptance:
    - Never rasterize every page eagerly; decoded-page cache is bounded with eviction policy evidence.
    - Cancellation terminates in-flight decode/tiling without leaking resources; disposal is explicit and tested.
    - Adapter never owns calibration, markup persistence, authorization, or BoQ links (M01 authority map).
    - The renderer choice (PDF.js reference vs candidate) follows the M01 spike and M08-T01 evidence; no silent renderer switch.

- [ ] **M08-T03** — Persist revision/page/crop/rotation/calibration provenance and vector measurement geometry
  - Depends on: M08-T02 · Output: provenance model + versioned measurement geometry storage.
  - Scope: persist revision/page/crop/rotation/calibration provenance and vector measurement geometry; measurement and calibration versioned together (v3 §5.4 takeoff row, §6 M08).
  - Acceptance:
    - Every measurement records its source revision, page, crop/rotation state, and calibration version; provenance is queryable.
    - Revision changes invalidate/review derived quantities — never silent rebase (v3 §5.4).
    - Geometry is stored in document space with declared units; conversion to display space is a rendering concern only.
    - Change-feed integration and Flutter-parity path named in the task packet (standing constraint 3).

- [ ] **M08-T04** — Measurement coverage: area with holes, polyline length, perimeter, unit conversion, counts; invalid geometry rejected
  - Depends on: M08-T03 · Output: measurement implementation with independent fixture evidence.
  - Scope: area with holes, polyline length, perimeter, unit conversion, counts; invalid geometry rejected with independent expected measurements as fixtures (v3 §8 documents row).
  - Acceptance:
    - Identical results native/web/server on the fixture set (v3 §6 M08); fixtures include independently computed expected values.
    - Invalid geometry (self-intersection, zero area, degenerate polylines) is rejected with explicit errors, not coerced.
    - Unit conversion is calibrated and versioned with the measurement (no ambient unit state).
    - Reuses M07 geometry primitives where applicable — no duplicate topology implementations.

- [ ] **M08-T05** — First-class takeoff-to-BoQ link via existing models and one domain integration path
  - Depends on: M08-T04, M06 BoQ linking contract · Output: takeoff→BoQ integration through one domain path.
  - Scope: quantity changes flow through one domain integration path; no direct BoQ cell mutation from a drawing widget (v3 §6 M08).
  - Acceptance:
    - The link uses existing models where they fit; quantity postings are existing service calls with permission checks intact.
    - A drawing widget cannot mutate BoQ cells directly; the single integration path is enforced and tested.
    - Change-feed integration and Flutter-parity path named (standing constraint 3); round-trip evidence links measurement → quantity → BoQ → measurement.

- [ ] **M08-T06** — Recalibration/revision invalidation and double-counting prevention
  - Depends on: M08-T05 · Output: invalidation/deduplication evidence under real sync.
  - Scope: recalibration/revision changes mark affected measurements and downstream quantities for review; prevent double counting from repeated links or replayed measurements (v3 §6 M08).
  - Acceptance:
    - Affected measurements + downstream quantities are marked for review on recalibration/revision; accepted quantities cannot silently persist.
    - Repeated links and replayed measurements (M03 feed replay) cannot double count — idempotency fixture-proven.
    - Review state is visible in the shared save/sync model (M02-T05) and clears only through the domain path.

- [ ] **M08-T07** — Multi-page, rotated, mixed-size and scanned blueprint validation + large-PDF performance evidence
  - Depends on: M08-T02, M08-T04 · Output: blueprint validation matrix + performance evidence.
  - Scope: multi-page, rotated, mixed-size and scanned blueprints; large-PDF performance per §7 (v3 §6 M08).
  - Acceptance:
    - M00 PDF fixtures exercised (vector, scanned, rotated, mixed-size, malformed); failures explicit, never silent mis-measurement.
    - Vector overlays do not imply automatic extraction of all PDF geometry (v3 §6 M08) — stated and enforced.
    - Large-PDF performance evidence on ratified profiles: bounded memory, tiled viewport, cancellation under load.

- [ ] **M08-T08** — 👤 GATE — M08 exit evidence
  - Depends on: M08-T01…T07 · Output: `[M08-GATE]` evidence packet and owner decision.
  - Acceptance:
    - Parity + provenance + performance evidence aggregated: identical measurement results and linked quantities across native/web/server, preserved provenance, conflict behavior, large-PDF performance.
    - Per-engine adoption ADR status recorded (PdfCraft adopted with ADR reference, or TS engine/PDF.js reference retained with evidence).
    - Owner approval recorded under protocol R8 before merge.

## Refinement contract

This milestone is refined to task level under protocol R9 (ahead of its contractual deadline — before the M06 and M07 gates merge). M08-T01 (PdfCraft prototype) satisfies ADR-0015's requirement that refinement add an ArtCraft prototype task driving the tool via CLI/MCP over M00 fixtures against the PDF.js reference and TS measurement authority, producing a report in `docs/reports/`.
