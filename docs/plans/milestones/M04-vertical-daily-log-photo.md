# M04 — First vertical workflow: daily log and photo

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M04. Dependencies: M03. Proves the system architecture — **not** a complete platform release (v3 §6 M04).
> Photo markup approach ([ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md) §6, owner 2026-10-09): lightweight native overlay in-app; PdfCraft annotation/export path (photo → PDF → shapes/comments) for share/print. photocraft rejected for markup as too heavy.
> **Refined to task level under protocol R9** by the `[PLAN-AMEND]` PR recorded in the register (2026-10-09, after M03-T09 merged, before the M03-T10 gate opened). The original WP sketches (W01–W07) are preserved as the `Refinement record` section at the bottom.

Exit (v3): device-recorded workflow evidence, automated fault tests, parity with current daily-log rules and user verification.

---

- [x] **M04-T01** — Daily-report domain path trace through the M03 adapter + side-effect inventory (PR #44)
  - Depends on: M03-T01, M03-T04 · Output: trace + side-effect disposition report `docs/reports/M04/domain-path-trace.md`; no production code change.
  - Scope: trace the daily-report domain path (schemas, builders, permissions, side-effect services) through the M03-T01 adapter exactly as the workflow will call it, BEFORE any UI wiring; identify every side effect that would need a central transaction the adapter path cannot give it, and disposition each (in-path, deferred with reason, or requires adapter change) (v3 §6 M04 W01).
  - Acceptance:
    - Every inventoried daily-report writer from the M00 router/job/import inventories that the vertical workflow touches is listed with its adapter route and its M03-T04 feed coverage (migrated or intentionally excluded, citing the T04 audited writer list).
    - Side effects needing a central transaction are identified and dispositioned in the report BEFORE any workflow code calls the adapter; anything requiring an adapter change is either registered via `[PLAN-AMEND]` or recorded as a known constraint in this file.
    - Permissions for the pilot domain are enumerated against the M03-T02 scope-claims model (tenant/project/role) with the revalidation expectation stated.
    - The report names the Flutter consumer path and its parity evidence route (M10 gate).

- [x] **M04-T02** — Flutter mount wiring of the M03 engine (identity, outbox, snapshot/bootstrap, orchestrator, health) (PR #45)
  - Depends on: M03-T02, M03-T03, M03-T05, M03-T07, M03-T08 · Output: mount adapter code in `prototype/construction_client/` binding the M03 contract packages' ports to device implementations, with tests.
  - Scope: the composition root the M03 packages were designed for: bind `SqlDriver` ports to the native SQLite driver (WAL + synchronous=FULL semantics preserved), `SecureCredentialStore` to the OS keystore, `SystemBrowserPort` to the platform browser, `ObjectStore`/`SourceReaderPort`/`DigestPort` (real SHA-256) to the device filesystem, `SyncTransportPort` to the server routes, and the `PendingOperationSource` adapter onto the outbox; wire the orchestrator drain triggers (app launch, foreground, manual, background-gated) and the sync-health read model (v3 §5.2/§5.3, §6 M04 W02 substrate).
  - Acceptance:
    - Each port binding has a test proving the device implementation honors the port contract (durability flags, fail-closed behaviors, redaction) — the M03 packages' own suites remain the semantic authority; mount tests verify the BINDING, not re-prove the packages.
    - The outbox adapter implements the `PendingOperationSource` surface 1:1 (including blocked/conflict states via documented schema extension) with no translation layer drift.
    - Credentials never appear outside the secure store; crash-report paths route through the M03-T08 sanitizer.
    - The mount runs the SAME M03 suites' contract shapes (structural pins intact) — no package code is forked or edited.

- [ ] **M04-T03** — The vertical workflow, shared Flutter: select project → create/edit log → save locally → sync
  - Depends on: M04-T01, M04-T02 · Output: one workflow code path running on installed apps and browser, with workflow tests.
  - Scope: the M04 headline workflow (v3 §6 M04 W02): project selection, daily-log create/edit with the existing daily-report rules, local save committing the domain write and its pending operation together (M03-T03 contract), and dispatch through the M03-T07 orchestrator.
  - Acceptance:
    - The SAME widget/code path renders on native and web; no platform branch inside the workflow logic (platform differences live behind the M04-T02 ports).
    - A local save is durable per the M03-T03 contract (domain write + pending op together; private drafts where applicable) and survives app restart.
    - Accepted data is visible in the current web app AND on a second device via the M03-T04/T05 sync surfaces; the round trip is demonstrated in a test or recorded fixture.
    - The workflow uses the shared component library and command registries (M02 contracts) — no new screen framework.

- [ ] **M04-T04** — Photo attachment path live: capture → stage → finalize → register + sync-health UI binding
  - Depends on: M04-T03, M03-T06, M03-T08 · Output: working photo attachment flow through the M03-T06 protocol, and the device sync-health surface wired into the app UI.
  - Scope: camera/gallery capture writes through the M03-T06 manager (stageBytes → finalize → register with server digest verification); transfer states (staging/staged/finalized/registered/failed) surface in the UI; the M03-T08 device health read model drives the app's sync status display (pending count, oldest age, per-scope cursors, rejection reasons, honest synced flag).
  - Acceptance:
    - An interrupted photo transfer (kill app mid-upload) resumes through the reconciliation journal after relaunch — the M03-T06 typed failure states are all reachable and surfaced, never silently dropped.
    - An incomplete photo is never displayed as a complete attachment anywhere in the UI (complete == registered).
    - The sync-health UI cannot present a false success state (the M03-T08 honesty rule binds the display; pending work or a fresh rejection shows the real state).
    - Digest verification runs with a REAL SHA-256 on device (no fallback digest path exists in the binding).

- [ ] **M04-T05** — Vertical-workflow fault matrix: the v3 W03 list end-to-end
  - Depends on: M04-T03, M04-T04, M03-T09 · Output: automated fault legs for the assembled workflow (device-mounted engine, not package-level), extending the M03-T09 matrix runner; report `docs/reports/M04/fault-matrix-vertical.md`.
  - Scope: the v3 §6 M04 W03 scenario list exercised against the MOUNTED workflow: simultaneous office edit (conflict), permission revocation mid-flow, expired login mid-flow, app termination, reboot, disk full, slow/absent network, lost acknowledgment, incomplete photo upload (v3 §6 M04 list, all covered).
  - Acceptance:
    - Each scenario runs automated (device/emulator harness or recorded fixture where true device automation is not available — recorded evidence cites the run).
    - The M03-T09 global invariants (I1–I4) hold at each boundary in the assembled system, not only per-package.
    - Every failure surfaces through the M03-T08 device health surface with a deterministic recovery action — the scenario evidence includes the health-surface transcript.
    - Results are reported in the same matrix format as M03-T09 (boundary, engine, invariant, recovery, result).

- [ ] **M04-T06** — Retention and restore proof + attachment download contract for device restore
  - Depends on: M04-T04, M04-T05 · Output: retention/restore tests and the attachment fetch/download contract (server object URL + digest-verified re-fetch) recorded and implemented for the workflow.
  - Scope: pending local data is retained through a rejected sync (M03-T02/T03 gates hold); a NEW device restores accepted records via snapshot bootstrap (M03-T05) — and restores registered photos: this task defines and implements the minimal attachment download path (fetch by receipt/object id, digest verified on re-fetch, re-staged locally through the same journal) so restore is complete (v3 §6 M04 W04).
  - Acceptance:
    - A rejected sync leaves all pending local data intact and surfaced (typed states, no silent drop); the user path to resolve (fix + retry) is demonstrated.
    - A new device restores accepted daily-log records through snapshot bootstrap with the manifest-closure reconcile preserving any local pending work.
    - Registered photos re-fetch with digest verification; a tampered/failed fetch is a typed recoverable state, never a silently corrupt photo.
    - The download contract names its server route, authorization model (scope revalidation), and its change-feed/Flutter-parity note per the standing v3 §10 constraint.

- [ ] **M04-T07** — Real-device telemetry capture and capacity re-baseline PROPOSAL
  - Depends on: M04-T03, M04-T04, M04-T05, M04-T06 · Output: telemetry report `docs/reports/M04/device-telemetry.md` + a capacity re-baseline PROPOSAL (bands change only via `[PLAN-AMEND]`).
  - Scope: capture sync latency, battery/background behavior, and crash-free rate on the ratified device profile during real workflow use; re-baseline the §6.0 effort bands against measured throughput (v3 §6 M04 W05).
  - Acceptance:
    - Telemetry comes from REAL device sessions of the vertical workflow (not emulator-only), with the capture method recorded and reproducible.
    - The M03-T08 server metrics (outcome counters, feed lag, checkpoint age, attachment retries) are correlated with device-side observations for at least one full sync session.
    - The re-baseline is a PROPOSAL in the report — the §6.0 bands themselves change only through a `[PLAN-AMEND]` the owner approves (protocol R6/R8).
    - Crash-report samples demonstrate the M03-T08 sanitization end-to-end on device (no credentials/private drafts in captured reports).

- [ ] **M04-T08** — Evidence package: device-recorded workflow video/logs + parity check vs current daily-log rules
  - Depends on: M04-T01 … M04-T07 · Output: the M04 evidence packet `docs/reports/M04/evidence-package.md` + recorded media/logs.
  - Scope: assemble the exit evidence (v3 §6 M04 W06): device-recorded workflow video and logs covering native AND web, the parity check against the CURRENT daily-log rules (the workflow must not silently change business behavior), and the fault-matrix + retention/restore + telemetry results.
  - Acceptance:
    - Evidence covers native and web explicitly; each claim links its producing task's report or recording.
    - The parity check enumerates the current daily-log rules and shows the workflow preserves them (differences are listed and dispositioned, none silent).
    - User verification is EXPLICITLY requested in the packet (the v3 M04 exit requires user verification; the gate asks for it).

- [ ] **M04-T09** — 👤 GATE — M04 exit evidence and user verification
  - Depends on: M04-T01 … M04-T08 and M05 task-level refinement PR · Output: `[M04-GATE]` evidence packet, M05 task register, and owner decision.
  - Acceptance:
    - Every M04 task is ticked with a PR reference and links reproducible evidence.
    - The recorded workflow evidence and user verification request are presented to the owner; verification is the owner's call (protocol R8).
    - M05 is refined to task level through a separate `[PLAN-AMEND]` PR BEFORE this gate PR opens (protocol R9).
    - Only the repository owner approves and merges this gate under protocol R8.

## Refinement record

The original WP-level register (superseded 2026-10-09 by the `[PLAN-AMEND]` refinement PR recorded in the register):

- M04-W01 → refined into **M04-T01** (domain path trace) and the substrate expectations carried by **M04-T02**.
- M04-W02 → refined into **M04-T02** (mount wiring), **M04-T03** (workflow), **M04-T04** (attachment + health UI).
- M04-W03 → refined into **M04-T05** (vertical fault matrix on the M03-T09 harness).
- M04-W04 → refined into **M04-T06** (retention/restore + the attachment download contract restore requires).
- M04-W05 → refined into **M04-T07** (telemetry + re-baseline proposal).
- M04-W06 → refined into **M04-T08** (evidence package + parity check).
- M04-W07 → refined into **M04-T09** (gate; adds the explicit M05 refinement precondition per protocol R9).

## Refinement contract

Before the M04 gate PR opens, M05 is refined from work-package level to `M05-Tnn` tasks with scope, outputs, dependencies, and testable acceptance criteria via a `[PLAN-AMEND]` PR (protocol R9). Far-future milestones stay coarse until evidence supports their refinement.
