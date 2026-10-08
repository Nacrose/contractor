# M05 — Extend field workflows through the same engine

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M05. Dependencies: M04. Registered at **WP level** — refine before the M04 gate opens.

Exit (v3): each workflow passes the same crash/replay/permission contract suite and native/web outcome tests; unsynchronized work cannot disappear during migration.

---

- [ ] **M05-W01** — Attendance submissions via the shared repositories/commands/sync-status components
  - Acceptance sketch: same engine path as M04; duplicate attendance rules defined centrally; no device-time authority for posting sequence or approvals (v3 §6 M05).

- [ ] **M05-W02** — Petty cash / site expense submissions
  - Acceptance sketch: existing `site-expense` resolvers reused; approval distinctness preserved; original actor + edited payload audit history kept (v3 §6 M05).

- [ ] **M05-W03** — MRR / delivery submissions
  - Acceptance sketch: `field-submission.ts` office review flows reused; material reconciliation semantics unchanged.

- [ ] **M05-W04** — Field photos through the full pipeline (native camera/files adapters)
  - Acceptance sketch: native camera + OS file adapters; staging/digest/finalize per §5.2; visible in office review surfaces.

- [ ] **M05-W05** — OS scheduling adapters with persisted scheduling state
  - Acceptance sketch: background sync opportunities used but **foreground recovery works when background execution never ran** (v3 §6 M05).

- [ ] **M05-W06** — Existing browser drafts/queues: explicit export/import or safe drain plan
  - Acceptance sketch: operation IDs preserved; no blanket IndexedDB deletion; PWA retirement path documented (v3 §6 M05).

- [ ] **M05-W07** — Contract suite pass: crash/replay/permission + native/web outcome tests per workflow
  - Acceptance sketch: same suite as M03-W09 extended to each new workflow (v3 §6 M05 exit).

- [ ] **M05-W08** — Field PWA code retirement gate (drain verified)
  - Acceptance sketch: retired only after draft drain completes and evidence recorded; retirement is its own task with rollback notes.

- [ ] **M05-W09** — 👤 GATE — M05 exit evidence
  - Acceptance sketch: all WPs ticked; downstream (M06/M09) refinement needs noted; owner approval per protocol R8.

## Refinement contract

Before `M04-W07` merges, refine to `M05-Tnn` tasks with testable acceptance criteria (protocol R9).
