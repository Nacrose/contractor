# M00-T15: Change-Feed Spike Evaluation Harness

> **Status**: Verified & Operational  
> **Milestone**: M00 (Inventory, Fixtures & Baseline)  
> **Output Artifacts**: [`spike/change-feed/`](file:///Users/aakashdhakal/contractor/spike/change-feed/) & [`docs/reports/M00/spike-harness.md`](file:///Users/aakashdhakal/contractor/docs/reports/M00/spike-harness.md)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 §6 M00 (Headless execution, exit code 0, complete failure reproduction)

---

## 1. Executive Summary & Purpose

A fundamental architectural decision for the cross-platform client migration is selecting the **Change-Feed Mechanism** that synchronizes state between the authoritative PostgreSQL backend (`Nacrose/Construction_Manager`) and the local SQLite databases on desktop and mobile clients (`Nacrose/contractor`).

Two primary mechanisms are evaluated in Milestone M00:
- **Arm A (Application-Level Writer Instrumentation)**: Explicitly writing audit/mutation log records within application transactions or domain services.
- **Arm B (PostgreSQL Logical Decoding / WAL Streaming)**: Streaming transaction commit records directly from PostgreSQL Write-Ahead Logs via logical replication slots.

Milestone task **M00-T15** constructs the evaluation test rig: a disposable, headless evaluation harness that reproduces the core concurrency races, crash failures, and disk exhaustion hazards inherent to distributed data synchronization.

---

## 2. Harness Architecture & Components

The harness lives in [`spike/change-feed/`](file:///Users/aakashdhakal/contractor/spike/change-feed/) and executes standalone with zero external dependencies:

```
spike/change-feed/
├── package.json               # ES module package definition
├── run-harness.mjs            # Master test runner (exit code 0 on all pass)
├── harness-results.json       # Machine-readable test execution report
├── lib/
│   ├── pg-client.mjs          # ACID transactional simulator + live psql client
│   ├── checkpoint-store.mjs   # Durable consumer cursor store with monotonic guard
│   ├── slot-monitor.mjs       # Replication slot retention tracker & circuit breaker
│   └── crash-injector.mjs     # Process crash (SIGKILL) simulator & duplicate injector
└── scenarios/
    ├── s1-late-commit.mjs     # S1: Commit-order race hazard (The Late-Commit Race)
    ├── s2-crash-replay.mjs    # S2: Crash & restart replay with duplicate batches
    ├── s3-slot-retention.mjs  # S3: Replication slot WAL accumulation & disk protection
    ├── s4-concurrent-writers.mjs # S4: 10 concurrent worker transactions & inversion rates
    └── s5-checkpoint-store.mjs   # S5: Monotonic cursor advancement & resync reset
```

---

## 3. Evaluated Scenarios & Empirical Results

The master harness runner (`node spike/change-feed/run-harness.mjs`) executes five automated scenarios:

```
===============================================================================
       M00-T15: CHANGE-FEED SPIKE EVALUATION HARNESS RUNNER
===============================================================================
[✓ PASS] [S1] Late-Commit Order Hazard
[✓ PASS] [S2] Crash & Restart Replay
[✓ PASS] [S3] Replication Slot Retention
[✓ PASS] [S4] High-Concurrency Writers
[✓ PASS] [S5] Consumer Checkpoint Store
===============================================================================
SUMMARY: 5 / 5 Scenarios Passed (Exit Code 0)
===============================================================================
```

### 3.1. Scenario S1: Commit-Order Hazard (The Late-Commit Race)
- **Problem Modeled**: When multiple transactions run concurrently, Sequence IDs (or auto-incrementing integers, or timestamps) are allocated at **statement execution time**, NOT commit time.
- **Hazard Execution**:
  1. Transaction 1 ($Tx_1$) begins and allocates Event ID `1`.
  2. Transaction 2 ($Tx_2$) begins and allocates Event ID `2`.
  3. $Tx_2$ commits first at $t_a$.
  4. Client polls the feed (`WHERE id > 0`), receives Event `2`, and advances checkpoint cursor to `2`.
  5. $Tx_1$ commits later at $t_b > t_a$.
  6. Client polls next batch (`WHERE id > 2`). Event `1` is **permanently skipped and lost**!
- **Empirical Findings**:
  - `wasId1SkippedInNaiveSync`: **`true`**. The naive sequence-based outbox dropped Event 1 completely without raising an error.
  - `wasId1CapturedInLsnSync`: **`true`**. When polled by Commit LSN (`_commitLsn`), $Tx_2$ committed at LSN `1100` and $Tx_1$ committed at LSN `1200`. The consumer polling `LSN > 1100` cleanly received Event 1 in the second batch.
- **Architectural Conclusion**: Any application-level change log (Arm A) that relies on `serial` / `bigserial` or wall-clock timestamps **must** incorporate a delayed watermark window ($T - \Delta$) or transaction-snapshot visibility query (`txid_snapshot_min()`). Pure WAL streaming (Arm B) naturally eliminates this race because WAL records are serialized strictly in commit order.

---

### 3.2. Scenario S2: Crash & Restart Replay (Duplicate Delivery Injection)
- **Problem Modeled**: In distributed systems, exactly-once delivery across network failure is impossible without end-to-end deduplication. A client application must expect at-least-once delivery.
- **Hazard Execution**:
  1. Server delivers batch of 5 changes [`mut-001` .. `mut-005`].
  2. Client applies changes to local database.
  3. Client crashes abruptly (simulated `kill -9` / OS termination) before acknowledging receipt to the server or persisting its local sync cursor.
  4. On restart, client re-requests from its last durable checkpoint (`cursor = 0`). Server re-delivers the identical 5 mutations.
- **Empirical Findings**:
  - `duplicatesEncountered`: **`5`**.
  - `successfulIdempotentApplies`: **`5`** (`allDeduplicated = true`).
  - `nonIdempotentEntriesCount`: **`10`** (A naive consumer doubled all database entries).
- **Architectural Conclusion**: Every entity mutation in `contractor` **must** carry a deterministic `mutationId` / UUID idempotency key. Client SQLite upserts must verify `mutationId` before modifying state.

---

### 3.3. Scenario S3: Replication Slot Retention & Disk Exhaustion Hazard
- **Problem Modeled**: In PostgreSQL Logical Replication (Arm B), a replication slot holds unconsumed WAL files on database disk indefinitely until the consumer flushes its LSN. If a mobile device or field tablet goes offline for days, WAL accumulation will rapidly fill the server disk, crashing the production database.
- **Hazard Execution**:
  1. Desktop Client A acknowledges WAL regularly. Retained bytes: **`0 B`**.
  2. Field Tablet B disconnects. Database writes generate 120 MB of WAL.
  3. Slot B exceeds the 100 MB retention threshold (`clientBPeakRetainedBytes = 125,829,120 B`).
  4. The retention monitor circuit breaker trips: `SLOT_DROPPED_BY_CIRCUIT_BREAKER`.
- **Empirical Findings**:
  - Client B's replication slot was automatically dropped, releasing disk space.
  - Client A's slot was preserved unaffected.
- **Architectural Conclusion**: If Arm B is selected, mobile devices **cannot** connect directly to dedicated PostgreSQL replication slots. Mobile clients must connect to an intermediate application fan-out service (e.g. ElectricSQL / custom change publisher) that maintains a single server-side slot and buffers changes in disk-capped stores.

---

### 3.4. Scenario S4: High-Concurrency Writers Stress Test
- **Problem Modeled**: 10 concurrent worker transactions generating mutations across multiple entities with overlapping commit times.
- **Empirical Findings**:
  - Total rows written: **`50`**.
  - Commit order inversions: **`7 out of 9`** (**`77.8% inversion rate`**).
  - More than 75% of concurrent transactions committed in a different order than their initial ID allocation!
  - `lsnStrictlyMonotonic`: **`true`**. Commit-LSN ordering produced a strictly linear, gap-free sequence despite severe allocation interleaving.

---

### 3.5. Scenario S5: Consumer Checkpoint Store
- **Problem Modeled**: Durable tracking of client sync watermarks.
- **Empirical Findings**:
  - Advancing checkpoints (5000 $\to$ 5200) saved successfully.
  - Retroactive cursor rollback (5200 $\to$ 4800) strictly rejected (`retroactiveRejected = true`).
  - Formal administrative resync reset (`resetCheckpoint(1000, "schema_rebuild_resync")`) succeeded with full version audit trail.

---

## 4. Key Comparative Takeaways for M00-T16–T18

| Risk Dimension | Arm A: Application Writer Instrumentation | Arm B: PostgreSQL Logical Decoding (WAL) |
|---|---|---|
| **Coverage Completeness** | ⚠️ **Risk (12–15% bypassed)**: As proven in M00-T08, 51–62 direct database writes, cron jobs, and CLI scripts bypass domain routers and would be lost unless manually wrapped. |  **Complete (100%)**: Captures every commit, migration, script, and background job at the PostgreSQL engine level. |
| **Commit-Order Gap Hazard** | ⚠️ **High Hazard**: Sequence IDs suffer from the late-commit race (77.8% inversion rate in S4). Requires complex snapshot query logic or delayed read windows. |  **Zero Gap**: Serialized directly by commit LSN. Commits appear strictly in commit sequence. |
| **Disk Exhaustion Risk** |  **Zero**: App outbox table is capped or purged via standard TTL jobs. | ⚠️ **High Hazard**: Orphaned slots retain WAL on disk until exhaustion unless circuit-broken (proven in S3). |
| **Multi-Tenant RLS Filtering** |  **Native**: Written with tenant context and evaluated within Prisma RLS policies. | ⚠️ **Complex**: WAL stream contains raw table rows; tenant demultiplexing must happen in an external worker. |
| **Cloud Hosting Portability** |  **Universal**: Runs on standard PostgreSQL, AWS RDS, Neon serverless, Supabase. | ⚠️ **Restricted**: Requires `wal_level = logical` and replication privileges (often restricted in serverless pooling tiers). |

---

## 5. Verification & Headless Execution

To reproduce the evaluation harness:
```bash
# Run standalone from contractor repository root
node spike/change-feed/run-harness.mjs

# Or via npm test
cd spike/change-feed && npm test
```
The harness exits with code `0` on 100% scenario passage and writes detailed metrics to [`spike/change-feed/harness-results.json`](file:///Users/aakashdhakal/contractor/spike/change-feed/harness-results.json).
