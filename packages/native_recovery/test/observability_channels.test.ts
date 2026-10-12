import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ObservabilityChannelEngine,
  TelemetryExceptionEvent,
  SessionMetric,
  SyncHealthHeartbeat,
} from '../src/observability_channels.js';

test('ObservabilityChannelEngine: captures unhandled exceptions across Dart, Wasm, and Native FFI', () => {
  const engine = new ObservabilityChannelEngine();

  const dartException: TelemetryExceptionEvent = {
    eventId: 'evt-dart-001',
    sourceRuntime: 'dart',
    errorName: 'RenderFlexOverflowException',
    message: 'A RenderFlex overflowed by 14 pixels on the bottom.',
    platform: 'android',
    channel: 'canary',
    deviceId: 'dev-pixel-01',
    timestamp: new Date().toISOString(),
    breadcrumbs: [
      { category: 'navigation', message: 'Navigated to BoQ Takeoff sheet', timestamp: new Date().toISOString() },
    ],
  };

  const wasmException: TelemetryExceptionEvent = {
    eventId: 'evt-wasm-002',
    sourceRuntime: 'wasm',
    errorName: 'SqliteWasmMemoryException',
    message: 'Out of memory in WebAssembly linear heap during CAD tessellation',
    platform: 'web',
    channel: 'beta',
    deviceId: 'dev-browser-02',
    timestamp: new Date().toISOString(),
  };

  const ffiException: TelemetryExceptionEvent = {
    eventId: 'evt-ffi-003',
    sourceRuntime: 'native_ffi',
    errorName: 'RustPanicException',
    message: 'GridCraft calc panic: divide by zero in formula cell C12',
    platform: 'macos',
    channel: 'ga',
    deviceId: 'dev-mac-03',
    timestamp: new Date().toISOString(),
  };

  engine.recordException(dartException);
  engine.recordException(wasmException);
  engine.recordException(ffiException);

  assert.equal(engine.getExceptions().length, 3);
  assert.equal(engine.getExceptions('dart').length, 1);
  assert.equal(engine.getExceptions('wasm').length, 1);
  assert.equal(engine.getExceptions('native_ffi').length, 1);
  assert.equal(engine.getExceptions('dart')[0].errorName, 'RenderFlexOverflowException');
});

test('ObservabilityChannelEngine: tracks crash-free session rate against >= 99.5% target and triggers alerts', () => {
  const engine = new ObservabilityChannelEngine({ minCrashFreeRatePercent: 99.5 });

  // Record 1,000 sessions for GA: 3 crashes -> 99.7% crash-free (PASS)
  for (let i = 0; i < 997; i++) {
    engine.recordSession({
      sessionId: `sess-ga-${i}`,
      deviceId: `dev-${i % 50}`,
      durationMs: 45000,
      crashed: false,
      channel: 'ga',
      platform: 'macos',
      timestamp: new Date().toISOString(),
    });
  }
  for (let i = 0; i < 3; i++) {
    engine.recordSession({
      sessionId: `sess-ga-crash-${i}`,
      deviceId: `dev-${i}`,
      durationMs: 12000,
      crashed: true,
      channel: 'ga',
      platform: 'macos',
      timestamp: new Date().toISOString(),
    });
  }

  const gaMetrics = engine.evaluateCrashMetrics('ga');
  assert.equal(gaMetrics.totalSessions, 1000);
  assert.equal(gaMetrics.crashedSessions, 3);
  assert.equal(gaMetrics.crashFreeRatePercent, 99.7);
  assert.equal(gaMetrics.meetsTarget, true);
  assert.equal(gaMetrics.alertTriggered, false);

  // Record Canary sessions: 100 sessions, 2 crashes -> 98.0% crash-free (FAIL -> ALERT)
  for (let i = 0; i < 98; i++) {
    engine.recordSession({
      sessionId: `sess-canary-${i}`,
      deviceId: `dev-canary-${i}`,
      durationMs: 30000,
      crashed: false,
      channel: 'canary',
      platform: 'android',
      timestamp: new Date().toISOString(),
    });
  }
  for (let i = 0; i < 2; i++) {
    engine.recordSession({
      sessionId: `sess-canary-crash-${i}`,
      deviceId: `dev-canary-${i}`,
      durationMs: 5000,
      crashed: true,
      channel: 'canary',
      platform: 'android',
      timestamp: new Date().toISOString(),
    });
  }

  const canaryMetrics = engine.evaluateCrashMetrics('canary');
  assert.equal(canaryMetrics.totalSessions, 100);
  assert.equal(canaryMetrics.crashedSessions, 2);
  assert.equal(canaryMetrics.crashFreeRatePercent, 98.0);
  assert.equal(canaryMetrics.meetsTarget, false);
  assert.equal(canaryMetrics.alertTriggered, true);
});

