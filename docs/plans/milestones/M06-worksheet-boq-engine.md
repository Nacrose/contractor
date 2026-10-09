# M06 — Worksheet/BoQ engine migration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M06, §3 worksheet row. Dependencies: M02, M03; M01 file/compute feasibility accepted. May develop before M05 completes; integrated rollout waits for the shared sync gate. Largest single engine (v3 §6.0: 10–20 weeks band). Registered at **WP level** — refine before the M02 gate opens.
> Candidate engine: GridCraft (storytold) — evidence-gated per [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md); family evaluation in [prior-art report](../../reports/prior-art-artcraft-family.md); licenses per [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md). Refinement must add a GridCraft prototype task (CLI/MCP over M00 fixtures vs the TS authority).

Exit (v3): agreed feature matrix, native/web/server calculation parity, concurrent edit/structure tests and 50k/100k-row workload evidence. Retire redundant production evaluators only after all consumers switch.

---

- [ ] **M06-W01** — Workbook model evolution: command semantics, structure transforms, names, formatting, formula registry
  - Acceptance sketch: versioned migration of positional references into stable collaboration identities without changing displayed A1 behavior (v3 §6 M06).

- [ ] **M06-W02** — Dependency graph: dirty propagation, cycle/error handling, bounded/cancellable recalculation
  - Acceptance sketch: volatile functions, random/time inputs, external references defined so server/native/web agree (v3 §6 M06); M00 profiling (fresh-evaluator scan behavior) informs the incremental boundary.

- [ ] **M06-W03** — Calculation port to the shared core with differential fixtures + verified server binding
  - Acceptance sketch: per-engine decision record honored; kernel governance duplication status maintained (single impl / governed temporary duplicate / accepted exception) (v3 §4, §6 M06).

- [ ] **M06-W04** — One virtualized Flutter grid consuming engine viewport/layout output
  - Acceptance sketch: no widget per cell; no recalculation triggered by scrolling; 50k/100k-row workload evidence per §7 (v3 §6 M06).

- [ ] **M06-W05** — Cell/structure operations: version checks, compensating undo, conflict review, compaction/checkpoints
  - Acceptance sketch: disjoint edits compose; overlapping edits preserve conflict; ordered structure ops with tested reference transformations (v3 §5.4 worksheet rows).

- [ ] **M06-W06** — IPC/BoQ integration through existing financial services
  - Acceptance sketch: authoritative financial arithmetic stays centralized; exact-decimal crossing as strings/scaled ints; no client-authorized postings (v3 §5.1, §6 M02/M06).

- [ ] **M06-W07** — XLSX compatibility: byte round-trip tests + independently checked representative files
  - Acceptance sketch: known Excel gaps remain tracked work — never declared solved by the port (v3 §6 M06); import/export fidelity matrix recorded.

- [ ] **M06-W08** — Concurrent edit + structure test evidence
  - Acceptance sketch: legacy snapshot saves denied writes to migrated document types or forced into version checks (v3 §5.4); no blind full-workbook replacement.

- [ ] **M06-W09** — Redundant production evaluator retirement (consumer-switch complete)
  - Acceptance sketch: retirement gated on all consumers switched; consumer sweep documented (v3 §2 instruction 10).

- [ ] **M06-W10** — 👤 GATE — M06 exit evidence
  - Acceptance sketch: parity + workload evidence aggregated; M08 inputs (BoQ linking contract) confirmed; owner approval per protocol R8.

## Refinement contract

Before `M02-W08` merges (M06's dependency path), refine to `M06-Tnn` tasks with testable acceptance criteria (protocol R9).
