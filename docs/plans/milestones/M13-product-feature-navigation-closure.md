# M13 — Full product feature and navigation closure

Status: planned; 0/33 completed. Planning amendment dated 2026-10-17. No implementation completion is asserted.

Specification: [full-product plan](../full-product-feature-navigation-plan.md). Coverage: [route/workflow appendix](../../frontend/full-product-coverage.md).

Execution procedure: [full-product execution runbook](../full-product-execution-runbook.md).

This registers the missing product integration work without resetting historical M00–M12 engine milestones. Packets are execution boundaries; broad downstream packets must be split/refined through a plan amendment before implementation where one reviewable PR cannot cover them. Update the rollup and coverage ownership when splitting. Dependencies below refer to M13 unless fully qualified. All tasks inherit the specification’s per-feature evidence and scope-isolation rules.

## M13-T01 — Reconcile original source and complete the action inventory

- [ ] **M13-T01** — Reconcile original source and complete the action inventory
  - Depends on: None.
  - Scope/outputs: Pin the actual original checkout/archive and compatible backend. Inspect route pages plus imported tabs, dialogs, menus, APIs, jobs and mobile entry points. Reconcile the 64-route seed, 41-workflow matrix, router registrations and missing navigation registries. Replace heuristic mappings with reviewed evidence.
  - Acceptance: Every source route/action has a stable coverage ID, owner, source location, service, permission and per-action offline policy. Aliases, source-partial features and user-directed replacements are explicit. No claim that archive and commit match without proof.

## M13-T02 — Implement canonical route and capability contracts

- [ ] **M13-T02** — Implement canonical route and capability contracts
  - Depends on: T01.
  - Scope/outputs: Extend construction_application registries with scoped routes, aliases, view/entity metadata, query encoding and capability projections. Add factories and dependency contracts consumed by all modules.
  - Acceptance: Round-trip route parsing and direct links cover all inventoried routes; duplicate/unbound IDs fail checks. Login/admin/utility paths cannot resolve to project inventory. Sidebar, tabs and nested detail selections derive from the same registry.

## M13-T03 — Connect production bootstrap, authentication and workspace identity

- [ ] **M13-T03** — Connect production bootstrap, authentication and workspace identity
  - Depends on: T01.
  - Scope/outputs: Reuse connected host identity/configuration, credential and project services in shared native/web bootstrap. Remove implicit production development authentication; preserve explicit preview entry points. Restore account/organisation/project and pending-work logout handling.
  - Acceptance: Real sign-in, restart, sign-out, expiry/revocation and inaccessible project flows pass. Project selection comes from authoritative membership; scope changes invalidate late responses and preserve correctly scoped drafts. Missing server configuration has a setup/error state.

## M13-T04 — Connect repositories, commands, attachments and sync

- [ ] **M13-T04** — Connect repositories, commands, attachments and sync
  - Depends on: T02, T03.
  - Scope/outputs: Wire authorized transport, DTO serialization, query cache, expected versions, outbox drain, receipts, attachments and change feed through existing central services. Inject field stores into the actual product entry point.
  - Acceptance: Real read/write/read-back passes against the compatible backend. Lost acknowledgment retries are idempotent; definitive rejection is not replayed; offline commands survive process restart. Cross-account/project isolation and exact-decimal transport pass.

## M13-T05 — Complete shell navigation and shared interaction behavior

- [ ] **M13-T05** — Complete shell navigation and shared interaction behavior
  - Depends on: T02, T03.
  - Scope/outputs: Split label-based shell branches into module factories. Implement route history/deep links, scope switch, list/detail restoration, dirty exit, keyboard/focus, sidebar modes/reordering, theme, notifications and shared action bar behavior.
  - Acceptance: All registered destinations have correct active tabs and explicit loading/empty/error/access states. No inventory catch-all or success-only generic action remains. Original shell preferences persist and compact layouts do not clip primary actions.

## M13-T06 — Deliver organisation desk and project lifecycle

