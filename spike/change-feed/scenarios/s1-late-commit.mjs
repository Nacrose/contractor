/**
 * Scenario 1: Commit-Order Hazard (The Late-Commit Race)
 *
 * Demonstrates:
 * 1. How sequential ID or timestamp allocation causes silent gap loss when transactions
 *    commit out-of-order.
 * 2. How commit-LSN / CSN serialization prevents this hazard.
 */
import { MockPgClient } from "../lib/pg-client.mjs";

export async function runScenarioLateCommit() {
  const db = new MockPgClient();
  const results = {
    scenario: "S1_LATE_COMMIT_HAZARD",
    passed: false,
    details: {}
  };

  // Step 1: Tx 1 begins (slow transaction)
  const tx1 = db.beginTransaction();
  const id1 = db.nextSequence("events_seq"); // ID 1
  db.insert(tx1, "change_events", {
    id: id1,
    entity: "Project",
    data: "Bridge Foundation Excavation"
  });

  // Step 2: Tx 2 begins (fast transaction)
  const tx2 = db.beginTransaction();
  const id2 = db.nextSequence("events_seq"); // ID 2
  db.insert(tx2, "change_events", {
    id: id2,
    entity: "Project",
    data: "Culvert Reinforcement"
  });

  // Step 3: Tx 2 commits BEFORE Tx 1!
  const commit2 = db.commit(tx2);

  // Step 4: Consumer 1 polls change feed with naive sequence checkpoint (cursor = 0)
  // Only committed rows are visible
  const poll1 = db.query("change_events", (row) => row.id > 0);
  const naiveCheckpoint = Math.max(...poll1.map((r) => r.id)); // Checkpoint = 2

  // Step 5: Tx 1 finally commits AFTER consumer polled!
  const commit1 = db.commit(tx1);

  // Step 6: Consumer polls next batch using naive sequence checkpoint (WHERE id > 2)
  const poll2 = db.query("change_events", (row) => row.id > naiveCheckpoint);

  // Verification of the Hazard:
  const wasId1SkippedInNaiveSync = !poll1.some((r) => r.id === id1) && !poll2.some((r) => r.id === id1);

  // Step 7: LSN-Ordered / Commit-Log Poll (Arm B / Logical Decoding Model)
  // Consumer polls by commit LSN instead of pre-allocated sequence ID:
  const lsnPoll1 = db.query("change_events", (row) => row._commitLsn > 1000n && row._commitLsn <= commit2.commitLsn);
  const lsnPoll2 = db.query("change_events", (row) => row._commitLsn > commit2.commitLsn);

  const wasId1CapturedInLsnSync = lsnPoll2.some((r) => r.id === id1);

  results.details = {
    tx1AllocatedId: id1,
    tx2AllocatedId: id2,
    commitOrder: [tx2, tx1],
    naiveCheckpoint,
    naivePoll1Items: poll1.map((r) => r.id),
    naivePoll2Items: poll2.map((r) => r.id),
    wasId1SkippedInNaiveSync,
    lsnCommit1: commit1.commitLsn.toString(),
    lsnCommit2: commit2.commitLsn.toString(),
    wasId1CapturedInLsnSync
  };

  // The scenario passes if the hazard was successfully reproduced AND proven solved by commit-LSN ordering
  results.passed = wasId1SkippedInNaiveSync && wasId1CapturedInLsnSync;
  return results;
}
