# M04 — First vertical workflow: daily log and photo

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M04. Dependencies: M03. Proves the system architecture — **not** a complete platform release (v3 §6 M04). Registered at **WP level** — refine before the M03 gate opens.

Exit (v3): device-recorded workflow evidence, automated fault tests, parity with current daily-log rules and user verification.

---

- [ ] **M04-W01** — Trace daily-report domain path through the new adapter
  - Acceptance sketch: existing daily-report schemas, builders, permissions and side-effect services reused; any side effect needing central transaction changes identified **before** calling through the adapter (v3 §6 M04).

- [ ] **M04-W02** — One shared Flutter workflow, native and web: select project → create/edit log → attach photo → save locally → sync
  - Acceptance sketch: same workflow code path on installed apps and browser; local save on native per the M03 durability contract; accepted data viewable in the current web app and on a second device (v3 §6 M04).

- [ ] **M04-W03** — Fault matrix automated tests
  - Acceptance sketch: simultaneous office edit, permission revocation, expired login, app termination, reboot, disk full, slow/absent network, lost acknowledgment, incomplete photo upload (v3 §6 M04 list, all covered).

- [ ] **M04-W04** — Retention and restore proof
  - Acceptance sketch: pending local data retained through rejected sync; new device restores accepted records and registered photos (v3 §6 M04).

- [ ] **M04-W05** — Real-device telemetry capture and capacity re-baseline
  - Acceptance sketch: sync latency, battery/background behavior, crash-free rate captured; §6.0 effort bands re-baselined against measured throughput (v3 §6 M04; bands change only via `[PLAN-AMEND]`).

- [ ] **M04-W06** — Evidence package: device-recorded workflow video/logs + parity check vs current daily-log rules
  - Acceptance sketch: evidence covers native and web; user verification explicitly requested (v3 §6 M04 exit).

- [ ] **M04-W07** — 👤 GATE — M04 exit evidence and user verification
  - Acceptance sketch: all WPs ticked; M05 refined to task level in the gate; owner approval per protocol R8.

## Refinement contract

Before `M03-W10` merges, refine to `M04-Tnn` tasks with testable acceptance criteria (protocol R9).
