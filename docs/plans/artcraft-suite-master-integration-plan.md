# Master Integration Plan: ArtCraft Suite Full Editors and Embedded Capabilities

**Status:** Planning amendment — implementation remains evidence-gated
**Updated:** 2026-10-12 (Asia/Kathmandu)
**Scope:** GridCraft, CADCraft, PdfCraft, WordCraft, DeckCraft, and craft-fonts
**Governing ADRs:** ADR-0014 (Open-Source-Only Posture), ADR-0015 (Upstream Strategy), ADR-0016 (Full Editors, Embedded Capabilities & Updates)
**Task register:** [Master Execution Plan](EXECUTION-PLAN.md); task definitions live in the linked milestone files below.

**Program-wide direction:** [ADR-0018](../adr/0018-upstream-capabilities-and-construction-integration.md) and the [platform integration strategy](open-source-platform-integration-strategy.md) preserve the original app's connected workflows while upstream projects provide generic capabilities. This suite plan supplies the Craft portion; M10 maps original custom tools, qualifies accounting and verifies cross-tool journeys.

**Related scheduling integration:** [ADR-0017](../adr/0017-trueppm-scheduling-integration.md) selects TruePPM for [M09](milestones/M09-scheduling-engine.md), with full workspace/focused views and tested upstream updates. TruePPM is a separate dependency; its [registry](../vendor/TRUEPPM.md) can reuse shared release tooling without being counted as a Craft app.

## 1. Amendment and intent

The owner clarified that full document editing should use the Craft application as shipped, including its ribbons, menus and editing tools. Compact capability views inside Contractor workflows should expose the relevant components without the surrounding full editor. This replaces the earlier blanket "zero ribbons" requirement for all five apps.

Reuse upstream application interfaces, renderers and engines. Contractor owns project context, domain data bindings, permissions, storage and sync through adapters outside upstream source. Avoid rebuilding equivalent editors or introducing a second calculation/rendering implementation per mode. Adoption of each app and its platform bindings still requires the evidence and decision records in ADR-0015; this plan does not certify upstream features, performance or embedding APIs.

## 2. Two modes across the suite

| App | Full editor mode | Embedded capability mode | Milestone |
|---|---|---|---|
| GridCraft | Complete workbook editor with upstream ribbons, formula bar, sheets, formatting and tools | Calculation tables: cells, row/column headers, selection, copy/paste, formulas and protected fields inside BoQ, measurement, receipt and expense screens | [M06](milestones/M06-worksheet-boq-engine.md) |
| CADCraft | Complete drawing editor with upstream drafting interface and commands | Drawing viewer, layer controls, dimensions/redline tools and plot actions inside project/drawing workflows | [M07](milestones/M07-cad-kernel-plot.md) |
| PdfCraft | Complete PDF application with its available editing, annotation and document tools | Page viewer, calibrated takeoff, selected annotations and photo-audit PDF preview/export inside workflows | [M08](milestones/M08-pdf-takeoff.md) |
| WordCraft | Complete document editor with upstream formatting, review and document tools | Reusable document preview or focused template/section editing inside correspondence workflows | [M12](milestones/M12-documents-presentations.md) |
| DeckCraft | Complete presentation editor with upstream slide and presentation tools | Slide preview, focused slide editing and progress-deck generation inside reporting workflows | [M12](milestones/M12-documents-presentations.md) |
| craft-fonts | Shared font supply used by the adopted apps | Same pinned font assets and fallback policy in embedded views and exports | M06–M12 |

Embedded controls are selected per workflow; they need not be identical across apps. Full editor mode preserves upstream chrome. Mode switching must retain document identity, revision, pending edits and undo history where supported; limitations must be visible and recorded rather than silently resetting state. Embedded protection and workflow permissions continue to apply when the same data is opened in the full editor.

Spreadsheet capability replaces data-entry and calculation tables throughout the application where it fits. Ordinary record lists (projects, users, documents, approval queues) remain standard lists/tables unless a documented workflow benefits from spreadsheet interaction. M06-T13 inventories and migrates the applicable consumers.

