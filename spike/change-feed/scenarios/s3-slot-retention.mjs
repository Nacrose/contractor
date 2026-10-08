/**
 * Scenario 3: Replication Slot Retention & Disk Exhaustion Hazard
 *
 * Demonstrates:
 * 1. Accumulation of PostgreSQL WAL when a replication slot consumer is offline.
 * 2. Retention budget monitoring and circuit-breaker slot drop.
 * 3. Cutover to snapshot re-synchronization when a slot is dropped.
 */
import { SlotRetentionMonitor } from "../lib/slot-monitor.mjs";

export async function runScenarioSlotRetention() {
  const monitor = new SlotRetentionMonitor({
    maxRetentionBytes: 100 * 1024 * 1024, // 100 MB test budget
    maxIdleDurationMs: 5000 // 5 second test idle timeout
  });

  const results = {
    scenario: "S3_SLOT_RETENTION_CIRCUIT_BREAKER",
    passed: false,
    details: {}
  };

  // Step 1: Client A (active desktop) and Client B (field tablet on offline site)
  const slotA = monitor.createSlot("slot_desktop_client");
  const slotB = monitor.createSlot("slot_field_tablet");

  // Step 2: Database generates 40 MB of WAL
  monitor.advanceDatabaseWal(40n * 1024n * 1024n);

  // Client A acknowledges WAL up to current position
  monitor.acknowledgeSlot("slot_desktop_client", monitor.currentLsn);

  // Client B is disconnected (offline)
  monitor.disconnectSlot("slot_field_tablet");

  const status1A = monitor.getSlotRetention("slot_desktop_client");
  const status1B = monitor.getSlotRetention("slot_field_tablet");

  // Step 3: High database activity adds another 80 MB of WAL (Total 120 MB > 100 MB budget)
  monitor.advanceDatabaseWal(80n * 1024n * 1024n);
  monitor.acknowledgeSlot("slot_desktop_client", monitor.currentLsn);

  const status2B = monitor.getSlotRetention("slot_field_tablet");

  // Step 4: Enforce circuit breaker
  const droppedSlots = monitor.checkAndEnforceCircuitBreaker();

  // Step 5: Check resulting state
  const isSlotBStillActive = monitor.slots.has("slot_field_tablet");
  const isSlotAStillActive = monitor.slots.has("slot_desktop_client");

  results.details = {
    clientARetainedBytes: status1A.retainedBytes,
    clientBInitialRetainedBytes: status1B.retainedBytes,
    clientBPeakRetainedBytes: status2B.retainedBytes,
    clientBExceededBudget: status2B.exceedsRetentionBudget,
    droppedSlots,
    isSlotBStillActive,
    isSlotAStillActive
  };

  // Scenario passes if:
  // - Client A stayed healthy and retained 0 bytes
  // - Client B exceeded the 100 MB budget
  // - Circuit breaker dropped Client B's slot, protecting disk
  // - Client A was preserved
  results.passed = (
    status1A.retainedBytes === 0 &&
    status2B.exceedsRetentionBudget &&
    droppedSlots.some((s) => s.slotName === "slot_field_tablet") &&
    !isSlotBStillActive &&
    isSlotAStillActive
  );

  return results;
}
