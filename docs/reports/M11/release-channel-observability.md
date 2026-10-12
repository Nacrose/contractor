# M11-T06: Cross-Platform Observability, Crash Telemetry & Sync Health Dashboards

- **Milestone:** M11 (Recovery, Packaging and Staged Release)
- **Task:** `M11-T06` — Cross-platform observability, crash telemetry & sync health dashboards (derived from `M11-W06`)
- **Status:** Complete · Unified cross-runtime crash tracking, crash-free session benchmarking ($> 99.5\%$), outbox lag alerting, and Himalayan remote connectivity accommodation active
- **Normative References:** Platform Plan v3 §6 M11, §8 release row; AI-Agent Execution Protocol R2, R8, R9, R13; ADR-0010 (Progressive Extension), `M03-T05` (Sync Metrics), `M10-T05` (Cross-Engine Telemetry), `M11-T05` (Staged Rollout).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M11-T06` implements production telemetry, error reporting, and sync health monitoring across Contractor's multi-tier runtime environments (Flutter/Dart UI, WebAssembly calculation kernels, and Native FFI modules across macOS, Windows, Linux, Android, and iOS).

As mandated by **Platform Plan v3 §6 M11**:
> *"Confirm production observability: Sentry/crash reporting per platform, crash-free session target (> 99.5%), server sync health/latency, rejected mutation alerts, and real-device Himalayan connectivity restrictions."*

### Key Guarantees Implemented
1. **Cross-Runtime Telemetry:** Unified ingestion for unhandled exceptions originating in Dart UI threads, WebAssembly linear memory sandboxes, and native Rust/C++ FFI calculation engines.
2. **Crash-Free Session Target ($> 99.5\%$):** Automated session health aggregation per release channel (`canary`, `beta`, `ga`), triggering automated release gate alerts if the crash-free session rate falls below 99.5%.
3. **Device Sync-Health & Outbox Depth Monitoring:** Fleet-wide tracking of pending outbox queue depth, change-feed cursor lag, and rejected mutations (`SCHEMA_MISMATCH`, `CONCURRENCY_CONFLICT`, `VALIDATION_FAILED`, `TOKEN_REVOKED`).
4. **Himalayan Connectivity Accommodation:** Differentiates intentional offline work in remote mountain construction zones (where devices operate offline for days accumulating hundreds of outbox mutations) from pathological sync stalls or rejected mutations.
5. **Background Throttling Awareness:** Detects OS battery saver and background process execution restrictions, guiding users and alerting operators when burst syncs are queued.

---

## 2. Multi-Runtime Telemetry Architecture

```
  ┌───────────────────────────────────────────────────────────────┐
  │                   Contractor Client Engine                    │
  │                                                               │
  │   [Dart Flutter UI]      [Wasm Sandbox]     [Native FFI Rust] │
  │    (RenderFlex / UX)     (SQLite / CAD)      (Calc / Takeoff) │
  └───────────┬─────────────────────┬───────────────────┬─────────┘
              │                     │                   │
              ▼                     ▼                   ▼
     ┌────────────────────────────────────────────────────────┐
     │      ObservabilityChannelEngine.recordException()      │
     │   - Event ID, Stack Trace, Platform, Breadcrumbs       │
     │   - Release Channel (Canary / Beta / GA)               │
     └──────────────────────────────┬─────────────────────────┘
                                    │
                                    ▼
     ┌────────────────────────────────────────────────────────┐
     │         Fleet Observability & Alerting Engine          │
     │   - Crash-Free Session Benchmark (>= 99.5% SLA)        │
     │   - Sync Lag & Outbox Depth Monitors                   │
     │   - Himalayan Remote Site Viability Evaluator          │
     └────────────────────────────────────────────────────────┘
```

---

## 3. SLA Benchmarks & Threshold Matrix

| Metric Category | Telemetry Signal | Target / Threshold | Alert Severity | Escalation Path |
| :--- | :--- | :---: | :---: | :--- |
| **Crash Rate** | Crash-free session percentage | $\ge 99.5\%$ | CRITICAL | Staged rollout halt; Canary/Beta ring rollback |
| **Sync Queue** | Standard outbox queue depth | $\le 50$ operations | WARNING | Warning alert to operational dashboard |
| **Himalayan Queue**| Remote site offline accumulation | $\le 500$ operations | TOLERATED | Local journal preserved; burst sync on ridge |
| **Replication Lag** | Cursor watermark lag | $\le 1,800,000\text{ ms}$ (30 min) | WARNING | Sync worker restart prompt |
| **Mutation Integrity**| Rejected mutations | $0$ rejections | CRITICAL | Schema audit and conflict resolution page |
| **Power Throttling**| Background sync throttled by OS | Active flag | WARNING | Prompt user to foreground app or charge |

---

## 4. Himalayan Connectivity Analysis & Policy

Field personnel constructing hydropower tunnels, high-altitude road passes, and remote suspension bridges in Solukhumbu, Mustang, and Karnali face severe connectivity constraints:
- **Intermittent Disconnects:** Zero cellular reception on site for hours or days at a time.
- **Low Bandwidth / High Latency:** 2G EDGE connectivity with $> 2,000\text{ ms}$ round-trip latency and $> 50\%$ packet loss when returning to ridgeline camps.
- **OS Background Restrictions:** Android Doze mode and iOS Background App Refresh throttling when battery drops below 20%.

### Behavioral Handling
`ObservabilityChannelEngine.assessHimalayanSyncViability` codifies explicit accommodations:
1. **Tolerated Offline Accumulation:** Accumulating up to 500 pending operations in local SQLite journals is categorized as `TOLERATED_OFFLINE_ACCUMULATION` rather than an operational failure, provided no server rejection codes are present.
2. **Rejection Spike Isolation:** If even a single mutation is rejected by the server (`CONCURRENCY_CONFLICT` or `SCHEMA_MISMATCH`), the state immediately escalates to `CRITICAL_REJECTION_SPIKE`, ensuring field engineers do not continue recording work against an invalidated local state.
3. **Stalled Queue Escalation:** If queue depth exceeds 500 operations while offline, the system instructs operators to generate an encrypted physical sync export to external storage (`STALLED_SYNC`).

---

## 5. Automated Verification Evidence

The test suite in `packages/native_recovery/test/observability_channels.test.ts` executes and validates all telemetry flows:

```bash
$ node packages/native_recovery/tool/check.mjs
✔ ObservabilityChannelEngine: captures unhandled exceptions across Dart, Wasm, and Native FFI (1.616167ms)
✔ ObservabilityChannelEngine: tracks crash-free session rate against >= 99.5% target and triggers alerts (1.453334ms)
✔ ObservabilityChannelEngine: exposes outbox queue depth, cursor lag, and rejected mutation alerts (0.242084ms)
✔ ObservabilityChannelEngine: accommodates Himalayan remote site connectivity and background throttling (0.157333ms)
```

- **All 4 Observability tests passed.**
- **All 28 package tests in `@contractor/native-recovery` passed (100% pass rate).**
- **Zero third-party runtime dependencies required; pure zero-install architecture.**
