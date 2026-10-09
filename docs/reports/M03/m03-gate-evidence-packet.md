# [M03-GATE] Evidence packet — Native identity, repositories & sync engine

- **Milestone:** M03 — ALL 10/10 tasks ticked with PR references (T01–T09 implementation PRs #32–#40; this gate is PR #42)
- **Gate decision requested:** owner approval + merge of THIS PR under protocol R8 (the only approval this packet needs; nothing in M03 is self-approved)
- **Precondition satisfied:** M04 refined to task level via `[PLAN-AMEND]` PR #41 (merged before this gate PR opened, per protocol R9)
- **Date:** 2026-10-09

---

## 1. Exit-claim → evidence map (every claim has a runnable source)

| Register item | Delivers | PR | Package | Test evidence (engine) |
|---|---|---|---|---|
| M03-T01 | Native adapter pipeline (identity stage; transport envelope discipline) | #32 | `packages/native_adapter` | contract tests (per PR #32 packet) |
| M03-T02 | Native identity & device lifecycle (system-browser PKCE, secure storage, pending-work gate) | #33 | `packages/native_identity` | 26/26 node:test; PKCE/security/redaction matrix |
| M03-T03 | SQLite transaction + outbox repository (durable pending ops, drafts, attachment state) | #34 | `packages/native_outbox` | node:test vs REAL SQLite incl. SIGKILL harness |
| M03-T04 | Authorized commit-safe change feed (pilot domain) | #35 | `packages/native_sync_feed` | node:test vs REAL SQLite incl. SIGKILL + replay |
| M03-T05 | Snapshot bootstrap, cursor persistence, tombstones | #36 | `packages/native_snapshot` | 20/20 node:test vs REAL SQLite, 2 SIGKILL children |
| M03-T06 | Attachment staging/resume + reconciliation journal | #37 | `packages/native_attachment` | 22/22 node:test, real on-disk store + disposable server fixture, 4 SIGKILL scenarios |
| M03-T07 | Sync orchestration + the eight typed outcomes | #38 | `packages/native_orchestrator` | 19/19 node:test, REAL SQLite source+ledger, real server service in-loop |
| M03-T08 | Sync + native crash observability | #39 | `packages/native_observability` | 18/18 node:test, REAL SQLite health read model, tenant-safe metrics, staged transitions |
| M03-T09 | Fault-boundary matrix (real SQLite + disposable PostgreSQL) | #40 | `packages/native_faultmatrix` | 16 matrix legs: 12 SQLite + 4 PostgreSQL, ALL GREEN in CI with live `postgres:16` |

Design-decision records produced: [identity-device-design.md](identity-device-design.md) (M03-T02), plus per-task recovery reports: [sqlite-outbox-recovery.md](sqlite-outbox-recovery.md), [sync-feed-pilot.md](sync-feed-pilot.md), [snapshot-bootstrap.md](snapshot-bootstrap.md), [attachment-staging.md](attachment-staging.md), [sync-orchestration.md](sync-orchestration.md), [sync-observability.md](sync-observability.md), [fault-matrix.md](fault-matrix.md) (CI emits the per-run matrix to `fault-matrix-results.md`).

## 2. Engine statement (the register's durability rule)

Every M03 durability claim is backed by REAL engines: **real SQLite** (`node:sqlite`, WAL + synchronous=FULL) in every package suite including SIGKILL child-process scenarios, two-connection concurrency, and `max_page_count` disk-full; **disposable PostgreSQL** (`services: postgres:16` in CI, pinned MIT `pg@8.16.3`) for the server-side concurrent-writer legs of the M03-T09 matrix (transactional acceptance, exactly-once under the same-op race, GREATEST-guarded cursor monotonicity, terminated-backend rollback) — all four legs GREEN in the CI run that merged PR #40. Mocks appear nowhere as the sole proof of a durability claim.

## 3. The staged rejection/retry scenario (device state ↔ server telemetry)

The register's staged scenario is demonstrated end-to-end with device state and server telemetry moving TOGETHER: retryable → retryable → accepted (M03-T08 report §5: device health `synced:false` with 1 pending and retryable counters rising, then `synced:true` with the cursor at the commit-order seq and `accepted:1`), and the rejection stage (conflict visible on BOTH surfaces, recovery re-accepting). The M03-T09 matrix legs independently prove the underlying boundaries (duplicate/reordered delivery, lost acknowledgement, late commit, expired cursor, checkpoint loss/replay). **Privacy/redaction evidence**: the M03-T08 suite pins that crash contexts never export credentials, private drafts, or payload bodies (drop-first allow-list, redact-then-cap, frame-count-only), that global server metrics structurally carry no tenant identifiers, and that device health/metrics surfaces never contain payload sentinels; the M03-T07 suite pins sanitized outcome details.

## 4. Owner ratification items (design decisions recorded per the M03-T02 contract)

The following decisions were recorded during M03 and are presented here for explicit owner ratification at this gate (each links its record):

1. **System-browser sign-in** (authorization code + PKCE; no WebView anywhere) — [identity-device-design.md §2](identity-device-design.md)
2. **Server-enforced session semantics**: rotation families, reuse → family revocation → client credential wipe (pending work preserved) — §3
3. **Device identity = infrastructure** (registration, removal revokes all device sessions) — §4
4. **Secure credential storage fails CLOSED**; no disk fallback — §5
5. **Pending work is never silently discarded** (logout/device-removal/account-switch gates; tombstone/reconcile protection) — §6
6. **Attachment protocol**: local digest verify at both boundaries → durable finalize → server registration; server-authoritative upload offsets; typed recoverable failures — [attachment-staging.md](attachment-staging.md)
7. **Orchestration policy constants**: maxAttempts=8, FULL-jitter backoff, suspend-at-cap, hints-as-hints — [sync-orchestration.md](sync-orchestration.md)
8. **Observability redaction vocabulary** (drop-first allow-list; tenant-safe aggregation) — [sync-observability.md](sync-observability.md)
9. **M04 task-level refinement** (informational, already merged): PR #41 — M04-T01…T09 with the attachment-download-contract and telemetry-as-proposal items made explicit.

## 5. Register state

- M03: **10/10** — T01–T09 as in §1; T10 ticked with THIS PR reference (#42).
- Program: **56/131** after this gate (M00 21/21, M01 17/17, M02 8/8, M03 10/10, M04 0/9 refined, M05–M12 WP level).
- Protocol linter: PASS (checkbox/PR-reference/rollup consistency).
- CI: all gates green on the merged implementation PRs (#32–#40); the M03-T09 matrix runs on every `lint_and_protocol` run with live disposable PostgreSQL.

## 6. What the owner is asked to do

1. Review this packet (and any linked report it raises questions about).
2. Ratify the §4 design decisions (or request changes — each names its record so amendments are cheap).
3. Approve and merge THIS PR (`[M03-GATE]`) under protocol R8. The merge IS the gate decision; M05 refinement and the M04 implementation sequence then unlock per the dependency graph.
