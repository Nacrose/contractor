# M00 — Inventory, behavior fixtures and baseline

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M00, §3 reuse map, §6.0 capacity envelope, §1.1 verification. Dependencies: none. Timebox note: the change-feed spike is timeboxed 1–2 weeks (v3 §6 M00); the rest is bounded discovery and is **exempt from the capacity gate** (v3 §2 instruction 13).

Exit (v3, verbatim intent): reviewed engine/consumer inventory, behavior matrix, reproducible baseline, ratified change-feed mechanism and capacity envelope, and no unsupported claim that the current app already meets the new platform requirements.

---

- [x] **M00-T01** — Verify the `contractor` repository and record repository identities (PR #1)
  - Depends on: none · Owner role: repository/domain architecture agent
  - Scope (v3 §1.1): read charter text, commits, working tree; confirm or rewrite the charter; record repository identities for the §4 cross-repository execution contract.
  - Output: findings recorded in ADR-0010; identities in this repo's records.
  - Acceptance:
    - Commit history, working tree, docs tree, and CI state inspected and recorded (result: 1 scaffold commit `7773842`, clean tree, no CI, no application code).
    - Repository identities recorded: `Construction_Manager` (server, PostgreSQL access, React app, CI/backup) and `contractor` (Flutter app, packages, kernels, fixtures, benchmarks).
    - Deviations flagged to owner — **found: repo visibility is PUBLIC at verification time; flagged for owner decision (recommend private until deliberate open).**
    - Scaffold cruft (duplicate ADR copies at `docs/0001–0009.md`) removed; canonical set remains `docs/adr/0001–0009`.

- [x] **M00-T02** — Adopt the AI-Agent Execution Protocol (PR #1)
  - Depends on: M00-T01 · Owner role: process/architecture agent
  - Output: `docs/rules/AI-AGENT-EXECUTION-PROTOCOL.md`.
  - Acceptance:
    - Protocol covers: plan-as-only-backlog, one-task-one-PR with in-PR tick, naming, PR body contract, Definition of Done, plan amendments, dependencies, owner-only gates, refinement-before-gate, evidence rule, repo-as-memory, secrets rule, rollup upkeep.
    - Protocol explicitly subordinates to v3 §2 instructions and §9 rejection criteria.

- [x] **M00-T03** — Import platform plan v3 as the normative program reference (PR #1)
  - Depends on: M00-T02 · Output: `docs/plans/native-web-platform-plan-v3.md` (verbatim copy of the reviewed plan).
  - Acceptance:
    - File content identical to the reviewed v3 deliverable (572-line plan, revisions v2/v3 markers intact).
    - Referenced by the protocol and this register as the authority for scope, contracts, and exit gates.

- [x] **M00-T04** — Record ADR-0010: evolve in place over greenfield rewrite (PR #1)
  - Depends on: M00-T01, M00-T03 · Output: `docs/adr/0010-progressive-extension-over-greenfield-rewrite.md`.
  - Acceptance:
    - Decision, charter supersession, carry-over rules, verification findings, and consequences recorded per ADR conventions.
    - Status Accepted with owner direction cited; supersedes conflicting charter commitments only.

- [x] **M00-T05** — Amend the `contractor` README charter to reference this program (PR #1)
  - Depends on: M00-T04 · Output: updated `README.md`.
  - Acceptance:
    - Charter marked superseded-in-part by ADR-0010 with a pointer to the v3 plan and this register.
    - "Suggested first milestones" replaced by the register pointer; non-negotiables retained and mapped to where they now bind.

- [x] **M00-T06** — Establish the master execution register and milestone files (PR #1)
  - Depends on: M00-T02, M00-T03 · Output: `docs/plans/EXECUTION-PLAN.md` + 12 milestone files.
  - Acceptance:
    - M00/M01 decomposed to task level with acceptance criteria; M02–M11 at WP level with refinement-before-gate contracts (protocol R9).
    - Rollup counts match the milestone files (verified at creation: 6/118).

- [x] **M00-T07** — Inventory: tRPC routers and every server mutation (PR #2)
  - Depends on: M00-T06 · Owner role: repository/domain architecture agent
  - Output: `docs/reports/M00/inventory-routers.md` (+ companion `.json`/`.csv` table if useful)
  - Scope: every file under `Construction_Manager/src/server/routers/` (~60 routers) in the upstream repo.
  - Acceptance:
    - Every router file listed with procedure count and mutation/query classification.
    - Each mutation mapped to the central engine/service it mutates through (or explicitly flagged "direct Prisma path").
    - Authorization method recorded per router: `createDomainRouter` pipeline vs hand-rolled assert call sites (counts per router).
    - Every writer relevant to the future change feed flagged (feeds M00-T15–T18).
    - Findings reconciled against the v3 §3 reuse-map rows (policy/lifecycle/finance, retry/events) — agreements and mismatches listed.

- [x] **M00-T08** — Inventory: background jobs, imports, admin tools and scripts (non-router writers) (PR #3)
  - Depends on: M00-T06 · Output: `docs/reports/M00/inventory-jobs-imports.md`
  - Scope: cron/background jobs, importers (XER/MSP/Excel), admin tooling, `scripts/`, seeds, reconciliation services — everything that writes domain data outside tRPC.
  - Acceptance:
    - Each writer named with: trigger (schedule/event/manual), entry file, domain effects, whether it bypasses domain services.
    - Change-feed writer-coverage risk (v3 §3) quantified: % of writes flowing through services vs direct writes.
    - This inventory feeds the M00 spike writer-coverage analysis (cross-referenced).

- [x] **M00-T09** — Inventory: client local stores, offline surfaces and document formats (PR #4)
  - Depends on: M00-T06 · Output: `docs/reports/M00/inventory-local-stores.md`
  - Scope: `field-db.ts` (IndexedDB), `field-outbox.ts`, `field-drafts.ts`, `field-photo.ts`, service worker, drafts/queues, local settings; document formats produced/consumed (worksheet workbook, CAD DXF/DWG, PDF, images).
  - Acceptance:
    - Every local store: location, schema versioning, eviction semantics, durability behavior (v3 §3 risks on best-effort storage paths recorded).
    - Existing offline workflows enumerated with their current submission/replay semantics.
    - Document formats listed with producing/consuming engine and compatibility status.

- [x] **M00-T10** — Feature matrix as implemented (implemented / partial / missing / unverified) (PR #5)
  - Depends on: M00-T07, M00-T08, M00-T09 · Output: `docs/reports/M00/feature-matrix.md`
  - Scope: all user-visible workflows (field ops, billing/IPC, procurement, workforce/HR, accounting, documents/CAD, worksheets/BoQ, scheduling, JV, admin).
  - Acceptance:
    - Each workflow row carries: status class (implemented/partial/missing/unverified), central engine, current tests, target platforms, README-vs-reality discrepancy notes (v3 §3 risk: README describes online-first while offline code exists — resolve here).
    - Existing-product parity kept separate from requested additions and from full third-party compatibility claims (v3 §6 M00).

- [ ] **M00-T11** — Capture and sanitize behavior fixtures (CAD, worksheet, PDF, CPM)
  - Depends on: M00-T06 · Output: `fixtures/platform-parity/` index + `docs/reports/M00/fixture-register.md`
  - Scope: representative inputs incl. adverse/degenerate cases: DXF/DWG generations covered by `src/lib/dwg/`; workbook files at 50k/100k rows; 100+ page / 200 MB PDF plus dense single pages and scanned blueprints; CPM graphs at 10k tasks / 50k dependencies with Nepal calendar and constraint variants.
  - Acceptance:
    - Every fixture: hash, size, unit/coordinate conventions, source, licensing recorded; sanitized (no tenant data — v3 protocol R12).
    - Degenerate/adverse inputs included per engine (near-coincident geometry, cyclic dependencies, volatile functions, mixed page sizes).
    - Fixture manifest versioned; generation seeds recorded where synthetic.

- [ ] **M00-T12** — Establish reference outputs and the honest test baseline
  - Depends on: M00-T11 · Output: `docs/reports/M00/baseline-tests.md`
  - Scope: run the preserved command set — `npm run ci:verify`, `npm run test:integration`, `npx vitest run src/lib/worksheet`, scoped CAD/document/CPM suites — and record results as-is.
  - Acceptance:
    - Command, environment, commit, exit code and failures recorded for each suite; known failures listed explicitly without weakening tests (v3 §6 M00).
    - Reference outputs derived from existing tests PLUS independently reviewed domain expectations; known bugs are recorded as bugs, not preserved as expected behavior.
    - Skipped/unavailable checks recorded as skipped (never passed — protocol R10).

- [ ] **M00-T13** — Performance baseline profile on recorded hardware
  - Depends on: M00-T11 · Output: `docs/reports/M00/baseline-perf.md`
  - Scope: current worksheet recalculation (fresh evaluator/cache scan behavior, real formula graphs), CAD viewport render/selection, PDF decode, CPM calculation — measured, not estimated.
  - Acceptance:
    - Hardware, build mode, OS, dataset (fixture refs) recorded per measurement (v3 §6 M00).
    - Baseline failures recorded without silently weakening tests; gaps vs §7 budgets listed as input to M00-T19 ratification.

- [ ] **M00-T14** — Draft the platform support matrix (OS/browser/hardware/disk/retention)
  - Depends on: M00-T10 · Output: `docs/reports/M00/platform-support-matrix.md`
  - Scope: target OS/browser versions, Intel macOS coverage, declared minimum hardware, disk budgets, offline retention expectations — the release-commitment prerequisites (v3 §6 M00).
  - Acceptance:
    - Matrix covers all six §1 surfaces (macOS Intel+AS, Windows, Linux, Android, iOS, browser).
    - Explicit "unsupported/best-effort" rows where coverage cannot be committed; no silent omissions.
    - Draft budgets for per-device memory/startup/download recorded as proposals for M01 to finalize (v3 §7).

- [ ] **M00-T15** — Change-feed spike: build the evaluation harness
  - Depends on: M00-T07, M00-T08 · Output: `spike/change-feed/` harness + `docs/reports/M00/spike-harness.md`
  - Scope: disposable PostgreSQL (Neon-compatible) test rig with: late-commit scenario generator, crash/restart injection (kill -9 + restart), replication-slot retention monitoring, consumer-checkpoint store, duplicate-delivery injector.
  - Acceptance:
    - Harness reproduces: transaction committing after a later-allocated event id (commit-order hazard), crash replay re-delivering batches, concurrent writers.
    - Harness runs headless with an exit code; scenario list documented. Spike is timeboxed — harness kept minimal (v3 §6 M00 timebox 1–2 weeks).

- [ ] **M00-T16** — Change-feed spike arm A: writer instrumentation prototype
  - Depends on: M00-T15 · Output: prototype branch + `docs/reports/M00/spike-arm-writers.md`
  - Scope: explicit writer instrumentation across a representative router/jobs subset (not all ~60 routers) using the existing outbox/idempotency patterns.
  - Acceptance:
    - Measured: instrumentation cost per writer, coverage gaps when any writer is missed, commit-order behavior under the harness, redaction/visibility filter feasibility.
    - Honest coverage extrapolation to full writer set, grounded in M00-T07/T08 percentages.

- [ ] **M00-T17** — Change-feed spike arm B: WAL logical decoding prototype
  - Depends on: M00-T15 · Output: prototype + `docs/reports/M00/spike-arm-wal.md`
  - Scope: logical decoding (pgoutput or equivalent) end-to-end in the harness: commit-ordered stream, filtered visibility, Neon compatibility, slot retention risk.
  - Acceptance:
    - Demonstrated on the harness: commit-order correctness under late commits; **durable consumer checkpoints surviving crash; idempotent re-application of re-delivered batches** (v3 §6 M00 requirement — checkpoint durability is part of the decision, not a downstream detail).
    - Neon slot-retention/failure story recorded; monitoring approach named.

- [ ] **M00-T18** — Change-feed mechanism decision record
  - Depends on: M00-T16, M00-T17 · Output: decision record `docs/adr/0011-change-feed-mechanism.md` (or DR file per repo convention — number assigned at creation)
  - Scope: select mechanism (writer instrumentation / WAL logical decoding / hybrid) per v3 §5.3 + M00 spike.
  - Acceptance:
    - Decision names: mechanism, commit-order guarantee, visibility/redaction design, **durable checkpoint design + duplicate-delivery recovery**, failure/rollback story (incl. replication-slot retention on Neon), operational monitoring.
    - If neither mechanism survives: explicit finding that M03's sync design must be revisited before any protocol freeze (v3 §6 M00) — escalated to owner, M03 marked at-risk in the rollup.
    - Ratification deadline respected: decision consumed by M03 start.

- [ ] **M00-T19** — Ratify the capacity envelope, maintenance posture and performance budgets
  - Depends on: M00-T07, M00-T10, M00-T13 · Output: `docs/reports/M00/capacity-ratification.md` (+ plan amendment if bands change)
  - Scope: confirm or correct v3 §6.0 effort bands against the completed inventory; freeze the maintenance-posture table; ratify §7 initial budgets against declared hardware.
  - Acceptance:
    - Effort bands confirmed or corrected with inventory-based reasoning (bands stay provisional until M04 re-baseline — v3 §6.0).
    - Maintenance posture frozen: what is Maintained / Frozen / Continued / Deferred, named explicitly (v3 §6.0 table).
    - §7 budgets ratified or amendment-proposed; no budget silently lowered (protocol R6 if changed).

- [ ] **M00-T20** — Protocol lint: enforce the register mechanically
  - Depends on: M00-T06 · Output: `scripts/lint-protocol.mjs` + `.github/workflows/lint-protocol.yml` in this repo
  - Scope: a script that validates: every task ID referenced in PR titles exists; every ticked task carries a `(PR #N)` reference; rollup counts match milestone files; checkbox syntax is well-formed.
  - Acceptance:
    - Lint passes on the current register (exit 0) and fails on a deliberately corrupted fixture copy (negative test).
    - CI workflow runs the lint on PRs touching `docs/plans/**`; failures block merge guidance recorded in the protocol (link added by a `[PROTOCOL-AMEND]` if needed).

- [ ] **M00-T21** — 👤 GATE — M00 exit evidence and owner sign-off
  - Depends on: M00-T07…T20 (all) · Output: gate PR `[M00-GATE]` aggregating: inventory set, behavior matrix, fixture register, baseline reports, spike decision record, capacity ratification.
  - Acceptance:
    - Every M00 task ticked with evidence; rollup shows 21/21 before the gate PR (except the gate task itself).
    - Gate report states the exit claim honestly: no unsupported claim that the current app already meets platform requirements (v3 M00 exit).
    - **Owner approval recorded** (protocol R8) before merge; M01 refinement (`M01` already task-level — verify acceptance criteria still true against M00 findings, amend if not) confirmed in the gate PR.
