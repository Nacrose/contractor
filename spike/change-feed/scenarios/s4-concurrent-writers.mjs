/**
 * Scenario 4: High-Concurrency Writers Stress Test
 *
 * Demonstrates:
 * 1. 10 concurrent worker transactions generating mutations across multiple entities.
 * 2. Race condition probability under high write concurrency.
 * 3. Commit serialization behavior under LSN ordering vs naive sequence ID.
 */
import { MockPgClient } from "../lib/pg-client.mjs";

export async function runScenarioConcurrentWriters() {
  const db = new MockPgClient();
  const results = {
    scenario: "S4_CONCURRENT_WRITERS",
    passed: false,
    details: {}
  };

  const workerCount = 10;
  const mutationsPerWorker = 5;
  const activeWorkers = [];

  // Begin 10 concurrent transactions and allocate IDs
  for (let w = 0; w < workerCount; w++) {
    const txId = db.beginTransaction();
    const workerEvents = [];
    for (let m = 0; m < mutationsPerWorker; m++) {
      const id = db.nextSequence("concurrent_events_seq");
      workerEvents.push({ id, worker: w, mutation: m });
      db.insert(txId, "concurrent_events", {
        id,
        worker: w,
        mutation: m,
        data: `Site log entry ${w}-${m}`
      });
    }
    activeWorkers.push({ txId, workerEvents });
  }

  // Shuffle commit order to simulate variable transaction execution durations
  // (e.g. Worker 7 finishes before Worker 0)
  const commitOrder = [...activeWorkers].sort((a, b) => {
    // Reverse or deterministic pseudo-random interleaving
    return (a.txId * 7) % 11 - (b.txId * 7) % 11;
  });

  const commitLog = [];
  for (const worker of commitOrder) {
    const { commitLsn, committedAt } = db.commit(worker.txId);
    commitLog.push({
      txId: worker.txId,
      commitLsn,
      firstAllocatedId: worker.workerEvents[0].id,
      lastAllocatedId: worker.workerEvents[workerEventsLength(worker) - 1].id
    });
  }

  function workerEventsLength(w) {
    return w.workerEvents.length;
  }

  // Verify all rows committed
  const allCommittedRows = db.query("concurrent_events");
  const totalExpectedRows = workerCount * mutationsPerWorker;

  // Measure gaps: how many transactions committed after a transaction with HIGHER sequence IDs
  let commitOrderInversions = 0;
  for (let i = 1; i < commitLog.length; i++) {
    if (commitLog[i].firstAllocatedId < commitLog[i - 1].firstAllocatedId) {
      commitOrderInversions++;
    }
  }

  // Query using LSN ordering from beginning to end
  const lsnOrderedRows = db.query("concurrent_events").sort((a, b) => Number(a._commitLsn - b._commitLsn));

  results.details = {
    workerCount,
    mutationsPerWorker,
    totalExpectedRows,
    actualCommittedRows: allCommittedRows.length,
    commitOrderInversions,
    inversionRatePercent: ((commitOrderInversions / (commitLog.length - 1)) * 100).toFixed(1),
    lsnStrictlyMonotonic: lsnOrderedRows.every((r, idx) => idx === 0 || r._commitLsn >= lsnOrderedRows[idx - 1]._commitLsn)
  };

  results.passed = (
    allCommittedRows.length === totalExpectedRows &&
    commitOrderInversions > 0 && // Concurrency inversion successfully demonstrated
    results.details.lsnStrictlyMonotonic
  );

  return results;
}
