/**
 * Scenario 2: Crash & Restart Replay (Duplicate Delivery Injection)
 *
 * Demonstrates:
 * 1. Process termination (crash) before commit acknowledgement.
 * 2. Duplicate delivery of change-feed batches upon reconnect.
 * 3. Client idempotency protection via mutation deduplication keys.
 */
import { CrashReplayHarness } from "../lib/crash-injector.mjs";

export async function runScenarioCrashReplay() {
  const harness = new CrashReplayHarness();
  const results = {
    scenario: "S2_CRASH_RESTART_REPLAY",
    passed: false,
    details: {}
  };

  // Step 1: Batch of 5 changes delivered from server
  const batch1 = [
    { mutationId: "mut-001", entityId: "proj-1", version: 1, payload: { name: "Highway Package 1", status: "DRAFT" } },
    { mutationId: "mut-002", entityId: "task-1", version: 1, payload: { name: "Clear & Grub", duration: 5 } },
    { mutationId: "mut-003", entityId: "task-2", version: 1, payload: { name: "Excavation", duration: 10 } },
    { mutationId: "mut-004", entityId: "boq-1", version: 1, payload: { code: "1.01", qty: 500 } },
    { mutationId: "mut-005", entityId: "proj-1", version: 2, payload: { name: "Highway Package 1", status: "ACTIVE" } }
  ];

  // Apply batch 1 locally
  for (const event of batch1) {
    harness.applyEventIdempotent(event);
  }

  // Baseline client entities
  const initialEntitiesCount = harness.clientEntities.size;
  const initialProjStatus = harness.clientEntities.get("proj-1")?.status;

  // Step 2: Crash injection!
  // Client unpersisted checkpoint was 5, durable checkpoint was 0.
  const crashState = harness.simulateCrashAndRestart(5, 0);

  // Step 3: Reconnection replay — server re-sends batch 1 because checkpoint wasn't ACKed!
  const replayOutcomes = [];
  for (const event of batch1) {
    const res = harness.applyEventIdempotent(event);
    replayOutcomes.push(res);
  }

  // Step 4: Verify that all replayed events were cleanly deduplicated without corrupting entities
  const finalEntitiesCount = harness.clientEntities.size;
  const finalProjStatus = harness.clientEntities.get("proj-1")?.status;
  const allDeduplicated = replayOutcomes.every((r) => r.status === "DEDUPLICATED");

  // Step 5: Contrast with non-idempotent collector
  const nonIdempotentLog = [];
  for (const event of batch1) harness.applyEventNonIdempotent(event, nonIdempotentLog);
  for (const event of batch1) harness.applyEventNonIdempotent(event, nonIdempotentLog); // Duplicate run

  results.details = {
    batchSize: batch1.length,
    crashState,
    initialEntitiesCount,
    finalEntitiesCount,
    initialProjStatus,
    finalProjStatus,
    duplicatesEncountered: harness.duplicatesEncountered,
    successfulIdempotentApplies: harness.successfulIdempotentApplies,
    allDeduplicated,
    nonIdempotentEntriesCount: nonIdempotentLog.length // Should be 10 (corrupted double insert)
  };

  results.passed = (
    allDeduplicated &&
    initialEntitiesCount === finalEntitiesCount &&
    finalProjStatus === "ACTIVE" &&
    harness.duplicatesEncountered === batch1.length &&
    nonIdempotentLog.length === batch1.length * 2
  );

  return results;
}