- [ ] **M13-T06** — Deliver organisation desk and project lifecycle
  - Depends on: T04, T05.
  - Scope/outputs: Implement portfolio/search, project creation/details/membership/archive, organisation selection, activity, notification links and task inbox using original services. Keep analytics for T30.
  - Acceptance: Create/select/archive/restore under permitted roles persists across restart. Notifications and task links open the correct scoped entity; original forms and validation are preserved. No demo projects or assumed permissions.

## M13-T07 — Finish field capture and office review journeys

- [ ] **M13-T07** — Finish field capture and office review journeys
  - Depends on: T04, T05, T06, T08, T09.
  - Scope/outputs: Connect daily report detail/edit/review, photos/GPS, attendance, direct deliveries and petty cash to actual project roster/catalog inputs and durable field stores. Finish drafts/conflicts/sync status surfaces and original print routes with document bindings.
  - Acceptance: Capture offline with attachments, restart, reconnect and review produces one authoritative record. Rejection/conflict remains recoverable; no fabricated worker/material IDs or financial acceptance on local save. Source aliases reach the same records.

## M13-T08 — Implement workforce identity, team and assignments

- [ ] **M13-T08** — Implement workforce identity, team and assignments
  - Depends on: T04, T05, T06.
  - Scope/outputs: Bind organisation persons/users, staff roles, employment contracts, project assignments, access and responsibility handover. Supply real roster queries to field consumers.
  - Acceptance: Worker identity remains distinct from login identity. Assignment changes affect authorized projects; handover reassigns pending responsibilities under original rules. Duplicate person, access denial and restart read-back pass.

## M13-T09 — Implement material, vendor, resource and preset libraries

- [ ] **M13-T09** — Implement material, vendor, resource and preset libraries
  - Depends on: T04, T05, T06.
  - Scope/outputs: Deliver shared/project catalogs, suppliers, resource/rate libraries, presets and profile selection; preserve ownership/version rules and provide selectors to BOQ, procurement and equipment.
  - Acceptance: Create/update/import/search supported records with real services, scoped uniqueness and validation. Changes invalidate dependent views without silently changing approved snapshots. Central and project catalogs cannot leak across organisations.

## M13-T10 — Complete BOQ contract hierarchy, versions and exports

- [ ] **M13-T10** — Complete BOQ contract hierarchy, versions and exports
  - Depends on: T04, T05, T06.
  - Scope/outputs: Replace sample BOQ repository production use with authoritative bill/subbill/item hierarchy, quantities/rates, approved versions, comparison, import/export and PDF designer. Connect supported worksheet capability through qualified adapters.
  - Acceptance: Original actions, reordering, hierarchy totals and versions match service fixtures. Immutable contractual baselines survive changes/restart. Actual exports reopen, unauthorized writes fail and selected project is never hard-coded.

## M13-T11 — Complete rate analysis and profile workflows

- [ ] **M13-T11** — Complete rate analysis and profile workflows
  - Depends on: T09, T10.
  - Scope/outputs: Implement norms/resource breakdown, labor/material/equipment rates, overhead/profit, profile updates, library reuse and original approval/version interactions. Remove static synchronization claims.
  - Acceptance: Detailed unit-rate results match authoritative fixtures with exact decimals. Updating a profile follows original propagation rules and exposes affected drafts; approved history does not silently change. Original dialogs and reports work.

## M13-T12 — Complete variation orders and contract effects

- [ ] **M13-T12** — Complete variation orders and contract effects
  - Depends on: T10, T11.
  - Scope/outputs: Implement VO register/detail, quantities/rates, justifications, attachments, status transitions, comparison and revised-contract projections through original services.
  - Acceptance: Create/review/approve/reject and permitted amendments persist with audit. Approved VO changes flow once to contract/BOQ projections; retries and stale versions cannot duplicate financial effects.

## M13-T13 — Harden Contractor IPC creation and durable workbook ownership

- [ ] **M13-T13** — Harden Contractor IPC creation and durable workbook ownership
  - Depends on: T04, T05, T06, T10.
  - Scope/outputs: Reuse current creator/store, add versioned blank-template validation, correct contract/period identity, durable number reservation, cross-process no-overwrite creation, staged recovery and launch/reopen behavior. Each IPC owns a separate workbook.
  - Acceptance: First IPC is created from Contractor without an existing link. Two IPCs have distinct files/identities. Duplicate clicks, concurrent creation, disk-full, launch failure and crash between file/DB stages recover without overwrite, duplicate numbering or phantom success. Reference IPC-9 values are never seeded.

