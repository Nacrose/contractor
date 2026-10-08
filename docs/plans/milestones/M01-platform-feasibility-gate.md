# M01 — Platform feasibility and performance gate

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M01, §4 kernel governance, §7 budgets, M01 fallback matrix. Dependencies: M00 gate passed. Scope discipline: disposable but reproducible technical prototypes using shared components/contracts — **not production screens**. All prototypes live under `prototype/` and carry no production cutover.

Exit (v3, verbatim intent): measured report and architecture decision accepting the stack, or a documented redesign before a broad rewrite. No production cutover if browser parity, native storage or cross-language semantics fail.

---

- [x] **M01-T01** — Pin toolchains and license-reviewed binding strategy; stand up cross-platform CI (PR #17)
  - Depends on: M00-T21 (gate) · Output: `docs/reports/M01/toolchain.md` + CI workflow files
  - Acceptance:
    - Flutter/Dart (+ Rust if adopted later) versions pinned with license review; pinning rationale recorded.
    - CI builds desktop (Linux runner), Android, iOS (via cross-platform CI if no macOS host), and browser targets; unavailable host coverage recorded honestly (v3 §6 M01).
    - `flutter analyze`, `flutter test` wired; missing checks recorded as skipped, never passed.

- [x] **M01-T02** — Scaffold the disposable prototype shell (`prototype/construction_client/`) (PR #18)
  - Depends on: M01-T01 · Output: prototype app shell + platform runners (desktop/Android/iOS/web)
  - Acceptance:
    - Shell boots on all available targets; screenshots/logs per target recorded in the PR.
    - Clearly labeled disposable (v3 M01 scope discipline); no domain formulas in widgets; no production feature code.

- [x] **M01-T03** — Browser target proof: startup and data access without native plugins or local server (PR #19)
  - Depends on: M01-T02 · Output: `docs/reports/M01/browser-proof.md`
  - Acceptance:
    - Flutter web build starts from static hosting with no local server and no native plugin dependency (v3 §6 M01).
    - Data access path exercised in-browser ( IndexedDB/OPFS or equivalent adapter) with results recorded; cache-durability dependency explicitly avoided (v3 §4 rule).

- [x] **M01-T04** — Representative worksheet interaction prototype (desktop + web) (PR #20)
  - Depends on: M01-T02, M00-T11 (fixtures) · Output: prototype + `docs/reports/M01/proto-worksheet.md`
  - Acceptance:
    - Virtualized grid subset driven by engine viewport/layout output handles a 50k-row fixture from M00.
    - Text input/IME, selection, clipboard, fonts, keyboard shortcuts exercised on desktop and web; gaps listed per platform (v3 §6 M01).

- [x] **M01-T05** — Representative CAD viewport prototype (desktop + web) (PR #21)
  - Depends on: M01-T02, M00-T11 · Output: prototype + `docs/reports/M01/proto-cad.md`
  - Acceptance:
    - Renders a M00 CAD fixture (blocks/text/hatches/curves mix) with pan/zoom/selection/snap basics; frame-time p95/p99 and input latency recorded per §7 methodology on the declared minimum hardware.
    - Browser path exercised through the web rendering route, not a desktop-only code path (v3 §4 cross-platform rules).

- [x] **M01-T06** — Representative PDF measurement interaction prototype (desktop + web) (PR #22)
  - Depends on: M01-T02, M00-T11 · Output: prototype + `docs/reports/M01/proto-pdf.md`
  - Acceptance:
    - Tiled viewport, bounded decoded-page cache, cancellation and explicit disposal demonstrated on the 100+ page / 200 MB fixture and a dense single page (v3 §6 M01 + §7).
    - First-page and warm-page timings recorded; no eager rasterization of every page.

- [x] **M01-T07** — Kernel comparative prototype: worksheet recalculation engine (PR #23)
  - Depends on: M01-T04, M00-T12 (reference outputs) · Output: scored prototypes + `docs/reports/M01/kernel-worksheet.md`
  - Acceptance:
    - Candidates prototyped within the ratified timebox: (i) focused Dart implementation, (ii) existing library where one exists, (iii) Rust port where profiling justifies (v3 §4).
    - Each scored on: performance vs ratified budgets on minimum hardware, correctness vs shared fixtures, interoperability across native/web/server targets, maintenance/licensing cost. No fixed multiplier qualifies/disqualifies (v3 §4).
    - Worksheet expected as the strongest binding-heavy candidate for a non-Dart kernel — verdict recorded either way.

- [x] **M01-T08** — Kernel comparative prototype: CPM/scheduling (PR #24)
  - Depends on: M01-T04 (harness reuse) · Output: scored prototypes + `docs/reports/M01/kernel-cpm.md`
  - Acceptance:
    - CPM semantics (inclusive dates, calendars, lag hours, constraints) exercised via M00 fixtures against candidates; server-authoritative TypeScript retention evaluated as the expected outcome (v3 §4).
    - Any client-side port classified per instruction 9 governance (temporary duplicate: owner, fixtures, removal gate).

- [ ] **M01-T09** — Kernel comparative prototype: geometry/CAD primitives
  - Depends on: M01-T05 · Output: scored prototypes + `docs/reports/M01/kernel-geometry.md`
  - Acceptance:
    - Intersections/connectivity/offsets/tolerance policy exercised via fixtures; Dart/library/Rust candidates scored per §4 criteria.
    - Rendering separately measured as an adapter consuming compact geometry batches — no per-vertex bridge calls (v3 §4 rule).

- [ ] **M01-T10** — Kernel comparative prototype: PDF/document primitives
  - Depends on: M01-T06 · Output: scored prototypes + `docs/reports/M01/kernel-pdf.md`
  - Acceptance:
    - Rendering/decoding candidates scored on memory bounds, cancellation, platform coverage (incl. web) and licensing.
    - Decision inputs consolidated for the M01 report; no package selected by name alone (v3 §6 M01).

- [ ] **M01-T11** — DWG dependency spike (dedicated)
  - Depends on: M00-T09, M00-T11 · Output: `docs/reports/M01/dwg-spike.md`
  - Acceptance:
    - Existing TypeScript DWG reader (`src/lib/dwg/` incl. `dwg-native.ts`) inventoried: generations covered, gaps, extension feasibility vs external converters per platform (v3 §6 M01).
    - Version coverage and **GPLv3** licensing implications of the libredwg-based converter recorded; out-of-process isolation and commercial alternatives evaluated as mitigations.
    - DWG carried as its own capability-matrix line (not a footnote beside PDF/XLSX); per-platform read/write coverage recorded.

- [ ] **M01-T12** — PDF/DWG/XLSX dependency evaluation against the capability matrix
  - Depends on: M01-T06, M01-T11 · Output: `docs/reports/M01/dependency-matrix.md`
  - Acceptance:
    - Per dependency: platform support, licensing, fidelity, offline behavior (v3 §4 rule) — gaps, costs and platform constraints recorded instead of name-picking.
    - Cloud-only converter candidates marked unacceptable for native offline editing where applicable (v3 §4).

- [ ] **M01-T13** — Native SQLite durability proof
  - Depends on: M01-T02 · Output: test rig + `docs/reports/M01/sqlite-durability.md`
  - Acceptance:
    - Proofs on real devices/runners: process termination mid-transaction, journaling/synchronization configuration, busy handling, migrations, interruption recovery, disk-full behavior (v3 §6 M01, §5.2).
    - "WAL alone" explicitly not accepted as durability proof (v3 §5.2); save-acknowledgement only after transaction commit demonstrated.

- [ ] **M01-T14** — Cross-language semantics parity: decimal/geometry/date across FFI/Wasm/server
  - Depends on: M01-T07…T10 (whichever candidates exist) · Output: fixture suite + `docs/reports/M01/cross-language-parity.md`
  - Acceptance:
    - Exact decimal strings/scaled integers across boundaries; geometry tolerances; date-only vs UTC-instant semantics proven identical across targets via shared fixtures (v3 §5.1, §6 M01).
    - Nepal dates and inclusive scheduling conventions included in the fixture set; disagreements block adoption per the fallback matrix.

- [ ] **M01-T15** — Select the canonical schema format for `packages/platform_contracts/`
  - Depends on: M01-T07…T10 evidence · Output: ADR/DR naming the one canonical schema format (v3 §4 contract artifact)
  - Acceptance:
    - Format chosen against: TS/Dart/Rust codegen quality, drift-check tooling, versioning story; alternatives scored.
    - Generated-bindings-as-committed-artifacts + generation-drift check approach ratified in the record (v3 §4).

- [ ] **M01-T16** — Execute the fallback matrix and record every row's outcome
  - Depends on: M01-T03…T14 evidence · Output: `docs/reports/M01/fallback-matrix-outcomes.md`
  - Acceptance:
    - All seven matrix rows (v3 §6 M01) resolved with the measured outcome: taken (gate failed) or not triggered (gate passed).
    - Implementation fallbacks (native perf → comparative prototype; SQLite durability → stop and fix; cross-language → single authoritative implementation) executed as pre-committed.
    - Product-scope rows (browser engineering engines, browser field-ops, DWG scope, per-platform takeoff) produce **evidence + written proposals for the owner** — never self-executed; §1 parity gate holds until owner ADR (protocol R8; v3 v3-matrix rules).
    - Any budget renegotiation recorded as a decision — never silently lowered.

- [ ] **M01-T17** — 👤 GATE — M01 measured report and stack decision
  - Depends on: M01-T01…T16 (all) · Output: gate PR `[M01-GATE]` with the consolidated measured report and the architecture decision (accept stack / documented redesign)
  - Acceptance:
    - Kernel per-engine decision records drafted (authoritative implementation, per-target binding strategy, shared fixtures, duplication status) for engines going forward — required before any screen depends on them (v3 §4).
    - M02 register verified/refined against M01 findings (`[PLAN-AMEND]` if criteria changed) — protocol R9.
    - **Owner approval recorded** before merge; no production cutover claims.
