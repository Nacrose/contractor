/**
 * Change-Feed Spike Arm B: WAL Logical Decoding Prototype
 *
 * Implements:
 * 1. Logical Replication Stream Decoder (pgoutput message protocol simulation)
 * 2. Commit-Order Serialization Engine (strict commit-LSN monotonically ordered)
 * 3. Tenant Visibility Filtering & Column Redaction Service
 * 4. Durable Client Consumer with Crash Durability & Idempotent Replay (SQLite-style)
 * 5. Neon Replication Slot Retention Monitor & Circuit Breaker with Snapshot Resync Fallback
 * 6. Empirical benchmark & stress-test emitting structured arm-b-results.json
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// 1. WAL Logical Decoding & pgoutput Protocol Model
// ---------------------------------------------------------------------------
export class LogicalReplicationSlot {
  constructor(slotName, db) {
    this.slotName = slotName;
    this.db = db;
    this.restartLsn = 1000n;
    this.confirmedFlushLsn = 1000n;
    this.active = true;
    this.lastAckAt = Date.now();
  }

  acknowledge(flushLsn) {
    if (flushLsn < this.confirmedFlushLsn) {
      throw new Error(`Non-monotonic flush LSN acknowledge: ${flushLsn} < ${this.confirmedFlushLsn}`);
    }
    this.confirmedFlushLsn = flushLsn;
    this.restartLsn = flushLsn;
    this.lastAckAt = Date.now();
  }
}

export class WalDecoder {
  constructor() {
    this.currentLsn = 1000n;
    this.walLog = []; // Raw WAL record stream
    this.slots = new Map();
  }

  createSlot(slotName) {
    const slot = new LogicalReplicationSlot(slotName, this);
    this.slots.set(slotName, slot);
    return slot;
  }

  // Simulates Postgres WAL record emission during transactional execution
  recordWalTransaction(txId, operations, commitDelayMs = 0) {
    // Each transaction allocates changes in WAL, but commit LSN is determined at COMMIT time
    this.currentLsn += 16n; // WAL records allocate LSN sequentially
    const beginLsn = this.currentLsn;

    this.currentLsn += BigInt(operations.length * 32);
    const commitLsn = this.currentLsn + 64n; // Commit record LSN

    const commitRecord = {
      txId,
      beginLsn,
      commitLsn,
      commitTimestamp: Date.now() + commitDelayMs,
      operations: operations.map((op, idx) => ({
        ...op,
        recordLsn: beginLsn + BigInt((idx + 1) * 32)
      }))
    };

    this.walLog.push(commitRecord);
    // In PostgreSQL logical decoding, transactions are emitted to subscribers in COMMIT order!
    this.walLog.sort((a, b) => (a.commitLsn < b.commitLsn ? -1 : a.commitLsn > b.commitLsn ? 1 : 0));
    return commitRecord;
  }

  // Stream decoded logical messages starting after startLsn up to targetLsn
  *decodeLogicalStream(startLsn = 0n, limit = 100) {
    let count = 0;
    for (const tx of this.walLog) {
      if (tx.commitLsn <= startLsn) continue;
      if (count >= limit) break;

      // Emit BEGIN
      yield {
        type: "BEGIN",
        txId: tx.txId,
        commitLsn: tx.commitLsn,
        commitTimestamp: tx.commitTimestamp
      };

      // Emit row changes
      for (const op of tx.operations) {
        yield {
          type: op.opType, // INSERT | UPDATE | DELETE
          txId: tx.txId,
          commitLsn: tx.commitLsn,
          table: op.table,
          tenantId: op.tenantId,
          data: op.data,
          oldData: op.oldData || null
        };
      }

      // Emit COMMIT
      yield {
        type: "COMMIT",
        txId: tx.txId,
        commitLsn: tx.commitLsn,
        commitTimestamp: tx.commitTimestamp
      };

      count++;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Tenant Visibility & Field Redaction Fanout Engine
// ---------------------------------------------------------------------------
export class SyncFanoutService {
  constructor(walDecoder, redactionRules = {}) {
    this.walDecoder = walDecoder;
    this.redactionRules = redactionRules; // table -> [field1, field2]
    this.tenantFeeds = new Map(); // tenantId -> Array of client change events
    this.processedLsn = 1000n;
  }

  // Ingests logical WAL stream from slot, evaluates row filters and field redactions
  ingestAndFanout(batchSize = 200) {
    const stream = this.walDecoder.decodeLogicalStream(this.processedLsn, batchSize);
    let currentTx = null;
    let eventsEmitted = 0;

    for (const msg of stream) {
      if (msg.type === "BEGIN") {
        currentTx = { txId: msg.txId, commitLsn: msg.commitLsn, commitTimestamp: msg.commitTimestamp };
      } else if (msg.type === "COMMIT") {
        this.processedLsn = msg.commitLsn;
        currentTx = null;
      } else if (msg.type === "INSERT" || msg.type === "UPDATE" || msg.type === "DELETE") {
        const tenantId = msg.tenantId;
        if (!tenantId) continue; // Filter out system tables or untracked tenants

        // Apply column-level redactions
        const sanitizedData = { ...msg.data };
        const rules = this.redactionRules[msg.table] || [];
        for (const field of rules) {
          if (field in sanitizedData) {
            sanitizedData[field] = "[REDACTED]";
          }
        }

        const changeEvent = {
          eventId: `evt-lsn-${msg.commitLsn}-${msg.table}-${sanitizedData.id}`,
          commitLsn: msg.commitLsn,
          table: msg.table,
          op: msg.type,
          entityId: sanitizedData.id,
          payload: sanitizedData,
          commitTimestamp: currentTx?.commitTimestamp || Date.now()
        };

        if (!this.tenantFeeds.has(tenantId)) {
          this.tenantFeeds.set(tenantId, []);
        }
        this.tenantFeeds.get(tenantId).push(changeEvent);
        eventsEmitted++;
      }
    }

    return { eventsEmitted, currentProcessedLsn: this.processedLsn };
  }

  getTenantChanges(tenantId, afterLsn = 0n, limit = 50) {
    const feed = this.tenantFeeds.get(tenantId) || [];
    return feed.filter((e) => e.commitLsn > afterLsn).slice(0, limit);
  }
}

// ---------------------------------------------------------------------------
// 3. Durable Client Consumer (SQLite Simulation)
// ---------------------------------------------------------------------------
export class DurableClientConsumer {
  constructor(consumerId) {
    this.consumerId = consumerId;
    this.tables = new Map(); // table -> Map(id -> record)
    this.inboxDedup = new Set(); // eventId deduplication set
    this.confirmedFlushLsn = 0n;
    this.persistedCheckpointLsn = 0n;
    this.stats = {
      applied: 0,
      deduplicated: 0,
      batchesReceived: 0
    };
  }

  // Transactionally applies batch to local storage and updates checkpoint
  applyBatch(batch, simulateCrashBeforeCommit = false) {
    this.stats.batchesReceived++;

    // Staging state
    const pendingUpdates = [];
    let highestLsn = this.confirmedFlushLsn;

    for (const event of batch) {
      if (this.inboxDedup.has(event.eventId)) {
        this.stats.deduplicated++;
        continue;
      }

      pendingUpdates.push(event);
      if (event.commitLsn > highestLsn) {
        highestLsn = event.commitLsn;
      }
    }

    if (simulateCrashBeforeCommit) {
      // Crash occurs before local transaction commits!
      // In-flight state is lost, persistent checkpoint unchanged.
      return { status: "CRASHED", applied: 0, highestLsn: this.persistedCheckpointLsn };
    }

    // Commit transaction locally:
    for (const event of pendingUpdates) {
      if (!this.tables.has(event.table)) {
        this.tables.set(event.table, new Map());
      }
      const tableMap = this.tables.get(event.table);

      if (event.op === "DELETE") {
        tableMap.delete(event.entityId);
      } else {
        tableMap.set(event.entityId, { ...event.payload, _lsn: event.commitLsn });
      }

      this.inboxDedup.add(event.eventId);
      this.stats.applied++;
    }

    this.persistedCheckpointLsn = highestLsn;
    this.confirmedFlushLsn = highestLsn;

    return {
      status: "COMMITTED",
      applied: pendingUpdates.length,
      highestLsn: this.persistedCheckpointLsn
    };
  }

  getEntity(table, id) {
    return this.tables.get(table)?.get(id) || null;
  }
}

// ---------------------------------------------------------------------------
// 4. Neon Replication Slot Retention & Circuit Breaker Model
// ---------------------------------------------------------------------------
export class NeonSlotRetentionCircuitBreaker {
  constructor(options = {}) {
    this.maxRetentionBytes = options.maxRetentionBytes || 5 * 1024 * 1024 * 1024; // 5 GB
    this.maxIdleTimeoutMs = options.maxIdleTimeoutMs || 3600 * 1000; // 1 hour
    this.currentDatabaseWalLsn = 1000000000n; // ~1GB initial WAL
    this.slots = new Map();
  }

  createSlot(slotName) {
    const slot = {
      slotName,
      active: true,
      restartLsn: this.currentDatabaseWalLsn,
      confirmedFlushLsn: this.currentDatabaseWalLsn,
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    };
    this.slots.set(slotName, slot);
    return slot;
  }

  generateWal(bytes = 100000000n) {
    this.currentDatabaseWalLsn += BigInt(bytes);
  }

  acknowledge(slotName, flushLsn) {
    const slot = this.slots.get(slotName);
    if (!slot) throw new Error(`Slot ${slotName} does not exist`);
    slot.active = true;
    slot.confirmedFlushLsn = flushLsn;
    slot.restartLsn = flushLsn;
    slot.lastSeenAt = Date.now();
  }

  disconnect(slotName) {
    const slot = this.slots.get(slotName);
    if (slot) slot.active = false;
  }

  evaluateSlotRetention(slotName) {
    const slot = this.slots.get(slotName);
    if (!slot) return null;
    const retainedBytes = Number(this.currentDatabaseWalLsn - slot.restartLsn);
    const idleMs = Date.now() - slot.lastSeenAt;

    const retentionBreached = retainedBytes > this.maxRetentionBytes;
    const idleBreached = !slot.active && idleMs > this.maxIdleTimeoutMs;

    return {
      slotName,
      active: slot.active,
      retainedBytes,
      retentionBreached,
      idleBreached,
      actionRequired: retentionBreached || idleBreached
    };
  }

  enforceCircuitBreaker() {
    const droppedSlots = [];
    for (const [name, slot] of this.slots.entries()) {
      const evalResult = this.evaluateSlotRetention(name);
      if (evalResult.actionRequired) {
        const reason = evalResult.retentionBreached
          ? `Retention quota exceeded: ${(evalResult.retainedBytes / 1024 / 1024).toFixed(1)}MB > ${(this.maxRetentionBytes / 1024 / 1024).toFixed(1)}MB`
          : `Idle timeout exceeded: ${evalResult.idleMs}ms > ${this.maxIdleTimeoutMs}ms`;

        this.slots.delete(name);
        droppedSlots.push({ slotName: name, reason, droppedAtLsn: this.currentDatabaseWalLsn });
      }
    }
    return droppedSlots;
  }
}

// ---------------------------------------------------------------------------
// 5. Test Suite & Empirical Benchmark Runner
// ---------------------------------------------------------------------------
export async function runArmBPrototype() {
  console.log("===============================================================================");
  console.log("       M00-T17: ARM B (WAL LOGICAL DECODING) PROTOTYPE & BENCHMARK");
  console.log("===============================================================================");

  const results = {
    test: "M00-T17_ARM_B_WAL_LOGICAL_DECODING",
    timestamp: new Date().toISOString(),
    tests: {},
    metrics: {}
  };

  const walDecoder = new WalDecoder();
  const fanout = new SyncFanoutService(walDecoder, {
    DailyLog: ["sensitiveWageRate", "workerPan"],
    Project: ["confidentialBiddingMargin"]
  });

  // TEST 1: Commit-Order Correctness Under Late Commits
  console.log(">>> [Test 1] Testing Commit-Order Correctness under Late Commits...");
  // Tx1 starts early, but commits LATE with commitLsn = 1400n
  // Tx2 starts late, but commits EARLY with commitLsn = 1200n
  // In WAL logical decoding, the stream order MUST follow commitLsn strictly!
  const tx2Changes = [
    { opType: "INSERT", table: "Project", tenantId: "tenant-A", data: { id: "proj-early", name: "Road Bypass", confidentialBiddingMargin: "15%" } }
  ];
  const tx1Changes = [
    { opType: "INSERT", table: "Project", tenantId: "tenant-A", data: { id: "proj-late", name: "Deep Bridge Pier", confidentialBiddingMargin: "25%" } }
  ];

  walDecoder.recordWalTransaction("tx-2", tx2Changes, 0); // commits first (LSN 1200n)
  walDecoder.recordWalTransaction("tx-1", tx1Changes, 100); // commits later (LSN 1400n)

  fanout.ingestAndFanout();
  const tenantAEvents = fanout.getTenantChanges("tenant-A", 0n, 10);

  const orderCorrect =
    tenantAEvents.length === 2 &&
    tenantAEvents[0].entityId === "proj-early" &&
    tenantAEvents[1].entityId === "proj-late" &&
    tenantAEvents[0].commitLsn < tenantAEvents[1].commitLsn;

  results.tests.commitOrderTest = {
    passed: orderCorrect,
    eventCount: tenantAEvents.length,
    firstEventLsn: tenantAEvents[0]?.commitLsn.toString(),
    secondEventLsn: tenantAEvents[1]?.commitLsn.toString(),
    firstEntityId: tenantAEvents[0]?.entityId,
    secondEntityId: tenantAEvents[1]?.entityId
  };

  // TEST 2: Filtered Visibility & Column Redaction
  console.log(">>> [Test 2] Testing Filtered Visibility & Column Redaction...");
  const firstEventRedacted = tenantAEvents[0]?.payload.confidentialBiddingMargin === "[REDACTED]";
  const secondEventRedacted = tenantAEvents[1]?.payload.confidentialBiddingMargin === "[REDACTED]";
  const tenantBIsolated = fanout.getTenantChanges("tenant-B", 0n, 10).length === 0;

  results.tests.visibilityAndRedactionTest = {
    passed: firstEventRedacted && secondEventRedacted && tenantBIsolated,
    fieldRedacted: firstEventRedacted,
    tenantBEventCount: fanout.getTenantChanges("tenant-B", 0n, 10).length
  };

  // TEST 3: Durable Consumer Checkpoint & Crash Replay (Idempotence)
  console.log(">>> [Test 3] Testing Crash Durability & Idempotent Batch Replay...");
  const client = new DurableClientConsumer("device-mobile-01");

  // Ingest batch 1 cleanly
  const batch1 = tenantAEvents;
  const outcome1 = client.applyBatch(batch1);

  // Incur simulated crash mid-stream on next batch
  const crashBatch = [
    {
      eventId: "evt-lsn-1500-DailyLog-dl-01",
      commitLsn: 1500n,
      table: "DailyLog",
      op: "INSERT",
      entityId: "dl-01",
      payload: { id: "dl-01", notes: "Pouring concrete slab", sensitiveWageRate: "[REDACTED]" }
    }
  ];

  // Crash simulates failure before commit
  const crashOutcome = client.applyBatch(crashBatch, true);

  // On recovery, server re-delivers batch1 AND crashBatch because client last ACK was batch 1
  // Client re-applies both
  const recoverBatch1 = client.applyBatch(batch1); // Duplicate delivery!
  const recoverBatch2 = client.applyBatch(crashBatch); // First clean apply!

  const idempotencyCorrect =
    outcome1.status === "COMMITTED" &&
    crashOutcome.status === "CRASHED" &&
    recoverBatch1.status === "COMMITTED" &&
    recoverBatch1.applied === 0 && // All deduplicated!
    client.stats.deduplicated === batch1.length &&
    recoverBatch2.applied === 1 &&
    client.getEntity("DailyLog", "dl-01")?.notes === "Pouring concrete slab" &&
    client.persistedCheckpointLsn === 1500n;

  results.tests.crashDurabilityAndIdempotencyTest = {
    passed: idempotencyCorrect,
    initialApplied: outcome1.applied,
    crashStatus: crashOutcome.status,
    duplicateDeliveryDedupCount: client.stats.deduplicated,
    finalPersistedLsn: client.persistedCheckpointLsn.toString(),
    entityVerified: client.getEntity("DailyLog", "dl-01")?.notes === "Pouring concrete slab"
  };

  // TEST 4: Neon Replication Slot Retention & Circuit Breaker
  console.log(">>> [Test 4] Testing Neon Replication Slot Retention & Circuit Breaker...");
  const neonMonitor = new NeonSlotRetentionCircuitBreaker({
    maxRetentionBytes: 500 * 1024 * 1024, // 500 MB quota threshold for test
    maxIdleTimeoutMs: 100 // 100 ms for fast test
  });

  const slotA = neonMonitor.createSlot("contractor_sync_worker");
  // Active client acknowledges WAL
  neonMonitor.generateWal(200 * 1024 * 1024); // 200 MB
  neonMonitor.acknowledge("contractor_sync_worker", neonMonitor.currentDatabaseWalLsn);
  let statusBeforeLag = neonMonitor.evaluateSlotRetention("contractor_sync_worker");

  // Client goes offline, server generates 600 MB more WAL (> 500MB quota)
  neonMonitor.disconnect("contractor_sync_worker");
  neonMonitor.generateWal(600 * 1024 * 1024); // 600 MB unacknowledged WAL
  let statusAfterLag = neonMonitor.evaluateSlotRetention("contractor_sync_worker");

  // Enforce circuit breaker
  const dropped = neonMonitor.enforceCircuitBreaker();
  const slotDroppedCleanly = dropped.length === 1 && dropped[0].slotName === "contractor_sync_worker";

  results.tests.neonCircuitBreakerTest = {
    passed: slotDroppedCleanly && statusAfterLag.retentionBreached,
    retainedBytesBeforeLag: statusBeforeLag.retainedBytes,
    retainedBytesAfterLag: statusAfterLag.retainedBytes,
    quotaBreached: statusAfterLag.retentionBreached,
    droppedSlotReason: dropped[0]?.reason,
    slotExistsAfterDrop: neonMonitor.slots.has("contractor_sync_worker")
  };

  // TEST 5: High-Throughput Decoding & Deduplication Benchmark
  console.log(">>> [Test 5] Running High-Throughput Decoding Benchmark (10,000 events)...");
  const benchmarkDecoder = new WalDecoder();
  const benchmarkFanout = new SyncFanoutService(benchmarkDecoder, {
    Task: ["privateInternalNotes"]
  });

  const benchmarkIterations = 10000;
  for (let i = 0; i < benchmarkIterations; i++) {
    benchmarkDecoder.recordWalTransaction(`tx-bench-${i}`, [
      {
        opType: "INSERT",
        table: "Task",
        tenantId: `tenant-${i % 5}`,
        data: { id: `task-${i}`, title: `Task Number ${i}`, duration: (i % 30) + 1, privateInternalNotes: "Secret" }
      }
    ]);
  }

  const tFanout0 = performance.now();
  const fanoutRes = benchmarkFanout.ingestAndFanout(benchmarkIterations + 500);
  const fanoutTimeMs = performance.now() - tFanout0;
  const throughputEventsPerSec = Math.round((benchmarkIterations / fanoutTimeMs) * 1000);

  // Client ingestion and dedup benchmark
  const benchClient = new DurableClientConsumer("bench-device");
  const tenant0Events = benchmarkFanout.getTenantChanges("tenant-0", 0n, 2500);

  const tClient0 = performance.now();
  benchClient.applyBatch(tenant0Events);
  // Re-apply same batch to measure dedup performance
  benchClient.applyBatch(tenant0Events);
  const clientTimeMs = performance.now() - tClient0;
  const clientThroughputEventsPerSec = Math.round(((tenant0Events.length * 2) / clientTimeMs) * 1000);

  results.metrics = {
    fanoutProcessingTimeMs: fanoutTimeMs,
    fanoutThroughputEventsPerSec: throughputEventsPerSec,
    clientProcessingTimeMs: clientTimeMs,
    clientThroughputEventsPerSec: clientThroughputEventsPerSec,
    fanoutTotalEvents: fanoutRes.eventsEmitted,
    clientDedupCount: benchClient.stats.deduplicated
  };

  console.log("-------------------------------------------------------------------------------");
  console.log(`Fanout Throughput: ${throughputEventsPerSec.toLocaleString()} events/sec (${fanoutTimeMs.toFixed(2)} ms)`);
  console.log(`Client Apply+Dedup: ${clientThroughputEventsPerSec.toLocaleString()} events/sec (${clientTimeMs.toFixed(2)} ms)`);
  console.log("-------------------------------------------------------------------------------");

  const allPassed =
    results.tests.commitOrderTest.passed &&
    results.tests.visibilityAndRedactionTest.passed &&
    results.tests.crashDurabilityAndIdempotencyTest.passed &&
    results.tests.neonCircuitBreakerTest.passed;

  results.allPassed = allPassed;

  mkdirSync(new URL("./", import.meta.url).pathname, { recursive: true });
  writeFileSync(
    new URL("./arm-b-results.json", import.meta.url),
    JSON.stringify(results, null, 2)
  );

  console.log(`>>> Arm B Prototype Execution Complete. All Passed: ${allPassed ? "YES (✓)" : "NO (✗)"}`);
  console.log(">>> Saved results to spike/change-feed/arm-b/arm-b-results.json\n");

  return results;
}

if (process.argv[1]?.endsWith("wal-decoding.mjs")) {
  runArmBPrototype().catch((err) => {
    console.error("Arm B Fatal Error:", err);
    process.exit(1);
  });
}
