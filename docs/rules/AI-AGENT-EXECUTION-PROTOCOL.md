# AI-Agent Execution Protocol

> **This file is a binding rule.** It governs every change to this repository, by every contributor, human or AI agent. Its purpose: the platform plan is executed **traceably** — every unit of work is a registered task, every task completes through a pull request, and the pull request itself ticks the task's checkbox in the plan. Progress lives in the repository, never in an agent's memory.

- Status: **Accepted** — 2026-10-08, owner-directed
- Companion documents:
  - [Master Execution Plan (task register)](../plans/EXECUTION-PLAN.md)
  - [Native/web platform plan v3](../plans/native-web-platform-plan-v3.md) — the *what*; this protocol is the *how*
  - [ADR-0010](../adr/0010-progressive-extension-over-greenfield-rewrite.md) — the pivot decision this protocol operationalizes
- Scope: this repository (`contractor`). Changes inside `Construction_Manager` additionally follow that repository's `AGENTS.md` and the §4 cross-repository execution contract of the v3 plan.

---

## 0. The core loop

Every agent session runs the same loop:

1. **Read** — this protocol, the [execution plan rollup](../plans/EXECUTION-PLAN.md), the milestone file for the chosen task, and the bodies of the most recent merged PRs if continuing a thread of work.
2. **Pick** — the lowest-numbered task whose dependencies are all ticked and which no open PR (draft or ready) already covers.
3. **Branch** — using the naming rule (R3).
4. **Implement** — exactly the task scope, nothing more. Fill the work packet (§ below) into the PR description.
5. **Open a PR** — title per R3, body per R4.
6. **Tick** — the same PR edits the milestone file, flipping the task's checkbox `- [ ]` to `- [x]` and appending the PR reference `(PR #N)`.
7. **Merge** — after the Definition of Done checklist (R5) passes; update the rollup counts in the same PR (R13).

**Interrupted session:** push the branch and open a **Draft PR** titled `[WIP <TASK-ID>] …` with a short state note. Work state survives in the repository, not in the agent.

---

## R1 — The plan is the only backlog

No task in a milestone file, no work. An agent that identifies a needed change which is not a registered task must first open a `[PLAN-AMEND]` PR (R6) to register it — then implement it in its own PR.

*Escape valve:* trivial repo hygiene (broken link, typo) may ship as a `chore:` PR with `No-task change: yes` stated in the body. Anything else requires a task.

## R2 — One task, one PR, one tick

- A task (e.g. `M00-T07`) is completed by **exactly one pull request**.
- The implementing PR **must, in the same diff**, change that task's checkbox and append its own reference: `- [x] **M00-T07** — … (PR #123)`.
- A PR must never tick a second task. If a task turns out too large, split it with a `[PLAN-AMEND]` PR **before** implementing.
- Work items in milestone files are the only checkboxes in this repo's planning docs; acceptance criteria inside a task are plain bullets, evidenced in the PR body — they are never separately ticked.

## R3 — Naming

| Artifact | Convention | Example |
|---|---|---|
| Branch | `<milestone-lower>-t<nn>-<slug>` | `m00-t07-router-inventory` |
| PR title | `[<TASK-ID>] <type>: <imperative summary>` | `[M00-T07] docs: router & mutation inventory` |
| PR types | `feat`, `fix`, `test`, `docs`, `chore`, `spike`, `plan`, `gate` | |
| Plan amendment | `[PLAN-AMEND] plan: <summary>` | `[PLAN-AMEND] plan: split M03-T04 into protocol + feed tasks` |
| Gate PR | `[<MILESTONE>-GATE] gate: <milestone> exit evidence` | `[M00-GATE] gate: inventory, fixtures, spike decision, ratified budgets` |

## R4 — PR body contract

Every PR description contains, in order:

1. **Task:** `<TASK-ID>` (link to the heading anchor in the milestone file).
2. **Work packet:** the template reproduced in §"Work packet" below, filled in. (Inherited from v3 plan §9; mandatory for implementation tasks, abbreviated for docs/spike tasks.)
3. **Acceptance criteria:** copied verbatim from the task; after each criterion, one line of evidence — command + result, or `file:line` pointer, or output path.
4. **Tests/evidence run:** commands, environment, exit codes; explicitly list anything skipped and why.
5. **Docs:** planning/report files updated by this PR.
6. **Rollup:** confirmation the master rollup counts were updated.
7. **Self-review checklist:** no unrelated files touched · no weakened guard/test/ratchet · no silent fallback · no TODO without a registered follow-up task.

