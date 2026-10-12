# Contractor: open-source capabilities and connected construction workflows

**Direction:** owner-requested, 2026-10-12; [ADR-0018](../adr/0018-upstream-capabilities-and-construction-integration.md).
**Backlog:** [Master Execution Plan](EXECUTION-PLAN.md); this document adds no independent task checkboxes.

## Product outcome

Keep the original app's integrated construction experience while replacing generic custom tooling with reusable upstream capabilities where suitable. A user works with the same project, records, permissions and approval history across estimating, drawings, takeoff, procurement, site work, billing, scheduling, accounting and correspondence. Full editors and focused workflow views are parts of that product.

The goal is to reduce the specialist code we maintain. Contractor still owns integration quality, business rules, data migration, release verification and support. Upstream community work supplies reusable improvements; no fixed share of future development or release timetable is assumed.

## Capability and ownership map

These are intended integration responsibilities, not certification of current upstream features or embedding APIs.

| Capability | Upstream direction | Contractor responsibility | Owning work |
|---|---|---|---|
| Workbooks and calculation tables | GridCraft | BoQ/IPC schemas, protected inputs, domain commands, financial authority and table migration | M06; ADR-0016 |
| Drawing authoring/review | CADCraft | Drawing revisions, project links, redline provenance, permissions and file/plot lifecycle | M07; ADR-0016 |
| PDF annotation and takeoff | PdfCraft | Calibration provenance, measurement-to-BoQ links, accepted quantities and revision invalidation | M08; ADR-0016 |
| Scheduling | TruePPM, selected | Task/BoQ/progress mapping, accepted schedule versions, approvals and cash-flow integration | M09; ADR-0017 |
| Bookkeeping primitives | `flutter_accounting`, intended library; source/API/license unverified | Construction posting rules, projects/JVs, fiscal controls, approvals, synchronization and accounting migration | M10-W08 |
| Letters, reports and specifications | WordCraft | Templates, typed data providers, issued snapshots, permissions and provenance | M12 |
| Presentations | DeckCraft | Progress/BoQ/photo bindings, templates and issued snapshots | M12 |
| Typography | craft-fonts where its verified coverage fits | Required scripts/symbols, fallback policy and export checks | M06/M07/M08/M12 |
| Construction workflows and shared platform | Existing original-app engines and services | Rate analysis, billing, retention, advances, procurement, stock, workforce/payroll, JV rules, authorization, sync and recovery; assess generic internals for reuse individually | Existing milestone owners; M10 inventory |

The last row is not a permanent ban on upstream reuse. The disposition audit can replace generic internals while retaining construction semantics and service contracts. Open Planner Studio and other discussed alternatives are not additional selected schedulers.

## Tight integration contract

- **Context:** propagate stable tenant/project/domain IDs, revision and actor context. Tool-specific IDs are mapped explicitly; names or row positions are not primary keys.
- **Commands:** route edits and approved business effects through existing typed service boundaries. Upstream file/save/import/automation operations receive the same protection as embedded edits.
- **State:** define the authoritative owner of domain records, document bytes and calculation outputs. SQLite/document checkpoints and upstream stores serve declared roles; no uncontrolled whole-document overwrite or dual writes.
- **Offline:** use M03's repository/outbox/sync contracts and M02's save/conflict states. Local drafts and calculations remain proposals until required server acceptance; replay must not duplicate stock or journal effects.
- **Experience:** preserve navigation and source-record links across full/embedded views, including save/reopen, pending work and conflict review. Adapt controls per platform without hiding required workflows.
- **Specialist engines:** reuse upstream formula, rendering, topology, measurement and bookkeeping behavior when available. Our code translates contracts and adds missing construction rules; it does not maintain a parallel general engine for each host.
- **History:** accepted quantities, posted journals, approved schedules and issued reports retain source revisions. Live draft refreshes cannot silently rewrite issued history.

## Representative connected journeys

1. Drawing/PDF revision → calibrated takeoff → reviewed BoQ quantity → procurement or measurement/billing workflow. Source geometry, calibration and accepted quantity remain traceable; no drawing widget writes a total directly.
2. Purchase/delivery or certified bill → authorized stock/financial effect → balanced journal → accounting report. Postings retain the originating record/version, use an idempotency key and reverse through the original domain rules.
3. Site progress → linked TruePPM task update → accepted schedule/cash-flow revision → WordCraft report or DeckCraft presentation. Drafts may refresh; issued artifacts freeze the accepted source snapshot.

Each journey must be tested across actual adopted components and Contractor services, including rejection, offline replay and conflicts. A collection of isolated vendor demos does not establish these outcomes.

## Original custom-tool disposition

M10-W07 starts from the [M00 feature inventory](../reports/M00/feature-matrix.md) and original source, including jobs/imports/background writers. For each original tool record: behavior and consumers; upstream component/API; retained domain rules; adapter and data owner; required platforms; fixtures; gaps; owning implementation task; migration/restore; retirement criteria. Classify it as retained domain capability, upstream replacement with adapter, temporary migration reference, or a gap requiring registered work. Never delete a working tool merely because a vendor has a similar feature name.

This mapping is preparation for each specialist milestone, not a late M10 discovery exercise. Existing completed tasks stay historical; their models and contracts become integration inputs. Remaining tasks describing an engine/graph/renderer mean upstream reuse and adapter qualification first, with custom work justified explicitly.

## Accounting qualification

The owner supplied a description of `flutter_accounting` including version `0.4.0` and MIT licensing. These claims and API examples have not been independently verified. M10-W08 must identify the actual source/artifact and license, execute it, inspect monetary representation/rounding, and test balanced atomic posting, period closure, reversals, reports, migrations and concurrency.

Prove its server/runtime suitability and integration with Contractor's existing accounting services before choosing the final binding. Keep one authoritative ledger and financial semantics; local storage does not create a second authoritative book. Preserve project/JV dimensions, retention/advance/tax mappings and source-document references. Assess standard account seeds against our own chart rather than accepting defaults automatically. Until qualification and migration pass, the original accounting path remains active.

## Upstream releases and acceptance

M06-T12 owns shared release machinery and Craft qualifications; M09-W08 owns TruePPM qualification; M10-W08 adds the adopted accounting package to that approach. Use independent immutable pins, lockfiles/hashes and notices. Check actual API/schema/modeling changes and upstream maintenance during active development; no scheduled automation is created by this plan.

Every adopted dependency needs real execution, target-host evidence and an upgrade between two releases with compatible old data or tested migration/restore. M10-W09 checks connected journeys after those component checks, including pending local work, tenant boundaries, approvals and issued history. Keep the prior working release if an upgrade fails; record integration work instead of editing upstream source.

## Delivery mapping

- M06/M07/M08/M09/M12 deliver their specialist adapters and full/focused experiences under existing gates.
- M10-W07 produces the original-tool disposition and assigns every remaining migration to an owning task; bounded documentation work may prepare earlier milestones after its declared prerequisites.
- M10-W08 qualifies and integrates accounting during the accounting migration wave, with source discovery prepared earlier.
- M10-W09 demonstrates connected journeys and cross-component upgrade/recovery behavior. M10-W06 includes W07/W08/W09; original feature parity and M11 release requirements remain.

This amendment changes planned implementation choices. It does not claim the original-app audit, vendor bindings, accounting verification or end-to-end journeys are completed.
