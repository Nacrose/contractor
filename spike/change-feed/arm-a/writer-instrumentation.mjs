/**
 * Change-Feed Spike Arm A: Application-Level Writer Instrumentation Prototype
 *
 * Implements:
 * 1. `withChangeCapture` transactional outbox decorator.
 * 2. Benchmark measuring latency overhead and write amplification.
 * 3. Coverage gap test showing silent desynchronization when writers bypass instrumentation.
 * 4. Grounded mathematical extrapolation across the 425 system write paths from M00-T07/T08.
 */
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";

export class OutboxManager {
  constructor() {
    this.events = [];
    this.entities = new Map();
    this.nextEventId = 1;
  }

  // Simulated raw database write (uninstrumented)
  rawDbWrite(entityType, id, data) {
    this.entities.set(`${entityType}:${id}`, { ...data, updatedAt: Date.now() });
    return { success: true, id };
  }

  // Arm A: Instrumented transactional write
  withChangeCapture(tenantId, userId, entityType, id, op, data, redactions = []) {
    // 1. Perform primary entity write
    this.entities.set(`${entityType}:${id}`, { ...data, updatedAt: Date.now() });

    // 2. Prepare sanitized / redacted payload
    const sanitizedData = { ...data };
    for (const field of redactions) {
      if (field in sanitizedData) {
        sanitizedData[field] = "[REDACTED]";
      }
    }

    // 3. Atomically write to outbox event log
    const event = {
      eventId: this.nextEventId++,
      tenantId,
      userId,
      entityType,
      entityId: id,
      op,
      payload: sanitizedData,
      createdAt: Date.now()
    };
    this.events.push(event);

    return { success: true, id, eventId: event.eventId };
  }

  pollChanges(tenantId, afterEventId = 0, limit = 50) {
    return this.events
      .filter((e) => e.tenantId === tenantId && e.eventId > afterEventId)
      .slice(0, limit);
  }
}

