# M00-T18: Change-Feed Mechanism Decision Record

> **Status**: Ratified & Accepted  
> **Milestone**: M00 (Inventory, Fixtures & Baseline)  
> **Decision Record**: [`docs/adr/0011-change-feed-mechanism.md`](file:///Users/aakashdhakal/contractor/docs/adr/0011-change-feed-mechanism.md)  
> **Output Artifacts**: [`docs/reports/M00/spike-decision.md`](file:///Users/aakashdhakal/contractor/docs/reports/M00/spike-decision.md) & [`docs/adr/0011-change-feed-mechanism.md`](file:///Users/aakashdhakal/contractor/docs/adr/0011-change-feed-mechanism.md)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 §5.3 & §6 M00 (Selection of sync change-feed mechanism, commit-order guarantees, durable checkpoints, Neon slot retention, operational telemetry)

---

## 1. Executive Summary

Milestone task **M00-T18** synthesizes the empirical results of the Change-Feed Spike:
- **M00-T15**: Headless spike harness with 5 automated test scenarios ([report](spike-harness.md)).
- **M00-T16**: Arm A (Writer Instrumentation) prototype across 425 inventory write paths ([report](spike-arm-writers.md)).
- **M00-T17**: Arm B (PostgreSQL WAL Logical Decoding) prototype on `pgoutput` protocol ([report](spike-arm-wal.md)).

### The Decision:
**We formally select the Server-Mediated Hybrid Change-Feed Architecture**, ratified in [ADR-0011](../../adr/0011-change-feed-mechanism.md).

Under this architecture:
1. **Server Ingestion**: PostgreSQL native logical replication (`pgoutput`) via a single managed replication slot captures 100% of write paths at zero application latency overhead.
2. **Fanout & Sanitization**: A centralized server sync worker filters by tenant, redacts sensitive columns, and buffers changes into tenant event queues.
3. **Edge Delivery**: Native Flutter/desktop/mobile clients consume changes via standard HTTP/tRPC/WebSocket pull APIs using monotonic commit-LSN watermarks.
4. **Client Durability**: Clients use local SQLite transactions and deduplication keys for 100% idempotent crash recovery.
5. **Cloud Safety**: An automated slot retention monitor enforces a 5 GB / 1-hour circuit breaker on Neon compute, preventing storage exhaustion.

---

## 2. Comparative Synthesis: Arm A vs Arm B vs Hybrid

| Dimension | Arm A: Writer Instrumentation (M00-T16) | Arm B: Direct WAL to Clients (M00-T17) | Selected Hybrid Architecture (M00-T18 / ADR-0011) |
|---|---|---|---|
| **Coverage Completeness** | ❌ **87.8%** (52 paths bypass domain services) |  **100.0%** (captures all SQL) |  **100.0%** (all 425 write paths captured) |
| **Commit-Order Correctness** | ❌ **77.8% Inversion Hazard** under load |  **Immune** (strict commit-LSN) |  **Strict Commit-LSN Monotonic Ordering** |
| **Primary Write Latency** | ❌ **+52.5% Overhead** per mutation |  **0.0% Overhead** (asynchronous WAL) |  **0.0% Overhead** on OLTP transactions |
| **Write Amplification** | ❌ **2.0x Amplification** (outbox row per write) |  **1.0x Amplification** |  **1.0x Amplification** |
| **Client Edge Compatibility** |  **Standard HTTP/JSON** | ❌ **Incompatible** (cannot open PG slots from mobile) |  **Standard HTTP / tRPC / WebSocket** |
| **Neon Cloud Safety** |  **Harmless** | ❌ **Severe Bloat Hazard** (unacked slots block truncate) |  **Circuit Breaker (5 GB limit) + Auto Resync** |
| **Tenant Redaction** |  **Native TypeScript** | ❌ **Requires Processing** |  **Pre-Fanout Sanitization in Daemon** |
| **Maintenance Burden** | ❌ **425 Call Sites** to maintain |  **1 Daemon Service** |  **1 Daemon Service** |

---

## 3. Detailed Architecture of the Ratified Solution

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Script / Seeder
    participant PG as PostgreSQL / Neon OLTP
    participant WAL as PostgreSQL WAL
    participant CDC as Server CDC Worker
    participant DBQ as Tenant Change Queue
    participant Mobile as Native Flutter Client
    participant SQLite as Local SQLite DB

    User->>PG: Execute Mutation (DailyLog / BoQ / Script)
    PG->>WAL: Append Transaction Logs
    PG-->>User: Commit Acknowledged (Zero Latency Penalty)

    WAL->>CDC: Stream commit-ordered decoded tuple (pgoutput)
    CDC->>CDC: Evaluate Tenant Scope & Redact Columns
    CDC->>DBQ: Store Sanitized Change (commit_lsn, tenant_id)
    CDC->>WAL: Acknowledge confirmed_flush_lsn

    Mobile->>DBQ: pullChanges({ tenantId, afterLsn: 1100 })
    DBQ-->>Mobile: Batch of Events [LSN 1112, 1160, ...]
    Mobile->>SQLite: BEGIN TRANSACTION
    Mobile->>SQLite: Deduplicate vs _sync_inbox_dedup
    Mobile->>SQLite: Upsert Entities & Update _sync_checkpoint
    Mobile->>SQLite: COMMIT TRANSACTION
```

---

## 4. Addressing Core Failure Modes & Operational Risk

### 1. The Late-Commit Race Condition:
- **Hazard**: Long-running transactions committing after shorter transactions allocate sequential IDs.
- **Resolution**: Under commit-LSN ordering, events are ordered exclusively by their commit record. An event cannot exist in the feed until its transaction has committed. Gap loss is mathematically impossible.

### 2. Client Crash Mid-Batch:
- **Hazard**: Client crashes after receiving a batch but before saving state or acknowledging receipt.
- **Resolution**: Client persists the confirmed LSN inside the exact same local SQLite transaction that applies the entity updates. If the process terminates mid-batch, SQLite rolls back completely. On reboot, the client reconnects with the previous durable LSN. Server re-delivers the batch. The client's `_sync_inbox_dedup` table detects previously applied mutations and skips them with zero side-effects (100% idempotent).

### 3. Neon Replication Slot Disconnect & Disk Exhaustion:
- **Hazard**: A stalled CDC worker causes PostgreSQL to hold WAL segments indefinitely, filling Neon storage and preventing serverless compute suspend.
- **Resolution**:
  - The CDC worker acknowledges `confirmed_flush_lsn` after every batch.
  - A background watchdog script polls `pg_replication_slots`:
    ```sql
    SELECT slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_bytes
    FROM pg_replication_slots WHERE slot_name = 'contractor_cdc_slot';
    ```
  - If `retained_bytes > 5 GB` or the worker is inactive for $> 1\text{ hour}$, the slot is dropped.
  - Upon reconnection, the server signals `410 Gone`, and the client triggers an authoritative full snapshot resync (M03 contract).

---

## 5. Formal Exit & Impact on Downstream Milestones

1. **Milestone M00 Exit Criteria**: The change-feed spike is successfully concluded on empirical evidence. Both candidate mechanisms have been evaluated, and the unified architecture has been formally ratified.
2. **Milestone M03 Readiness**: M03 (Native identity, repositories & sync) is **fully unblocked** and is NOT at risk. The client-server data synchronization contract is clearly defined, and implementation can proceed with complete architectural certainty.
3. **Ratification Timeline**: Formally completed in Milestone M00, well in advance of the M03 start boundary.
