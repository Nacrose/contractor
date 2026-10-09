# M05 — Extend field workflows through the same engine

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M05. Dependencies: M04. Registered at **WP level** — **refined to task level under protocol R9** by the `[PLAN-AMEND]` PR recorded in the register (2026-10-09, during M04, before the M04-T09 gate). The original WP sketches (W01–W09) are preserved as the `Refinement record` section at the bottom.

Exit (v3): each workflow passes the same crash/replay/permission contract suite and native/web outcome tests; unsynchronized work cannot disappear during migration.

---

- [ ] **M05-T01** — Expansion substrate: shared repositories, typed commands, and sync status for the workflow family
  - Depends on: M04-T02, M04-T03 · Output: substrate extension code with tests — the per-domain operation bindings, command registrations, and sync-status wiring the expansion workflows share; no new screen framework.
  - Scope: extend the M04 mount (T02) and vertical workflow substrate (T03) so attendance, petty cash, MRR/delivery, and media workflows all run through the SAME repositories, typed commands, and sync-status components (v3 §6 M05 bullet 1) — one engine path, no per-workflow forks.
  - Acceptance:
    - Each expansion workflow dispatches through the SAME outbox → orchestrator → adapter path as the M04 vertical; no workflow gets a private transport, private sync logic, or a second health surface.
    - Sync status for every expansion workflow renders from the M03-T08 device health read model (pending count, oldest age, per-scope cursors, honest synced flag) — zero per-workflow health code.
    - Each workflow's adapter operation bindings (operationId + declared guard chain) are registered in the M03-T01 registry from the M00 router-inventory rows for that domain — a binding that cannot name its inventory row and guard chain cannot be registered.
    - Standing constraint (v3 §10): every writer added server-side for these workflows names its change-feed integration and Flutter-parity path in the per-workflow tasks below — none added silently.

- [ ] **M05-T02** — Attendance submissions (duplicate rules central; server-authoritative time and sequence)
  - Depends on: M05-T01 · Output: attendance submission workflow running on native and web with tests; writer/feed disposition recorded in the task's evidence report.
  - Scope: attendance create/edit/post through the shared engine; duplicate attendance rules and field-capture timestamp semantics defined CENTRALLY; device time is never authoritative for posting sequence or approvals (v3 §6 M05 bullet 3).
  - Acceptance:
    - Duplicate attendance is prevented by one central rule (single definition, tested) — not per-client validation; two devices submitting the same attendance converge deterministically with no duplicates.
    - Posting sequence and approval order derive from server-received order (commit-order feed seq / server timestamps); a device with a skewed clock cannot reorder, forge sequence, or backdate authority.
    - The M00 inventories' attendance writers are audited and dispositioned (migrated → emit their change atomically per the M03-T04 pattern; excluded → reason recorded) — no silent writer; the Flutter-parity path is named (M02 `platform_contracts` generation pattern).
    - Approval remains a distinct server-side action where currently required; the native client cannot self-approve (permission guards enforced at the adapter, in GUARD_ORDER).

- [ ] **M05-T03** — Petty cash / site expense submissions (approval distinctness + audit history)
  - Depends on: M05-T01 · Output: expense submission workflow running on native and web with tests.
  - Scope: existing `site-expense` resolvers reused (adapter seed binding `siteExpense.create` already names the full financial guard chain); approval distinctness preserved; original actor + edited payload audit history kept (v3 §6 M05 bullet 2).
  - Acceptance:
    - Expenses land in the submission/review state and do NOT post to the financial ledger until office approval — current business behavior preserved (M00 local-stores inventory, "Site Expense & Petty Cash Logging").
    - The full financial guard chain (delegation, financial, fiscalLock, idempotency) runs server-side on EVERY dispatch — no financial rule moves to client state.
    - Original actor + edited payload audit history survives the sync path: an office edit does not overwrite who originally submitted or what they submitted (pinned by test against the real audit-log service).
    - Financial command receipts follow the M03-T04 §7 durable-receipt rules (never expiry-deleted; compaction keeps the replay gate fail-closed).

