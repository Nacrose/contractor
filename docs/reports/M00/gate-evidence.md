# M00-T21: Milestone M00 Exit Evidence & Program Baseline Review

> **Milestone**: M00 (Inventory, Fixtures & Baseline)  
> **Status**: **ALL TASKS COMPLETE (21 / 21) — READY FOR OWNER GATE APPROVAL**  
> **Target Program**: [`Nacrose/contractor`](https://github.com/Nacrose/contractor) (Cross-platform evolution of `Construction_Manager`)  
> **Output Artifacts**: [`docs/reports/M00/gate-evidence.md`](file:///Users/aakashdhakal/contractor/docs/reports/M00/gate-evidence.md) & [Gate Pull Request `[M00-GATE]`](https://github.com/Nacrose/contractor/pull/new/m00-t21-gate)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 §6 M00, Rule R8 (Owner gate approval)

---

## 1. Executive Summary & Honest Exit Declaration

Milestone **M00 (Inventory, Fixtures & Baseline)** represents the comprehensive discovery, profiling, and architectural foundation phase of the `contractor` program. Over 21 systematically executed and atomically committed tasks, the program has cataloged the entire authoritative application surface, created deterministic cross-platform behavior fixtures, profiled baseline performance, resolved the critical data synchronization architecture via a rigorous empirical spike, and established mechanical protocol enforcement in CI.

### The Honest Exit Claim (Mandatory per v3 §6 M00):
> **Formal Declaration**: We explicitly record that the current web application (`Construction_Manager`) **does NOT yet satisfy the native cross-platform platform requirements, offline durability standards, or high-density performance budgets**. 
> 
> Milestone M00 does not claim that parity is already met. Rather, M00 has produced the complete, honest empirical baseline and verified fixtures required to build the true cross-platform Flutter application and shared calculation kernels in **Milestones M01 through M11**.

---

## 2. Complete Milestone M00 Task Ledger

| Task ID | Description | Delivery PR | Key Output Artifacts | Status |
|---|---|---|---|---|
| **M00-T01** | Verify repository identities & clean scaffold cruft | PR #1 | [ADR-0010](../../adr/0010-progressive-extension-over-greenfield-rewrite.md) |  Merged |
| **M00-T02** | Adopt AI-Agent Execution Protocol | PR #1 | [AI-AGENT-EXECUTION-PROTOCOL.md](../../rules/AI-AGENT-EXECUTION-PROTOCOL.md) |  Merged |
| **M00-T03** | Import Platform Plan v3 as normative baseline | PR #1 | [native-web-platform-plan-v3.md](../native-web-platform-plan-v3.md) |  Merged |
| **M00-T04** | Record ADR-0010 (Evolve in place over rewrite) | PR #1 | [ADR-0010](../../adr/0010-progressive-extension-over-greenfield-rewrite.md) |  Merged |
| **M00-T05** | Amend README charter to reference register | PR #1 | [README.md](../../../README.md) |  Merged |
| **M00-T06** | Establish Master Register & 12 milestone plans | PR #1 | [EXECUTION-PLAN.md](../EXECUTION-PLAN.md), [M00–M11 plans](../milestones/) |  Merged |
| **M00-T07** | tRPC Router & Server Mutation Inventory | PR #2 | [inventory-routers.md](inventory-routers.md), [inventory-routers.json](inventory-routers.json) |  Complete |
| **M00-T08** | Non-Router Writers, Jobs & Importers Inventory | PR #3 | [inventory-jobs-imports.md](inventory-jobs-imports.md), [inventory-jobs-imports.json](inventory-jobs-imports.json) |  Complete |
| **M00-T09** | Client Local Stores & Document Formats Inventory | PR #4 | [inventory-local-stores.md](inventory-local-stores.md), [inventory-local-stores.json](inventory-local-stores.json) |  Complete |
| **M00-T10** | Feature Matrix As Implemented | PR #5 | [feature-matrix.md](feature-matrix.md), [feature-matrix.json](feature-matrix.json) |  Complete |
| **M00-T11** | Behavior Fixtures & Parity Manifest | PR #6 | [manifest.json](../../../fixtures/platform-parity/manifest.json), [fixture-register.md](fixture-register.md) |  Complete |
| **M00-T12** | Reference Outputs & Honest Test Baseline | PR #7 | [baseline-tests.md](baseline-tests.md) |  Complete |
| **M00-T13** | Performance Baseline Profile | PR #8 | [baseline-perf.md](baseline-perf.md), [baseline-perf.json](baseline-perf.json) |  Complete |
| **M00-T14** | Platform Support Matrix | PR #9 | [platform-support-matrix.md](platform-support-matrix.md) |  Complete |
| **M00-T15** | Change-Feed Spike Evaluation Harness | PR #10 | [`spike/change-feed/`](../../../spike/change-feed/), [spike-harness.md](spike-harness.md) |  Complete |
| **M00-T16** | Change-Feed Spike Arm A: Writer Instrumentation | PR #11 | [`spike/change-feed/arm-a/`](../../../spike/change-feed/arm-a/), [spike-arm-writers.md](spike-arm-writers.md) |  Complete |
| **M00-T17** | Change-Feed Spike Arm B: WAL Logical Decoding | PR #12 | [`spike/change-feed/arm-b/`](../../../spike/change-feed/arm-b/), [spike-arm-wal.md](spike-arm-wal.md) |  Complete |
| **M00-T18** | Change-Feed Mechanism Decision Record | PR #13 | [ADR-0011](../../adr/0011-change-feed-mechanism.md), [spike-decision.md](spike-decision.md) |  Complete |
| **M00-T19** | Ratify Capacity, Maintenance Posture & Budgets | PR #14 | [capacity-ratification.md](capacity-ratification.md) |  Complete |
| **M00-T20** | Protocol Lint: Mechanical Register Enforcement | PR #15 | [`scripts/lint-protocol.mjs`](../../../scripts/lint-protocol.mjs), [Workflow](../../../.github/workflows/lint-protocol.yml) |  Complete |
| **M00-T21** | 👤 GATE — M00 Exit Evidence & Owner Sign-off | PR #16 | [gate-evidence.md](gate-evidence.md) (This Report) |  **AT GATE** |

---

## 3. Key Findings & Empirical Baselines

### 1. Application Inventory (M00-T07 – M00-T09):
- **79 tRPC Routers & 402 Mutations**: 363 mutations (90.3%) are backed by domain services, while 39 bypass services directly into Prisma.
- **23 Non-Router Writers**: 7 financial reconciliation services, 3 background BullMQ jobs, 4 bulk Excel/CSV importers, 7 CLI maintenance scripts, and 2 database seeders.
- **425 Total System Write Paths**: Mapped and accounted for in the synchronization architecture.
- **10 Local Client Stores**: Identified across IndexedDB, `localStorage`, and session cookies, with 8 document formats cataloged (DWG, DXF, PDF, XLSX, CSV, JSON, PNG, JPEG).

### 2. Behavior Fixtures & Parity Manifest (M00-T11):
- **15 Canonical Test Fixtures**: Seeded in [`fixtures/platform-parity/manifest.json`](../../../fixtures/platform-parity/manifest.json) with SHA-256 integrity hashes.
- **Deterministic Scale Generators**: Capable of generating reproducible 50,000 and 100,000-row BoQs, 120-page blueprint PDFs, and 10,000-task CPM schedule networks.

### 3. Empirical Test & Performance Baselines (M00-T12 & M00-T13):
- **Authoritative Test Baseline**: 350 test files, 5,860 passing tests, 2 failing tests, 22 skipped tests. Type check clean (0 errors). Core engines pass 100%.
- **Upstream Defects Cataloged**: Recorded regression of +8 float-money coercions on server and 1 missing accessibility label in CAD toolbar.
- **Performance Profiling (Apple M1)**:
  - 50k BoQ recalculation: **4.17 seconds** in TypeScript (establishing the necessity of viewport virtualization, dirty-subgraph evaluation, and background isolate execution).
  - 10k CPM schedule pass: **677 ms**.
  - CAD DWG decode: **<0.2 ms**.

### 4. Change-Feed Mechanism Ratification (ADR-0011):
- **Empirical Spike**: Proved on harness that Arm A suffers a **77.8% commit-order inversion hazard** and misses **12.2% of write paths**, while raw Arm B is incompatible with direct mobile connections on serverless Neon compute.
- **Selected Architecture**: **Server-Mediated Hybrid Architecture (ADR-0011)**. A single server-side CDC daemon consumes PostgreSQL logical replication (`pgoutput`), sanitizes tenant payloads, strips confidential columns, and populates tenant change queues. Native clients sync via standard HTTP/WebSocket pull APIs using monotonic commit-LSN cursors and local SQLite transactional deduplication.
- **Neon Cloud Safety**: Monitored replication slot with an automated 5 GB / 1-hour retention circuit breaker, preventing database disk exhaustion.

### 5. Capacity Envelope & Budgets Frozen (M00-T19):
- **Effort Bands**: Confirmed provisional multi-year envelope (78–166 weeks across M01–M11) pending M04 re-baseline.
- **Maintenance Posture**: Frozen into Maintain, Freeze, Continue, and Defer categories to prevent legacy code decay during the migration overlap.
- **Performance Budgets**: All 11 §7 targets ratified against declared hardware tiers without weakening.

### 6. Mechanical Governance Enforcement (M00-T20):
- Automated script `scripts/lint-protocol.mjs` validates all task checkboxes, PR references, and rollup counts.
- Negative test suite verifies 100% rejection of corrupted registers.
- GitHub Actions CI workflow protects all future changes to `docs/plans/**`.

---

## 4. Verification of Milestone M01 Readiness

Before requesting owner gate approval, Milestone **M01 (Platform feasibility & performance gate)** was reviewed against M00 findings:
1. **Scope Discipline**: M01 remains strictly bounded to **disposable prototypes** (`prototype/construction_client/`) — no production feature screens.
2. **Acceptance Criteria Validity**: All 17 tasks in `M01-platform-feasibility-gate.md` remain valid and accurate.
3. **M01 Fallback Matrix**: Pre-committed fallback options (e.g. Dart vs Rust comparative prototypes, browser parity proposals) are fully aligned with M00 baselines.

---

## 5. Formal Owner Gate Sign-off (Protocol Rule R8)

Pursuant to **AI-Agent Execution Protocol Rule R8 (Owner Gate Approvals)**, Milestone M00 is formally submitted for owner review and sign-off.

### Review Checklist for Project Owner:
- [x] All 21 tasks in Milestone M00 are executed and ticked with PR evidence.
- [x] Master execution plan rollup matches 21/21 for M00 and 21/118 for the Program Total.
- [x] Change-feed spike completed; ADR-0011 accepted.
- [x] Capacity envelope, maintenance posture, and performance budgets ratified.
- [x] Protocol mechanical linter and CI workflow active.
- [ ] **Owner Approval Recorded**: Project owner confirms completion and authorizes initiation of Milestone M01.