## 3. Integration boundary

```text
Contractor screens (full editor / embedded capability)
                         ↓
Contractor adapters (mode, commands, project data, permissions, lifecycle)
                         ↓
Pinned, unmodified Craft applications / reusable UI components / engines
```

Proposed responsibilities live in `packages/embedded_gridcraft`, `packages/embedded_cadcraft`, `packages/embedded_pdfcraft`, `packages/embedded_wordcraft` and `packages/embedded_deckcraft`, with shared lifecycle/update contracts owned once. Package creation must first account for existing package responsibilities. Screens use Contractor contracts; only adapters depend on upstream surfaces.

For each app, prove the public configuration, grid/canvas/editor components, command dispatch and lifecycle hooks available at the selected release. A WASM app or headless MCP server alone is not evidence of an embeddable UI. The per-app decision record names the installed-app and browser host, server automation binding, persistence interception, input/IME/clipboard behavior, accessibility, cancellation and disposal. Reuse the upstream UI on each target through a tested host; no assumed Flutter-native widget API or automatic mobile parity.

Use supported public configuration/components to select embedded controls. Do not hide painted controls with brittle DOM/CSS selectors or bind screens to private internals. If a required hook is missing, record it, propose/contribute it upstream, and gate the affected capability until a supported release is available. A local adapter can compose exposed behavior; it cannot guarantee changes to inaccessible upstream internals. Full editor integration may proceed independently where its requirements are met.

Names such as `showRibbon`, `lockedColumns` and `autoSaveIntervalMs` describe desired adapter behavior, not verified upstream API options.

## 4. Domain and document contracts

### GridCraft and construction tables

- Contractor defines table schemas, stable domain row IDs, column bindings, editable inputs and allowed structural operations. Sorting, filtering, pasting, inserting/deleting rows and undo must preserve identities and domain intent.
- Quantity and other authorized input columns are editable; contractual rates, item codes and derived totals are protected by workflow policy. Selecting a derived total exposes its formula. Authorized rate amendments use the existing versioned domain workflow.
- Protection covers typing, paste, fill, delete, structural changes, imports, automation and full-editor access. UI locking prevents accidental edits; authoritative services enforce permissions, approvals and fiscal locks independently.
- Cell edits become validated domain commands, persisted with local state and outbox intent transactionally. Server acceptance or rejection reconciles the view. No direct SQL bypass, blind whole-workbook replacement of domain records or workbook/domain dual source of truth.
- Workbook calculation semantics are verified at the actual pin. Do not assume `rust_decimal` support. Existing financial services own exact-decimal/scaled-int calculations, rounding and postings; previews must agree on the required fixtures before release. Currency-string conversion after floating-point calculation is not proof of exact arithmetic.
- Distinguish freeform workbooks from domain-backed tables. XLSX is an interchange/checkpoint format; collaboration uses versioned commands, stable identities, reference transforms and conflict rules defined in M06.

### Other Craft apps

- CAD: preserve original drawing bytes; redlines retain source revision and entity/document coordinates. Unsupported entities and save/plot limitations are explicit. Full editing and embedded review share one adopted command/rendering path, with permissions applied to both.
- PDF: measurements retain document revision, page, crop/rotation, calibration version, units and geometry. BoQ quantity changes use the M08 domain service path; no direct mutation of GridCraft cells. Photo audit PDFs use the M04/M08 annotation/export path.
- Documents/decks: typed project data comes through authorized services. Draft generation may refresh source data; issued letters/reports/decks freeze a versioned source-data snapshot and template/font versions for reproducibility. Preview, focused editing and full editing share artifact identity and revision rules.
- Fonts: pin assets and record hashes, per-font licenses, coverage and fallback behavior; verify engineering symbols and required scripts (including Devanagari) in previews and exports. Do not assume craft-fonts supplies every required CAD/SHX or language font.

