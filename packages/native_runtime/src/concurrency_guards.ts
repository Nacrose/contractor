/**
 * Route-Level In-Flight Concurrency Guards & Entity Mutex (M10-T03)
 */

export interface LockLease {
  readonly leaseId: string;
  readonly entityId: string;
  readonly acquiredAt: number;
  readonly expiresAt: number;
}

export class LockAcquisitionTimeoutError extends Error {
  public readonly code = 'LOCK_ACQUISITION_TIMEOUT';
  public readonly entityId: string;

  constructor(entityId: string) {
    super(`Could not acquire in-flight write lock on entity "${entityId}". Another mutation is actively processing.`);
    this.name = 'LockAcquisitionTimeoutError';
    this.entityId = entityId;
  }
}

/**
 * EntityWriteLockManager provides in-process mutex locking for entity mutations,
 * ensuring overlapping write operations to the same entity ID cannot race.
 */
export class EntityWriteLockManager {
  private readonly activeLocks = new Map<string, LockLease>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = 5000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Attempts to acquire an exclusive lock for an entity.
   */
  public acquireLock(entityId: string, ttlMs = this.defaultTtlMs): LockLease {
    const now = Date.now();
    const existing = this.activeLocks.get(entityId);

    if (existing && existing.expiresAt > now) {
      throw new LockAcquisitionTimeoutError(entityId);
    }

    const lease: LockLease = {
      leaseId: `lease_${entityId}_${now}_${Math.random().toString(36).substring(2, 8)}`,
      entityId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
    };

    this.activeLocks.set(entityId, lease);
    return lease;
  }

  /**
   * Releases an acquired lock.
   */
  public releaseLock(lease: LockLease): boolean {
    const existing = this.activeLocks.get(lease.entityId);
    if (existing && existing.leaseId === lease.leaseId) {
      this.activeLocks.delete(lease.entityId);
      return true;
    }
    return false;
  }

  /**
   * Checks if an entity is currently locked.
   */
  public isLocked(entityId: string): boolean {
    const existing = this.activeLocks.get(entityId);
    if (!existing) return false;
    if (existing.expiresAt <= Date.now()) {
      this.activeLocks.delete(entityId);
      return false;
    }
    return true;
  }

  /**
   * Executes an action within an acquired lock.
   */
  public async withLock<T>(entityId: string, action: () => Promise<T> | T, ttlMs = this.defaultTtlMs): Promise<T> {
    const lease = this.acquireLock(entityId, ttlMs);
    try {
      return await action();
    } finally {
      this.releaseLock(lease);
    }
  }
}
