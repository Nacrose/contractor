# M03 — Native identity, repositories and sync engine

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M03, §4 contracts, §5.2 local durability, §5.3 synchronization, and §5.4 conflicts. Dependencies: M02-GATE. This milestone is refined to task level under protocol R9. The change-feed mechanism, checkpoint/replay design, and failure/rollback story must follow the M00 owner-ratified decision record; this file does not select a mechanism. Every new server-side domain feature in M03 names its change-feed integration and Flutter-parity path in its task packet (v3 §10).

Exit: real SQLite plus disposable PostgreSQL evidence proves no lost accepted operation, no duplicate business effect, no cross-tenant disclosure, and safe recovery at each transaction/network failure boundary. Sync telemetry is demonstrated end-to-end. Mocks alone do not count as durability evidence.

---

- [x] **M03-T01** — Define a versioned native-facing API adapter (PR #32)
  - Depends on: M02-GATE · Output: versioned adapter contract, compatibility rules, and guard-inventory report.
  - Scope: expose existing domain services to native clients through the pinned `platform_contracts` version without binding the native interface to tRPC internals.
  - Acceptance:
    - Each adapter operation maps to an existing authoritative service; no business rule or permission check moves into client state.
    - Authentication, authorization, tenant scoping, validation, rate limits, and side-effect guards currently provided by tRPC middleware are inventoried and demonstrably preserved at the service boundary.
    - Contract compatibility tests cover supported and rejected versions, malformed input, and authorization failures.
    - No new server-side domain feature is introduced. Any follow-up feature task must name its change-feed integration and Flutter-parity path.

- [x] **M03-T02** — Implement native identity and device lifecycle (PR #33)
  - Depends on: M03-T01 · Output: native login/session/device contract and secure credential-storage adapter.
  - Scope: native login, session rotation/revocation, device registration, logout, and account switching; preserve browser authentication behavior.
  - Acceptance:
    - Native sign-in uses the system browser if the owner-ratified identity design selects that flow; browser sessions retain httpOnly-cookie and CSRF protections and existing origin checks.
    - Session rotation, logout, revocation, expired credentials, device removal, and account switching have explicit server-enforced outcomes and tests.
    - Credentials use the target OS secure storage and never appear in source, logs, crash reports, or bundled binaries.
    - Logout or account switching surfaces unsynchronized work before it can become inaccessible; no pending work is silently uploaded or deleted.
    - Identity/device operations do not add domain writers. Any server-side domain feature added later must name its change-feed integration and Flutter-parity path.

- [x] **M03-T03** — Build the SQLite transaction and outbox repository (PR #34)
  - Depends on: M03-T01, M03-T02 · Output: versioned SQLite schema/migrations, repository API, and recovery report.
  - Scope: make local mutations and pending sync operations durable together, with account isolation and private-draft handling.
  - Acceptance:
    - A save commits the local mutation and its pending operation in one SQLite transaction; failed transactions leave neither partially visible.
    - Migrations, interrupted migration recovery, busy/locked handling, disk-full, corruption, and process termination have reproducible tests against a real SQLite database.
    - Account-scoped records cannot be read after switching accounts; logout/account switching clearly surfaces pending shared work and private drafts.
    - Pending operations, attachments, and private drafts are never evicted as cache data. Retention and deletion require explicit, tested policy.
    - Repository commands preserve the domain service as authority. Any new server-side domain feature names its change-feed integration and Flutter-parity path.

- [x] **M03-T04** — Implement the selected authorized change feed for the pilot domain (PR #35)
  - Depends on: M00 change-feed decision record, M03-T01, M03-T03 · Output: server feed, migrated pilot-domain writers, durable consumer checkpoint/replay design, and operational rollback runbook.
  - Scope: implement the M00-selected mechanism for one explicitly named pilot domain and migrate every inventoried writer for that domain in the same release.
  - Acceptance:
    - Feed ordering is commit-safe under late and concurrent commits; cursor advancement cannot skip a transaction that commits late.
    - Feed reads are incrementally bounded, tenant- and permission-authorized, redacted to the caller's scope, and tested against cross-tenant and revoked-access cases.
    - Every pilot-domain writer identified in the M00 router/job/import inventories emits a sync-visible change atomically with its authoritative mutation; an audited writer list records migrated and intentionally excluded writers.
    - Consumers persist checkpoints durably and safely reapply duplicate or replayed batches; crash/restart tests cover checkpoint loss, duplicate delivery, and lost acknowledgements.
    - Financially effective commands retain durable receipts beyond the 30-day default with compaction; expiry cannot enable replayed business effects.
    - Operational monitoring, retention limits, failure behavior, rollback, and recovery follow the ratified decision record. The PR identifies the Flutter repository/parity task that consumes the feed.

- [ ] **M03-T05** — Add snapshot bootstrap, cursor persistence, and tombstones
  - Depends on: M03-T03, M03-T04 · Output: bounded snapshot/bootstrap endpoint, local apply transaction, cursor/tombstone model, and recovery tests.
  - Scope: initialize a device to a consistent server state and continue from the feed without losing pending local work.
  - Acceptance:
    - Snapshot data and its watermark represent one consistent state; ordering and maximum response bytes are bounded and deterministic.
    - Applying a snapshot batch and persisting its cursor occur in one local transaction; interruption cannot advance the cursor ahead of applied data.
    - Deletes and scope changes are represented with tombstones or an equivalent safe mechanism; stale rows cannot reappear after replay.
    - Expired/invalid cursors trigger a safe rebootstrap that preserves and reconciles pending local work instead of discarding it.
    - Tests cover pagination boundaries, concurrent writes during bootstrap, duplicate pages, tombstones, interrupted apply, and expired cursors. The Flutter consumer and its parity evidence are named in the implementation PR.

- [ ] **M03-T06** — Stage and resume attachment transfers
  - Depends on: M03-T03, M03-T04 · Output: durable attachment staging/finalization protocol, reconciliation journal, and interruption tests.
  - Scope: transfer attachment bytes independently from domain acceptance while keeping registration and file durability consistent.
  - Acceptance:
    - The client stages bytes, computes and verifies a digest, durably finalizes storage, and only then registers the attachment with the server.
    - Interrupted file/database transitions are recoverable through a reconciliation journal; orphaned or partial objects are not exposed as complete attachments.
    - Resume works after app launch, foregrounding, and manual sync; OS background transfer is an opportunity and is not the only recovery path.
    - Retry, rejection, revoked access, insufficient storage, and digest mismatch preserve pending data and expose a recoverable state.
    - Integration tests use real local storage and the disposable server/object fixture, and record the Flutter attachment path and parity contract.

- [ ] **M03-T07** — Orchestrate foreground/background sync and typed command outcomes
  - Depends on: M03-T02, M03-T03, M03-T04, M03-T05, M03-T06 · Output: versioned sync envelope, orchestration policy, and state-transition tests.
  - Scope: coordinate ordered pending operations, retries, dependencies, network/power conditions, and response handling across native and browser clients.
  - Acceptance:
    - Each command envelope carries protocol version, operation/device identity, scope claims, payload digest, and dependency identity as specified by v3 §5.3; server claims are revalidated authoritatively.
    - Outcomes distinguish accepted, previously accepted, conflict, rejected, revoked, authentication required, dependency blocked, and retryable states.
    - Retries are bounded with jitter and preserve idempotency; dependent operations do not overtake prerequisites. Push notifications act only as hints.
    - Foreground sync works without OS background scheduling. Background attempts respect platform/network/power constraints and cannot lose pending work.
    - Native and browser tests cover matching response semantics, conflicts, revocation, expired login, duplicate delivery, lost acknowledgement, and dependency ordering. Any added server-side domain feature identifies its feed and Flutter-parity path.

- [ ] **M03-T08** — Wire sync and native crash observability
  - Depends on: M03-T02, M03-T04, M03-T07 · Output: Dart/native/Rust crash reporting, server sync metrics, and a device sync-health surface.
  - Scope: make sync health observable now so M04 fault evidence can be diagnosed.
  - Acceptance:
    - Dart, native, and Rust panic/crash paths report sanitized diagnostics without credentials, private drafts, or sensitive payloads.
    - Server metrics expose sync requests, accepted/replayed/rejected/conflicted outcomes, feed lag, checkpoint age, and attachment retry/error counts with tenant-safe aggregation.
    - The device surface exposes pending-operation count, oldest pending age, last accepted cursor per scope, and rejection reasons without presenting a false success state.
    - A staged rejection/retry scenario is visible from device state through server telemetry; tests or recorded fixture evidence verify each transition and data redaction.
    - The Flutter parity surface and any server-side event/change-feed mapping are documented in the implementation packet.

- [ ] **M03-T09** — Prove transaction and network fault-boundary recovery
  - Depends on: M03-T03…T08 · Output: automated fault matrix using real SQLite and disposable PostgreSQL, with reproducible reports.
  - Scope: exercise failures across local commit, server acceptance, feed delivery, checkpoint persistence, attachment transfer, and device recovery.
  - Acceptance:
    - Tests prove no lost accepted operation, no duplicate business effect, no cross-tenant disclosure, and safe recovery at each covered transaction/network boundary.
    - Scenarios include duplicate/reordered delivery, lost acknowledgement, late server commit, expired cursor, checkpoint loss/replay, concurrent devices, permission revocation, attachment interruption, process termination, disk full, and interrupted migration.
    - Durability evidence uses real SQLite and disposable PostgreSQL; mocks may supplement but never substitute for these checks.
    - Failures report operation/device/cursor identifiers in sanitized form and demonstrate a deterministic recovery action.
    - The packet links the corresponding Flutter parity tests and identifies any server-side domain writers covered by the feed.

- [ ] **M03-T10** — 👤 GATE — M03 exit evidence and owner decision
  - Depends on: M03-T01…T09 and M04 task-level refinement PR · Output: `[M03-GATE]` evidence packet, M04 task register, and owner decision.
  - Acceptance:
    - Every M03 task is ticked with a PR reference and links to reproducible evidence; all M03 exit claims are supported by real SQLite and disposable PostgreSQL results.
    - A staged rejection/retry scenario is demonstrated across device state and server telemetry; privacy/redaction evidence is included.
    - M04 is refined to task level through a separate `[PLAN-AMEND]` PR before this gate PR opens (protocol R9).
    - Only the repository owner approves and merges this gate under protocol R8.

## Refinement contract

Before the M03 gate PR opens, M04 is refined from work-package level to `M04-Tnn` tasks with scope, outputs, dependencies, and testable acceptance criteria via a `[PLAN-AMEND]` PR (protocol R9). Far-future milestones stay coarse until evidence supports their refinement.
