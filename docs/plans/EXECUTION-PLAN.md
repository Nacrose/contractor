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
| M01 Platform feasibility & performance gate | [M01-platform-feasibility-gate.md](milestones/M01-platform-feasibility-gate.md) | **In progress** | 16/17 | M01-T17 `👤 GATE` — not reached |
| M02 Central contracts & shared UX | [M02-contracts-shared-ux.md](milestones/M02-contracts-shared-ux.md) | Blocked by M01 owner gate | 0/8 | M02-T08 `👤 GATE` — not reached |
| M03 Native identity, repositories & sync | [M03-identity-storage-sync.md](milestones/M03-identity-storage-sync.md) | Blocked by M02 (WP level) | 0/10 | M03-T10 `👤 GATE` — not reached |
| M04 First vertical workflow (daily log + photo) | [M04-vertical-daily-log-photo.md](milestones/M04-vertical-daily-log-photo.md) | Blocked by M03 (WP level) | 0/7 | M04-T07 `👤 GATE` — not reached |
| M05 Field workflow expansion | [M05-field-workflow-expansion.md](milestones/M05-field-workflow-expansion.md) | Blocked by M04 (WP level) | 0/9 | M05-T09 `👤 GATE` — not reached |
| M06 Worksheet/BoQ engine | [M06-worksheet-boq-engine.md](milestones/M06-worksheet-boq-engine.md) | Blocked by M02/M03 (WP level) | 0/10 | M06-T10 `👤 GATE` — not reached |
| M07 CAD kernel, topology, rendering & plot | [M07-cad-kernel-plot.md](milestones/M07-cad-kernel-plot.md) | Blocked by M02/M03 (WP level) | 0/9 | M07-T09 `👤 GATE` — not reached |
| M08 PDF & BoQ-linked takeoff | [M08-pdf-takeoff.md](milestones/M08-pdf-takeoff.md) | Blocked by M06/M07 contracts (WP level) | 0/7 | M08-T07 `👤 GATE` — not reached |
| M09 Scheduling, progress & cash-flow | [M09-scheduling-engine.md](milestones/M09-scheduling-engine.md) | Blocked by M03/M05/M06 (WP level) | 0/7 | M09-T07 `👤 GATE` — not reached |
| M10 Full parity & web migration | [M10-parity-web-migration.md](milestones/M10-parity-web-migration.md) | Blocked by M04–M09 (WP level) | 0/6 | M10-T06 `👤 GATE` — not reached |
| M11 Recovery, packaging & staged release | [M11-recovery-packaging-release.md](milestones/M11-recovery-packaging-release.md) | Blocked by M03–M10 (WP level) | 0/7 | M11-T07 `👤 GATE` — not reached |
| **Program total** | | | **37/118** | |

## Dependency graph

```text
M00 ──► M01 ──► M02 ──► M03 ──► M04 ──► M05 ─────┐
                 │       │                       │
                 │       ├──► M06 ──► M08 ──► M10 ─┼──► M11
                 │       └──► M07 ──────────► M10 │
                 │              M09 ◄─ M05/M06 ─► M10
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