test('ObservabilityChannelEngine: exposes outbox queue depth, cursor lag, and rejected mutation alerts', () => {
  const engine = new ObservabilityChannelEngine({
    maxOutboxQueueDepthThreshold: 50,
    maxCursorLagMsThreshold: 1800000, // 30 min
  });

  // Healthy device
  const healthyHeartbeat: SyncHealthHeartbeat = {
    deviceId: 'dev-office-01',
    tenantId: 'tenant-corp',
    channel: 'ga',
    outboxQueueDepth: 5,
    cursorLagMs: 200,
    serverWatermark: 1000,
    deviceWatermark: 1000,
    rejectedMutations: [],
    connectivityProfile: {
      networkType: 'wifi',
      latencyMs: 15,
      packetLossPercent: 0,
      himalayanRemoteSite: false,
      backgroundThrottled: false,
    },
    timestamp: new Date().toISOString(),
  };

  // Device with rejected mutation and cursor lag
  const laggingHeartbeat: SyncHealthHeartbeat = {
    deviceId: 'dev-field-02',
    tenantId: 'tenant-corp',
    channel: 'ga',
    outboxQueueDepth: 75, // > 50 threshold
    cursorLagMs: 3600000, // 60 min > 30 min threshold
    serverWatermark: 1200,
    deviceWatermark: 950,
    rejectedMutations: [
      {
        mutationId: 'mut-boq-entry-99',
        reasonCode: 'CONCURRENCY_CONFLICT',
        message: 'Row modified concurrently by another estimator',
        timestamp: new Date().toISOString(),
      },
    ],
    connectivityProfile: {
      networkType: '4g_lte',
      latencyMs: 120,
      packetLossPercent: 2,
      himalayanRemoteSite: false,
      backgroundThrottled: false,
    },
    timestamp: new Date().toISOString(),
  };

  engine.recordSyncHeartbeat(healthyHeartbeat);
  engine.recordSyncHeartbeat(laggingHeartbeat);

  const evalResult = engine.evaluateSyncHealth();
  assert.equal(evalResult.totalDevicesReporting, 2);
  assert.equal(evalResult.devicesWithAlerts, 1);
  assert.equal(evalResult.totalRejectedMutations, 1);

  const rejectionAlert = evalResult.alerts.find((a) => a.type === 'MUTATION_REJECTED');
  assert.ok(rejectionAlert);
  assert.equal(rejectionAlert!.severity, 'CRITICAL');

  const depthAlert = evalResult.alerts.find((a) => a.type === 'QUEUE_DEPTH_EXCEEDED');
  assert.ok(depthAlert);
  assert.equal(depthAlert!.severity, 'WARNING');

  const lagAlert = evalResult.alerts.find((a) => a.type === 'CURSOR_LAG_EXCEEDED');
  assert.ok(lagAlert);
  assert.equal(lagAlert!.severity, 'WARNING');
});

test('ObservabilityChannelEngine: accommodates Himalayan remote site connectivity and background throttling', () => {
  const engine = new ObservabilityChannelEngine({
    maxOutboxQueueDepthThreshold: 50,
    himalayanMaxOfflineQueueDepth: 500,
  });

  // Mountain pass remote site: offline, 120 outbox records accumulated, zero rejections
  const remoteSiteHeartbeat: SyncHealthHeartbeat = {
    deviceId: 'dev-himalaya-solukhumbu',
    tenantId: 'tenant-everest-hydro',
    channel: 'ga',
    outboxQueueDepth: 120,
    cursorLagMs: 86400000, // 24 hours offline
    serverWatermark: 2000,
    deviceWatermark: 1800,
    rejectedMutations: [],
    connectivityProfile: {
      networkType: 'offline',
      latencyMs: 9999,
      packetLossPercent: 100,
      himalayanRemoteSite: true,
      backgroundThrottled: true,
    },
    timestamp: new Date().toISOString(),
  };

  engine.recordSyncHeartbeat(remoteSiteHeartbeat);

  // Sync health evaluation allows up to 500 for Himalayan remote sites without queue depth warning
  const fleetHealth = engine.evaluateSyncHealth();
  const queueDepthAlert = fleetHealth.alerts.find((a) => a.type === 'QUEUE_DEPTH_EXCEEDED');
  assert.equal(queueDepthAlert, undefined); // Tolerated!

  // Background throttling alert is present to warn operator
  const bgAlert = fleetHealth.alerts.find((a) => a.type === 'BACKGROUND_THROTTLED');
  assert.ok(bgAlert);

  // Detailed viability assessment
  const viability = engine.assessHimalayanSyncViability(remoteSiteHeartbeat);
  assert.equal(viability.classification, 'TOLERATED_OFFLINE_ACCUMULATION');
  assert.equal(viability.toleratedDepthThreshold, 500);
  assert.ok(viability.recommendations.some((r) => r.includes('Maintain local SQLite journal')));
});
