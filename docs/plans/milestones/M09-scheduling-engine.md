# M09 — Scheduling, site progress and cash-flow engine

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M09, §3 CPM row. Dependencies: M03, M05, M06; portable core substrate from M01/M02. Registered at **WP level** — refine before the M05/M06 gates open.

Exit (v3): native/web/server schedule results agree, progress cannot post twice, cash-flow uses the correct rate source and large-graph edits remain responsive.

---

- [ ] **M09-W01** — Evolve `cpm-engine.ts` semantics through shared fixtures **before** any port
  - Acceptance sketch: calendars/holidays (Nepal), inclusive dates, milestones, FS/SS/FF/SF, lag hours, constraints, actuals, retained logic, float and leveling floors covered (v3 §6 M09).

- [ ] **M09-W02** — Versioned calculation inputs: calendars, data date, rates, progress
  - Acceptance sketch: no ambient device timezone/holiday cache changes authoritative results (v3 §6 M09); date-only semantics preserved.

- [ ] **M09-W03** — Reuse scheduler progress/cost/approval services
  - Acceptance sketch: contractual BoQ rate vs RA cost separation preserved (v3 §6 M09); authoritative recalculation stays server-side per the M01 kernel decision.

- [ ] **M09-W04** — One virtualized Gantt view + typed schedule operations
  - Acceptance sketch: offline schedules are local proposals until server acceptance; graph cycles/conflicting dependencies surfaced (v3 §6 M09).

- [ ] **M09-W05** — Immutable baselines/versions; recalculation changes explained before applying regulated/approved updates
  - Acceptance sketch: baseline/version concepts preserved; explanation UX precedes apply for approved schedules (v3 §6 M09).

- [ ] **M09-W06** — Parity + double-post prevention + large-graph responsiveness evidence
  - Acceptance sketch: 10k tasks / 50k dependencies fixtures per §7; progress cannot post twice; cash-flow correct rate source (v3 §6 M09 exit).

- [ ] **M09-W07** — 👤 GATE — M09 exit evidence
  - Acceptance sketch: evidence aggregated; M10 schedule-area migration inputs confirmed; owner approval per protocol R8.

## Refinement contract

Before the M05 and M06 gates merge, refine to `M09-Tnn` tasks with testable acceptance criteria (protocol R9).
