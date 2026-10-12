# M10 — Full feature parity and web migration

> Source of scope: [platform plan v3](../native-web-platform-plan-v3.md) §6 M10, §6.0 maintenance posture. Dependencies: M04–M09 and the M00 inventory; T07's document/deck legs also consume M12-W07. Long-tail overlap tax peaks here (v3 §6.0). Refined from WP level to task level per Protocol R9 ahead of execution.

Exit (v3): every agreed inventory item has passing platform evidence or an explicitly accepted scope decision. Browser feature omissions cannot be hidden behind an installation prompt.

Integration direction: [ADR-0018](../../adr/0018-upstream-capabilities-and-construction-integration.md) and the [platform integration strategy](../open-source-platform-integration-strategy.md) preserve original workflows while upstream projects supply generic capabilities. T01's documentation-only mapping prepares specialist milestones after M00-T10/M02-T08; T04's source discovery may also prepare early. Production migration and accounting integration retain this milestone's dependencies.

---

- [x] **M10-T01** — Original custom tool audit, upstream capability mapping & retained domain rules (PR #110)
  - Depends on: M00-T10, M02-T08 · Output: `docs/reports/M10/tool-audit-and-upstream-mapping.md`, inventory disposition matrix.
  - Scope: documentation-only audit of original sources and M00 inventory, including background jobs, imports, and background writers (derived from M10-W07). For each tool/route, name its consumers, behavior, retained construction domain rules, proposed upstream/API component, state owner, adapters, platform/fixture coverage, gaps, migration/restore, and retirement criteria. Assign implementation to owning milestones/tasks without rebuilding specialist capabilities already available upstream or retiring custom construction behavior by naive name matching.
  - Acceptance:
    - Audit maps 100% of M00 inventory workflows with explicit disposition: `ADOPT_UPSTREAM`, `RETAIN_CUSTOM_DOMAIN`, or `WRAP_ADAPTER`.
    - Retained construction domain rules (BoQ measurement linkage, RA cost separation, Nepal tax/withholding, retention deductions) explicitly identified per workflow.
    - State ownership and writer authorities assigned to existing services without duplicate logic.

- [x] **M10-T02** — Inventory migration waves & wave-by-wave tracking matrix (PR #111)
  - Depends on: M10-T01, M04–M09 · Output: `docs/reports/M10/migration-waves-matrix.md`, automated parity tracking fixture.
  - Scope: group all M00 inventory workflows into structured migration waves (derived from M10-W01): Wave 1 (Procurement & Materials/Inventory), Wave 2 (Workforce, Daily Attendance & HR), Wave 3 (Billing, IPC & Client Certifications), Wave 4 (Subcontractor & Joint Venture Management), Wave 5 (Administrative & System Operations). Establish per-wave platform evidence criteria, ensuring domain behavior is preserved while replacing generic implementations with upstream adapters.
  - Acceptance:
    - Every M00 inventory item assigned to a concrete migration wave with defined entry and exit criteria.
    - Zero orphaned workflows; four engineering engines (GridCraft, CadCraft, PdfCraft, TruePPM) integrated into application-level workflows.
    - Machine-readable parity matrix validates status of each route and feature.

- [x] **M10-T03** — Single active writer contract per entity/document version & route-by-route cutover adapter (PR #112)
  - Depends on: M10-T01, M03-T04 · Output: `packages/native_runtime` cutover gateway / routing adapters, route-level concurrency guards.
  - Scope: enforce the "one route at a time; one active writer contract per entity/document version" rule across client and server boundaries (derived from M10-W02). Ensure no duplicated authoritative business logic exists across Dart/TypeScript. Block silent downgrades of older clients via strict protocol version negotiation.
  - Acceptance:
    - Route cutover gateway routes each entity write exclusively to one authoritative handler with optimistic concurrency (`lastServerSeq` / revision ID).
    - Concurrent writes from superseded clients are rejected fail-closed with structured migration upgrade prompts, never corrupted.
    - Zero authoritative business logic duplicated between Flutter and Next.js layers.

- [x] **M10-T04** — Accounting library qualification (`flutter_accounting`) & service integration (PR #113)
  - Depends on: M10-T01, M03-T02, M06-T03 · Output: `docs/reports/M10/accounting-qualification-and-integration.md`, `packages/native_accounting` integration module.
  - Scope: resolve actual `flutter_accounting` package identity, upstream source, version, and license per ADR-0014 (derived from M10-W08). Prove monetary precision (exact-decimal / integer cents), balanced atomic double-entry journals ($\sum\text{Debits} = \sum\text{Credits}$), period locks, reversal transactions, and reconciliation reports. Integrate through Contractor accounting/approval services with single ledger authority, stable project/JV dimensions, retry-safe idempotent posting, and M03 sync feed. Supply domain-specific Nepal construction chart of accounts (VDS, TDS, advance mobilization, retention).
  - Acceptance:
    - Open source license and NOTICE audited; exact commit and digest pinned.
    - Zero floating-point rounding drift; atomic balancing verified across complex multi-line journals.
    - Closed fiscal period locking strictly prevents retroactive journal entries.
    - Idempotent posting eliminates duplicate journal entries on sync replay.

- [x] **M10-T05** — Deep links, session state transitions & asset caching between Next.js and Flutter Web (PR #114)
  - Depends on: M02-T04, M10-T03 · Output: `docs/reports/M10/session-transitions-and-deep-links.md`, unified authentication and navigation shell.
  - Scope: establish bidirectional deep linking and seamless session state transitions between remaining Next.js areas and Flutter Web (derived from M10-W04). Maintain shared authentication token state, active project context, tenant isolation, and canvas viewport coordinates. Configure explicit asset caching, PWA service workers, deployment path routing, and instantaneous rollback mechanisms.
  - Acceptance:
    - Seamless navigation transitions between Next.js routes and Flutter Web without re-authentication or loss of context.
    - Deep links directly open target entities (BoQ items, schedule tasks, takeoff sheets, CAD drawings) on web and native.
    - Asset caching policies ensure predictable offline loading and instant cache invalidation on deployment.
    - Explicit rollback mechanism switches traffic back to legacy route if web runtime faults occur.

- [ ] **M10-T06** — Cross-cutting verification matrix across Flutter Web and installed native apps
  - Depends on: M10-T02, M10-T05 · Output: `docs/reports/M10/cross-cutting-verification-matrix.md`, automated cross-platform E2E verification suite.
  - Scope: evaluate cross-cutting non-functional requirements across Flutter Web and desktop/mobile installed apps (derived from M10-W03): RBAC role-based visibility, file imports/exports (CSV, DXF, PDF, XLSX, DOCX), print/vector fidelity, file linking, global search, error handling, keyboard shortcuts, screen-reader accessibility (a11y), responsive screen sizes (mobile, tablet, desktop, 4K), and localization (English/Nepali).
  - Acceptance:
    - Role-based permissions identically restrict or expose UI actions across web and native targets.
    - Keyboard navigation and accessibility pass WCAG 2.1 AA requirements on web canvas surfaces.
    - Responsive layout adapts fluidly from compact mobile screens ($360\text{ dp}$) to ultra-wide desktop displays ($3840\text{ px}$).
    - File export and print output bit-identical across web and installed runtimes.

- [ ] **M10-T07** — Connected original-app cross-tool journeys across adopted upstream engines
  - Depends on: M10-T02, M10-T03, M10-T04, M10-T06, M12-W07 · Output: `docs/reports/M10/connected-journeys-verification.md`, end-to-end multi-tool journey integration tests.
  - Scope: verify complete end-to-end journeys linking adopted engines and retained domain workflows (derived from M10-W09): (1) Takeoff measurement $\rightarrow$ BoQ item $\rightarrow$ Procurement requisition $\rightarrow$ Client IPC billing; (2) Material delivery $\rightarrow$ Goods receipt $\rightarrow$ Inventory stock ledger $\rightarrow$ Journal entry $\rightarrow$ Financial report; (3) Daily site progress $\rightarrow$ TruePPM schedule recalculation $\rightarrow$ EVM S-curve $\rightarrow$ Client progress report/deck. Validate stable entity context, offline queueing, conflict resolution, and cross-component upgrade/restore.
  - Acceptance:
    - Complete multi-tool workflows execute flawlessly without data translation loss or manual copy-pasting.
    - Offline-created multi-tool chains replay and reconcile accurately upon reconnecting.
    - Upgrades of underlying tool engines (GridCraft, CadCraft, PdfCraft, TruePPM) preserve in-flight multi-tool journey state.

- [ ] **M10-T08** — Superseded React UI retirement, clean decommissioning & rollback drill
  - Depends on: M10-T02, M10-T03, M10-T07 · Output: `docs/reports/M10/react-ui-retirement-and-rollback.md`, decommissioning manifest, rollback drill runbook.
  - Scope: retire superseded React components and routes only after documented feature equivalence, automated test coverage, and formal owner signoff (derived from M10-W05). Preserve Next.js backend API routes and domain services while decoupling deprecated frontend views. Execute a live rollback drill to prove emergency route fallback without data loss.
  - Acceptance:
    - Superseded frontend views removed cleanly without leaving dead code or broken router links.
    - All backend endpoints and domain logic remain intact and verified by regression test batteries.
    - Rollback drill demonstrates immediate traffic restoration to legacy fallback within $< 60\text{ s}$ if triggered.

- [ ] **M10-T09** — 👤 GATE — Full parity & web migration exit evidence
  - Depends on: M10-T01…T08 · Output: `[M10-GATE]` evidence packet (`docs/reports/M10/m10-exit-gate.md`) and owner decision.
  - Scope: aggregate complete cross-platform parity matrix, tool disposition audit, accounting integration proof, connected journey evidence, and retirement signoff (derived from M10-W06).
  - Acceptance:
    - Exit sentence proven: every agreed inventory item has passing platform evidence or an explicitly accepted scope decision; browser feature omissions cannot be hidden behind an installation prompt.
    - Owner approval recorded under Protocol R8 before merge.

---

## Refinement contract

This milestone is refined to task level under protocol R9 ahead of execution. All 9 work packages have been mapped to concrete tasks `M10-T01` through `M10-T09` with explicit dependencies, deliverable outputs, implementation scopes, and testable acceptance criteria, preserving the upstream capability and domain rule retention strategy (ADR-0018).