export function runArmABenchmark() {
  console.log("===============================================================================");
  console.log("       M00-T16: ARM A (WRITER INSTRUMENTATION) PROTOTYPE & BENCHMARK");
  console.log("===============================================================================");

  const manager = new OutboxManager();
  const iterations = 5000;

  // 1. Benchmark uninstrumented baseline writes
  const tBase0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    manager.rawDbWrite("DailyLog", `dl-${i}`, { weather: "Sunny", notes: "Excavation" });
  }
  const baseDurationMs = performance.now() - tBase0;
  const baseAvgMs = baseDurationMs / iterations;

  // 2. Benchmark instrumented writes with change capture & redaction
  const tArmA0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    manager.withChangeCapture(
      "tenant-alpha",
      "user-101",
      "DailyLog",
      `dl-inst-${i}`,
      "CREATE",
      { weather: "Sunny", notes: "Excavation", sensitiveWageRate: 1500, workerPan: "123456789" },
      ["sensitiveWageRate", "workerPan"]
    );
  }
  const armADurationMs = performance.now() - tArmA0;
  const armAAvgMs = armADurationMs / iterations;
  const overheadPerWriteMs = armAAvgMs - baseAvgMs;
  const overheadPercent = ((armADurationMs - baseDurationMs) / baseDurationMs) * 100;

  // 3. Coverage Gap Simulation: Representative Writers
  console.log(">>> Simulating System Writer Paths (Representative Subset)...");
  const writerLog = [];

  // Writer 1 (Instrumented): Daily Log Router
  const res1 = manager.withChangeCapture("tenant-alpha", "u1", "DailyLog", "dl-201", "CREATE", { title: "Pier 4 pour" });
  writerLog.push({ writer: "dailyLogRouter.create", instrumented: true, synced: true });

  // Writer 2 (Instrumented): IPC Submission Router
  const res2 = manager.withChangeCapture("tenant-alpha", "u1", "Ipc", "ipc-04", "UPDATE", { status: "SUBMITTED" });
  writerLog.push({ writer: "ipcRouter.submit", instrumented: true, synced: true });

  // Writer 3 (Instrumented): Attendance Background Cron Job
  const res3 = manager.withChangeCapture("tenant-alpha", "sys", "Attendance", "att-88", "UPDATE", { approved: true });
  writerLog.push({ writer: "attendanceJob.process", instrumented: true, synced: true });

  // Writer 4 (MISSED/UNINSTRUMENTED): Direct DB Reconciliation Script (e.g. apply-access-conversion.ts)
  manager.rawDbWrite("Project", "proj-99", { status: "ARCHIVED" });
  writerLog.push({ writer: "scripts/apply-access-conversion.ts", instrumented: false, synced: false });

  // Writer 5 (MISSED/UNINSTRUMENTED): Raw SQL Seeder / Fixer Script (e.g. fix-passwords.ts)
  manager.rawDbWrite("User", "user-admin", { role: "ADMIN" });
  writerLog.push({ writer: "scripts/setup-superadmin.ts", instrumented: false, synced: false });

  // Poll consumer for changes:
  const polled = manager.pollChanges("tenant-alpha", 0);
  const syncedEntities = new Set(polled.map((e) => `${e.entityType}:${e.entityId}`));

  const missedEntities = [
    { entity: "Project:proj-99", writer: "apply-access-conversion.ts", captured: syncedEntities.has("Project:proj-99") },
    { entity: "User:user-admin", writer: "setup-superadmin.ts", captured: syncedEntities.has("User:user-admin") }
  ];

  // 4. Mathematical Coverage Extrapolation from M00-T07/T08 Inventory
  // M00-T07: 79 routers, 402 mutations
  // M00-T08: 23 non-router writers, 51-62 direct database writes
  const totalWritePathways = 402 + 23; // 425
  const directBypassPaths = 56; // midpoint of 51-62
  const bypassPercentage = ((directBypassPaths / totalWritePathways) * 100).toFixed(1);

  const report = {
    benchmark: {
      iterations,
      baselineTotalMs: Number(baseDurationMs.toFixed(2)),
      baselineAvgMs: Number(baseAvgMs.toFixed(5)),
      armATotalMs: Number(armADurationMs.toFixed(2)),
      armAAvgMs: Number(armAAvgMs.toFixed(5)),
      overheadPerWriteMs: Number(overheadPerWriteMs.toFixed(5)),
      overheadPercent: Number(overheadPercent.toFixed(1)),
      writeAmplificationFactor: 2.0 // 1 entity insert + 1 outbox row
    },
    redactionValidation: {
      testedFields: ["sensitiveWageRate", "workerPan"],
      redactedInEvent: polled[0]?.payload?.sensitiveWageRate === "[REDACTED]" && polled[0]?.payload?.workerPan === "[REDACTED]"
    },
    coverageGaps: {
      testedWriters: writerLog,
      missedEntities,
      gapDemonstrated: missedEntities.every((m) => m.captured === false)
    },
    inventoryExtrapolation: {
      totalRouterMutations: 402,
      nonRouterWriters: 23,
      totalSystemWritePaths: totalWritePathways,
      directDbBypassPaths: directBypassPaths,
      bypassRiskPercentage: `${bypassPercentage}%`,
      manualInstrumentationCallSitesRequired: totalWritePathways
    }
  };

  console.log(`\nResults:`);
  console.log(`- Baseline Avg: ${(baseAvgMs * 1000).toFixed(2)} µs/op`);
  console.log(`- Arm A Avg:     ${(armAAvgMs * 1000).toFixed(2)} µs/op`);
  console.log(`- Overhead:      ${(overheadPerWriteMs * 1000).toFixed(2)} µs/op (+${overheadPercent.toFixed(1)}%)`);
  console.log(`- Write Amplification: 2.0x (1 entity row + 1 outbox row)`);
  console.log(`- Coverage Gap: Uninstrumented writers dropped 100% of mutations`);
  console.log(`- System Write Paths: 425 total, ${directBypassPaths} direct DB writes (${bypassPercentage}% gap risk)`);

  writeFileSync(
    new URL("./arm-a-results.json", import.meta.url),
    JSON.stringify(report, null, 2)
  );

  return report;
}

if (process.argv[1]?.endsWith("writer-instrumentation.mjs")) {
  runArmABenchmark();
}
