/**
 * Consumer Checkpoint Store
 *
 * Tracks synchronization watermarks per consumer client (device / tenant).
 * Enforces monotonic progress, prevents retroactive rollback, and records
 * acknowledged sequence positions.
 */

export class CheckpointStore {
  constructor() {
    this.checkpoints = new Map(); // consumerId -> { cursor, version, updatedAt, history: [] }
  }

  getCheckpoint(consumerId) {
    const cp = this.checkpoints.get(consumerId);
    return cp ? { ...cp, history: [...cp.history] } : null;
  }

  saveCheckpoint(consumerId, newCursor, metadata = {}) {
    const existing = this.checkpoints.get(consumerId);

    if (existing) {
      // Enforce monotonic cursor advancement
      if (typeof newCursor === "bigint" && newCursor < existing.cursor) {
        throw new Error(`Non-monotonic checkpoint rejected: ${newCursor} < ${existing.cursor}`);
      }
      if (typeof newCursor === "number" && newCursor < existing.cursor) {
        throw new Error(`Non-monotonic checkpoint rejected: ${newCursor} < ${existing.cursor}`);
      }

      existing.history.push({
        previousCursor: existing.cursor,
        timestamp: Date.now()
      });
      existing.cursor = newCursor;
      existing.version += 1;
      existing.updatedAt = Date.now();
      existing.metadata = metadata;
      return { ...existing, history: [...existing.history] };
    }

    const record = {
      consumerId,
      cursor: newCursor,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata,
      history: []
    };
    this.checkpoints.set(consumerId, record);
    return { ...record };
  }

  resetCheckpoint(consumerId, resetCursor, reason = "forced_resync") {
    const existing = this.checkpoints.get(consumerId);
    const history = existing ? [...existing.history, { action: "reset", reason, timestamp: Date.now() }] : [{ action: "reset", reason, timestamp: Date.now() }];
    const record = {
      consumerId,
      cursor: resetCursor,
      version: (existing?.version || 0) + 1,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      metadata: { reason },
      history
    };
    this.checkpoints.set(consumerId, record);
    return { ...record, history: [...record.history] };
  }
}
