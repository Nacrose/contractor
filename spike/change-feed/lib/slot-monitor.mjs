/**
 * PostgreSQL Logical Replication Slot Retention Monitor & Circuit Breaker
 *
 * Simulates and monitors WAL accumulation caused by inactive or lagging sync clients.
 * Protects database storage from disk-full outages by dropping orphaned slots when
 * retention limits are breached.
 */

export class SlotRetentionMonitor {
  constructor(options = {}) {
    this.maxRetentionBytes = options.maxRetentionBytes || 5 * 1024 * 1024 * 1024; // 5 GB default
    this.maxIdleDurationMs = options.maxIdleDurationMs || 3600 * 1000; // 1 hour default
    this.slots = new Map(); // slotName -> { active, restartLsn, confirmedFlushLsn, lastActiveAt, createdLsn }
    this.currentLsn = 1000000n;
    this.events = [];
  }

  createSlot(slotName) {
    if (this.slots.has(slotName)) {
      throw new Error(`Slot ${slotName} already exists`);
    }
    const slot = {
      slotName,
      active: true,
      restartLsn: this.currentLsn,
      confirmedFlushLsn: this.currentLsn,
      lastActiveAt: Date.now(),
      createdLsn: this.currentLsn
    };
    this.slots.set(slotName, slot);
    return slot;
  }

  advanceDatabaseWal(byteDelta = 50000000n) {
    this.currentLsn += byteDelta;
  }

  acknowledgeSlot(slotName, flushLsn) {
    const slot = this.slots.get(slotName);
    if (!slot) throw new Error(`Slot ${slotName} not found`);
    slot.active = true;
    slot.confirmedFlushLsn = flushLsn;
    slot.restartLsn = flushLsn;
    slot.lastActiveAt = Date.now();
  }

  disconnectSlot(slotName) {
    const slot = this.slots.get(slotName);
    if (slot) slot.active = false;
  }

  getSlotRetention(slotName) {
    const slot = this.slots.get(slotName);
    if (!slot) return null;
    const retainedBytes = Number(this.currentLsn - slot.restartLsn);
    const idleDurationMs = Date.now() - slot.lastActiveAt;
    return {
      slotName,
      active: slot.active,
      retainedBytes,
      idleDurationMs,
      exceedsRetentionBudget: retainedBytes > this.maxRetentionBytes,
      exceedsIdleTimeout: !slot.active && idleDurationMs > this.maxIdleDurationMs
    };
  }

  checkAndEnforceCircuitBreaker() {
    const droppedSlots = [];
    for (const [name, slot] of this.slots.entries()) {
      const status = this.getSlotRetention(name);
      if (status.exceedsRetentionBudget || status.exceedsIdleTimeout) {
        const reason = status.exceedsRetentionBudget
          ? `Retention quota exceeded: ${status.retainedBytes} bytes > ${this.maxRetentionBytes}`
          : `Idle timeout exceeded: ${status.idleDurationMs} ms > ${this.maxIdleDurationMs}`;

        this.slots.delete(name);
        droppedSlots.push({ slotName: name, reason });
        this.events.push({
          type: "SLOT_DROPPED_BY_CIRCUIT_BREAKER",
          slotName: name,
          reason,
          timestamp: Date.now()
        });
      }
    }
    return droppedSlots;
  }
}
