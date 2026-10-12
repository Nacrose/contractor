# M09 — TruePPM scheduling, site progress and cash-flow integration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M09, §3 CPM row; owner selection in [ADR-0017](../../adr/0017-trueppm-scheduling-integration.md). Dependencies: M03, M05, M06; contracts from M01/M02. Refined to task level under protocol R9 (refinement PR recorded in the register).

**Selected upstream:** TruePPM OSS application and scheduling engine. Develop Contractor's integration alongside upstream releases, using unmodified pinned dependencies and external adapters. Do not continue a custom CPM rewrite or run another vendor-selection exercise. Selection is accepted; production cutover still requires evidence.

Exit: native/web/server accepted schedule results agree, progress cannot post twice, cash-flow uses the correct rate source and large-graph edits remain responsive. The [vendor registry](../../vendor/TRUEPPM.md) records upstream gaps and release qualification; roadmap promises do not count as implemented features.

---

### Work-Package to Task Mapping (Protocol R9 Refinement Record)

| Original Work-Package | Refined Task | Title | Primary Focus |
|---|---|---|---|
| **M09-W01** | **M09-T01** | TruePPM pinned engine spike, contract & baseline fixtures | Python package execution, calendar/holiday mapping, CPM comparison vs M00 fixtures |
| **M09-W02** | **M09-T02** | Versioned calculation inputs, schema tracking & Contractor bridge | Stable entity IDs, date-only semantics, unit mapping, revision and schema versioning |
| **M09-W03** | **M09-T03** | Connect TruePPM to progress, cost, approval & financial services | Server recalculation, idempotent progress posting, BoQ rate vs RA cost, permission guards |
| **M09-W04** | **M09-T04** | Host full TruePPM workspace and focused scheduling views | Dual presentation surfaces, web/desktop hosts, cycle/conflict detection, local proposals |
| **M09-W05** | **M09-T05** | Immutable baselines, variance analysis & explained revisions | Baseline immutability, date/float slippage variance, structured revision explanation |
| **M09-W08** | **M09-T06** | Reproducible TruePPM release update and rollback pipeline | `scripts/update-trueppm.mjs`, lockfiles/hashes, 2-release upgrade & rollback qualification |
| **M09-W09** | **M09-T07** | Upstream capability tracking & legacy scheduler retirement | Capability matrix in `docs/vendor/TRUEPPM.md`, legacy CPM migration, deprecation path |
| **M09-W06** | **M09-T08** | Cross-platform parity, financial correctness & 10k/50k benchmarks | Multi-runtime parity, EVM/cash-flow accuracy, 10k task / 50k dependency benchmarks |
| **M09-W07** | **M09-T09** | 👤 GATE — TruePPM integration and M09 exit evidence | Exit evidence packet, owner review and approval under protocol R8 |

---

