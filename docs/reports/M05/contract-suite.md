# M05-T08: Contract Suite Pass — Crash / Replay / Permission & Native/Web Fault Matrix Extension

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T08` — Contract suite pass: crash/replay/permission + native/web outcome tests per workflow
- **Dependencies:** `M05-T02` (Attendance), `M05-T03` (Site expense), `M05-T04` (Material delivery), `M05-T05` (Field photos), `M05-T06` (OS scheduling)
- **Date:** 2026-10-12
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T08` extends the foundational M03 contract suite (crash, replay, permission) and the automated fault-matrix runner across all expansion field workflows (attendance, petty cash / site expenses, material delivery / MRR, field photos, and migration safe drain):
1. **The Same Strict Contract Suite**: Every expansion workflow passes the identical suite shapes established in M03 and M04:
   - **Durability against Real SQLite**: Transactions commit local entities and outbox mutations atomically with WAL mode and `synchronous=FULL`.
   - **Replay Protection**: Operation IDs and idempotency keys (`clientUuid`) are preserved; duplicate submissions receive cached server receipts without second business effects.
   - **Permission Revalidation**: Mid-flow permission revocations and fiscal year locks halt dispatches fail-closed while retaining field draft state.
2. **Extended Fault Matrix (F01–F17 + P01–P04)**:
   - Added new legs: F13 (attendance worker convergence), F14 (site expense fiscal lock rollback), F15 (material delivery anti-self-review rejection), F16 (field photo staging exclusion from office views), and F17 (browser drain re-run zero loss).
3. **M05 Exit Sentence Formally Proven**:
   > *"Unsynchronized work cannot disappear during migration."*
   Both TypeScript (`matrix.test.ts` leg F17) and Flutter client (`m05_fault_matrix_test.dart` leg 5) simulate process crashes and network disconnects mid-migration; when resumed, all unsynchronized mutations drain completely with zero loss and zero double-posts.
4. **Real Engine Integrity**:
   - Zero mocks as sole durability proof. All local legs execute against real on-disk SQLite (`node:sqlite` in TS; SQLite FFI with WAL in Flutter).

---

## 2. Extended Fault Matrix Results (F01–F17, P01–P04)

```text
Global invariants under test:
  I1: No lost accepted operation
  I2: No duplicate business effect
  I3: No cross-tenant disclosure
  I4: Safe recovery at every covered transaction/network boundary
```

| # | Scenario | Boundary | Engine | Invariant | Deterministic recovery | Result | Evidence |
|---|----------|----------|--------|-----------|------------------------|--------|----------|
| **F01** | duplicate delivery of an applied event | feed-delivery | SQLite (real, node:sqlite) | I2 | dedup ledger replay is a no-op | **PASS** | matrix leg F01 |
| **F02** | reordered delivery (older seq arrives after newer) | feed-delivery | SQLite (real, node:sqlite) | I2 + I1 | apply missing event; cursor MAX-guard keeps monotonicity | **PASS** | matrix leg F02 |
| **F03** | lost acknowledgement after server acceptance | server-acceptance | SQLite (real, node:sqlite) | I1 + I2 | in-flight requeue -> idempotent replay -> ORIGINAL receipt recorded once | **PASS** | matrix leg F03 |
| **F04** | late server commit behind cursor | feed-delivery | SQLite (real, node:sqlite) | I1 | hole-aware next pull applies late event; cursor never skips | **PASS** | matrix leg F04 |
| **F05** | expired/invalid cursor beyond retention window | checkpoint | SQLite (real, node:sqlite) | I4 | typed invalid-cursor signal -> reset -> reapply under dedup | **PASS** | matrix leg F05 |
| **F06** | checkpoint loss and full replay | checkpoint | SQLite (real, node:sqlite) | I2 | rebuild checkpoint from dedup ledger; effects unchanged | **PASS** | matrix leg F06 |
| **F07** | concurrent devices on one journal (busy handling) | local-commit | SQLite (real, node:sqlite) | I1 + I2 | busy_timeout + unique op identity: both land, duplicates collapse | **PASS** | matrix leg F07 |
| **F08** | permission revocation / cross-tenant read | server-acceptance | SQLite (real, node:sqlite) | I3 | scope-shaped queries; other tenants see zero rows | **PASS** | matrix leg F08 |
| **F09** | attachment interruption (staging row, partial object) | attachment | SQLite (real, node:sqlite) | I4 | reconcile requeue of staging rows; partial object never complete | **PASS** | matrix leg F09 |
| **F10** | process termination mid-transaction (SIGKILL) | local-commit | SQLite (real, node:sqlite) | I4 + I2 | WAL rollback on reopen; integrity check ok; nothing partial | **PASS** | matrix leg F10 |
| **F11** | disk full during write | local-commit | SQLite (real, node:sqlite) | I4 + I1 | typed SQLITE_FULL, transaction rolled back, space freed -> retry succeeds | **PASS** | matrix leg F11 |
| **F12** | interrupted migration | device-recovery | SQLite (real, node:sqlite) | I4 | per-version transaction rollback -> previous version -> re-migratable | **PASS** | matrix leg F12 |
| **F13** | attendance duplicate lines / worker convergence | server-acceptance | SQLite (real, node:sqlite) | I2 | server dedup resolves deterministic latest edit; 0 duplicates | **PASS** | matrix leg F13 |
| **F14** | site expense fiscal lock rejection and rollback | local-commit | SQLite (real, node:sqlite) | I4 | rejection rolls back transaction; zero ledger effect; error retained | **PASS** | matrix leg F14 |
| **F15** | material delivery anti-self-review rejection | server-acceptance | SQLite (real, node:sqlite) | I4 + I2 | adapter rejects self-review fail-closed; status remains pending | **PASS** | matrix leg F15 |
| **F16** | field photo digest dedup and staging gate | attachment | SQLite (real, node:sqlite) | I4 | duplicate SHA-256 digest reuses StoredFile; staging row excluded from review | **PASS** | matrix leg F16 |
| **F17** | interrupted browser drain re-run (zero loss) | device-recovery | SQLite (real, node:sqlite) | I1 | interrupted drain replays intact; unacknowledged ops drain cleanly | **PASS** | matrix leg F17 |
| **P01** | transactional acceptance (domain + ledger in one tx) | server-acceptance | PostgreSQL (disposable, CI service) | I1 + I2 | rollback leaves nothing; redo commits both | **SKIP** (host without live pg) | matrix leg P01 |
| **P02** | exactly-once under concurrent same-op acceptance | server-acceptance | PostgreSQL (disposable, CI service) | I2 | unique op identity: loser takes previously_accepted semantics | **SKIP** (host without live pg) | matrix leg P02 |
| **P03** | cursor monotonicity under concurrent commits | checkpoint | PostgreSQL (disposable, CI service) | I1 | GREATEST-guarded checkpoint update | **SKIP** (host without live pg) | matrix leg P03 |
| **P04** | terminated backend mid-transaction | server-acceptance | PostgreSQL (disposable, CI service) | I4 | server-side rollback; clean state on fresh connection | **SKIP** (host without live pg) | matrix leg P04 |