## M13-T14 — Qualify actual GridCraft workbook preservation and calculation

- [ ] **M13-T14** — Qualify actual GridCraft workbook preservation and calculation
  - Depends on: T01.
  - Scope/outputs: Test pinned GridCraft on disposable representative and blank-template workbooks. Resolve recorded image loss, shape limitations, dependency calculation and saved-result freshness. Establish supported launch/save observation contract and update/rollback policy.
  - Acceptance: Independent workbook comparison proves required parts/layout/formulas and supporting dependency calculations survive edit/save/reopen. Freshness evidence binds exact saved bytes. Until passed, automatic payment publication stays blocked with specific evidence; synthetic formulas alone do not pass.

## M13-T15 — Finish production IPC capture, extraction and recovery

- [ ] **M13-T15** — Finish production IPC capture, extraction and recovery
  - Depends on: T04, T13, T14.
  - Scope/outputs: Implement stable save capture, parent-directory watcher, ordered observations, reconciliation, immutable snapshots, production Summary of Payment reader, identity/schema/decimal checks and freshness-bound transactional publication. Reuse store history/claim protections.
  - Acceptance: Rapid/rename saves, partial writes, missed events, stale caches, missing links, malformed files, moved files, retries and process crashes pass. Older capture cannot replace newer accepted revision. Last-good values survive failure; local/server acceptance remains distinct and publication is idempotent.

## M13-T16 — Complete read-only IPC views and downstream summary integration

- [ ] **M13-T16** — Complete read-only IPC views and downstream summary integration
  - Depends on: T12, T15.
  - Scope/outputs: Render register/detail with validated Summary of Payment, previous/current/cumulative values, source revision/history, freshness/status/error explanation and Open in GridCraft. Bind existing finance/workflow consumers without exposing IPC amount/approval/paid-state editors.
  - Acceptance: Contractor create → GridCraft edit/save → validated view → reopen passes on real runtime. No IPC payment/quantity edit control exists. No workbook save certifies or pays an IPC; issued history is immutable. Only summary fields feed app payment calculations; absent Abstract of Quantity is not a prerequisite.

## M13-T17 — Complete TruePPM planning and schedule routes

- [ ] **M13-T17** — Complete TruePPM planning and schedule routes
  - Depends on: T04, T05, T06, T10.
  - Scope/outputs: Bind real schedules, Gantt, WBS/dependencies, calendars/BS dates, versions/baselines/revisions, progress, look-ahead, staffing, XER/MSP import/export and PDF designer to full TruePPM and authoritative services.
  - Acceptance: Actual project opens/saves/reopens in qualified TruePPM; progress and baseline comparisons agree with construction services. Calendar/import/export fixtures pass; old or mismatched saves cannot overwrite a newer schedule. No sample schedule or label-only launch counts.

## M13-T18 — Complete workflow, communication and responsibility routes

- [ ] **M13-T18** — Complete workflow, communication and responsibility routes
  - Depends on: T07, T08.
  - Scope/outputs: Deliver My Tasks, RFIs, meetings/actions, daily program, correspondence links, communication/chat, approvals/delegation and original report designer/print destinations. Reuse notification and document contracts.
  - Acceptance: Each lifecycle transition enforces roles, expected version and audit; assigned tasks/notifications deep-link correctly. Reports/attachments are real records; aliases resolve to same entities. Rejections and offline policies match the source.

## M13-T19 — Complete requisitions, quotations and purchase orders

- [ ] **M13-T19** — Complete requisitions, quotations and purchase orders
  - Depends on: T08, T09.
  - Scope/outputs: Implement demand/requisition, approvals, quote comparison, PO creation/numbering/terms, revisions, dispatch/export and receipt links.
  - Acceptance: Real requisition → approved PO → partial/final receipt linkage passes. Double submit does not duplicate PO; forbidden or stale transitions fail. Amendments/cancellations preserve original commitments and audit.

## M13-T20 — Complete stores, material transactions and transfers

