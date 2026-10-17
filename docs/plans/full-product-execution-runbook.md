# How to execute the full-product implementation plan

Date: 2026-10-17. Status: execution instructions prepared; implementation has not started under M13.

This runbook explains **how to deliver** the [feature/navigation specification](full-product-feature-navigation-plan.md). The [M13 register](milestones/M13-product-feature-navigation-closure.md) remains the only task backlog; the [coverage ledger](../frontend/full-product-coverage.md) remains the starting scope inventory. This document creates no duplicate task IDs or completion checkboxes.

## 1. Execution approach

Work in small, complete workflows. For each one, connect the real service, implement the UI and navigation, exercise failure/recovery, and demonstrate persistence before taking the next dependent task. Maintain a runnable integration build throughout.

Use one integration owner to maintain the composition root, navigation registry, shared contracts and acceptance ledger. Module work can be delegated later when requested, with disjoint file ownership. The default sequence below works with one implementer; parallelism is optional and never a prerequisite.

The first usable result is **sign in → choose a real project → create a daily report → restart → sync → reopen the same report**. The next commercial result is **Contractor creates a separate IPC workbook → full GridCraft edits/saves → Contractor displays its validated Summary of Payment**. Complete the prerequisites to these journeys rather than making all screens look finished first.

## 2. Preparation at the start of implementation

These are entry activities of T01 and each task's work packet, not additional unregistered implementation tasks.

1. Read current repository instructions, the execution protocol, M13 and the latest relevant PRs. Inspect open work before duplicating it. Recheck the current workspace; this planning inspection is not a permanent description of the code.
2. Preserve the existing dirty/untracked implementation. Record the base commit and task-owned files. Build a deliberate task-specific checkpoint or transfer selected changes into an isolated checkout; never reset, clean, stash everything, or assume a worktree contains uncommitted work. Use an existing suitable managed worktree where available.
3. Submit the documentation-only plan amendment that registers M13 according to the existing protocol. It must not include unrelated application changes. No task is marked complete by approving the plan.
4. Pin the original source and compatible backend in T01. Record source hashes, backend API/schema version, editor artifacts and toolchain versions. Keep archive-only and M00-only features visible until reconciled.
5. Establish an isolated acceptance organisation with at least two projects and representative users/capabilities. Use sanitized fixtures and a real test backend. Keep production data outside acceptance testing.
6. Establish a writable permitted Flutter toolchain or CI runner. Record current analyzer/build/test results as the baseline, including failures. Fixing an unrelated pre-existing failure requires its own registered scope; do not silently weaken tests.

If source/backend access is missing, complete the local inventory and name the exact unresolved reference or endpoint. Do not invent a replacement API or mark T01/T04 complete. Continue independent, ready work when its declared prerequisites are satisfied.

## 3. Concrete delivery order

This order respects the current M13 dependencies. Items joined by an arrow are sequential. A group is complete only when each task's acceptance criteria pass, not when its UI exists.

| Batch | Execution order | Working demonstration before leaving the batch |
|---|---|---|
| 1. Establish the baseline | T01 | Reviewed source/action inventory; every known route/workflow assigned, source discrepancies visible, compatible service target identified |
| 2. Connect the foundation | T02 → T03 → T04 → T05 → T06 | Real sign-in, actual project list, correct selected project, typed route navigation, authenticated persistence and explicit sync/error states |
| 3. First operational workflow | T08 → T09 → T07 | Real people/material selectors; daily report with attachment saved offline, recovered after restart, synchronized once and reviewed |
| 4. Commercial groundwork | T10 → T11 → T12 → T13 | Real BOQ/version/rate/VO behavior; Contractor creates and reopens distinct IPC workbooks safely |
| 5. Complete IPC sync | T14 → T15 → T16 | Actual GridCraft preservation/freshness proof, ordered saved-file ingestion and read-only summary with last-good recovery |
| 6. Planning and operations | T17 → T18 → T19 → T20 → T21 → T22 → T23 | Real schedule/progress, workflow actions, procurement/stock, equipment, subcontracting and payroll journeys |
| 7. Financial integration | T24 → T25 | Authoritative journals/payments and operational source links; VAT, fiscal locks, guarantees, JV and financial reports reconcile |
| 8. Remaining product coverage | T26 → T27 → T28 → T29 | QA/safety, drawings/takeoff, documents/forms/issuance, settings/admin and utility destinations work |
| 9. Final parity and release | T30 → T31 → T32 → T33 | Original supported dashboards last; full action/navigation evidence, platform install/upgrade/restore and owner gate |

