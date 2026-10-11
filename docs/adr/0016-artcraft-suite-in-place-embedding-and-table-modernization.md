# ADR-0016: ArtCraft Full Editors, Embedded Capabilities and Upstream Updates

- **Status:** Accepted direction; amended by owner clarification, 2026-10-12. Per-app production adoption remains evidence-gated.
- **Deciders:** Repository owner (chat: full applications as shipped for editing; focused embedded capabilities inside workflows; easy upstream release updates across the suite)
- **Related:** [ADR-0014](0014-open-source-only-dependency-posture.md), [ADR-0015](0015-artcraft-upstream-engine-strategy.md), [Master Integration Plan](../plans/artcraft-suite-master-integration-plan.md), milestones M06/M07/M08/M12

## 1. Context and amendment

Contractor will reuse the open-source GridCraft, CADCraft, PdfCraft, WordCraft and DeckCraft applications and their existing interfaces/components. The owner clarified two distinct uses: full document editing retains upstream ribbons, menus and tools; embedded capability views inside construction workflows expose the relevant cells, canvas, preview or editing controls. The earlier universal "zero ribbons" decision is superseded.

The owner also requires straightforward release updates without a maintained upstream fork. This is an adapter and dependency-management requirement, not evidence that every upstream release exposes all required embedding hooks or preserves its APIs.

The existing M06-T01 driver compares local JavaScript simulators, including hard-coded decimal/time/error outputs; it does not establish actual GridCraft versus production-engine parity. Historical PR/task records remain, but M06-T04 must replace that evidence before adoption. The previous claim that prototype evaluation proved all custom interfaces inherently inferior is withdrawn.

## 2. Decision

### 2.1 Two presentations of each adopted app

- **Full editor mode:** host the upstream application interface in Contractor's document workspace, retaining available ribbons, toolbars, menus, sheets/pages/slides and editing tools.
- **Embedded capability mode:** compose reusable upstream UI/rendering/engine components with workflow-specific controls: GridCraft calculation tables; CADCraft drawing review/layers/redlines; PdfCraft takeoff/annotations/previews; WordCraft document preview/focused editing; DeckCraft slide preview/focused editing/generation.
- Both modes use the same adopted app version and shared underlying document/engine path. Do not build equivalent private editors or duplicate engines per mode. Contractor adapters supply project context, mode configuration, commands, permissions, storage and sync.
- Switching modes preserves identity, revisions and pending work; undo/cursor limitations require explicit evidence. Full-editor access cannot bypass restrictions on domain-backed documents.
- Prove supported configuration/component/lifecycle hooks and installed-app/browser hosting per app. Proposed adapter settings are not upstream API claims. Missing hooks require upstream contributions or a recorded blocked capability; private-internal coupling or modifying pinned upstream code is not the default workaround.

### 2.2 GridCraft construction tables and authority

- Replace applicable calculation/data-entry tables across Contractor using GridCraft's reusable grid features: cells, headers, formulas, selection, copy/paste and protected fields. Ordinary record lists remain standard components unless workflow evidence supports conversion.
- Contractor defines schemas, stable domain row IDs and column permissions. Apply protection to typing, paste, fill, delete, row/column changes, imports, automation and full-editor access. Show derived formulas on selection; authorized contractual rate changes follow existing amendment workflows.
- Grid actions dispatch validated domain commands through the existing local transaction/outbox and server services. No workbook-driven direct SQL bypass or permanent workbook/domain dual source of truth.
- Existing services retain exact-decimal/scaled-int money, rounding, stock effects, approvals and posting authority. Verify GridCraft's numeric semantics at its actual pin; withdraw the unverified `rust_decimal` claim. Formatted decimal output alone does not establish exact arithmetic.
- Freeform workbooks and domain-backed tables have distinct edit contracts. XLSX is interchange/checkpoint storage; stable identities and versioned operations govern collaboration.

### 2.3 Lifecycle across all Craft apps

- Persist document bytes in the M03 durable object/file store; SQLite holds metadata, revisions, operation journals and outbox state. Use the existing attachment registration and digest/recovery protocol.
- Separate frequent local edit persistence from serialized checkpoints and uploads. A 500ms debounce is a prototype target to measure, not a requirement to rewrite large files per edit. M02 exposes local-save, cloud-pending, conflict and failure states; conflicts may require review.
- Preserve CAD originals and revision-bound redlines, PDF calibration/measurement provenance and service-mediated BoQ links. Issued documents/decks retain source-data snapshots, template versions and font versions. Format and feature fidelity require per-app fixture evidence.

### 2.4 Zero-fork and tested upgrades

- Consume unmodified upstream releases through supported app/component/engine interfaces. All Contractor customizations live in adapters outside upstream source; screens depend on Contractor contracts.
- Machine-readable configuration pins each app independently to a release and immutable commit, with artifact hashes and build lockfiles. The vendor registry mirrors actual build inputs and attribution. Fonts are independently pinned and tested with affected dependents.
- M06-T12 implements the shared update command/pipeline; M07-T11, M08-T09 and M12-W09 integrate subsequent apps. Each update produces a reviewable dependency diff and checks both UI modes, file fidelity, permissions, domain bindings, recovery/sync, platforms and performance.
- Demonstrate an actual release-to-release upgrade and rollback for each adopted app. Retain prior artifacts and compatible files/history or prove migration/restore before writes. Review monthly or per gate; promote only after existing checks/gates pass.
- Zero-fork removes reconciliation merges; breaking public APIs can still require adapter changes. Unsupported behavior is addressed upstream or remains gated at the working pin. No promise of zero rework or automatic live upgrades.

## 3. Scope and precedence

This ADR supersedes the prior blanket ribbon prohibition in ADR-0016 and the mandatory custom Flutter worksheet renderer in the v3/M06 plan. It clarifies ADR-0015's engine-only posture to include reuse of full application interfaces and supported embedded components. ADR-0013's authority/parity and bounded-prototype rules, ADR-0015's per-app adoption decisions, and owner-only milestone gates remain in force.

The master plan is the cross-suite contract; milestone files are the task definitions. This planning amendment registers work and does not certify completed integration or change production authority.

## 4. Consequences

- Full editing retains upstream functionality while focused workflow views share its components and engine.
- Adapters isolate app screens from upstream API churn; a repeatable update pipeline makes dependency changes reviewable and reversible.
- Embedding hooks, platform hosts, numeric semantics, accessibility, document fidelity and performance must be demonstrated on actual pinned builds.
- Missing upstream extension points may delay embedded modes. No fixed WASM size, full incumbent parity, tamper-proof UI locking or maintenance-free update guarantee is asserted.