- [ ] **M13-T20** — Complete stores, material transactions and transfers
  - Depends on: T07, T09, T19.
  - Scope/outputs: Implement gate/receipt, stock/valuation, issue/return, count/reconcile, inter-site dispatch/transit/receipt and ledger/print views.
  - Acceptance: PO/direct receipt → stock → issue/return/transfer matches authoritative valuation and quantity fixtures. Partial transfer, duplicate receipt, rejection, restart and scoped access pass. Local delivery cannot falsely claim accepted inventory posting.

## M13-T21 — Complete equipment, rentals, fuel and plant workflows

- [ ] **M13-T21** — Complete equipment, rentals, fuel and plant workflows
  - Depends on: T08, T09.
  - Scope/outputs: Implement fleet/assets, rental contracts, spot-hire/work orders, operation/maintenance logs, fuel dispensing/dip reconciliation, plant production and billing integration contracts.
  - Acceptance: Equipment usage/fuel/rental verification persists and produces correct authorized cost inputs. Duplicate logs, impossible readings and denied approvals fail under source rules. Original registers/details/reports work with real records.

## M13-T22 — Complete subcontractor measurement and billing

- [ ] **M13-T22** — Complete subcontractor measurement and billing
  - Depends on: T08, T10, T12.
  - Scope/outputs: Implement subcontractor/partner contracts, measurement evidence, work-done certificates, bill/deduction/payment projections and approval states.
  - Acceptance: Measured work reconciles with approved contract/variation and cumulative billed quantities. Repeated certification cannot bill twice; issued certificates remain immutable. Finance links retain source identity and original permissions.

## M13-T23 — Complete attendance, leave, payroll and allocations

- [ ] **M13-T23** — Complete attendance, leave, payroll and allocations
  - Depends on: T07, T08.
  - Scope/outputs: Deliver attendance review, leave/calendars, payroll runs, adjustments, project cost allocations and posting integration contracts.
  - Acceptance: Person-grain attendance → approved payroll → allocation matches central fixtures. Duplicate attendance/run, closed period and wrong-project access fail; totals and dates remain exact. Reports and original approval states persist.

## M13-T24 — Complete accounting foundation and finance navigation

- [ ] **M13-T24** — Complete accounting foundation and finance navigation
  - Depends on: T04, T05, T06.
  - Scope/outputs: Deliver chart of accounts, cash/bank, parties/payables, Day Book, journals, payments, reversal/reconciliation and ledger exports using existing authority. Audit any proposed third-party accounting adapter before adoption.
  - Acceptance: Balanced journals and source-linked postings persist; retries cannot post twice. Bank/cash and ledger results agree with service fixtures; reversal preserves audit and fiscal locks. Distinct finance tabs display their own records/actions, not the same sample table.

## M13-T25 — Complete financial controls, tax, guarantees and JV integration

- [ ] **M13-T25** — Complete financial controls, tax, guarantees and JV integration
  - Depends on: T16, T19, T20, T21, T22, T23, T24.
  - Scope/outputs: Integrate verified operational costs/IPC summary with finance; restore VAT/tax registers, guarantees/expiry/release, fiscal periods, cash-flow/budget variance and JV contributions/profit allocation. Preserve original jobs/import consumers.
  - Acceptance: Cross-module receipts/postings reconcile once; closed periods and unsupported financial inputs fail loudly. Tax/guarantee/JV fixtures and expiry-job effects match source behavior. No original approval or payment state is inferred from editing a workbook.

## M13-T26 — Complete quality, punch list and safety

- [ ] **M13-T26** — Complete quality, punch list and safety
  - Depends on: T04, T05, T06, T08.
  - Scope/outputs: Deliver inspection/checklist/NCR, punch items, safety incidents, severity/status, action assignment/closure, evidence and reports.
  - Acceptance: Original list/detail/dialog/close/reopen flows persist with access/audit. Attachments and responsible people remain scoped; unresolved items appear in appropriate task views. Empty/error/denied states and export pass.

## M13-T27 — Complete drawings, CAD and PDF takeoff

