# M08 — PDF and BoQ-linked takeoff engine

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M08. Dependencies: M02, M03; the M06 BoQ linking contract; M07 reusable geometry primitives as needed (not the entire CAD UI). Registered at **WP level** — refine before the M06/M07 gates open.

Exit (v3): identical measurement results and linked quantities across native/web/server, preserved source provenance, conflict behavior and representative large-PDF performance.

---

- [ ] **M08-W01** — Document-session renderer adapters: viewport tiling, bounded decoded-page cache, cancellation, explicit disposal
  - Acceptance sketch: extends existing document sessions (v3 §3); never rasterize every page eagerly (v3 §6 M08).

- [ ] **M08-W02** — Persist revision/page/crop/rotation/calibration provenance and vector measurement geometry
  - Acceptance sketch: measurement and calibration versioned together; revision changes invalidate/review derived quantities — never silent rebase (v3 §5.4 takeoff row, §6 M08).

- [ ] **M08-W03** — Measurement coverage: area with holes, polyline length, perimeter, unit conversion, counts; invalid geometry rejected
  - Acceptance sketch: independent expected measurements as fixtures (v3 §8 documents row); identical results native/web/server.

- [ ] **M08-W04** — First-class takeoff-to-BoQ link via existing models and one domain integration path
  - Acceptance sketch: quantity changes flow through one domain path; no direct BoQ cell mutation from a drawing widget (v3 §6 M08).

- [ ] **M08-W05** — Recalibration/revision invalidation and double-counting prevention
  - Acceptance sketch: affected measurements + downstream quantities marked for review; repeated links and replayed measurements cannot double count (v3 §6 M08).

- [ ] **M08-W06** — Multi-page, rotated, mixed-size and scanned blueprint validation + large-PDF performance evidence
  - Acceptance sketch: M00 PDF fixtures exercised; vector overlays do not imply automatic extraction of all PDF geometry (v3 §6 M08).

- [ ] **M08-W07** — 👤 GATE — M08 exit evidence
  - Acceptance sketch: parity + provenance + performance evidence aggregated; owner approval per protocol R8.

## Refinement contract

Before the M06 and M07 gates merge, refine to `M08-Tnn` tasks with testable acceptance criteria (protocol R9).
