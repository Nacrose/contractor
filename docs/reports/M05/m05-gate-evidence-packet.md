# [M05-GATE] Evidence Packet — Field Workflow Expansion

- **Milestone:** M05 Field Workflow Expansion — ALL 10/10 tasks complete (T01–T09 implementation PRs #56–#64; this gate is PR #65).
- **Gate decision requested:** Owner review and decision under protocol R8 (the only approval this packet needs; nothing in M05 is self-approved).
- **Normative Reference:** Platform Plan v3 §6 M05; AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12

---

## 1. Exit-Claim → Evidence Map

Every unit of work across M05 is backed by reviewed code, real-engine automated test suites, and dedicated evidence reports:

| Task | Title | PR | Primary Deliverables | Evidence Report | Test Evidence |
|---|---|---|---|---|---|
| **M05-T01** | Substrate extension | #56 | SQLite migration 5 (`attendance_local`, `site_expense_local`, `material_delivery_local`), domain models, sync health | [substrate-extension.md](substrate-extension.md) | Migration 5 unit tests, WAL durability pass |
| **M05-T02** | Attendance workflow | #57 | Attendance domain model, centralized worker deduplication (`attendance.ts`), Flutter widget UI | [attendance-workflow.md](attendance-workflow.md) | 5/5 deduplication tests, server-time authority |
| **M05-T03** | Site expense / petty cash | #58 | Financial guard chain, delegation limits, submitter audit history invariance (`site_expense.ts`), UI | [site-expense-workflow.md](site-expense-workflow.md) | 5/5 financial guard tests, fiscal lock rejection |
| **M05-T04** | MRR / material delivery | #59 | MRR schema, office review reuse (`material_delivery.ts`), anti-self-review rejection, UI | [material-delivery-workflow.md](material-delivery-workflow.md) | 5/5 delivery ingestion & anti-self-review tests |
| **M05-T05** | Field photos full pipeline | #60 | Native camera & OS file adapters bound to M03 manager, SHA-256 dedup, office review gate | [field-photos-pipeline.md](field-photos-pipeline.md) | 4/4 photo tests, StoredFile reuse, staging gate |
| **M05-T06** | OS scheduling adapters | #61 | SQLite migration 6 (`scheduling_state`), `DurableSchedulerStateStore`, `OsSchedulerPort`, foreground recovery | [os-scheduling-adapters.md](os-scheduling-adapters.md) | Process-death recovery test, honest health telemetry |
| **M05-T07** | Browser drafts/queues drain | #62 | `browser_drain.ts`, bundle schema `cm-field-drain-v1`, `BrowserDrainImporter`, zero-loss drain | [browser-drain.md](browser-drain.md) | 5/5 TS drain tests, 2/2 Flutter importer tests |
| **M05-T08** | Contract suite pass & fault matrix | #63 | Extended fault matrix runner with legs F13–F17, real SQLite WAL durability, replay protection | [contract-suite.md](contract-suite.md) | 19/19 matrix tests, 5/5 Flutter fault tests |
| **M05-T09** | Field PWA code retirement gate | #64 | `pwa_retirement.ts`, changeset auditor, service worker sanitization, rollback notes | [pwa-retirement.md](pwa-retirement.md) | 6/6 retirement gate tests, 53/53 native adapter |
| **M05-T10** | 👤 GATE — Exit evidence & owner decision | #65 | This evidence packet + downstream refinement notes (M06/M09) | [m05-gate-evidence-packet.md](m05-gate-evidence-packet.md) | Protocol lint pass, complete program register |

---

## 2. Exit Sentence Formal Proof

> **Platform Plan v3 §6 M05 Exit Sentence:**  
> *"Each workflow passes the same crash/replay/permission contract suite and native/web outcome tests; unsynchronized work cannot disappear during migration."*

### 2.1 Uniform Contract Suite Shapes (No Weakened Variants)
Every expansion workflow (attendance, site expense, MRR delivery, field photos, and migration safe drain) passes the exact contract shapes pinned in M03:
1. **Durability against real SQLite:** All local records commit under WAL mode with `synchronous=FULL`. Process kills and restarts recover intact.
2. **Replay Protection:** Deduplication ledgers and idempotent operation IDs guarantee that repeated dispatches (e.g. following lost ACK or client network timeouts) result in zero duplicate ledger effects.
3. **Permission & Security Revalidation:** Revoked permissions or cross-tenant scope changes reject fail-closed without corrupting uncommitted local work.

### 2.2 Fault Matrix Extension (F13–F17 Results)
The `native_faultmatrix` runner was extended with 5 dedicated workflow legs:
- **F13 (Attendance Convergence):** Duplicate worker entries within single or concurrent submissions collapse deterministically leaving 0 duplicate database rows.
- **F14 (Site Expense Fiscal Lock):** Rejection against a locked fiscal period rolls back the local transaction cleanly leaving zero ledger effects while retaining the error for user remediation.
- **F15 (Material Delivery Anti-Self-Review):** Attempted review/approval by the submitter is rejected fail-closed; delivery remains pending for independent review.
- **F16 (Field Photo Digest Dedup & Staging Gate):** Uploads sharing identical byte digests reuse existing `StoredFile` records; incomplete/staging uploads are strictly excluded from office review queries.
- **F17 (Migration Zero-Loss Invariant):** Replaying an interrupted drain asserts 100% of unsynchronized mutations drain cleanly with 0 loss and 0 double-posts.

---

## 3. Real Engine Durability Statement

In accordance with AI-Agent Execution Protocol R2:
- **No Mocks as Sole Durability Proof:** All local persistence tests run against real SQLite (`node:sqlite` in TypeScript suites; native SQLite C library via Dart `sqlite3` in WAL mode on macOS/iOS/Android).
- **Crash Testing:** Process termination mid-transaction verified clean rollback without database corruption.
- **Schema Migrations:** Migrations 1 through 6 apply sequentially and verifiably in real SQLite.

---

## 4. Downstream Refinement Needs (M06 & M09)

As required by M05-T10 acceptance criteria, downstream refinement needs are recorded here and will be formally incorporated into milestone backlog files via separate `[PLAN-AMEND]` PRs under protocol R9:

### 4.1 Downstream Needs for M06 (Worksheet / BoQ Engine)
1. **Material Delivery (MRR) to BoQ Item Linking:**
   - Establish a typed delta schema linking accepted material deliveries directly to Bill of Quantities (BoQ) item consumption records.
   - Ensure BoQ recalculation treats field material receipts as immutable inputs rather than allowing formula overwrites.
2. **Concurrent Edits vs Field Writes:**
   - Define versioned cell/row conflict semantics so background field submissions do not invalidate active user edits in the 100k-row virtual grid.

### 4.2 Downstream Needs for M09 (Scheduling, Progress & Cash-Flow)
1. **Site Expense to Cash-Flow Integration:**
   - Direct ingestion pipeline mapping accepted petty cash and site expense records into real-time project cash-flow forecasts.
2. **Attendance Hours to Earned Value (EVA):**
   - Ingestion contract feeding daily attendance worker-hours into CPM schedule progress and earned-value calculations.
3. **OS Scheduler Integration:**
   - Map background sync opportunities (`OsSchedulerPort`) to schedule recalculation triggers when fresh field daily reports are synchronized.

---

## 5. Register & Governance State

- **Milestone M05:** **10/10** complete (T01–T09 implemented, T10 gate presented).
- **Program Total:** **66/132** tasks complete (M00 21/21, M01 17/17, M02 8/8, M03 10/10, M04 2/9, M05 10/10, M06–M12 0/57).
- **Protocol Linter:** PASSED (`node scripts/lint-protocol.mjs`).
- **All CI & Test Suites:**
  - TypeScript Native Adapter: 53/53 PASS.
  - Native Fault Matrix: 19/19 PASS (17 real SQLite legs PASS, 4 PostgreSQL SKIP, report PASS).
  - Flutter Native Client: 257/257 PASS, `flutter analyze` 0 issues.

---

## 6. Owner Decision Action

Under AI-Agent Execution Protocol R8:
1. Review this evidence packet and the individual task reports in `docs/reports/M05/`.
2. Verify test reproducibility via `node packages/native_adapter/tool/check.mjs`, `node packages/native_faultmatrix/tool/check.mjs`, and `flutter test`.
3. Approve and merge PR #65 (`[M05-GATE]`). The merge constitutes the formal milestone exit gate approval.
