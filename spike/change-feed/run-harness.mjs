/**
 * Master Change-Feed Spike Evaluation Harness Runner (M00-T15)
 *
 * Runs all 5 core change-feed evaluation scenarios headless and emits
 * pass/fail status with an exit code:
 * - S1: Late-Commit Order Hazard (Demonstrates gap loss vs LSN serialization)
 * - S2: Crash & Restart Replay (Duplicate delivery & client idempotency)
 * - S3: Replication Slot Retention (WAL growth monitoring & circuit breaker)
 * - S4: High-Concurrency Writers (Inversion rate & commit ordering)
 * - S5: Consumer Checkpoint Store (Monotonic cursor enforcement & reset)
 */
import { writeFileSync } from "node:fs";
import { runScenarioLateCommit } from "./scenarios/s1-late-commit.mjs";
import { runScenarioCrashReplay } from "./scenarios/s2-crash-replay.mjs";
import { runScenarioSlotRetention } from "./scenarios/s3-slot-retention.mjs";
import { runScenarioConcurrentWriters } from "./scenarios/s4-concurrent-writers.mjs";
import { runScenarioCheckpointStore } from "./scenarios/s5-checkpoint-store.mjs";

async function runAllScenarios() {
  console.log("===============================================================================");
  console.log("       M00-T15: CHANGE-FEED SPIKE EVALUATION HARNESS RUNNER");
  console.log("===============================================================================");
  console.log(`Node: ${process.version} | Timestamp: ${new Date().toISOString()}`);
  console.log("-------------------------------------------------------------------------------\n");

  const scenarios = [
    { id: "S1", name: "Late-Commit Order Hazard", fn: runScenarioLateCommit },
    { id: "S2", name: "Crash & Restart Replay", fn: runScenarioCrashReplay },
    { id: "S3", name: "Replication Slot Retention", fn: runScenarioSlotRetention },
    { id: "S4", name: "High-Concurrency Writers", fn: runScenarioConcurrentWriters },
    { id: "S5", name: "Consumer Checkpoint Store", fn: runScenarioCheckpointStore }
  ];

  const results = [];
  let allPassed = true;

  for (const s of scenarios) {
    try {
      const res = await s.fn();
      const statusIcon = res.passed ? "✓ PASS" : "✗ FAIL";
      console.log(`[${statusIcon}] [${s.id}] ${s.name}`);
      console.log(`       Details:`, JSON.stringify(res.details, null, 2).replace(/\n/g, "\n       "));
      console.log("");
      results.push(res);
      if (!res.passed) allPassed = false;
    } catch (err) {
      console.error(`[✗ ERROR] [${s.id}] ${s.name}:`, err);
      results.push({ scenario: s.id, passed: false, error: err.message });
      allPassed = false;
    }
  }

  console.log("===============================================================================");
  console.log(`SUMMARY: ${results.filter((r) => r.passed).length} / ${results.length} Scenarios Passed`);
  console.log("===============================================================================");

  const summary = {
    executedAt: new Date().toISOString(),
    totalScenarios: results.length,
    passedScenarios: results.filter((r) => r.passed).length,
    allPassed,
    results
  };

  writeFileSync(
    new URL("./harness-results.json", import.meta.url),
    JSON.stringify(summary, null, 2)
  );
  console.log("Results saved to spike/change-feed/harness-results.json\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runAllScenarios();
