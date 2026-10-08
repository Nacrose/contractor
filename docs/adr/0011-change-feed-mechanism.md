# ADR-0011: Server-Mediated Hybrid Change-Feed Mechanism for Native Client Synchronization

- Date: 2026-10-08 (Asia/Kathmandu)
- Status: **Accepted**
- Context: Milestone M00 Spike (M00-T15 Harness, M00-T16 Arm A Evaluation, M00-T17 Arm B Evaluation)
- Companion: [native-web-platform-plan-v3.md](../plans/native-web-platform-plan-v3.md) (§5.3, §6) · [spike-arm-writers.md](../reports/M00/spike-arm-writers.md) · [spike-arm-wal.md](../reports/M00/spike-arm-wal.md) · [spike-decision.md](../reports/M00/spike-decision.md)

---

## 1. Context

The cross-platform architecture (plan v3) mandates local-first offline execution with client-side SQLite databases synchronized against the PostgreSQL authoritative backend (`Construction_Manager`). 

A synchronization engine requires a reliable, continuous **change feed** of database mutations. In Milestone M00, two competing architectural arms were prototyped and empirically evaluated:
1. **Arm A (Application-Level Writer Instrumentation)**: Explicitly decorating router mutations with transactional `outbox_events` inserts ([report](../reports/M00/spike-arm-writers.md)).
2. **Arm B (PostgreSQL WAL Logical Decoding)**: Streaming changes directly from the database Write-Ahead Log via `pgoutput` replication slots ([report](../reports/M00/spike-arm-wal.md)).

### Empirical Findings from M00 Spikes:
- **Arm A Flaws**:
  - **12.2% Coverage Black Hole**: Exactly 52 out of 425 system write paths bypass domain routers directly into PostgreSQL (scripts, seeders, background jobs, raw SQL). Under Arm A, all 52 paths cause silent client-server divergence.
  - **77.8% Commit-Order Inversion Hazard**: Naive sequence numbers or timestamps allocated at transaction start suffer out-of-order commits under concurrent load (Scenario S4), causing clients to skip mutations permanently unless high-latency watermark windows ($T - \Delta$) are introduced.
  - **Performance Cost**: $+52.5\%$ mutation latency overhead and $2.0\times$ write amplification on primary OLTP transactions.
- **Arm B Constraints**:
  - **Neon Cloud Incompatibility for Edge Clients**: Edge mobile/desktop devices cannot connect directly to PostgreSQL replication slots. Neon serverless compute instances suspend (scale to zero) when idle; active replication slots block suspension. Furthermore, unacknowledged slots risk unbounded WAL accumulation and disk exhaustion.
  - **Lack of Native Row/Column Redaction**: Raw WAL decoding operates at the storage engine level and cannot dynamically evaluate per-user authorization without a processing intermediary.

Neither pure Arm A nor pure direct-to-database Arm B is viable as a stand-alone sync architecture.

---

## 2. Decision

We adopt a **Server-Mediated Hybrid Change-Feed Architecture**:

```
[PostgreSQL / Neon OLTP]
   │ (Transactions, Scripts, Background Jobs)
   ▼
[PostgreSQL WAL (pgoutput)]
   │ (Single managed replication slot: contractor_cdc_slot)
   ▼
[Server Sync Fanout Daemon] ─── (Slot Retention Circuit Breaker & Monitoring)
   │
   ├─► Ingests commit-ordered WAL stream (strict commit-LSN monotonicity)
   ├─► Evaluates Tenant Isolation & Column Redactions (strips sensitive fields)
   └─► Appends to Tenant Change Log (PostgreSQL sync_changes partition / Redis stream)
         │
         ▼ (HTTP / tRPC / WebSocket: sync.pullChanges({ afterLsn }))
[Native Edge Clients (Flutter / SQLite)]
   ├─► Durable Checkpoint Store (_sync_checkpoint: confirmed_flush_lsn)
   └─► Idempotent Deduplication Engine (_sync_inbox_dedup: event_id)
```

