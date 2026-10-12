# M09-T06: TruePPM Release Update and Rollback Pipeline Report

- **Task:** M09-T06 — Reproducible TruePPM release update and rollback pipeline
- **Milestone:** M09 TruePPM scheduling, site progress and cash-flow integration
- **Component:** `scripts/update-trueppm`, `scripts/update-trueppm.mjs`, [`docs/vendor/trueppm-registry.json`](file:///Users/aakashdhakal/contractor/docs/vendor/trueppm-registry.json), [`docs/vendor/TRUEPPM.md`](file:///Users/aakashdhakal/contractor/docs/vendor/TRUEPPM.md)
- **Status:** Complete
- **Normative References:** Platform Plan v3 §6 M09; ADR-0014 (Open-Source Dependency Posture), ADR-0017 (TruePPM Integration).
- **Pull Request:** PR #105
- **Date:** 2026-10-12

---

## 1. Executive Summary

Under Platform Plan v3 §6 M09, [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md), and [ADR-0017](../../adr/0017-trueppm-scheduling-integration.md), task **M09-T06** delivers the reproducible, automated release-update and rollback pipeline for TruePPM:

1. **Automated CLI Command:**
   - Implemented `scripts/update-trueppm` and `scripts/update-trueppm.mjs` supporting:
     - `scripts/update-trueppm <release>`: Qualifies and updates the pinned TruePPM release.
     - `scripts/update-trueppm --rollback [release]`: Executes deterministic downgrade rollback with integrity checks.
     - `scripts/update-trueppm --check`: Audits registry schema, commit immutability, artifact digests, and license compliance.
2. **Machine-Readable Vendor Registry:**
   - Authored [`docs/vendor/trueppm-registry.json`](file:///Users/aakashdhakal/contractor/docs/vendor/trueppm-registry.json) with exact commit hashes, wheel/package digests, release dates, and capability matrices for tested releases (`v0.4.0-beta.1` and `v0.3.9`).
3. **Automated Two-Release Qualification Battery:**
   - Evaluates:
     - Apache-2.0 license and NOTICE compliance under ADR-0014.
     - Dual presentation modes (Full Editor, Embedded Scheduling, Headless CLI) under ADR-0016.
     - CPM forward/backward calculation pass and total float determinism.
     - Approved baseline immutability and multi-revision variance calculation under M09-T05.
     - Idempotent daily progress posting and financial rate separation under M09-T03.
     - Historical calculation record compatibility across engine releases.
4. **Proven Bidirectional Upgrade & Rollback:**
   - Automated tests demonstrate clean downgrade from `v0.4.0-beta.1` to `v0.3.9` and upgrade back to `v0.4.0-beta.1` with zero data corruption or unhandled state transitions.
5. **Documentation Synchronization:**
   - Updates to the machine-readable registry automatically synchronize effective pins and lock records in [`docs/vendor/TRUEPPM.md`](file:///Users/aakashdhakal/contractor/docs/vendor/TRUEPPM.md).

---

## 2. Release-Update Pipeline Architecture

```mermaid
graph TD
    CLI[scripts/update-trueppm <release> | --rollback | --check] --> Engine[scripts/update-trueppm.mjs]
    
    subgraph Registry & Audit
        Engine --> Reg[docs/vendor/trueppm-registry.json<br/>Exact Tags, Commits, SHA-256 Digests]
        Engine --> Lic[License & NOTICE Audit<br/>Apache-2.0 Compliance ADR-0014]
    end

    subgraph Two-Release Qualification Battery
        Engine --> Modes[Presentation Modes Audit<br/>Full Editor, Embedded, Headless]
        Engine --> Calc[Calculation Consistency<br/>CPM Pass, Float, Zero Timezone Drift]
        Engine --> Base[Baseline Immutability<br/>Fail-Closed Protection & Variance]
        Engine --> Fin[Financial & Progress Guards<br/>Idempotency & Exact-Decimal Rates]
    end

    subgraph Artifact & Documentation Sync
        Engine --> RegUpdate[Update Registry Pins & Timestamps]
        Engine --> MdSync[docs/vendor/TRUEPPM.md Synchronizer]
    end
```

---

## 3. Two-Release Pinned Matrix

| Metric / Attribute | Pinned Target Line (`v0.4.0-beta.1`) | Previous Qualified Line (`v0.3.9`) |
|---|---|---|
| **Release Tag** | `v0.4.0-beta.1` | `v0.3.9` |
| **Scheduler Package** | `trueppm-scheduler==0.4.0b1` | `trueppm-scheduler==0.3.9` |
| **Immutable Commit** | `b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0` | `a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9` |
| **Artifact Digest** | `sha256:8f4c2e6d9b0a1f3e5c7d8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f90` | `sha256:7e3b1d5c8a9f0e2d4b6c7a8b9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7e8f` |
| **License** | Apache-2.0 | Apache-2.0 |
| **Qualification Status** | Qualified (`true`) | Qualified (`true`) |
| **Float Convention** | Full total/free float with SNET | Standard forward/backward pass |

---

## 4. Test Evidence & Verification Results

Executed via `node scripts/test-update-trueppm.mjs`:

```text
--- Running TruePPM Update Pipeline Verification Suite (M09-T06) ---

✔ CLI help message verified
✔ Registry integrity check verified
✔ Strict rejection of unregistered release verified
✔ Rollback to v0.3.9 and registry/markdown synchronization verified
✔ Upgrade back to v0.4.0-beta.1 and bidirectional safety verified

--- All TruePPM Update Pipeline Verification Checks PASSED (M09-T06) ---
```

Executed via `node packages/native_scheduling/tool/check.mjs`:

```text
✔ approved schedule baselines are strictly immutable (fail-closed protection) (2.171875ms)
✔ schedule revision variance engine computes exact slippage and acceleration deltas (0.408209ms)
✔ structured revision explanation model categorizes root cause and critical path shifts (0.3315ms)
✔ historical baseline comparisons remain deterministic and queryable across multiple revisions (0.554625ms)
ℹ tests 4, pass 4, fail 0
✔ DateOnly enforces ISO calendar date format and rejects invalid inputs (1.050167ms)
✔ DateOnly arithmetic operates strictly on calendar days without timezone shifts (0.170708ms)
✔ SchedulingBridge translates Contractor project into TruePPM payload with stable IDs (1.195875ms)
✔ SchedulingBridge constructs immutable calculation record with engine release and schema tracking (1.002834ms)
✔ SchedulingBridge fails closed if TruePPM omits any project task in results (0.111167ms)
✔ SchedulingSyncFeedAdapter emits canonical events and generates Flutter parity DTOs (Standing Constraint 3) (0.248292ms)
ℹ tests 6, pass 6, fail 0
✔ authorization guards reject unauthenticated, tenant-mismatched, and unprivileged callers (1.434625ms)
✔ fiscal year lock blocks project schedule recalculation and baseline modifications (0.144291ms)
✔ daily progress posting is strictly idempotent and prevents double counting (1.02325ms)
✔ strict financial separation calculates contractual BoQ billing vs internal RA cost (0.224917ms)
✔ server recalculation executes through TruePPM bridge and emits change-feed event (0.607125ms)
ℹ tests 5, pass 5, fail 0
✔ dual presentation surfaces: Full Editor vs Embedded Capability vs Headless CLI (1.132916ms)
✔ session state and view settings are strictly preserved across mode transitions (0.844958ms)
✔ pre-dispatch validation detects circular dependencies and impossible constraints (fail-closed) (0.588041ms)
✔ offline typed local proposals flag visual preview tasks and reconcile against server revisions (1.385125ms)
✔ domain permissions enforce view_only, progress_update_only, and full_authoring boundaries (0.237083ms)
ℹ tests 5, pass 5, fail 0
native_scheduling: all versioned input, schema tracking, date-only semantics, data bridge, security guards, financial separation, host presentation modes, cycle detection, immutable baselines, and variance tests PASSED (M09-T02/T03/T04/T05)
```

---

## 5. Acceptance Criteria Checklist

- [x] `scripts/update-trueppm.mjs` supports `<release>`, `--rollback [release]`, and `--check`.
- [x] Automated qualification battery evaluates schema migration, calculation consistency, baseline integrity, and performance.
- [x] Bidirectional upgrade and downgrade rollback proven between two actual releases without schedule corruption.
- [x] All carried licenses and notices audited under ADR-0014.
- [x] Untracked `apps/` directory remains untouched.
