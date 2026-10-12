/**
 * ObservabilityChannelEngine: Production telemetry, crash rate tracking,
 * sync health metrics, and Himalayan connectivity accommodation (M11-T06).
 */

export type RuntimeSource = 'dart' | 'wasm' | 'native_ffi';
export type ReleaseChannel = 'canary' | 'beta' | 'ga';
export type SupportedPlatform = 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'web';
export type RejectionReasonCode = 'SCHEMA_MISMATCH' | 'CONCURRENCY_CONFLICT' | 'VALIDATION_FAILED' | 'TOKEN_REVOKED';
export type NetworkType = 'offline' | '2g_edge' | '3g' | '4g_lte' | 'wifi';

export interface Breadcrumb {
  category: string;
  message: string;
  timestamp: string;
}

export interface TelemetryExceptionEvent {
  eventId: string;
  sourceRuntime: RuntimeSource;
  errorName: string;
  message: string;
  stackTrace?: string;
  platform: SupportedPlatform;
  channel: ReleaseChannel;
  deviceId: string;
  timestamp: string;
  breadcrumbs?: Breadcrumb[];
}

export interface SessionMetric {
  sessionId: string;
  deviceId: string;
  durationMs: number;
  crashed: boolean;
  channel: ReleaseChannel;
  platform: SupportedPlatform;
  timestamp: string;
}

export interface RejectedMutation {
  mutationId: string;
  reasonCode: RejectionReasonCode;
  message: string;
  timestamp: string;
}

export interface ConnectivityProfile {
  networkType: NetworkType;
  latencyMs: number;
  packetLossPercent: number;
  himalayanRemoteSite: boolean;
  backgroundThrottled: boolean;
}

export interface SyncHealthHeartbeat {
  deviceId: string;
  tenantId: string;
  channel: ReleaseChannel;
  outboxQueueDepth: number;
  cursorLagMs: number;
  serverWatermark: number;
  deviceWatermark: number;
  rejectedMutations: RejectedMutation[];
  connectivityProfile: ConnectivityProfile;
  timestamp: string;
}

export interface CrashMetricsSummary {
  channel: ReleaseChannel;
  totalSessions: number;
  crashedSessions: number;
  crashFreeRatePercent: number;
  meetsTarget: boolean;
  alertTriggered: boolean;
}

export interface SyncAlert {
  deviceId: string;
  severity: 'CRITICAL' | 'WARNING';
  type: 'QUEUE_DEPTH_EXCEEDED' | 'CURSOR_LAG_EXCEEDED' | 'MUTATION_REJECTED' | 'BACKGROUND_THROTTLED';
  message: string;
}

export interface SyncHealthEvaluation {
  totalDevicesReporting: number;
  devicesWithAlerts: number;
  totalRejectedMutations: number;
  alerts: SyncAlert[];
}

export interface HimalayanSyncViability {
  classification: 'HEALTHY_ONLINE' | 'TOLERATED_OFFLINE_ACCUMULATION' | 'CRITICAL_REJECTION_SPIKE' | 'STALLED_SYNC';
  toleratedDepthThreshold: number;
  reasons: string[];
  recommendations: string[];
}

export interface ObservabilityEngineOptions {
  minCrashFreeRatePercent?: number; // Target >= 99.5%
  maxOutboxQueueDepthThreshold?: number; // Default 50
  maxCursorLagMsThreshold?: number; // Default 1,800,000 (30 mins)
  himalayanMaxOfflineQueueDepth?: number; // Default 500
}

export class ObservabilityChannelEngine {
  private readonly minCrashFreeRate: number;
  private readonly maxOutboxQueueDepth: number;
  private readonly maxCursorLagMs: number;
  private readonly himalayanMaxOfflineQueueDepth: number;

  private exceptions: TelemetryExceptionEvent[] = [];
  private sessions: SessionMetric[] = [];
  private heartbeats: Map<string, SyncHealthHeartbeat> = new Map();

