/**
 * Device sync-health surface (M03-T08) — the honest read model.
 *
 * Derived ENTIRELY from durable state (the `SyncHealthSource` the mount
 * binds to the outbox + checkpoint databases; tests back it with REAL
 * SQLite). `synced` is TRUE only when: no pending operations exist, no
 * fresh rejection is unsurfaced, and no scope lacks a cursor — anything
 * else reports `synced: false` with explicit reasons. A false success
 * state is the one thing this surface must never produce (tested).
 */

import {
  DeviceSyncHealth,
  HealthOptions,
  RejectionSurface,
  ScopeCursor,
  SyncHealthSource,
} from "./contract.js";

export function buildDeviceSyncHealth(source: SyncHealthSource, options: HealthOptions): DeviceSyncHealth {
  const ops = source.pendingOps();
  const cursors = source.acceptedCursors();
  const reasons: string[] = [];

  const pending = ops.filter((o) => o.state === "pending" || o.state === "in_flight");
  const conflicts = ops.filter((o) => o.state === "conflict");
  const blocked = ops.filter((o) => o.state === "blocked");
  const rejections: RejectionSurface[] = ops
    .filter((o) => o.state === "rejected")
    .map((o) => ({
      opId: o.opId,
      kind: o.kind,
      reason: (o.lastError ?? "rejected").slice(0, 160),
      atMs: o.updatedAtMs,
    }));
  const freshRejectionMs = options.rejectionFreshMs ?? 24 * 60 * 60_000;
  const freshRejections = rejections.filter((r) => options.nowMs - r.atMs < freshRejectionMs);

  if (pending.length > 0) reasons.push(`${pending.length} pending operation(s) not yet accepted`);
  if (conflicts.length > 0) reasons.push(`${conflicts.length} conflicted operation(s) awaiting resolution`);
  if (blocked.length > 0) reasons.push(`${blocked.length} dependency-blocked operation(s)`);
  if (freshRejections.length > 0) reasons.push(`${freshRejections.length} recent rejection(s) surfaced`);

  const oldestPendingAgeMs = pending.length > 0
    ? Math.max(...pending.map((o) => options.nowMs - o.createdAtMs))
    : null;

  return {
    accountId: source.accountId,
    synced: reasons.length === 0,
    reasons,
    pendingOperationCount: pending.length,
    oldestPendingAgeMs,
    conflicts: conflicts.length,
    blocked: blocked.length,
    lastAcceptedCursors: cursors,
    rejections,
    generatedAtMs: options.nowMs,
  };
}
