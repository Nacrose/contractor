# M09 — TruePPM scheduling, site progress and cash-flow integration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M09, §3 CPM row; owner selection in [ADR-0017](../../adr/0017-trueppm-scheduling-integration.md). Dependencies: M03, M05, M06; contracts from M01/M02. Registered at **WP level** — refine before the M05/M06 gates open.

**Selected upstream:** TruePPM OSS application and scheduling engine. Develop Contractor's integration alongside upstream releases, using unmodified pinned dependencies and external adapters. Do not continue a custom CPM rewrite or run another vendor-selection exercise. Selection is accepted; production cutover still requires evidence.

Exit: native/web/server accepted schedule results agree, progress cannot post twice, cash-flow uses the correct rate source and large-graph edits remain responsive. The [vendor registry](../../vendor/TRUEPPM.md) records upstream gaps and release qualification; roadmap promises do not count as implemented features.

---

- [ ] **M09-W01** — Integrate actual pinned TruePPM and establish the scheduling contract
  - Acceptance sketch: execute the real `trueppm-scheduler` package against construction fixtures; record the Python server binding, runtime/deployment dependencies and provenance. Map calendars/holidays (Nepal), inclusive dates, milestones, FS/SS/FF/SF, lag hours, constraints, actuals, retained logic, float and leveling floors. Record differences and unsupported cases in W09; no simulated engine evidence. TruePPM is the target calculation authority; current TypeScript behavior is a migration reference until cutover. Any upstream preview has a named owner, conformance fixtures and reconciliation policy; do not create a new Contractor CPM port.

- [ ] **M09-W02** — Versioned TruePPM calculation inputs and Contractor data bridge
  - Acceptance sketch: map stable project/task/dependency/calendar IDs and version calendars, data date, rates and progress. Persist engine release, input schema and calculation revision with results. No ambient device timezone/holiday cache changes authoritative results; preserve date-only semantics and explicitly translate units. Contractor owns tenant-scoped domain records; choose the minimal upstream state/sync boundary with no uncontrolled dual writes.

- [ ] **M09-W03** — Connect TruePPM to existing progress/cost/approval services
  - Acceptance sketch: server recalculation invokes pinned TruePPM through the Contractor contract; authorization, approvals, change feed and idempotent progress posting remain Contractor-owned. Preserve contractual BoQ rate versus RA cost separation and exact financial arithmetic. All upstream UI/API edits use the same authorized acceptance path; external writes cannot bypass financial guards or approved-baseline rules. No proprietary enterprise dependency.

- [ ] **M09-W04** — Host the full TruePPM workspace and focused scheduling views
  - Acceptance sketch: preserve the upstream interface for full editing; reuse focused Gantt/task/dependency views through supported boundaries. Prove actual web and installed-app hosting, session/project mapping, disposal and permissions at the chosen release; a headless engine is not UI embedding evidence. Resolve missing hooks through upstream work or an explicit hosted-app boundary, with limitations recorded. Offline edits are typed local proposals until server acceptance; approximate drag previews are labeled and reconciled. Surface graph cycles/conflicts. Do not build a parallel custom Gantt/CPM stack.

- [ ] **M09-W05** — Immutable baselines and explained schedule revisions
  - Acceptance sketch: preserve Contractor baseline/version identities, provenance and approval history across integration and upgrades. Show date/float changes before applying approved updates; accepted revisions freeze engine release and inputs. W03 remains the approval authority.

- [ ] **M09-W06** — Cross-platform parity, financial correctness and performance evidence
  - Acceptance sketch: actual TruePPM integration covers 10k tasks / 50k dependencies per §7; measure calculation and host interaction separately on ratified profiles. Native/web/server accepted results agree, retries cannot double-post progress and cash-flow uses the correct rate source. Missing targets stay visible in W09; do not silently lower budgets or mark unsupported semantics passed.

- [ ] **M09-W07** — 👤 GATE — TruePPM integration and M09 exit evidence
  - Depends on: M09-W01, M09-W02, M09-W03, M09-W04, M09-W05, M09-W06, M09-W08, M09-W09
  - Acceptance sketch: aggregate real execution, both UI modes, migration and upgrade/restore evidence. Required capabilities are verified or covered by an explicit owner-approved scope amendment. Confirm M10 migration inputs and legacy-engine retirement; owner approval per protocol R8. Upstream selection is already decided.

- [ ] **M09-W08** — Reproducible TruePPM release updates and rollback
  - Acceptance sketch: implement a documented command, proposed as `scripts/update-trueppm <release>`, with machine-readable immutable app/engine pins, resolved revisions, artifact hashes, dependency locks and license/NOTICE records mirrored in the registry. Reuse M06-T12 tooling where practical without making TruePPM part of ArtCraft. Review releases during active integration and before M09/M10 gates; this is a development workflow, not an installed recurring automation. Demonstrate two actual releases, both UI modes, old schedules, API/schema compatibility, fixtures and upgrade/restore. Retain prior artifacts and database/operation checkpoints; pin rollback alone is insufficient after incompatible writes. No unreviewed automatic production updates.

- [ ] **M09-W09** — Track upstream capability delivery and migrate the legacy scheduler
  - Acceptance sketch: maintain a release-specific matrix linked to upstream issues/releases, our fixture and affected workflow. Recheck gaps as releases arrive; sequence dependent work against verified capabilities rather than predicted dates. Record what waits for upstream, what belongs in an external domain adapter, and upstream contributions needed; no source fork or substitute calculation engine. Unsupported operations fail visibly. Compare existing schedules against TruePPM, explain changed semantics, then migrate/version records and retire TypeScript/Dart CPM paths after acceptance. Existing production behavior stays available until cutover; blockers require upstream resolution or a separate owner scope amendment, not automatic abandonment of TruePPM.

## Refinement contract

Before the M05 and M06 gates merge, refine to `M09-Tnn` tasks with scope, outputs and testable acceptance criteria (protocol R9). Preserve the owner-selected TruePPM direction and register additional implementation work before starting it.
