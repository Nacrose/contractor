# M03 — Native identity, repositories and sync engine

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M03, §5.2 local durability, §5.3 synchronization, §5.4 conflicts. Dependencies: M02. Hardest subsystem of the program (v3 §6.0). Registered at **WP level** — refine before the M02 gate opens.

Exit (v3): real SQLite + disposable PostgreSQL tests prove no lost accepted operation, no duplicate business effect, no cross-tenant disclosure and safe recovery at each transaction/network failure boundary. No mocks as sole durability evidence. Sync telemetry visible end-to-end.

---

- [ ] **M03-W01** — Versioned native-facing API adapter around existing domain services
  - Acceptance sketch: adapter defined against the pinned platform-contracts version, not tRPC internals (v3 §4); all guards currently supplied by tRPC middleware inventoried and preserved (v3 §6 M03).

- [ ] **M03-W02** — Native identity: login/session rotation/revocation, device registration, secure credential storage
  - Acceptance sketch: system-browser login if selected; browser httpOnly-cookie/CSRF protections kept; no weakened origin checks; no secrets in binaries (v3 §6 M03).

- [ ] **M03-W03** — Local transaction/outbox repository: SQLite migrations, recovery, account isolation, private drafts
  - Acceptance sketch: save = one SQLite transaction covering mutation + pending operation (v3 §5.2); corruption/disk-full handling; pending ops/attachments/private drafts never evictable as cache; logout/account-switch surfaces unsynchronized work.

- [ ] **M03-W04** — Change feed build-out on the M00-selected mechanism
  - Acceptance sketch: durable operation identity; authorized commit-safe incremental feed; **all writers for the pilot domain migrated in the same release**; durable consumer checkpoints + duplicate-delivery recovery per the M00 decision record; financially effective commands keep durable receipts beyond the 30-day default with compaction, not expiry-driven replay risk (v3 §6 M03, §5.3).

- [ ] **M03-W05** — Snapshot bootstrap, cursor persistence, tombstones, dependency handling
  - Acceptance sketch: consistent-state snapshot + watermark; batch+cursor applied in one local transaction; bounded bytes + deterministic ordering; expired cursor → safe rebootstrap preserving pending local work (v3 §5.3).

- [ ] **M03-W06** — Attachment staging/retry: resumable transfers
  - Acceptance sketch: stage bytes → digest → durable finalize → register; interrupted file/DB transitions recovered via reconciliation journal; resume on app launch/foreground/manual sync plus OS background opportunities (v3 §5.2, §5.3).

- [ ] **M03-W07** — Sync orchestration: foreground/background, typed command envelope, response states
  - Acceptance sketch: envelope per v3 §5.3 (protocol version, operation/device ID, scope claims, digest…); response states distinguish accepted/previously-accepted/conflict/rejected/revoked/auth-required/dependency-blocked/retryable; bounded retries with jitter; push notifications are hints only.

- [ ] **M03-W08** — Observability wired now (moved forward from M11)
  - Acceptance sketch: crash/panic reporting for Dart, native and Rust surfaces; server sync API metrics; device sync-health surface (pending-op count, oldest pending age, last-accepted cursor per scope, rejection reasons) — development dependency of M04 evidence (v3 §6 M03).

- [ ] **M03-W09** — Fault-boundary test suite: real SQLite + disposable PostgreSQL
  - Acceptance sketch: no lost accepted operation, no duplicate business effect, no cross-tenant disclosure, safe recovery at each transaction/network failure boundary; duplicate/reordered/lost-ack/late-commit/expired-cursor/checkpoint-loss-replay/concurrent-device scenarios from v3 §8.

- [ ] **M03-W10** — 👤 GATE — M03 exit evidence
  - Acceptance sketch: all WPs ticked with fault evidence; telemetry demonstrated against a staged rejection/retry scenario (v3 §8 observability row); M04 refined to task level in the gate; owner approval per protocol R8.

## Refinement contract

Before `M02-W08` merges, this file is refined to `M03-Tnn` tasks with testable acceptance criteria (protocol R9). Standing constraint to carry in: every new server-side domain feature from M03 onward names its change-feed integration and Flutter-parity path in its task packet (v3 §10).