- [ ] **M05-T04** — MRR / delivery submissions (office review flows reused)
  - Depends on: M05-T01 · Output: MRR/delivery submission workflow running on native and web with tests.
  - Scope: `field-submission.ts` office review flows reused; material reconciliation semantics unchanged — `daily-report-sync` normalization is not forked or re-implemented client-side (v3 §6 M05 bullet 2).
  - Acceptance:
    - MRR/delivery submissions flow through field-submission ingestion and `daily-report-sync` normalization exactly as today; the reconciliation service's semantics are untouched.
    - Office review (accept/reject/adjust) remains a distinct server-authoritative action; field devices observe review outcomes through the M03-T04/T05 sync surfaces, not through client-side state mutation.
    - Material reconciliation results are computed server-side from the same inputs as the current app — parity pinned by test (differences would be listed and dispositioned, none silent).
    - The delivery writer set is dispositioned against the M00 inventories (migrated/excluded with reasons) per the M03-T04 audited-writer pattern.

- [ ] **M05-T05** — Field photos through the full pipeline (native camera/files adapters)
  - Depends on: M05-T01, M04-T04 · Output: capture → stage → finalize → register for every expansion workflow that attaches media, with tests.
  - Scope: native camera + OS file adapters bound to the M03-T06 protocol (one manager, one journal — no per-workflow transfer code); photos visible in office review surfaces (v3 §6 M05 bullet 4).
  - Acceptance:
    - Every expansion workflow's attachments go through the SAME M03-T06 manager and reconciliation journal — staging/digest/finalize/register semantics identical to the M04 vertical; no second transfer path exists.
    - Office review surfaces display only REGISTERED photos (complete == registered; an incomplete upload is never displayed as complete).
    - EXIF/geotag handling and server-side StoredFile digest dedup behave as the current app (M00 local-stores/asset inventory rows); any difference is listed and dispositioned explicitly, none silent.
    - The native camera/file adapter bindings honor the port contracts (real SHA-256 digest, fail-closed on store errors) — mount-level binding tests per the M04-T02 pattern; package semantics are not re-proved.

- [ ] **M05-T06** — OS scheduling adapters with persisted scheduling state
  - Depends on: M05-T01 · Output: scheduling adapter bindings + durable scheduling state + tests.
  - Scope: background sync opportunities used where the OS provides them; **foreground recovery works when background execution never ran** (v3 §6 M05 bullet 4).
  - Acceptance:
    - Scheduling state (last attempt, next window, backoff) persists durably and survives process death; a device whose background execution NEVER ran fully reconciles on foreground launch (pinned by test simulating never-ran-background then foreground).
    - Background triggers are best-effort enhancements only: every correctness property holds with background execution disabled entirely.
    - OS scheduler bindings (Android WorkManager / iOS BGTaskScheduler class) live behind the mount ports — no scheduling logic inside workflow code.
    - OS constraints (battery/quota deferrals) surface honestly through the health read model — a blocked background window is visible, never silent.

- [ ] **M05-T07** — Existing browser drafts/queues: explicit export/import or safe drain
  - Depends on: M05-T02, M05-T03, M05-T04 · Output: migration tooling/flow with tests + drain evidence report `docs/reports/M05/browser-drain.md`.
  - Scope: explicit export/import or safe draining of existing browser drafts/queues (`cm-field-outbox` IndexedDB v3: `outbox`/`drafts`/`queries`; legacy `cm-offline-v2`) BEFORE retiring field PWA code; operation IDs preserved; no blanket IndexedDB deletion (v3 §6 M05 bullet 5).
  - Acceptance:
    - Every pending browser outbox item drains into the corresponding workflow with its operationId and idempotency key INTACT — server-side dedup treats a migrated submission and its original identically (no double-post).
    - No migration step deletes IndexedDB wholesale: per-store, per-record disposition (drained → archived/removed only after server acknowledgement; pending → retained), with the disposition rule tested.
    - The drain is idempotent and resumable — an interrupted migration re-runs without loss or duplication, with crash-safety evidence against the real browser store engine (no mocks as sole proof).
    - The PWA retirement path is documented in the report (what retires, what remains, rollback notes); actual retirement is M05-T09, not this task.