T14 is independent after T01. If parallel work is requested, run its disposable-workbook qualification early to expose upstream blockers before the IPC integration batch. A failed T14 blocks T15/T16 and dependent financial closure; it does not block ready planning/operations/document tasks. Retain T14 as open with its evidence rather than accepting an unproven fallback.

The default sequence follows the repository's lowest-numbered-ready-task rule. A different priority order or subdivision is recorded in a plan amendment, not kept only in chat. T08/T09 precede T07 because the real field forms need workforce and catalog records.

## 4. First implementation sessions, step by step

### Session A — T01: turn the seed inventory into execution records

- Inspect the original route, imported views/dialogs and actual service implementation for each seed row. Include utilities, mobile capture, hidden role-specific tools, print designers and background-job effects.
- Produce a source baseline record and action ledger under `docs/reports/M13/` and `docs/frontend/`. These are planned output locations, not existing acceptance evidence.
- Each action record states its route/entity, trigger, allowed lifecycle, validation, service/command, permission, offline policy, target owner and an executable acceptance scenario.
- Compare original-source coverage against the 64-route/41-workflow seed. Add discovered omissions; preserve explicit user changes such as GridCraft-only IPC editing. Do not silently shrink the denominator.
- Inspect the first foundation packets and split any that cannot fit one reviewable PR. Register the split and update dependency references before coding.

Exit: another implementer can pick a task and know exactly which original actions and backend contracts it must deliver. The original/backend reference conflict is resolved or remains an explicit blocking issue; T01 is not ticked prematurely.

### Session B — T02/T03: stable routes and real identity

Complete T02 and T03 as separate changes. Define route IDs/aliases and scoped context first; then connect production configuration and the existing identity implementation. Keep the real server authoritative for capabilities. Leave future module screens explicitly unavailable during construction instead of routing them to another module's table.

Verify route parsing/direct links, project selection, sign-in/expiry/revocation, account/project switching and response-generation guards. Keep fixture mode explicitly separate from the product entry point.

### Session C — T04/T05/T06: prove the actual product connection

Complete these as separate task changes. Reuse the real transport, mount/outbox, attachment pipeline and repositories from the connected host; inject them into `main.dart`/ContractorApp. Then mount the registry-driven shell and authoritative project/organisation lifecycle.

Verify a real service-backed command through the production composition, persisted read-back, duplicate retry, rejected operation and cross-project isolation. Navigate to the same record through the shell and a direct link. An isolated repository test cannot establish that the shell uses it.

### Session D — T08/T09/T07: deliver the first complete field journey

Implement the real roster/catalog prerequisites, then daily reports and the other registered field actions. Reuse the existing capture screens and durable stores where correct. Test the full report/attachment restart and sync journey through the main app. Record a short demonstration and test evidence against the action ledger.

These sessions describe work order, not fixed calendar durations. Do not claim completion of a broad packet because one happy-path demonstration works; all registered actions in that packet must pass or be split into explicit remaining tasks.

## 5. Repeatable cycle for every task

| Step | Required output | Rule for proceeding |
|---|---|---|
| Ready | Work packet with source actions, passed dependencies, files owned, API contracts, migrations, test fixtures and failure cases | No duplicate open task; scope is small enough for one reviewable PR |
| Specify | Concrete input/output, lifecycle and acceptance scenarios | Resolve shared-contract questions before module code depends on them |
| Implement | Service/repository/controller/UI/navigation wired in the actual entry point | No production sample data, local-only fake acceptance or success-only toast |
| Verify | Focused tests, real-store/backend read-back and UI journey evidence | Fix findings; blocked/unrun checks remain open |
| Review | Task-scoped diff, evidence, limitations and migration/rollback notes | Review for wrong-scope access, financial correctness, durability and original-action omissions |
| Integrate | One task PR, task tick with its PR reference and updated rollup | Follow the existing protocol; a pending PR is not a completed milestone |
| Recheck | Combined integration build and affected connected journey | Run checks justified by combined changes; do not rely only on a branch's isolated tests |
| Record | Updated action evidence, blockers and next ready task | A new session can resume without relying on conversation memory |

Before implementation, refine oversized packets into registered tasks in a documentation-only amendment. For example, T19 may need separate requisition, approval/quotation and PO tasks; T28 may need document lifecycle, runtime binding and output-format tasks. These are refinement examples, not authorized hidden subtasks or extra completion ticks. Retain one owner for every action when updating the ledger.