Document bytes (`.xlsx`, `.dwg`/`.dxf`, `.pdf`, `.docx`, `.pptx`) use the M03 durable object/file store and attachment protocol; SQLite holds metadata, revisions, operation journals and outbox state. Frequent local operation saves and less frequent serialized checkpoints/uploads are separate policies. Prototype a 500ms debounce where suitable, then measure it; do not rewrite/upload entire large documents on every edit. Surface local-save, cloud-pending, conflict and failure states through M02. Conflict review may require user action.

## 5. Easy upstream updates across all apps

**Target:** one-command, tested upstream upgrades with minimal adapter changes and a clear rollback path. Zero-fork avoids reconciliation merges; it does not guarantee API compatibility or zero adapter maintenance.

M06-T12 establishes the shared pipeline; each later milestone supplies its app-specific build and test integration:

1. Pin each app and craft-fonts independently in machine-readable build configuration: upstream URL, release tag, resolved immutable commit, artifact digest and relevant lockfiles/build-tool versions. Documentation in [ARTCRAFT.md](../vendor/ARTCRAFT.md) mirrors those effective inputs. A Markdown edit alone does not update a build. Never invent pins for apps not yet evaluated.
2. Implement a documented command (proposed interface: `scripts/update-artcraft <app> <release>`) that resolves an explicit release, refreshes that dependency/build and runs its compatibility checks. This command is planned work, not currently available tooling. It must also support craft-fonts and validate shared dependents when assets/dependencies change.
3. Review release notes, public API/command changes, licenses and attribution; produce a reviewable pin-bump diff and evidence report. Monthly or milestone-gate checks identify candidates; security-relevant updates are expedited. No unreviewed live dependency tracking.
4. Exercise both full and embedded modes, file open/save/reopen, command/protection contracts, domain bindings, local recovery and sync conflicts, supported target hosts and representative performance. Test interoperability with documents from the previous release, not only fresh files.
5. Demonstrate at least one upgrade between two actual upstream releases per adopted app, plus rollback. Record whether a newer build changes persisted operations/files; retain original/checkpoint bytes and compatible history, or provide a tested migration/restore path before enabling writes. Pin rollback alone is insufficient for incompatible saved data.
6. Retain the previous working artifact and immutable inputs; promotion follows passing checks and the existing owner gates. API breakage is handled in adapters, by staying on the current pin, or by an upstream fix. Upstream source remains unmodified.

## 6. Sequencing and evidence

Task IDs below match the milestone register; existing IDs and historical completion records are preserved. New tasks have higher IDs even when prerequisites place them before an existing gate.

- **M06:** T01's PR #66 harness remains historical; its local simulators are not upstream parity evidence. T04 must revalidate using actual pinned GridCraft and the production TS authority before adoption. T02/T03 retain workbook identity and recalculation responsibilities. T05 proves full and embedded UI hosting; T06–T10 retain operations, financial integration, XLSX fidelity, concurrency and retirement. New T12 builds shared update tooling; new T13 inventories and migrates calculation-table consumers. T11 gate includes T12/T13.
- **M07:** T01 validates actual CADCraft/DWG fixtures; T02–T09 retain commands, topology, rendering, file/plot fidelity and conflict/performance responsibilities. New T11 integrates full editor and embedded review hosts, and qualifies its upstream upgrade/rollback path. T10 gate includes T11 and the shared M06-T12 pipeline.
- **M08:** T01 validates actual PdfCraft measurement/annotation behavior; T02–T07 retain sessions, provenance, BoQ integration and revision/performance responsibilities. New T09 integrates full editor and embedded takeoff/preview hosts with upgrade/rollback evidence. T08 gate includes T09 and M06-T12.
- **M12:** Remains at W01–W09 work-package level until evidence supports task refinement. W02/W04 deliver WordCraft/DeckCraft full and embedded modes following actual per-app prototypes; new W09 integrates both apps and fonts into the upgrade pipeline. W08 gate includes W09. This plan does not invent M12-T task IDs before refinement.

Performance targets are measured on ratified profiles: scroll/frame time, input/paste latency, calculation latency, memory, first-load/download size and save/checkpoint cost reported separately. The plan makes no blanket 60fps, full Excel/AutoCAD parity, fixed WASM size or tamper-proof calculation claim.