- [x] **M09-T01** — TruePPM pinned engine spike, baseline contract & construction fixtures (PR #100)
  - Depends on: M00-GATE, ADR-0017 · Output: prototype driver under `prototype/trueppm/`, MCP inventory, and prototype report `docs/reports/M09/trueppm-prototype-and-contract.md`.
  - Scope: execute the actual pinned `trueppm-scheduler` Python package against construction fixtures; evaluate the Python server runtime/subprocess bridge, provenance, calendars/holidays (Nepal standard Bikram Sambat / Saturday workweeks + Gregorian mapping), inclusive dates, milestones, dependency types (FS, SS, FF, SF), lag hours/days, constraints (SNET, SNLT, FNET, FNLT, MSO, MFO), actuals, retained logic vs progress override, total/free float, and leveling floors. Compare against existing TS CPM baseline. No simulated engine evidence; TruePPM is target calculation authority.
  - Acceptance:
    - Pinned release tag and immutable commit recorded in `docs/vendor/TRUEPPM.md`.
    - Scheduling matrix over M00 scheduling fixtures comparing TruePPM calculation against analytical expected CPM dates and TS baseline; divergences documented.
    - Calendar & holiday mapping verified for inclusive date boundaries and working-day arithmetic.
    - Python runtime execution budget verified ($\le 250\text{ ms}$ for 1,000 tasks).
    - TruePPM MCP tool inventory documented.

- [x] **M09-T02** — Versioned calculation inputs, schema tracking & Contractor data bridge (PR #101)
  - Depends on: M09-T01, M02-GATE, M03-GATE · Output: `@contractor/native-scheduling` core data bridge & schema versioning.
  - Scope: implement bidirectional data bridge mapping stable project, task, dependency, calendar, and rate IDs between Contractor tenant entities and TruePPM calculation inputs. Persist engine release, input schema version, and calculation revision alongside outputs. Preserve strict date-only semantics (ISO 8601 `YYYY-MM-DD` without ambient timezone drift) and explicit duration units (working days / hours). Minimal upstream state boundary with zero uncontrolled dual writes.
  - Acceptance:
    - Stable ID mapping preserves entity identity across calculation cycles.
    - Calculation records capture engine release, input schema version, data date, and calculation revision.
    - Date-only semantics verified across simulated client timezones (UTC+05:45 Nepal, UTC-08:00 PST, UTC+00:00 GMT); zero ambient timezone shifts.
    - Change feed integration and Flutter-parity DTO generation named and verified (Standing Constraint 3).

- [x] **M09-T03** — Connect TruePPM to existing progress, cost, approval & financial services (PR #102)
  - Depends on: M09-T02, M05-GATE, M06-GATE · Output: scheduling service adapter integrating Contractor progress, cost, and approval services.
  - Scope: server recalculation invokes pinned TruePPM through Contractor service contract; authorization, approvals, change feed, and idempotent progress posting remain Contractor-owned. Preserve contractual BoQ rate vs Running Account (RA) cost separation and exact financial arithmetic (exact-decimal serialization). All schedule updates route through authorized acceptance path; external writes cannot bypass financial guards or approved baseline rules.
  - Acceptance:
    - Idempotent progress posting: replayed daily log progress postings cannot double-count percent complete or actual quantities.
    - Strict financial separation: contractual BoQ billing rates and internal cost rates remain distinct; exact-decimal calculation without floating-point accumulation.
    - Authorization guards: schedule updates require project-level permission (`schedule.update`) and reject unauthenticated or tenant-mismatched requests.
    - Fiscal lock adherence: fiscal year lock blocks schedule baseline changes.

- [x] **M09-T04** — Host the full TruePPM workspace and focused scheduling views (PR #103)
  - Depends on: M09-T02, ADR-0016, ADR-0017 · Output: dual presentation host adapter (`TruePpmHostAdapter`) and presentation shells.
  - Scope: host the full upstream TruePPM workspace for comprehensive scheduling, alongside focused scheduling components (embedded Gantt timeline, task breakdown, critical path highlight, dependency inspector) for Contractor workflows (daily log progress tracking, subcontractor work orders). Web and desktop hosting surfaces, session mapping, disposal, and permissions. Offline edits handled as typed local proposals with visual preview labeling until server acceptance; surface dependency graph cycles and constraint conflicts.
  - Acceptance:
    - Dual presentation surfaces verified: Full Editor Mode vs Embedded Capability Mode vs Headless Mode.
    - Mode transitions preserve active schedule state, task selections, zoom/scroll positions, and filter settings.
    - Dependency cycles and impossible constraints detected and surfaced with fail-closed errors before calculation dispatch.
    - Local offline proposals clearly distinguished from server-accepted revisions; reconciliation rules proven.

- [ ] **M09-T05** — Immutable baselines, variance analysis & explained schedule revisions
  - Depends on: M09-T03, M09-T04 · Output: baseline snapshot engine, revision variance analyzer, and explanation model.
  - Scope: preserve Contractor baseline identities, provenance, and approval history across calculation cycles and upgrades. Compute deterministic date, duration, and float variances between active schedule and approved target baseline. Generate structured explanation of schedule shifts before applying revisions; accepted revisions freeze engine release and inputs.
  - Acceptance:
    - Approved baselines are immutable; attempts to overwrite an approved baseline throw an error.
    - Schedule revision variance engine computes exact slippage/acceleration (early start delta, finish delta, total float delta) for every activity.
    - Structured revision explanations categorize cause (progress actuals, dependency modification, calendar change, constraint change).
    - Historical baseline comparisons remain queryable across multiple revisions.

- [ ] **M09-T06** — Reproducible TruePPM release update and rollback pipeline
  - Depends on: M09-T01, M06-T12 · Output: `scripts/update-trueppm.mjs` command, vendor registry tracking, and two-release qualification test battery.
  - Scope: implement `scripts/update-trueppm.mjs <release>` with machine-readable immutable pins, resolved commits, artifact hashes, dependency locks, and Apache-2.0 license/NOTICE auditing in `docs/vendor/TRUEPPM.md`. Demonstrate two actual releases across full/embedded modes, historical schedule compatibility, and safe rollback.
  - Acceptance:
    - `scripts/update-trueppm.mjs` supports `<release>`, `--rollback <release>`, and `--check`.
    - Automated qualification battery evaluates schema migration, calculation consistency, baseline integrity, and performance.
    - Bidirectional upgrade and downgrade rollback proven between two actual releases without schedule corruption.
    - All carried licenses and notices audited under ADR-0014.

- [ ] **M09-T07** — Upstream capability delivery tracking & legacy scheduler migration/retirement
  - Depends on: M09-T01, M09-T06 · Output: capability delivery register in `docs/vendor/TRUEPPM.md`, legacy CPM migration adapter, and retirement plan.
  - Scope: maintain release-specific capability matrix in `docs/vendor/TRUEPPM.md` linking upstream releases to Contractor fixtures and workflows. Sequence features against verified capabilities rather than roadmap dates. Migrate historical schedule records to TruePPM schema; verify semantic differences; mark legacy TypeScript/Dart CPM implementations for clean retirement after cutover.
  - Acceptance:
    - Capability matrix records tested release, upstream issue, local fixture, workflow impact, disposition, and next verification date.
    - Unsupported operations (e.g. advanced resource leveling) fail visibly with explicit notifications, never silent miscalculation.
    - Migration adapter converts legacy TS CPM schedule graphs to TruePPM input format with verified equivalence on M00 fixtures.
    - Deprecation markers added to legacy CPM paths with documented cutover milestones.

- [ ] **M09-T08** — Cross-platform parity, financial correctness, 10k/50k performance & stress benchmarks
  - Depends on: M09-T03, M09-T04, M09-T07 · Output: cross-platform parity matrix, cash-flow verification suite, and 10k/50k performance benchmarks.
  - Scope: verify identical calculation results across native desktop, web browser, and server runtimes. Benchmark 10,000 tasks and 50,000 dependencies per Platform Plan v3 §7 on ratified hardware profiles ($<1,500\text{ ms}$ calculation budget, $<16.7\text{ ms}$ 60 Hz Gantt viewport panning). Validate cash-flow S-curves using correct contractual BoQ rate sources vs internal resource rates; ensure retries and concurrent updates cannot double-post progress.
  - Acceptance:
    - 10k task / 50k dependency calculation completes within ratified latency budget ($\le 1,500\text{ ms}$ on native/server).
    - Interactive Gantt viewport maintains $\le 16.7\text{ ms}$ p95 frame time on 10,000-task graphs via virtualized rendering.
    - Earned Value Management (EVM) metrics (BCWS, BCWP, ACWP, SPI, CPI) and monthly cash-flow distributions verified against analytical models.
    - Idempotent concurrency tests confirm zero double-posting under high load.

- [ ] **M09-T09** — 👤 GATE — TruePPM integration and M09 exit evidence
  - Depends on: M09-T01…T08 · Output: `[M09-GATE]` evidence packet (`docs/reports/M09/m09-exit-gate.md`) and owner decision.
  - Acceptance:
    - Aggregate real execution evidence, dual presentation mode verification, baseline immutability, 10k/50k benchmarks, and upgrade/rollback proof.
    - Exit sentence proven: native/web/server accepted schedule results agree, progress cannot post twice, cash-flow uses correct rate source, and large-graph edits remain responsive.
    - Owner approval recorded under Protocol R8 before merge.

---

## Refinement contract

This milestone is refined to task level under protocol R9 ahead of execution. All 9 work packages have been mapped to concrete tasks `M09-T01` through `M09-T09` with explicit dependencies, deliverable outputs, implementation scopes, and testable acceptance criteria, preserving the owner-selected TruePPM direction (ADR-0017).
