# M11-T05: Signed Update Verification, Staged Rollout & Schema Rollback Recovery

- **Milestone:** M11 (Recovery, Packaging and Staged Release)
- **Task:** `M11-T05` — Signed update verification, staged rollout channels & schema rollback recovery (derived from `M11-W05`)
- **Status:** Complete · Cryptographic update verification active, staged rollout rings codified, and rollback outbox preservation verified
- **Normative References:** Platform Plan v3 §6 M11, §8 release row; AI-Agent Execution Protocol R2, R8, R9, R13; ADR-0010 (Progressive Extension), `M10-T03` (Cutover Gateway), `M11-T04` (Packaging Pipeline).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M11-T05` establishes Contractor's production auto-update delivery pipeline, ensuring that binary updates are cryptographically authenticated before extraction, rolled out progressively across release rings, and backed by a zero-loss rollback path.

As mandated by **Platform Plan v3 §6 M11**:
> *"Implement signed update verification, staged rollout, schema/protocol compatibility and a recovery path for failed upgrades. Rollback must not destroy pending commands or apply an old binary to an incompatible local schema."*

### Key Guarantees Implemented
1. **Cryptographic Signature Verification:** Auto-update packages are validated against trusted root publisher public keys and SHA-256 package digests prior to disk extraction; tampered or unverified packages are rejected fail-closed.
2. **Staged Rollout Rings:** Releases deploy progressively through three deterministic rings: `Internal Canary` (5%), `Pilot Beta` (25%), and `General Availability` (100%), with stable device hash bucketing.
3. **Schema Compatibility Enforcement:** Binary updates check target schema versions against local SQLite database catalogs. Applying an older binary to an upgraded database schema is strictly blocked (`IncompatibleUpdateSchemaError`).
4. **Outbox Command Preservation:** If an update fails during installation or health checks, the rollback engine snapshots and preserves all un-synced offline outbox commands, preventing data loss for field users working in disconnected zones.
5. **Atomic Binary Rollback:** Reverts execution to the previous verified binary without corrupting local configurations or cached project documents.

---

## 2. Cryptographic Update Verification Workflow

```
             [Release Server: update-manifest.json]
                                │
                                ▼
            [SignedUpdateVerificationEngine.verify()]
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
      SHA-256 Digest Match?             Publisher Signature Valid?
      (Tampered bytes -> ERROR)         (Untrusted key -> ERROR)
              │                                   │
              └─────────────────┬─────────────────┘
                                ▼
                   Schema Version Compatible?
                   (Target >= Local DB Schema)
                                │
                                ▼
                    [SAFE EXTRACTION & APPLY]
```

---

## 3. Staged Rollout Ring Allocation

To prevent catastrophic fleet-wide disruptions from undetected edge-case bugs, update manifests are published with targeted rollout rings:

| Rollout Ring | Cohort Percentage | Target Audience | Promotion Criteria |
| :--- | :---: | :--- | :--- |
| **INTERNAL_CANARY_5** | 5% | Internal Contractor core engineering team | Zero crash reports after 24 hours of live field use |
| **PILOT_BETA_25** | 25% | Designated contractor pilot sites (Hydropower & Road JV projects) | Crash-free session rate $> 99.5\%$, sync lag $< 5\text{ s}$ |
| **GA_100** | 100% | General customer fleet across web, desktop, and mobile | Formal release officer approval |

### Deterministic Hash Bucketing:
```typescript
const hashHex = createHash('sha256').update(`${deviceId}:${manifestVersion}`).digest('hex');
const bucket = parseInt(hashHex.substring(0, 4), 16) % 100;
return bucket < ringThreshold;
```
This guarantees that a given device remains consistently inside or outside an update ring without flapping between builds.

---

## 4. Rollback Recovery & Outbox Preservation

When a client detects an unrecoverable crash or startup panic following an auto-update:

1. **Outbox Command Snapshot:** The `UpdateRollbackRecoveryEngine` inspects the local sync outbox and captures all pending offline transactions (e.g. daily logs, takeoff sheets, muster rolls).
2. **Binary Restoration:** The operating system launcher replaces the faulted executable with the known-good previous binary.
3. **Database Guard Check:** Asserts that the failed update did not mutate the local SQLite schema (`localSchemaIntact === true`).
4. **Resumed Field Operation:** The user is immediately returned to normal offline operation with all 100% of pending outbox mutations intact and queued for cloud sync.

---

## 5. Automated Test Execution Evidence

All update verification, ring eligibility, and rollback behaviors were verified by automated tests in `packages/native_recovery/test/update_verification.test.ts`:

```bash
$ node packages/native_recovery/tool/check.mjs
✔ SignedUpdateVerificationEngine: verifies valid signed update package and validates schema (1.141ms)
✔ SignedUpdateVerificationEngine: detects tampered update payload fail-closed (0.250ms)
✔ SignedUpdateVerificationEngine: detects invalid signature and blocks schema downgrade (0.155ms)
✔ StagedRolloutRingController: enforces deterministic ring eligibility thresholds (0.294ms)
✔ UpdateRollbackRecoveryEngine: preserves local un-synced outbox mutations upon failed update (0.106ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
ℹ duration_ms 6.72ms
...
native_recovery: all vault backup and independent restore drill tests PASSED (M11-T01)
```

The package maintains 24/24 passing tests across vault backups, RPO/RTO metrics, key escrow, failure matrix, packaging pipelines, and update verification.