- [ ] **M13-T27** — Complete drawings, CAD and PDF takeoff
  - Depends on: T04, T05, T06, T10.
  - Scope/outputs: Bind real drawing registers/revisions, actual CAD/PDF assets, qualified full editors, supported geometry/commands/plot, markup, calibrated measurements and BOQ links.
  - Acceptance: Drawing → takeoff → BOQ → revision invalidation/review passes with units/provenance. Actual DXF/DWG/PDF supported fixtures render/save/export/reopen; no default sample drawing. Unsupported file features are explicit, not silent data loss.

## M13-T28 — Complete documents, correspondence, forms and issuance

- [ ] **M13-T28** — Complete documents, correspondence, forms and issuance
  - Depends on: T04, T05, T06, T10, T17.
  - Scope/outputs: Bind corporate/project libraries, submittals/correspondence/forms, photo progress, document center, templates, original print designers and qualified WordCraft/DeckCraft/PdfCraft paths. Integrate report data through stable contracts.
  - Acceptance: Actual project data → editable document/deck → save/reopen → valid independent-reader export passes. Approval/issuance and revision history are immutable with source evidence; uploads cannot create phantom accepted documents. All inventoried designer/print routes work.

## M13-T29 — Complete settings, privileged administration and utility routes

- [ ] **M13-T29** — Complete settings, privileged administration and utility routes
  - Depends on: T03, T04, T05, T06.
  - Scope/outputs: Deliver original settings/profile flows, login/signup behavior, offline/sync pages, admin overview/organisations/users/trials/audit/data/settings/database and source-supported maintenance actions. Keep destructive/admin capabilities server-authorized.
  - Acceptance: Every original privileged route/action has corresponding permitted/denied evidence. Ordinary users cannot invoke admin APIs through deep links. Audit, account/trial operations, settings persistence and sync/error diagnostics work without exposing secrets.

## M13-T30 — Restore original overview and dashboard behavior last

- [ ] **M13-T30** — Restore original overview and dashboard behavior last
  - Depends on: T17, T18, T20, T21, T22, T23, T25, T26, T28, T29.
  - Scope/outputs: Bind original supported organisation/project/planning dashboards to real aggregates once contributing domains work. Preserve original partial status; no new analytical feature development.
  - Acceptance: Every displayed metric has an authoritative source and scope/time filter; no seeded KPI or null-as-zero fallback. Drill-downs navigate correctly, restricted data stays restricted and source-supported charts match fixtures. New analytics remains separately deferred.

## M13-T31 — Verify complete route/action and connected-workflow parity

- [ ] **M13-T31** — Verify complete route/action and connected-workflow parity
  - Depends on: T16, T18, T25, T26, T27, T28, T29, T30.
  - Scope/outputs: Exercise the complete reviewed coverage ledger, all cross-module journeys, permissions, failures, offline recovery, visual comparisons and accessibility. Record real service/editor evidence against each route/action.
  - Acceptance: No unexplained source route/action, generic fallback, simulated financial amount or missing detail/export remains. UI/service/restart evidence covers each required action and platform claim; open blockers are visible and prevent affected closure.

## M13-T32 — Verify deployment artifacts, upgrades and recovery

- [ ] **M13-T32** — Verify deployment artifacts, upgrades and recovery
  - Depends on: T31.
  - Scope/outputs: Converge actual product entry points/CI; verify schema/data upgrades, IPC file ownership, backups/restores, editor upgrades, installers and rollback on supported desktop platforms plus existing required web/mobile regression targets.
  - Acceptance: Fresh install and upgrade launch the real product with durable data intact; restore recovers workbook/summary associations and pending work. Each claimed OS has native executed evidence. Blocked toolchain or absent platform runs are recorded as not verified.

## M13-T33 — Prepare full-product closure evidence and owner gate

- [ ] **M13-T33** — Prepare full-product closure evidence and owner gate · 👤 GATE
  - Depends on: T32.
  - Scope/outputs: Aggregate route/action/platform measures, source revisions, acceptance artifacts, migration/rollback evidence, upstream limits and remaining issues. Prepare owner review under the existing execution protocol.
  - Acceptance: 100% claim requires every in-scope route/action release-verified and all required platform gates passed; no unresolved correctness/data-loss/access blocker. Owner approves/merges the gate. Existing historical milestone ticks alone cannot satisfy this gate.
