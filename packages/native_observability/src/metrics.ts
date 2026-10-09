/**
 * Server sync metrics registry (M03-T08) — tenant-safe aggregation.
 *
 * The mount records one `SyncObservation` per sync request at the service
 * boundary (outcome kinds are the M03-T07 outcome table). The GLOBAL
 * snapshot NEVER carries tenant identifiers — counts and tenant-safe
 * aggregates only; per-tenant breakdowns require the explicit authorized
 * `snapshotTenant(tenantId)` surface. Metrics are derived, lossy counters:
 * they never replace durable records and never write domain data.
 */

import {
  GlobalMetricsSnapshot,
  SyncMetricOutcome,
  SyncObservation,
  TenantMetricsSnapshot,
  observabilityError,
} from "./contract.js";

const OUTCOMES: SyncMetricOutcome[] = [
  "requests", "accepted", "replayed", "rejected", "conflicted",
  "revoked", "auth_required", "dependency_blocked", "retryable",
];

export class SyncMetrics {
  private readonly counts: Record<SyncMetricOutcome, number>;
  private readonly byKind: Map<string, number>;
  private readonly perTenantCounts: Map<string, Record<SyncMetricOutcome, number>>;
  private readonly perTenantKind: Map<string, Map<string, number>>;
  private readonly lags: number[] = [];
  private readonly checkpointAges: number[] = [];
  private attachmentRetries = 0;
  private attachmentErrors = 0;
  private total = 0;

  constructor() {
    this.counts = Object.fromEntries(OUTCOMES.map((k) => [k, 0])) as Record<SyncMetricOutcome, number>;
    this.byKind = new Map();
    this.perTenantCounts = new Map();
    this.perTenantKind = new Map();
  }

  /** Record one boundary observation (the mount's sync service calls this). */
  record(obs: SyncObservation): void {
    if (typeof obs?.tenantId !== "string" || obs.tenantId.length === 0) {
      throw observabilityError("misconfigured", "observation requires a tenantId");
    }
    this.counts.requests += 1;
    if (obs.outcome !== "requests") this.counts[obs.outcome] += 1;
    this.byKind.set(obs.kind, (this.byKind.get(obs.kind) ?? 0) + 1);
    this.total += 1;

    const tCounts = this.perTenantCounts.get(obs.tenantId) ?? (Object.fromEntries(OUTCOMES.map((k) => [k, 0])) as Record<SyncMetricOutcome, number>);
    tCounts.requests += 1;
    if (obs.outcome !== "requests") tCounts[obs.outcome] += 1;
    this.perTenantCounts.set(obs.tenantId, tCounts);
    const tKinds = this.perTenantKind.get(obs.tenantId) ?? new Map<string, number>();
    tKinds.set(obs.kind, (tKinds.get(obs.kind) ?? 0) + 1);
    this.perTenantKind.set(obs.tenantId, tKinds);

    if (typeof obs.feedLagMs === "number" && Number.isFinite(obs.feedLagMs)) this.lags.push(obs.feedLagMs);
    if (typeof obs.checkpointAgeMs === "number" && Number.isFinite(obs.checkpointAgeMs)) this.checkpointAges.push(obs.checkpointAgeMs);
  }

  /** Attachment retry/error counters (wired to the M03-T06 transfer surface). */
  recordAttachmentRetry(): void {
    this.attachmentRetries += 1;
  }
  recordAttachmentError(): void {
    this.attachmentErrors += 1;
  }

  private aggregates(values: number[]): { avg: number | null; max: number | null } {
    if (values.length === 0) return { avg: null, max: null };
    const max = Math.max(...values);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    return { avg, max };
  }

  /** GLOBAL snapshot — tenant-safe by construction: no tenant ids anywhere. */
  snapshot(nowMs: number): GlobalMetricsSnapshot {
    return {
      outcomes: Object.fromEntries(OUTCOMES.map((k) => [k, this.counts[k]])) as Record<SyncMetricOutcome, number>,
      requests: this.counts.requests,
      attachmentRetries: this.attachmentRetries,
      attachmentErrors: this.attachmentErrors,
      feedLagMs: this.aggregates(this.lags),
      checkpointAgeMs: this.aggregates(this.checkpointAges),
      generatedAtMs: nowMs,
    };
  }

  /**
   * AUTHORIZED per-tenant snapshot: requires the explicit tenant scope;
   * returns that tenant's counts and per-operation-kind breakdown.
   */
  snapshotTenant(tenantId: string, nowMs: number): TenantMetricsSnapshot {
    const counts = this.perTenantCounts.get(tenantId);
    if (!counts) {
      throw observabilityError("not_found", `no observations recorded for tenant '${tenantId}'`);
    }
    const kinds: Record<string, number> = {};
    for (const [k, n] of this.perTenantKind.get(tenantId) ?? new Map<string, number>()) kinds[k] = n;
    return {
      outcomes: Object.fromEntries(OUTCOMES.map((k) => [k, counts[k]])) as Record<SyncMetricOutcome, number>,
      requests: counts.requests,
      attachmentRetries: this.attachmentRetries,
      attachmentErrors: this.attachmentErrors,
      feedLagMs: this.aggregates(this.lags),
      checkpointAgeMs: this.aggregates(this.checkpointAges),
      generatedAtMs: nowMs,
      tenantId,
      byKind: kinds,
    };
  }

  get observationCount(): number {
    return this.total;
  }
}