A PR missing any element is not ready for merge.

## R5 — Definition of Done

A task may be merged (and only then counts as done) when:

- [ ] every acceptance criterion has evidence in the PR body;
- [ ] CI is green (once CI exists; until then, local gate commands are run and their output pasted);
- [ ] the task checkbox is ticked in the same PR with the PR reference;
- [ ] the rollup table in the master register reflects the new count;
- [ ] the diff contains only task-scoped changes (plus the tick);
- [ ] unresolved discoveries are either registered as new tasks via `[PLAN-AMEND]` or explicitly recorded as known issues in the PR body — never silently dropped.

## R6 — Plan amendments

Reality beats plan; silence beats neither.

- Any deviation — scope change, discovered dependency, task split, wrong acceptance criterion — ships as a **`[PLAN-AMEND]` PR** that edits only planning/report documents (plus an ADR when the change is decision-level).
- An implementation PR must never quietly widen its scope. Found work → register it → implement it in its own PR.
- Every amendment states: what changed, why, and the evidence that motivates it.

## R7 — Dependencies and parallelism

- Start only tasks whose declared dependencies are ticked.
- Independent tasks may run in parallel on separate branches **only if their diffs do not overlap**; overlapping files → sequential. Shared contracts (schemas, sync protocol, tokens, bindings) have a single owner at a time — v3 §9 stands.

## R8 — Gates are owner-only

- Tasks marked `👤 GATE` aggregate a milestone's evidence into one gate PR.
- Agents prepare the evidence; **only the repository owner approves and merges a gate** (approving review or an `Approved:` comment on the PR).
- Product-scope decisions arising from the M01 fallback matrix (v3 §6) are owner decisions recorded in an ADR before any affected implementation work proceeds. Agents escalate; they do not decide.

## R9 — Refinement before a gate opens

Before a milestone gate PR may be opened, the **next** milestone's file must be refined from work-package (WP) level to task (T) level — every task carrying scope, outputs, and acceptance criteria — via a `[PLAN-AMEND]` PR. Far-future milestones stay coarse by design; detail is added by evidence, not speculation.

## R10 — Evidence over claims

No tick without reproducible evidence: commands, exit codes, output paths, hardware/fixture context where relevant. "It should work" is forbidden. A skipped or unavailable check is recorded as skipped — never as passed (mirrors v3 §8). Mocks are not durability evidence; a build is not an installer test.

## R11 — The repository is the agent's memory

An agent starting cold must be able to reconstruct the full project state from: the rollup → the milestone file → open PRs → branches → merged PR bodies. Therefore keep PR descriptions self-sufficient and keep interim findings in committed report files (`docs/reports/…`), not only in conversation.

## R12 — Security and secrets

- Never commit secrets, tokens, or credentials. Tokens live only in the environment / credential helper of the session that received them — never in git config remote URLs, never in files, never in PR text, logs, or reports.
- A credential exposed in chat or files is compromised: report it immediately so the owner can revoke it. This protocol exists partly because such an incident already happened once.
- Reports and fixtures must be sanitized (no tenant data, no real names, no endpoints with credentials) before commit.

## R13 — Rollup upkeep

The master register's status table (done/total per milestone, milestone state, gate status) is updated in the same PR that ticks a task or amends a plan file. Counts must match the milestone files exactly (enforced by the protocol lint once `M00-T20` lands).

---

## Work packet (from v3 plan §9 — mandatory before implementing a task)

```text
Task / milestone:
User-authorized scope:
Prerequisite evidence:
Existing central engine and entry points:
All affected consumers (including old web, jobs and imports):
Behavior / invariant being changed:
Contract / schema versions affected:
Files owned; unrelated dirty files excluded:
Implementation sequence:
Failure / conflict / cancellation behavior:
Native, web and server parity checks:
Migration / upgrade / rollback approach:
Focused tests and performance fixtures:
Exit gate:
```

The v3 plan's §2 mandatory instructions and §9 automatic-rejection criteria remain fully in force for every review; this protocol adds process control on top of them.

---

## Bootstrap clause

The founding PR (`bootstrap/agent-governance`) created this protocol, the task register, ADR-0010, and completed `M00-T01…T06` in a single PR. This is the **only** sanctioned multi-task PR: the protocol cannot pre-date its own existence. Its ticks reference the bootstrap PR number; every task completed after it follows R2 strictly.

## Amending this protocol

Changes to this file ship as `[PROTOCOL-AMEND]` PRs referencing the rule number(s) touched, and take effect on merge. The protocol may never be amended inside an implementation PR.