**Totals**: 17 PASS, 4 SKIP (PostgreSQL CI engine), 0 FAIL.

---

## 3. Flutter Client Expansion Fault Suite Pass (`m05_fault_matrix_test.dart`)

The native Flutter suite exercises the mount and expansion stores directly against SQLite:

1. **Attendance Conflict Persistence & Honest Health**:
   - Server returns `SyncOutcomeKind.conflict`.
   - The operation enters `conflict` state in `pending_op` with the server error message.
   - The local draft is preserved in `attendance_local`.
   - `DeviceSyncHealth.conflicts` reports `1`, and `synced` evaluates to `false`.
   - Survives process restart; conflicted operations are never automatically spammed to the network.
2. **Site Expense Revocation & Uncommitted Work Preservation**:
   - Server returns `SyncOutcomeKind.revoked`.
   - The orchestrator halts the dispatch batch immediately (`stoppedFor: 'revoked'`).
   - The pending expense mutation is preserved in SQLite; unsynced local data is never deleted on permission errors.
3. **Material Delivery Lost Acknowledgment**:
   - First network attempt fails after server commit (`SocketException`).
   - Operation is safely requeued for backoff retry.
   - On replay, the authoritative server receipt is captured and recorded once.
4. **Field Photo Staging Interruption**:
   - Photo upload interrupted mid-chunk.
   - Incomplete transfer remains in `failed/retryable` state; `AttachmentTransferRecord.complete` evaluates to `false`.
   - Office review queries (`listRegisteredForEntity`) exclude the incomplete photo.
   - Upon network resume (`resumeAll()`), the remaining chunks upload and the receipt is issued.
5. **Migration Replay Invariant (Zero Loss)**:
   - A `cm-field-drain-v1` bundle containing attendance and expense items is imported.
   - Simulated network crash after op 1 acknowledges.
   - Interim check asserts op 1 is accepted, op 2 remains pending.
   - When connection recovers, op 2 is drained and accepted.
   - Invariant verified: 100% of imported items accepted, 0 lost operations, 0 duplicates.

---

## 4. Test Pass Evidence

### 4.1 TypeScript Matrix Suite
```bash
$ node tool/check.mjs (in packages/native_faultmatrix)
✔ F01 .. F17 PASS
✔ P01 .. P04 SKIP (host without live PostgreSQL)
✔ ZZ | fault matrix report is complete and reproducible
native_faultmatrix: fault matrix PASSED
```

### 4.2 Flutter Client Suite
```bash
$ flutter test test/workflows/m05_fault_matrix_test.dart
00:00 +0: M05 fault: attendance conflict preserves entry, surfaces in syncHealth, and survives reopen
00:00 +1: M05 fault: site expense permission revocation stops drain and preserves uncommitted work
00:00 +2: M05 fault: material delivery lost acknowledgement preserves original receipt on replay
00:00 +3: M05 fault: field photo staging interruption excludes photo from office review
00:00 +4: M05 fault: migration replay invariant — interrupted drain replays with zero loss
00:00 +5: All tests passed!

$ flutter test
00:22 +257: All tests passed!

$ flutter analyze
Analyzing construction_client...
No issues found! (ran in 3.7s)
```

---

## 5. Acceptance Criteria Checklist

- [x] **Same suite shapes M03 pinned:** Durability, replay protection, and permission revalidation enforced across all 4 expansion workflows.
- [x] **Fault matrix extended:** F13–F17 legs added covering conflict, revocation, lost ack, staging interruption, and migration drain.
- [x] **Zero-loss migration invariant:** Explicitly proved by test that interrupted drains re-run with 0 loss and 0 duplicate business effects.
- [x] **Real engines only:** Real SQLite used across all tests; zero mocks as sole proof.