- [ ] **M05-T08** — Contract suite pass: crash/replay/permission + native/web outcome tests per workflow
  - Depends on: M05-T02, M05-T03, M05-T04, M05-T05, M05-T06 · Output: per-workflow suite runs + fault-matrix extension; evidence report `docs/reports/M05/contract-suite.md`.
  - Scope: the M03 contract suite (crash/replay/permission) extended to each expansion workflow; native/web outcome tests; the M03-T09 fault-matrix runner extended with the new workflow boundaries (v3 §6 M05 exit).
  - Acceptance:
    - Each expansion workflow passes the SAME suite shapes M03 pinned (durability against real SQLite, replay protection, permission revalidation) — no weakened per-workflow variants.
    - The fault matrix gains legs for the new workflows (conflict, revocation mid-flow, lost acknowledgment, disk full, per workflow class) reported in the M03-T09 format (boundary, engine, invariant, recovery, result).
    - Unsynchronized work cannot disappear during migration: the suite replays interrupted drains and asserts zero loss (the M05 exit sentence, pinned).
    - All evidence is produced against real engines (real SQLite; disposable PostgreSQL where server-concurrency legs are required) — no mocks as sole proof of a durability claim.

- [ ] **M05-T09** — Field PWA code retirement gate (drain verified)
  - Depends on: M05-T07, M05-T08 · Output: retirement changeset with rollback notes + evidence report.
  - Scope: retire field PWA code ONLY after drain completes and evidence is recorded; retirement is its own task with rollback notes (v3 §6 M05 bullet 5; WP sketch W08).
  - Acceptance:
    - The retirement diff removes only what the M05-T07 drain report proves is dead (field PWA workflows with zero remaining pending work); shared code used by the React web app is untouched.
    - Rollback notes name the revert path and what happens to data written between retirement and any revert.
    - Post-retirement checks pass: no field-workflow regression in the web app (office surfaces keep working); service worker/cache cleanup verified.
    - Evidence is recorded before the retirement PR merges; the tick cites the drain evidence and the retirement diff.

- [ ] **M05-T10** — 👤 GATE — M05 exit evidence and owner decision
  - Depends on: M05-T01…T09 · Output: `[M05-GATE]` evidence packet; downstream (M06/M09) refinement needs noted; owner decision.
  - Acceptance:
    - Every M05 task is ticked with a PR reference and links reproducible evidence; each workflow's crash/replay/permission results are presented per the exit sentence.
    - Downstream refinement needs (M09 scheduling engine, M06 interactions) are recorded as register notes — refinements happen through separate `[PLAN-AMEND]` PRs per protocol R9.
    - Only the repository owner approves and merges this gate under protocol R8.

## Refinement record

The original WP-level register (superseded 2026-10-09 by the `[PLAN-AMEND]` refinement PR recorded in the register):

- M05-W01 (attendance) → refined into **M05-T01** (shared substrate) and **M05-T02** (attendance workflow).
- M05-W02 (petty cash / site expense) → refined into **M05-T03**.
- M05-W03 (MRR / delivery submissions) → refined into **M05-T04**.
- M05-W04 (field photos full pipeline) → refined into **M05-T05**.
- M05-W05 (OS scheduling adapters) → refined into **M05-T06**.
- M05-W06 (browser drafts/queues export/import or drain) → refined into **M05-T07**.
- M05-W07 (contract suite pass) → refined into **M05-T08**.
- M05-W08 (field PWA retirement gate) → refined into **M05-T09**.
- M05-W09 (👤 GATE) → refined into **M05-T10** (adds the explicit downstream-refinement-note acceptance).

## Refinement contract

Satisfied: this file was refined to `M05-T01…T10` with scope, outputs, dependencies, and testable acceptance criteria by the `[PLAN-AMEND]` PR recorded in the register (2026-10-09, during M04 — before the M04-T09 gate PR opens, per the M04-T09 precondition). Far-future milestones stay coarse until evidence supports their refinement.
