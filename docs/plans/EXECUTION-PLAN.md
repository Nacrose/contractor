# Master Execution Plan — Task Register

> This is the **single backlog** for the native/web platform program defined in [platform plan v3](native-web-platform-plan-v3.md). Every unit of work is a checkbox here or in a [milestone file](milestones/). Work is completed **only** through pull requests per the [AI-Agent Execution Protocol](../rules/AI-AGENT-EXECUTION-PROTOCOL.md) — the PR that implements a task ticks its checkbox in the same diff and appends the PR reference.

**How to read a task:**

```markdown
- [ ] **M00-T07** — Title of the task            ← the checkbox a PR flips
  - Depends on: M00-T06                          ← do not start until ticked
  - Acceptance:                                  ← evidenced in the PR body
    - concrete, testable criterion 1
    - concrete, testable criterion 2
```

**How progress is counted:** the table below. `Done/Total` must always match the milestone files (R13).

---

## Status snapshot

*Register created 2026-10-08 by the bootstrap PR. All counts verified against milestone files at creation.*

| Milestone | File | State | Done/Total | Gate |
|---|---|---|---|---|
| M00 Inventory, fixtures & baseline | [M00-inventory-fixtures-baseline.md](milestones/M00-inventory-fixtures-baseline.md) | **Complete** | 21/21 | M00-T21 `👤 GATE` — passed (PR #16) |
| M01 Platform feasibility & performance gate | [M01-platform-feasibility-gate.md](milestones/M01-platform-feasibility-gate.md) | **Complete** | 17/17 | M01-T17 `👤 GATE` — passed (PR #11) |
| M02 Central contracts & shared UX | [M02-contracts-shared-ux.md](milestones/M02-contracts-shared-ux.md) | **Complete** | 8/8 | M02-T08 `👤 GATE` — passed (PR #31), owner approved 2026-10-09 |
| M03 Native identity, repositories & sync | [M03-identity-storage-sync.md](milestones/M03-identity-storage-sync.md) | **Complete** — T01–T09 (PRs #32–#40), T10 gate (PR #42) | 10/10 | M03-T10 `👤 GATE` — passed (PR #42), owner approved 2026-10-09 |
| M04 First vertical workflow (daily log + photo) | [M04-vertical-daily-log-photo.md](milestones/M04-vertical-daily-log-photo.md) | In progress — T01 trace (PR #44), T02 mount (PR #45); T03 awaits M03-T01 adapter conformance and live product acceptance ([path correction](../reports/M04/product-path-correction.md)) | 2/9 | M04-T09 `👤 GATE` — not reached |
| M05 Field workflow expansion | [M05-field-workflow-expansion.md](milestones/M05-field-workflow-expansion.md) | **Complete** — T01–T09 (PRs #56–#64), T10 gate (PR #65) | 10/10 | M05-T10 `👤 GATE` — submitted for owner review (PR #65) |
| M06 Worksheet/BoQ engine | [M06-worksheet-boq-engine.md](milestones/M06-worksheet-boq-engine.md) | In progress — T01 harness (PR #66), T02 workbook model (PR #67), T03 dependency graph (PR #68), T04 calculation adoption (PR #69), T05 UI host adapter (PR #70), T06 operations & compaction (PR #71), T07 IPC/BoQ bridge (PR #72), T08 XLSX compatibility (PR #73), T09 concurrency & structure sync (PR #74), T10 evaluator retirement (PR #77), T12 update pipeline & qualification (PR #75), T13 consumer inventory & pilot migration (PR #76); dual modes + updates registered | 12/13 | M06-T11 `👤 GATE` — not reached |
| M07 CAD kernel, topology, rendering & plot | [M07-cad-kernel-plot.md](milestones/M07-cad-kernel-plot.md) | Task level — dual CAD modes + update qualification registered | 0/11 | M07-T10 `👤 GATE` — not reached |
| M08 PDF & BoQ-linked takeoff | [M08-pdf-takeoff.md](milestones/M08-pdf-takeoff.md) | Blocked by M06/M07 contracts; dual PDF modes + update qualification registered | 0/9 | M08-T08 `👤 GATE` — not reached |
| M09 TruePPM scheduling, progress & cash-flow | [M09-scheduling-engine.md](milestones/M09-scheduling-engine.md) | TruePPM selected; integration blocked by M03/M05/M06 (WP level) | 0/9 | M09-W07 `👤 GATE` — not reached |
| M10 Full parity & web migration | [M10-parity-web-migration.md](milestones/M10-parity-web-migration.md) | Migration blocked by M04–M09; document/deck evidence from M12; mapping + accounting + connected journeys registered (WP level) | 0/9 | M10-W06 `👤 GATE` — not reached |
| M11 Recovery, packaging & staged release | [M11-recovery-packaging-release.md](milestones/M11-recovery-packaging-release.md) | Blocked by M03–M10 (WP level) | 0/7 | M11-T07 `👤 GATE` — not reached |
| M12 Client documents & presentations | [M12-documents-presentations.md](milestones/M12-documents-presentations.md) | Registered 2026-10-09; dual editor/embedded modes + updates amended 2026-10-12 (WP level) | 0/9 | M12-W08 `👤 GATE` — not reached |
| **Program total** | | | **80/142** | |

## Dependency graph

```text
M00 ──► M01 ──► M02 ──► M03 ──► M04 ──► M05 ─────┐
                 │       │                       │
                 │       ├──► M06 ──► M08 ──► M10 ─┼──► M11
                 │       ├──► M07 ──────────► M10 │
                 │       ├──► M12 ◄─ M06/M08 (BoQ data + PDF export)
                 │              M09 ◄─ M05/M06 ─► M10
                 │              M12 ── document/deck evidence ──► M10
                 └── backup/packaging groundwork starts after M01 (M11)
```

Exact dependencies per task are declared inside each milestone file; the v3 plan §10 ledger remains the authority on milestone-level blocking.

## Standing constraints (from v3 plan)

1. **Capacity gate applies from M01** — bounded M00 discovery is exempt (v3 §2 instruction 13, §6.0).
2. **Product-scope fallbacks are owner decisions** — the M01 fallback matrix produces evidence + written proposals; the §1 parity gate holds until the owner accepts a scope change in an ADR (v3 §6 M01 matrix; protocol R8).
3. **Change-feed standing constraint** — every new server-side domain feature accepted from M03 onward names, in its task packet, its change-feed integration and Flutter-parity path (v3 §10).
4. **One owner per shared contract** — schema, sync protocol, design tokens, shared bindings (v3 §9).
5. **Dashboard work: Defer / do not start** for the duration (v3 §6.0 maintenance posture).
6. **Start with M00 only**, then M01. No screen rewrites, no speculative dependency installs (v3 §10).
7. **ArtCraft full editors, embedded capabilities and tested updates** — GridCraft/CADCraft/PdfCraft/WordCraft/DeckCraft reuse upstream full interfaces with ribbons/tools plus focused reusable components inside workflows. All adoption remains evidence-gated; no upstream forks/source edits. Contractor adapters own domain/lifecycle bindings; M06-T12 owns machine-readable pins and the shared release-update command, later milestones qualify their apps. See [ADR-0016](../adr/0016-artcraft-suite-in-place-embedding-and-table-modernization.md), [master integration plan](artcraft-suite-master-integration-plan.md), ADR-0015 and vendor registry; licenses per ADR-0014.
8. **TruePPM selected for scheduling** — M09 integrates the OSS app/engine, full workspace and supported focused views through external adapters. Contractor retains domain/financial/approval authority. M09-W08 owns tested release updates; M09-W09 tracks upstream delivery and migration rather than a new vendor-selection exercise or custom CPM rewrite. See [ADR-0017](../adr/0017-trueppm-scheduling-integration.md) and [vendor registry](../vendor/TRUEPPM.md).
9. **Upstream capabilities, connected construction product** — preserve original workflows and domain rules while reusing generic upstream engines/components. Inventory every original tool before replacement, maintain external adapters, one domain authority and tested releases. `flutter_accounting` is the intended library for M10-W08 qualification; its source/API/license remain unverified. See [ADR-0018](../adr/0018-upstream-capabilities-and-construction-integration.md) and [integration strategy](open-source-platform-integration-strategy.md).

## Platform integration amendment — 2026-10-12

- **What changed:** program-wide upstream reuse strategy added; unfinished specialist-engine tasks favor integration over reimplementation. M10-W07 maps original custom tools and retained rules; W08 qualifies/integrates accounting; W09 verifies connected workflows and upgrades. Existing specialist owners deliver their bindings; W07 mapping may prepare them before M10 rollout. M10 gate includes the new WPs and required M12 evidence for document/deck journeys.
- **Why:** owner requested the original app's tight integration while community projects provide most generic capabilities and Contractor maintains the construction integration.
- **Evidence:** owner chat directive; existing M00 inventory and ADR-0016/0017 integration boundaries. Accounting details are owner-supplied and await independent source/API/license verification; no accounting adoption fixture is claimed.
- **Scope:** planning/ADR documentation only; three pending WPs added (142 total, 70 completed unchanged). No package installed, production cutover, completed-task reset or guaranteed upstream delivery.

## TruePPM planning amendment — 2026-10-12

- **What changed:** M09-W01–W06 now integrate TruePPM and preserve construction/domain contracts. New W08 registers pinned-release updates and restore; W09 registers capability delivery and legacy migration. W07 depends on both. ADR-0017 supersedes ADR-0013's target CPM implementation; the v3 plan and registries are synchronized.
- **Why:** owner directed use of TruePPM, with releases adopted as Contractor develops.
- **Evidence:** owner chat directive recorded in ADR-0017; linked upstream scheduler, license and roadmap documentation in the TruePPM registry. No actual engine execution, UI hosting or effective pin is claimed.
- **Scope:** planning/ADR/vendor documentation only. Two pending WPs added; total 139, completed count unchanged at 70. Production cutover remains subject to M09 evidence and existing gates.

## ArtCraft planning amendment — 2026-10-12

- **What changed:** full editing retains upstream chrome; embedded workflows reuse focused components across all five apps. M06-T05 replaces the custom Flutter grid mandate; new M06-T12/T13, M07-T11, M08-T09 and M12-W09 register suite updates, applicable calculation-table migration and app hosting/qualification. Existing task/gate IDs and historical completion checkboxes remain; gates depend on the added work.
- **Why:** owner clarified that ribbon-free behavior applies to compact workflow capabilities, not full editors, and requested easy upstream release updates for the whole suite.
- **Evidence:** owner chat clarification and inspection of the committed M06-T01 driver, which uses local simulators. Actual GridCraft/production-engine execution is required in T04; the earlier prototype report is marked superseded for adoption. No new implementation or gate is claimed complete.
- **Scope:** planning/report/ADR amendment only; proposed packages, pins and update command require implementation in the registered tasks. Rollup adds five pending items (137 total); 69 historical completions remain.

## Bootstrap record (founding PR)

The bootstrap PR (#1) on branch `bootstrap/agent-governance` completed the governance layer and the v3 §1.1 repository verification, ticking:

- `M00-T01` — contractor repository verified; identities recorded; stray `docs/0001–0009` duplicates removed (findings in [ADR-0010](../adr/0010-progressive-extension-over-greenfield-rewrite.md))
- `M00-T02` — AI-Agent Execution Protocol adopted ([docs/rules/](../rules/AI-AGENT-EXECUTION-PROTOCOL.md))
- `M00-T03` — platform plan v3 imported as normative reference ([docs/plans/native-web-platform-plan-v3.md](native-web-platform-plan-v3.md))
- `M00-T04` — ADR-0010 recorded (pivot: evolve in place over greenfield rewrite)
- `M00-T05` — README charter amended to reference this register (supersession per v3 §1.1 completed)
- `M00-T06` — this master register established (this file + 12 milestone files)

Multi-task single-PR is permitted **only** for the bootstrap (protocol: Bootstrap clause). All later ticks are one-task-one-PR.

## Gate sequence

`M00-GATE` → `M01-GATE` → `M02-GATE` → `M03-GATE` → `M04-GATE` → `M05-GATE` → (`M06`, `M07` gates) → `M08-GATE` → `M09-GATE` → `M10-GATE` → `M11-GATE` (owner-approved release).

Every gate PR follows protocol R8: agents assemble evidence, the owner approves.
