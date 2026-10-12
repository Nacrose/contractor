# [M09-GATE] Evidence Packet — TruePPM Scheduling, Progress & Cash-Flow Integration

- **Milestone:** M09 TruePPM Scheduling, Progress & Cash-Flow Integration — ALL 9/9 tasks complete (T01–T08 implementation PRs #100–#107; this exit gate is PR #108).
- **Gate Decision Requested:** Owner review and decision under Protocol R8 (the only approval this packet needs; nothing in M09 is self-approved).
- **Normative References:** Platform Plan v3 §2 instruction 10, §3 scheduling/cost row, §5.1, §5.4 schedule/progress row, §6 M09 exit sentence, §7 benchmarks; AI-Agent Execution Protocol R2, R8, R9, R13; ADR-0014 (Open Source Only), ADR-0017 (TruePPM Adoption & Upstream Posture), ADR-0018 (Upstream Capabilities).
- **Date:** 2026-10-12

---

## 1. Exit-Claim → Evidence Map

Every unit of work across Milestone M09 is backed by committed code, automated test batteries, and dedicated evidence reports:

| Task | Title | PR | Primary Deliverables | Evidence Report | Test Evidence |
|---|---|---|---|---|---|
| **M09-T01** | TruePPM prototype & contract integration | #100 | Upstream prototype harness, contract schema `TruePpmInputContract` / `TruePpmOutputContract`, ADR-0017 ratification | [trueppm-prototype-and-contract.md](trueppm-prototype-and-contract.md) | Verified calculation contract and MCP/CLI interface parity |
| **M09-T02** | Scheduling bridge, date-only semantics & versioning | #101 | `DateOnly` calendar type, `SchedulingBridge`, deterministic IDs, schema version tracking, change feed & Flutter parity DTOs | [scheduling-bridge-and-versioned-inputs.md](scheduling-bridge-and-versioned-inputs.md) | 6/6 calendar arithmetic, schema tracking, fail-closed validation, and DTO tests pass |
| **M09-T03** | Service adapter & financial rate separation | #102 | `SchedulingServiceAdapter`, RBAC/tenant guards, fiscal year lock, idempotent daily progress posting, BoQ billing vs RA cost rate separation | [progress-cost-approval-services.md](progress-cost-approval-services.md) | 5/5 authentication, fiscal lock, idempotency, financial separation, and recalculation tests pass |
| **M09-T04** | TruePPM workspace host adapter & focused views | #103 | `TruePpmHostAdapter`, dual presentation modes (Full Editor vs Embedded Capability vs Headless CLI), view state preservation, fail-closed cycle & constraint detection, offline typed proposals | [trueppm-workspace-and-focused-views.md](trueppm-workspace-and-focused-views.md) | 5/5 dual presentation surfaces, state preservation, cycle detection, offline proposals, and domain permission tests pass |
| **M09-T05** | Immutable schedule baselines, variance & explanations | #104 | `BaselineSnapshotEngine`, fail-closed immutability protection, `ScheduleVarianceAnalyzer` (slippage/acceleration), `ScheduleRevisionExplainer` (structured root causes) | [immutable-baselines-variance-explanations.md](immutable-baselines-variance-explanations.md) | 4/4 baseline immutability, variance deltas, structured explanations, and revision query tests pass |
| **M09-T06** | Release update & rollback pipeline CLI | #105 | `scripts/update-trueppm` CLI, `docs/vendor/trueppm-registry.json`, two-release qualification suite (`v0.3.9` $\leftrightarrow$ `v0.4.0-beta.1`), rollback safety | [trueppm-release-update-and-rollback.md](trueppm-release-update-and-rollback.md) | 5/5 CLI help, registry integrity, rejection, rollback, and upgrade tests pass |
| **M09-T07** | Capability delivery register & legacy CPM migration | #106 | `docs/vendor/TRUEPPM.md` capability matrix, `UnsupportedCapabilityError` fail-closed guards, `LegacyCpmMigrationAdapter`, prototype CPM deprecation markers | [trueppm-capabilities-and-legacy-migration.md](trueppm-capabilities-and-legacy-migration.md) | 5/5 unsupported guard, ID/logic fidelity, cyclic loop detection, 1k/5k scale fixture, and error handling tests pass |
| **M09-T08** | Parity, financial correctness, 10k/50k benchmarks & EVM | #107 | Cross-platform parity matrix, exact-decimal EVM engine (BCWS, BCWP, ACWP, SV, CV, SPI, CPI), cash-flow S-curves, 10k task / 50k dependency benchmark, virtualized Gantt viewport slice, 50-worker concurrency stress test | [parity-benchmarks-and-evm.md](parity-benchmarks-and-evm.md) | 4/4 10k/50k latency, 60 Hz viewport frame budget, EVM analytical metrics, and high-concurrency idempotency tests pass |
| **M09-T09** | 👤 GATE — TruePPM integration & M09 exit evidence | #108 | This comprehensive exit packet and downstream integration contracts | [m09-exit-gate.md](m09-exit-gate.md) | Protocol lint pass, all 29 native scheduling tests and 5 update pipeline tests pass |

---

## 2. Exit Sentence Formal Proof

> **Platform Plan v3 §6 M09 Exit Sentence:**  
> *"native/web/server accepted schedule results agree, progress cannot post twice, cash-flow uses correct rate source, and large-graph edits remain responsive."*

### 2.1 Native/Web/Server Accepted Schedule Results Agree (M09-T01, M09-T02, M09-T08)
- **Deterministic Scheduling Kernel:** All forward and backward passes execute identically across native Node.js/Rust, browser V8/Wasm, and server environments.
- **Strict Date-Only Calendar Semantics (`DateOnly`):** Task early/late start and finish dates are evaluated strictly on calendar dates (`YYYY-MM-DD`). Ambient timezone offsets, daylight saving time shifts, and UTC midnight translations are strictly prohibited, guaranteeing identical calendar intervals regardless of execution environment.
- **Cross-Platform Hash & Result Identity:** Calculated early starts, early finishes, late starts, late finishes, and total floats produce identical string hashes across client and server execution.
- **Fail-Closed Result Verification:** The host bridge enforces complete task result matching; if an upstream calculation omits any task or yields corrupted dates, the calculation is rejected fail-closed.

### 2.2 Progress Cannot Post Twice (M09-T03, M09-T08)
- **Natural Key Idempotency:** Daily progress postings require a deterministic natural idempotency key:
  $$\text{IdempotencyKey} = \text{hash}(\text{projectId} \mathbin{\Vert} \text{taskId} \mathbin{\Vert} \text{workDate} \mathbin{\Vert} \text{sourceEventId})$$
- **Idempotency Guard & Deduplication:** Replayed, retried, or concurrent submissions with an identical natural key return the existing record (`isDuplicate: true`) without mutating progress totals, accumulators, or financial metrics.
- **High-Concurrency Concurrency Stress Proof:** Stress testing with 50 concurrent worker threads submitting progress updates for identical tasks and dates resulted in exactly 1 write and 49 caught idempotent duplicates with zero double-counting.

### 2.3 Cash-Flow Uses Correct Rate Source (M09-T03, M09-T08)
- **Strict Financial Dual-Rate Separation:**
  1. **Contractual BoQ Billing Rate Source:** Client-facing progress valuations, billing claims, and Earned Value (`BCWS` / `BCWP`) are derived strictly from contractual unit rates locked in the approved BoQ (`source: "BOQ_SCHEDULE"`).
  2. **Internal Resource Allocation (RA) Cost Rate Source:** Contractor internal cost accruals (`ACWP`), labor hours, and equipment costs derive strictly from internal resource catalogs (`source: "RESOURCE_CATALOG"`).
- **Exact-Decimal Arithmetic:** Monetary amounts and EVM metrics (`SV`, `CV`, `SPI`, `CPI`) are calculated using exact-decimal string arithmetic without floating-point rounding drift.
- **Monthly S-Curve Distributions:** Scheduled budget and actual expenditures are distributed proportionally over calendar working days, ensuring precise milestone cash-flow forecasting.

### 2.4 Large-Graph Edits & Gantt Views Remain Responsive (M09-T04, M09-T08)
- **10,000-Task / 50,000-Dependency Scale Performance:**
  - Topology Kahn sort and forward/backward passes on synthetic multi-stage industrial graphs execute in **$\approx 46.8\text{ ms}$**, crushing the Platform Plan v3 §7 latency budget of $\le 1,500\text{ ms}$ by a factor of 30x.
- **60 Hz Virtualized Viewport Frame Budget:**
  - Virtualized Gantt viewport slice extractor filters visible task rows and calendar intervals in **$< 5\text{ ms}$** (benchmark average $\approx 2.7\text{ ms}$ across 10 iterations), comfortably preserving the $\le 16.7\text{ ms}$ 60 Hz interactive panning budget.
- **Fail-Closed Cycle & Constraint Validation:**
  - Interactive graph edits undergo immediate cycle detection and impossible constraint checks prior to engine dispatch, preventing UI lockups and invalid calculation states.

---

## 3. Upstream Engine Posture & Host Binding

### 3.1 Zero-Fork Upstream Posture (ADR-0017)
- Contractor maintains a strict zero-fork relationship with `storytold/trueppm` under [ADR-0017](../../adr/0017-trueppm-scheduling-engine-adoption.md).
- All upstream scheduling binaries and contracts are consumed via clean interfaces without vendored source modifications.
- Upstream capability gaps (e.g., probabilistic PERT/Monte Carlo, linear scheduling/time-chainage, automated leveling) are registered in `docs/vendor/TRUEPPM.md` and guarded fail-closed with `UnsupportedCapabilityError`.

### 3.2 Dual Presentation Surfaces
[`TruePpmHostAdapter`](file:///Users/aakashdhakal/contractor/packages/native_scheduling/src/trueppm_host_adapter.ts) provides dual presentation surfaces over a shared calculation session:
1. **Full Editor Mode:** Comprehensive project schedule editor with interactive Gantt canvas, PERT network diagram, resource allocation breakdown, and baseline comparison.
2. **Embedded Capability Mode:** Compact timeline component embedded directly within BoQ worksheets, project dashboards, site progress reporting, and client document decks.
3. **Headless CLI Mode:** Automation surface for CI recalculations, baseline batching, and server reconciliation.

### 3.3 Domain Permission & Fiscal Year Locks
- Permissions strictly enforced:
  - `view_only`: Read-only schedule navigation and baseline inspection.
  - `progress_update_only`: Permits daily progress percentage and actual date entry; blocks schedule network restructuring or dependency authoring.
  - `full_authoring`: Unrestricted network topology and baseline management.
- **Fiscal Year Lock:** Prevents retroactive recalculation or baseline tampering within locked accounting periods.

### 3.4 Upstream Release Update & Rollback Pipeline
- Standardized CLI `scripts/update-trueppm <release>` with machine-readable registry `docs/vendor/trueppm-registry.json`.
- Validated across two releases (`v0.3.9` $\leftrightarrow$ `v0.4.0-beta.1`) with 5/5 verification checks passing on both upgrade and safe rollback.

---

## 4. Downstream Milestone Integration Contracts

### 4.1 M10 (Full Parity & Web Migration)
- Scheduling calculation engine, `DateOnly` semantics, and EVM logic run identically in Node.js server environments and browser clients using standard Web APIs.
- The dual presentation host binds cleanly to web and native desktop presentation shells.

### 4.2 M11 (Recovery, Packaging & Staged Release)
- Vendor registry `docs/vendor/trueppm-registry.json` provides cryptographic checksums (`sha256`) and pinned commits for reproducible packaging and offline desktop installers.

### 4.3 M12 (Client Documents & Presentations)
- M12 client documents consume schedule baseline variance summaries, critical path slippage reports, and cash-flow S-curves for executive project decks, delay claims, and monthly progress claims.

---

## 5. Test Suite & Linter Evidence

1. **`@contractor/native-scheduling` Check Runner:**
   ```bash
   node packages/native_scheduling/tool/check.mjs
   ```
   **Result:** All 6 test suites (29 tests) PASSED with 100% success:
   - `baseline_and_variance.test.ts` (4/4 tests pass)
   - `benchmarks_and_evm.test.ts` (4/4 tests pass)
   - `capabilities_and_migration.test.ts` (5/5 tests pass)
   - `date_only_and_bridge.test.ts` (6/6 tests pass)
   - `scheduling_service_adapter.test.ts` (5/5 tests pass)
   - `trueppm_host_adapter.test.ts` (5/5 tests pass)

2. **TruePPM Update Pipeline Verification Suite:**
   ```bash
   node scripts/test-update-trueppm.mjs
   ```
   **Result:** All 5 qualification checks PASSED (CLI help, registry integrity, invalid release rejection, rollback to v0.3.9, and upgrade back to v0.4.0-beta.1).

3. **Protocol & Register Linter:**
   ```bash
   node scripts/lint-protocol.mjs
   ```
   **Result:** Audited 13 milestone files, 142 task definitions. All checkboxes, PR references, and rollups valid.

---

## 6. Gate Decision & Owner Ratification

Milestone M09 has satisfied all requirements of Platform Plan v3 §6 M09, ADR-0017, and Protocol R8. All 9 tasks (T01–T08, T09) are complete, evidenced, and verified.

- **Gate Status:** Submitted for Owner Review
- **Owner Approval:** Awaiting Owner review and decision under Protocol R8.
- **Proceed:** Unblocks downstream integration milestones upon approval.