### Core Architectural Contracts:

### 1. Database Change Capture (Server-Side WAL / CDC)
- A single, dedicated server-side daemon (`contractor-cdc-worker`) attaches to a PostgreSQL logical replication slot (`pgoutput`).
- Captures 100% of mutations across all 425 system write pathways with **0% latency impact** and **1.0x write amplification** on primary database transactions.

### 2. Strict Commit-Order Guarantee
- The CDC daemon processes transactions strictly in `COMMIT` order using PostgreSQL Commit Log Sequence Numbers (`commit_lsn`).
- Mutations are assigned monotonically increasing 64-bit integer cursor positions within the tenant-partitioned change feed.
- Eliminates the late-commit race condition without requiring time-delayed polling windows.

### 3. Tenant Partitioning & Column-Level Redaction
- The CDC daemon filters events by `tenant_id` before persistence into tenant distribution queues.
- Applies strict schema-driven redactions: sensitive fields (e.g., employee PAN numbers, personal contact info, bank details, contractor unit bid margins, authentication credentials) are stripped before reaching the client transport.

### 4. Durable Client Checkpoints & Idempotent Replay
- Native Flutter clients persist synchronization state transactionally inside local SQLite:
  - `_sync_checkpoint`: Records the highest confirmed `commit_lsn`.
  - `_sync_inbox_dedup`: Records `(event_id, commit_lsn)` to ensure 100% idempotent deduplication during duplicate batch replays (network drop, crash before ACK).
- Entity mutations and checkpoint advancements are applied within a single atomic SQLite transaction.

### 5. Neon Replication Slot Retention & Circuit Breaker
- Only the centralized server CDC daemon connects to the PostgreSQL replication slot; mobile/desktop clients never hold database replication slots.
- To protect Neon compute storage from disk-full outages caused by worker crashes or stalls, an automated **Slot Retention Monitor** runs every 30 seconds:
  - Threshold: 5 GB retained WAL or 1 hour disconnected idle time.
  - Action: Automatically drops the replication slot via `pg_drop_replication_slot()`.
  - Recovery: Re-establishes slot baseline; clients presenting outdated bookmarks receive `410 Gone (RESYNC_REQUIRED)` and trigger authoritative snapshot reconciliation (M03 contract).

### 6. Operational Monitoring & Telemetry
The following metrics are exported via Prometheus / OpenTelemetry:
- `cdc_replication_lag_bytes`: Difference between current WAL LSN and slot confirmed LSN.
- `cdc_event_processing_latency_ms`: Time from transaction commit to tenant queue insertion.
- `cdc_slot_retention_bytes`: Total WAL storage held by the replication slot.
- `sync_client_batch_requests_total`: Throughput and latency of edge pull requests.
- `sync_circuit_breaker_events_total`: Counter for dropped replication slots.

---

## 3. Consequences

### Positive:
- **Complete Write Coverage**: Guarantees zero silent desynchronization; all 52 non-router write paths and future raw SQL scripts are automatically synchronized.
- **Zero Primary Transaction Overhead**: Eliminates the $+52.5\%$ latency overhead and $2.0\times$ write amplification of Arm A.
- **Strict Concurrency Safety**: Completely eliminates the 77.8% late-commit race condition; clients receive strictly ordered streams.
- **Cloud & Edge Separation**: Edge clients remain lightweight HTTP/WebSocket consumers, completely decoupled from PostgreSQL internal replication slots.
- **Neon Safe**: Slot retention circuit breaker eliminates disk-full hazards and respects Neon compute economics.

### Negative & Operational Costs:
- Requires operating and monitoring a background sync daemon service (`contractor-cdc-worker`).
- Requires initial snapshot resynchronization protocol when a client falls behind the retention horizon.

### Downstream Milestones:
- **Consuming Milestone**: **M03 (Native identity, repositories & sync)** will implement the client-side SQLite sync engine and server pull endpoints based on this contract.
- Milestone M03 is unblocked and confirmed on solid empirical ground.
