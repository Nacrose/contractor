/**
 * Scenario 5: Consumer Checkpoint Store & Monotonic Validation
 *
 * Demonstrates:
 * 1. Persistent cursor tracking across multiple consumers.
 * 2. Rejection of non-monotonic or retroactive cursor movements.
 * 3. Formal reset workflow for snapshot re-sync.
 */
import { CheckpointStore } from "../lib/checkpoint-store.mjs";

export async function runScenarioCheckpointStore() {
  const store = new CheckpointStore();
  const results = {
    scenario: "S5_CHECKPOINT_STORE_VALIDATION",
    passed: false,
    details: {}
  };

  const consumerId = "client-field-ipad-01";

  // Step 1: Initial checkpoint saved (LSN 5000)
  const cp1 = store.saveCheckpoint(consumerId, 5000n, { batchSize: 50 });

  // Step 2: Next valid advancing checkpoint saved (LSN 5200)
  const cp2 = store.saveCheckpoint(consumerId, 5200n, { batchSize: 20 });

  // Step 3: Attempt retroactive / backwards checkpoint (LSN 4800) -> MUST FAIL!
  let retroactiveRejected = false;
  try {
    store.saveCheckpoint(consumerId, 4800n, { batchSize: 10 });
  } catch (err) {
    if (err.message.includes("Non-monotonic checkpoint rejected")) {
      retroactiveRejected = true;
    }
  }

  // Step 4: Legitimate authorized reset to restart sync (e.g. after schema rebuild)
  const resetCp = store.resetCheckpoint(consumerId, 1000n, "schema_rebuild_resync");

  const finalState = store.getCheckpoint(consumerId);

  results.details = {
    consumerId,
    initialCursor: cp1.cursor.toString(),
    advancedCursor: cp2.cursor.toString(),
    retroactiveRejected,
    resetCursor: resetCp.cursor.toString(),
    versionHistoryCount: finalState.history.length
  };

  results.passed = (
    cp1.cursor === 5000n &&
    cp2.cursor === 5200n &&
    retroactiveRejected === true &&
    finalState.cursor === 1000n &&
    finalState.version === 3
  );

  return results;
}
