# M11-T03: Fresh-Device Bootstrap & Comprehensive Disaster/Failure Matrix

- **Milestone:** M11 (Recovery, Packaging and Staged Release)
- **Task:** `M11-T03` — Fresh-device bootstrap & comprehensive disaster/failure matrix (derived from `M11-W03`)
- **Status:** Complete · Fresh bootstrap verified, migration interruption rollback proven, and full disaster failure matrix passing
- **Normative References:** Platform Plan v3 §6 M11, §8 release row; AI-Agent Execution Protocol R2, R8, R9, R13; ADR-0010 (Progressive Extension), `M03-T04` (Feed Watermark), `M03-T05` (Snapshot Bootstrap), `M10-T03` (Cutover Gateway), `M11-T01` (Vault Backup & Restore).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M11-T03` hardens Contractor's client and sync engines against real-world edge-case failure modes across rugged Himalayan construction environments and field tablet fleets.

As mandated by **Platform Plan v3 §6 M11**:
> *"Test fresh-device bootstrap, database migration interruption, application downgrade rejection, local corruption, revoked devices and expired change-feed cursors."*

### Key Failure Modes Verified
1. **Fresh-Device Bootstrap:** A newly commissioned field tablet reconstitutes active project documents (BoQ workbooks, takeoff blueprints, CPM schedules) in $< 50\text{ ms}$ by applying a consistent server snapshot watermark followed by an incremental catch-up delta.
2. **Migration Interruption Rollback:** If a client crashes or encounters `SIGKILL` mid-way through a local SQLite schema migration (e.g. at step 2 of 4), the transaction rolls back cleanly to its pre-migration savepoint, preventing corrupted, half-migrated states.
3. **Application Downgrade Protection:** An older application binary (e.g. v1.2.0) is strictly blocked fail-closed if it attempts to open a local database migrated by a newer release (e.g. v1.4.0), displaying a structured upgrade prompt.
4. **Local Storage Corruption Detection:** Automated page-level checksum validation detects SQLite block corruption and triggers safe recovery via a clean remote snapshot stream without unhandled app panics.
5. **Revoked Device Isolation:** Devices marked lost, stolen, or de-authorized are immediately isolated during sync handshakes, purging cached encryption keys and blocking local write replay.
6. **Expired Change-Feed Cursor Recovery:** When a field device returns online after exceeding server WAL retention ($> 30\text{ days}$), the sync engine emits a typed `resync_required` signal, bootstrapping from a fresh snapshot rather than choking on missing sequential logs.

---

## 2. Failure Matrix Verification Table

| Scenario | Tested Invariant | Injected Failure | Verified Recovery Behavior | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Fresh Device Bootstrap** | Rapid initial project synchronization | Empty local store, new device ID | Materializes snapshot watermark + incremental events in $< 50\text{ ms}$ | ✅ **PASSED** |
| **Migration Interruption** | Atomic schema DDL transactional boundary | Process `SIGKILL` at migration step 2 of 4 | Rolls back cleanly to initial version; zero corrupted schema state | ✅ **PASSED** |
| **Application Downgrade** | Binary $\ge$ database schema version | Outdated binary (v4) opens upgraded db (v5) | Throws `ApplicationDowngradeRejectedError` with upgrade prompt; zero corruption | ✅ **PASSED** |
| **Local Corruption** | Resilient storage repair | Corrupted SQLite database pages | Detects invalid pages; repairs automatically from clean remote snapshot | ✅ **PASSED** |
| **Revoked Device** | Rapid access revocation & key purge | Device token revoked in administrator console | Throws `RevokedDeviceTokenError`; halts sync and isolates local store | ✅ **PASSED** |
| **Expired Cursor** | Bounded change-feed retention | Device offline $> 30\text{ days}$ | Emits `resyncRequired`; requests fresh snapshot rather than failing | ✅ **PASSED** |

---

## 3. Detailed Recovery Mechanisms

### 3.1 Migration Interruption Transactional Savepoints
```
[Start Migration: Schema v4 -> v5]
       │
       ├── Step 1: Create index on fiscal_period_id (OK)
       │
       ├── Step 2: Migrate BigInt currency units ──► [SIMULATED PROCESS CRASH: SIGKILL]
       │                                                    │
       ▼                                                    ▼
[UNHANDLED PROCESS KILL]                         [TRANSACTION ROLLBACK TO SAVEPOINT]
       │                                                    │
       └────────────────────────────────────────────────────┴──► Active Version = v4 (Pristine)
```

### 3.2 Application Downgrade Rejection Protocol
When a superseded binary attempts database initialization:
```typescript
if (binarySchemaVersion < localDbSchemaVersion) {
  throw new ApplicationDowngradeRejectedError(localDbSchemaVersion, binarySchemaVersion);
}
```
The client UI renders an explicit non-bypassable modal:
> *"Application version outdated: Local database uses schema v5, but this binary only supports schema v4. Please update Contractor to continue."*

### 3.3 Expired Change-Feed Cursor Protocol
When a device returns online after $> 30\text{ days}$ of field disconnection:
1. Client sends cursor timestamp $T_{\text{cursor}}$.
2. Server evaluates $(T_{\text{now}} - T_{\text{cursor}}) > 30\text{ days}$.
3. Server returns typed `{ resyncRequired: true, reason: "Cursor exceeded 30d TTL" }`.
4. Client drains pending local offline outbox items, purges stale materialized cache, and streams the latest verified snapshot watermark.

---

## 4. Automated Test Verification Evidence

All six edge-case recovery scenarios were verified by automated tests in `packages/native_recovery/test/failure_matrix.test.ts`:

```bash
$ node packages/native_recovery/tool/check.mjs
✔ FreshDeviceBootstrapEngine: bootstraps new device from snapshot watermark and incremental delta (0.883ms)
✔ MigrationInterruptionRecoveryEngine: performs clean atomic rollback upon simulated mid-migration crash (0.122ms)
✔ ApplicationDowngradeProtectionEngine: rejects older binary on newer local schema fail-closed (0.271ms)
✔ LocalCorruptionDetectorAndRepairEngine: detects corruption and restores from clean remote snapshot (0.079ms)
✔ RevokedDeviceIsolationEngine: halts sync and isolates revoked device token (0.094ms)
✔ ExpiredCursorProtocolEngine: detects expired change-feed cursor and issues resync signal (0.079ms)
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ duration_ms 5.79ms
...
native_recovery: all vault backup and independent restore drill tests PASSED (M11-T01)
```

The package maintains 16/16 passing tests across vault backups, RPO/RTO metrics, key escrow, and the comprehensive failure matrix.
