# M11 — Recovery, packaging and staged release

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M11, §8 release row. Dependencies: backup/packaging groundwork starts after M01; final release requires M03–M10 evidence. Refined from WP level to task level per Protocol R9 ahead of execution.

Exit (v3): measured recovery drill, validated platform packages, full parity evidence, monitoring and user-approved release. **Do not publish or push merely because a build succeeded.**

---

- [x] **M11-T01** — Complete backup coverage & independent vault retrieval/restore drill (PR #120)
  - Depends on: M03-T02, M10-T04 · Output: `docs/reports/M11/vault-retrieval-and-restore-drill.md`, backup/restore verification harnesses.
  - Scope: database (PostgreSQL/SQLite) + object storage (drawings, PDF blueprints, photos) vault backup and restore into an isolated environment (derived from M11-W01). Validate tenant isolation and referential integrity. Ensure independent vault verification: prove cloud-accepted records alone do not substitute for an independently retrieved vault backup.
  - Acceptance:
    - 100% database entities and registered attachments restored into isolated environment with matching cryptographic checksums.
    - Strict cross-tenant data isolation verified; cross-tenant references fail-closed.
    - Zero orphaned records or missing attachment blobs.

- [x] **M11-T02** — Measured RPO/RTO, key escrow, retention policies, failed-backup alerts & operator runbook (PR #121)
  - Depends on: M11-T01 · Output: `docs/reports/M11/rpo-rto-and-operator-runbook.md`, automated backup monitor, disaster recovery runbook.
  - Scope: define and benchmark Recovery Point Objective ($\text{RPO} \le 15\text{ min}$) and Recovery Time Objective ($\text{RTO} \le 60\text{ min}$) under simulated disaster conditions (derived from M11-W02). Implement KMS/key escrow policies, tiered retention schedules (7-day daily, 4-week weekly, 1-year annual), automated failed-backup alerting, and detailed step-by-step operator recovery procedures.
  - Acceptance:
    - RPO benchmarked under simulated disruption ($\le 15\text{ min}$ data loss threshold).
    - RTO benchmarked under complete cold-restore drill ($\le 60\text{ min}$ operational recovery).
    - Backup failure alerts trigger high-priority paging within $< 60\text{ s}$ of missed snapshot.

- [x] **M11-T03** — Fresh-device bootstrap & comprehensive disaster/failure matrix (PR #122)
  - Depends on: M03-T04, M10-T03, M11-T01 · Output: `docs/reports/M11/fresh-device-and-failure-matrix.md`, automated edge-case test suite.
  - Scope: verify fresh-device sync bootstrap from snapshot + incremental change feed (derived from M11-W03). Test edge-case failure matrix: migration interruption (mid-migration crash/kill), application downgrade rejection, local storage corruption detection, revoked device token isolation, and expired change-feed cursor resync.
  - Acceptance:
    - Fresh device reconstitutes active project state without full re-indexing latency.
    - Interrupted database migrations roll back cleanly to previous consistent version.
    - Application downgrade attempts fail-closed with structured update prompt.
    - Corrupted local databases trigger safe repair or clean remote re-sync without crashing.

- [x] **M11-T04** — Cross-platform packaging, code signing & notarization pipeline (PR #123)
  - Depends on: M01-T02, M10-T06 · Output: `docs/reports/M11/packaging-and-signing-pipeline.md`, packaging workflows, distribution artifacts.
  - Scope: configure production build and signing pipelines for macOS (Intel/ARM64 universal DMGs, notarization with Apple), Windows (MSIX/NSIS signed installers), Linux (AppImage/deb), Android (AAB/APK signed with upload key), and iOS (IPA with provisioning profiles) (derived from M11-W04). Ensure signing secrets exist only in secure runner keychains, never in repository or build logs.
  - Acceptance:
    - All desktop and mobile packages build cleanly on respective CI/CD runners.
    - macOS binaries pass Apple `spctl` gatekeeper notarization checks.
    - Windows packages pass Authenticode signature verification.
    - Clean install, launch, upgrade, and uninstall tested on each platform.

- [x] **M11-T05** — Signed update verification, staged rollout channels & schema rollback recovery (PR #124)
  - Depends on: M10-T03, M11-T04 · Output: `docs/reports/M11/signed-updates-and-rollback-recovery.md`, update verification engine.
  - Scope: cryptographic signature verification on auto-update packages before extraction (derived from M11-W05). Staged rollout rings (`Internal Canary` 5% $\rightarrow$ `Pilot Beta` 25% $\rightarrow$ `General Availability` 100%). Strict protocol and local database schema compatibility checks. Recovery path for failed updates ensuring rollback never destroys un-synced outbox commands or applies older binaries to upgraded schemas.
  - Acceptance:
    - Unsigned or tampered update binaries rejected fail-closed before execution.
    - Local outbox mutations preserved without loss during application updates.
    - Schema migration version incompatibility strictly prevents destructive binary downgrades.

- [ ] **M11-T06** — Cross-platform observability, crash telemetry & sync health dashboards
  - Depends on: M03-T05, M10-T05, M11-T05 · Output: `docs/reports/M11/release-channel-observability.md`, monitoring metrics suite.
  - Scope: confirm production observability across release channels (derived from M11-W06): Sentry/crash telemetry per platform, crash-free session tracking ($> 99.5\%$ target), server sync latency and outbox lag metrics, rejected mutation alerts, and real-device Himalayan connectivity restrictions.
  - Acceptance:
    - Real-time telemetry captures unhandled exceptions across Dart, WebAssembly, and native FFI.
    - Device sync-health metrics expose pending outbox queue depth, cursor lag, and rejection reasons.
    - Alerting triggers when sync lag exceeds threshold or crash rate spikes.

- [ ] **M11-T07** — 👤 GATE — Internal pilot → controlled wider rollout → owner-approved release
  - Depends on: M11-T01…T06 · Output: `[M11-GATE]` evidence packet (`docs/reports/M11/m11-exit-gate.md`) and owner release approval.
  - Scope: aggregate complete vault restore drill evidence, measured RPO/RTO metrics, fresh-device bootstrap pass, signed multi-platform installer artifacts, auto-update verification logs, and live channel observability dashboards (derived from M11-W07). Present final release packet to repository owner for formal Protocol R8 release signoff.
  - Acceptance:
    - Exit sentence proven: measured recovery drill, validated platform packages, full parity evidence, monitoring live, and user-approved release.
    - Owner approval recorded under Protocol R8 before publishing or tagging release.

---

## Refinement contract

This milestone is refined to task level under Protocol R9 ahead of execution. All 7 work packages have been mapped to concrete tasks `M11-T01` through `M11-T07` with explicit dependencies, deliverable outputs, implementation scopes, and testable acceptance criteria.