  constructor(options: ObservabilityEngineOptions = {}) {
    this.minCrashFreeRate = options.minCrashFreeRatePercent ?? 99.5;
    this.maxOutboxQueueDepth = options.maxOutboxQueueDepthThreshold ?? 50;
    this.maxCursorLagMs = options.maxCursorLagMsThreshold ?? 1800000;
    this.himalayanMaxOfflineQueueDepth = options.himalayanMaxOfflineQueueDepth ?? 500;
  }

  /**
   * Records an unhandled exception across Dart UI, WebAssembly, or Native FFI runtimes.
   */
  public recordException(event: TelemetryExceptionEvent): void {
    this.exceptions.push(event);
  }

  public getExceptions(runtime?: RuntimeSource): TelemetryExceptionEvent[] {
    if (runtime) {
      return this.exceptions.filter((e) => e.sourceRuntime === runtime);
    }
    return [...this.exceptions];
  }

  /**
   * Records an application session state.
   */
  public recordSession(session: SessionMetric): void {
    this.sessions.push(session);
  }

  /**
   * Evaluates crash-free session rate per release channel against the >= 99.5% SLA.
   */
  public evaluateCrashMetrics(channel: ReleaseChannel): CrashMetricsSummary {
    const channelSessions = this.sessions.filter((s) => s.channel === channel);
    const totalSessions = channelSessions.length;
    if (totalSessions === 0) {
      return {
        channel,
        totalSessions: 0,
        crashedSessions: 0,
        crashFreeRatePercent: 100,
        meetsTarget: true,
        alertTriggered: false,
      };
    }

    const crashedSessions = channelSessions.filter((s) => s.crashed).length;
    const crashFreeCount = totalSessions - crashedSessions;
    const crashFreeRatePercent = Number(((crashFreeCount / totalSessions) * 100).toFixed(2));
    const meetsTarget = crashFreeRatePercent >= this.minCrashFreeRate;

    return {
      channel,
      totalSessions,
      crashedSessions,
      crashFreeRatePercent,
      meetsTarget,
      alertTriggered: !meetsTarget,
    };
  }

  /**
   * Ingests a device sync heartbeat with queue depth, cursor lag, and rejected mutations.
   */
  public recordSyncHeartbeat(heartbeat: SyncHealthHeartbeat): void {
    this.heartbeats.set(heartbeat.deviceId, heartbeat);
  }

  /**
   * Evaluates overall fleet sync health and triggers alerts for excessive queue depth,
   * cursor lag, or rejected mutations.
   */
  public evaluateSyncHealth(): SyncHealthEvaluation {
    const alerts: SyncAlert[] = [];
    let totalRejectedMutations = 0;
    const devicesWithAlerts = new Set<string>();

    for (const [deviceId, heartbeat] of this.heartbeats.entries()) {
      // 1. Rejected mutations are critical alerts
      if (heartbeat.rejectedMutations.length > 0) {
        totalRejectedMutations += heartbeat.rejectedMutations.length;
        devicesWithAlerts.add(deviceId);
        for (const rej of heartbeat.rejectedMutations) {
          alerts.push({
            deviceId,
            severity: 'CRITICAL',
            type: 'MUTATION_REJECTED',
            message: `Mutation ${rej.mutationId} rejected (${rej.reasonCode}): ${rej.message}`,
          });
        }
      }

      // 2. Himalayan accommodation: if remote site is offline or on 2G EDGE,
      // allow higher queue depth without triggering panic alert
      const isRemoteSite = heartbeat.connectivityProfile.himalayanRemoteSite;
      const effectiveQueueLimit = isRemoteSite
        ? this.himalayanMaxOfflineQueueDepth
        : this.maxOutboxQueueDepth;

      if (heartbeat.outboxQueueDepth > effectiveQueueLimit) {
        devicesWithAlerts.add(deviceId);
        alerts.push({
          deviceId,
          severity: 'WARNING',
          type: 'QUEUE_DEPTH_EXCEEDED',
          message: `Pending outbox queue depth ${heartbeat.outboxQueueDepth} exceeds threshold ${effectiveQueueLimit}`,
        });
      }

      // 3. Cursor lag threshold
      if (heartbeat.cursorLagMs > this.maxCursorLagMs && !heartbeat.connectivityProfile.backgroundThrottled) {
        devicesWithAlerts.add(deviceId);
        alerts.push({
          deviceId,
          severity: 'WARNING',
          type: 'CURSOR_LAG_EXCEEDED',
          message: `Device cursor lag ${heartbeat.cursorLagMs}ms exceeds SLA threshold ${this.maxCursorLagMs}ms`,
        });
      }

      // 4. Background throttling detection
      if (heartbeat.connectivityProfile.backgroundThrottled && heartbeat.outboxQueueDepth > 0) {
        alerts.push({
          deviceId,
          severity: 'WARNING',
          type: 'BACKGROUND_THROTTLED',
          message: `OS background power saver throttling active; ${heartbeat.outboxQueueDepth} commands awaiting foreground burst`,
        });
      }
    }

    return {
      totalDevicesReporting: this.heartbeats.size,
      devicesWithAlerts: devicesWithAlerts.size,
      totalRejectedMutations,
      alerts,
    };
  }