## 6. Ownership and optional parallel execution

If the user requests parallel agent execution, use the available four slots as **one integration owner, two implementers and one reviewer/qualification worker**. Do not start four unrelated changes to the shared shell.

| Role | Owns | Boundary |
|---|---|---|
| Integration owner | Composition root, shared session/route/data contracts, registry mounting, final integration evidence | Sole writer for shared wiring and migrations at any given time |
| Module implementer A | One ready commercial/planning/document packet and its module tests | Returns factory/API requirements; coordinates shared changes with integration owner |
| Module implementer B | One ready operations/finance/governance packet and its module tests | No overlapping files or duplicated service authority |
| Reviewer/qualification worker | Actual editor fixture runs, independent action review, recovery/permission checks | Read-only review by default; fixes assigned explicitly to a file owner |

Suitable concurrency after dependencies pass: T02 with T03 if shared context ownership is settled; T14 with foundation work; T08/T09/T10 as separately owned module work; later ready operations/document packets with stable adapters. Shared registry, migration, generated-contract and lockfile changes remain serialized.

A dispatch packet must include: task ID; source/action IDs; passed dependencies; exact owned files; shared interfaces to consume; expected behavior; prohibited regressions; validation commands and fixtures; evidence output; blockers to report. Agent reports must distinguish implemented, tested and blocked. No agent may certify its own simulated editor behavior as real runtime acceptance.

## 7. Evidence, progress and interruption handling

Maintain one action ledger linked to M13, plus concise task evidence under `docs/reports/M13/`. For every task record:

```text
Task and PR:
Source reference and action IDs:
Base/integration revision and owned files:
Actual API/editor versions:
Changes and migration/rollback behavior:
Checks: command, fixture, platform, exit result, evidence path:
UI journey: steps, expected/observed result, screenshots or recording:
Known blockers and exact prerequisite to clear them:
Next ready task:
```

Use task states `ready`, `in progress`, `review`, `blocked`, `merged` for execution reporting. Keep action evidence stages from the specification separately: inventoried, specified, implemented, service-verified, UI-verified and release-verified. Never equate merged code, a task count or test count with full product parity.

At the end of each completed task, report what now works, the evidence run, the remaining blocker and the next task. At each batch boundary demonstrate the user journey in the table above. Update completion counts only according to the repository protocol; record pending gate approvals accurately.

If interrupted, preserve task-owned work, publish a draft PR when the authorized repository workflow permits, and record a resumable handoff. Do not sweep unrelated dirty files into a checkpoint. On resume inspect the diff, evidence and pending PR before continuing; do not redo already verified work without a relevant change.

## 8. Blocker handling and release discipline

| Blocker | Immediate action | Work that may continue |
|---|---|---|
| Original source versions disagree | Reconcile hashes/history and list unresolved source-only actions in T01 | Local inspection and evidence preparation; no fabricated baseline |
| Backend contract missing/incompatible | Record exact endpoint/DTO/permission gap and register the server-side dependency | Independent ready routes; fail visibly in affected product path |
| GridCraft loses required content or cannot prove freshness | Preserve disposable reproduction, pin artifact and pursue supported upstream resolution | Contractor creation/reopen and independent modules; no automatic payment publication |
| Flutter/OS runner unavailable | Use a permitted writable toolchain/CI; record the unrun platform check | Source work and available checks; no platform completion claim |
| Cross-project or financial correctness failure | Stop publication/posting on the affected path, retain last accepted state and fix/retest | Unaffected ready modules only |
| New feature discovered | Add source action and register its scope/dependencies through amendment | Current unrelated task stays bounded |

Release is a separate final step after T31/T32 evidence. T33 follows the existing owner-only gate rule; prepare a concrete reviewable package first. Installing, publishing or migrating production is not implied by this runbook. Preserve the IPC boundary throughout: Contractor creates the IPC, full GridCraft owns workbook/payment editing, and Contractor consumes only a validated Summary of Payment.

## 9. Checks for this planning change and future task closure

Planning consistency:

```sh
node scripts/lint-protocol.mjs
git diff --check
```

During implementation, run the pinned Flutter analyzer, the task's focused tests, real backend/store acceptance and relevant actual editor journeys. Build and install the actual product entry point on each claimed platform. Capture executable commands and results in task evidence; never replace an unavailable runtime check with a claim based on a unit test.

No application changes or agent dispatch are performed by creating this runbook. The next executable task is **M13-T01**; subsequent work follows its reconciled inventory and the dependency order above.
