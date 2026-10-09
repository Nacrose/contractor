/**
 * Crash Replay & Duplicate Delivery Injector
 *
 * Simulates process termination (SIGKILL) mid-sync and tests client idempotency
 * against duplicate delivery of mutation batches.
 */

export class CrashReplayHarness {
  constructor() {
    this.processedMutationIds = new Set();
    this.clientEntities = new Map(); // entityId -> { val, version, lastMutationId }
    this.duplicatesEncountered = 0;
    this.successfulIdempotentApplies = 0;
    this.inconsistentApplies = 0;
  }

  /**
   * Applies an incoming change-feed event to the client store with idempotency protection.
   */
  applyEventIdempotent(event) {
    const { mutationId, entityId, payload, version } = event;

    if (this.processedMutationIds.has(mutationId)) {
      this.duplicatesEncountered++;
      this.successfulIdempotentApplies++;
      return { status: "DEDUPLICATED", entityId };
    }

    this.processedMutationIds.add(mutationId);
    this.clientEntities.set(entityId, {
      ...payload,
      version,
      lastMutationId: mutationId
    });
    return { status: "APPLIED", entityId };
  }

  /**
   * Naive non-idempotent apply (e.g. naive array push or counter increment)
   * to demonstrate failure modes under crash replay.
   */
  applyEventNonIdempotent(event, targetArray) {
    targetArray.push(event.payload);
  }

  simulateCrashAndRestart(unpersistedCheckpoint, lastDurableCheckpoint) {
    // Process memory dies: unpersisted checkpoint is lost;
    // Client restarts from lastDurableCheckpoint
    return {
      restartedFrom: lastDurableCheckpoint,
      droppedCheckpoint: unpersistedCheckpoint,
      resumedAt: Date.now()
    };
  }
}