  /**
   * Assesses sync viability under severe remote Himalayan conditions (high latency,
   * intermittent multi-day offline disconnects, 2G bandwidth, battery throttling).
   */
  public assessHimalayanSyncViability(heartbeat: SyncHealthHeartbeat): HimalayanSyncViability {
    const reasons: string[] = [];
    const recommendations: string[] = [];

    // Critical rejection check
    if (heartbeat.rejectedMutations.length > 0) {
      reasons.push(`${heartbeat.rejectedMutations.length} mutations rejected by server`);
      recommendations.push('Immediate operator attention required to inspect schema or conflict error');
      return {
        classification: 'CRITICAL_REJECTION_SPIKE',
        toleratedDepthThreshold: this.himalayanMaxOfflineQueueDepth,
        reasons,
        recommendations,
      };
    }

    const { networkType, latencyMs, packetLossPercent, backgroundThrottled, himalayanRemoteSite } =
      heartbeat.connectivityProfile;

    if (networkType === 'offline' || (himalayanRemoteSite && (networkType === '2g_edge' || latencyMs > 2000))) {
      reasons.push(
        `Remote site connectivity constraint: network=${networkType}, latency=${latencyMs}ms, loss=${packetLossPercent}%`
      );
      if (heartbeat.outboxQueueDepth <= this.himalayanMaxOfflineQueueDepth) {
        reasons.push(
          `Accumulated ${heartbeat.outboxQueueDepth} outbox commands within tolerated threshold (${this.himalayanMaxOfflineQueueDepth})`
        );
        recommendations.push('Maintain local SQLite journal; burst sync upon reaching cellular ridge or WiFi camp');
        if (backgroundThrottled) {
          recommendations.push('Prompt user to launch foreground app or charge device to defeat OS background throttles');
        }
        return {
          classification: 'TOLERATED_OFFLINE_ACCUMULATION',
          toleratedDepthThreshold: this.himalayanMaxOfflineQueueDepth,
          reasons,
          recommendations,
        };
      } else {
        reasons.push(
          `Outbox depth ${heartbeat.outboxQueueDepth} exceeds maximum tolerated offline buffer ${this.himalayanMaxOfflineQueueDepth}`
        );
        recommendations.push('Advise site team to export offline sync bundle to physical USB/drive or travel to connection point');
        return {
          classification: 'STALLED_SYNC',
          toleratedDepthThreshold: this.himalayanMaxOfflineQueueDepth,
          reasons,
          recommendations,
        };
      }
    }

    reasons.push('High-bandwidth / stable network connection active');
    recommendations.push('Maintain continuous background bidirectional replication');
    return {
      classification: 'HEALTHY_ONLINE',
      toleratedDepthThreshold: this.maxOutboxQueueDepth,
      reasons,
      recommendations,
    };
  }
}
