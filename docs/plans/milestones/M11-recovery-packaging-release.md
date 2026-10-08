# M11 — Recovery, packaging and staged release

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M11, §8 release row. Dependencies: backup/packaging groundwork starts after M01; final release requires M03–M10 evidence. Registered at **WP level** — refine at the M10 gate.

Exit (v3): measured recovery drill, validated platform packages, full parity evidence, monitoring and user-approved release. **Do not publish or push merely because a build succeeded.**

---

- [ ] **M11-W01** — Complete backup coverage + independent vault retrieval/restore drill
  - Acceptance sketch: database + registered original/served objects restored into an isolated environment; tenant isolation and references validated; cloud-accepted record ≠ independent backup (v3 §6 M11).

- [ ] **M11-W02** — RPO/RTO measured; key escrow, retention, failed-backup alerts, operator procedures
  - Acceptance sketch: defined AND measured (v3 §6 M11); alerting demonstrated.

- [ ] **M11-W03** — Fresh-device bootstrap and failure matrix
  - Acceptance sketch: migration interruption, application downgrade rejection, local corruption, revoked devices, expired change-feed cursors (v3 §6 M11).

- [ ] **M11-W04** — Signed/notarized packages: macOS Intel/ARM64 DMGs, Windows installers, Linux AppImage/deb, Android/iOS artifacts
  - Acceptance sketch: built on supported runners; signing material only in release infrastructure; install/upgrade/uninstall tested (v3 §6 M11, §8 release row).

- [ ] **M11-W05** — Signed update verification, staged rollout, schema/protocol compatibility, failed-upgrade recovery path
  - Acceptance sketch: rollback never destroys pending commands or applies an old binary to an incompatible local schema (v3 §6 M11).

- [ ] **M11-W06** — Observability across release channels confirmed
  - Acceptance sketch: staged-rollout dashboards, crash-free sessions per platform, sync-lag and rejected-command alerts before pilot expansion (v3 §6 M11).

- [ ] **M11-W07** — 👤 GATE — Internal pilot → controlled wider rollout → owner-approved release
  - Acceptance sketch: measured recovery drill + full parity evidence + monitoring live; real-device background restrictions tested; **user-approved release recorded** (protocol R8; v3 §6 M11 exit).

## Refinement contract

Before the M10 gate merges, refine to `M11-Tnn` tasks with testable acceptance criteria (protocol R9).
