# M10 — Full feature parity and web migration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M10, §6.0 maintenance posture. Dependencies: M04–M09 and the M00 inventory. Long-tail overlap tax peaks here (v3 §6.0). Registered at **WP level** — refine before the preceding gates open.

Exit (v3): every agreed inventory item has passing platform evidence or an explicitly accepted scope decision. Browser feature omissions cannot be hidden behind an installation prompt.

---

- [ ] **M10-W01** — Migration waves over the M00 inventory: every workflow tracked (four engineering engines ≠ full parity)
  - Acceptance sketch: inventory items grouped into waves (billing/IPC, procurement, workforce/HR, accounting, documents, JV, admin…); each wave tracked to platform evidence (v3 §6 M10).

- [ ] **M10-W02** — One route at a time; one active writer contract per entity/document version
  - Acceptance sketch: no duplicated authoritative business logic; no silently downgraded old clients (v3 §6 M10).

- [ ] **M10-W03** — Cross-cutting verification on both Flutter web and installed apps
  - Acceptance sketch: role-based visibility, imports/exports, print fidelity, file links, search, errors, keyboard behavior, accessibility, screen sizes, localization (v3 §6 M10).

- [ ] **M10-W04** — Deep links and session transitions between remaining Next.js areas and Flutter web
  - Acceptance sketch: deployment paths, asset caching, rollback explicit (v3 §6 M10).

- [ ] **M10-W05** — Superseded React UI retirement with rollback evidence
  - Acceptance sketch: removal only after accepted feature equivalence + rollback evidence; Next.js backend functionality preserved until deliberately migrated — frontend replacement is not permission to delete server routes (v3 §6 M10).

- [ ] **M10-W06** — 👤 GATE — M10 exit evidence
  - Acceptance sketch: full cross-platform feature matrix evidence or explicitly accepted scope decisions (owner ADRs); owner approval per protocol R8.

## Refinement contract

Before the M08/M09 gates merge, refine to `M10-Tnn` tasks (per-wave tasks) with testable acceptance criteria (protocol R9).
