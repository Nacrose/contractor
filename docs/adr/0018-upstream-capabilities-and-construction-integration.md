# ADR-0018: Upstream capabilities integrated through Contractor's construction workflows

- **Status:** Accepted direction (owner directive); per-component implementation remains gated
- **Date:** 2026-10-12
- **Deciders:** Repository owner, requesting the original app's integration with open-source libraries so the community maintains general capabilities and Contractor integrates them tightly
- **Related:** [ADR-0010](0010-progressive-extension-over-greenfield-rewrite.md), [ADR-0014](0014-open-source-only-dependency-posture.md), [ADR-0016](0016-artcraft-suite-in-place-embedding-and-table-modernization.md), [ADR-0017](0017-trueppm-scheduling-integration.md), [integration strategy](../plans/open-source-platform-integration-strategy.md)

## Decision

Preserve the original application's connected construction workflows and domain rules. Prefer maintained open-source applications, components and engines for general capabilities. Contractor owns the product shell, integration adapters and construction-specific behavior; it does not rebuild upstream features simply to make every component use the same implementation language.

1. **Reuse first.** Inspect upstream public APIs and the original app's consumers before implementing a specialist feature. Reuse existing custom code where it represents construction behavior, proven infrastructure or a capability still needed during migration. Retire replaced generic implementations after consumer migration and parity evidence. A new custom specialist algorithm requires a documented missing capability and registered work; no automatic engine rewrite when a binding is inconvenient.
2. **One connected product.** Project, tenant, task, BoQ item, source document and revision identities cross all tools through typed contracts. Preserve navigation, permissions, save/sync status, cross-links and source provenance. Full upstream editors retain their tools; focused workflow views use supported components. A set of unrelated app launches or file exports does not satisfy integration.
3. **One authority for each business effect.** Contractor services continue to authorize quantity acceptance, stock effects, financial postings, approvals and issued baselines. Upstream engines supply the accepted specialist computation behind those boundaries. Local changes use the existing outbox/sync path; retries, imports, jobs and full editor operations follow the same rules. Do not introduce competing ledgers or duplicated accounting calculations.
4. **Maintain integrations outside upstream.** Pin immutable releases, keep Contractor adapters separate, and use supported extension points. Missing hooks are tracked upstream. Community maintenance is the intended source of generic improvements; its delivery dates and maintenance effort are not under Contractor's control.
5. **Qualify updates and replacement.** Each adoption records source/license, target binding, data ownership, fixtures, migration and retirement. Verify upgrade plus data restore, not only a successful build. Reuse shared release tooling while keeping each dependency independently pinned. Preserve accepted records and pending local work across upgrades.

## Component decisions

Craft editors/capabilities follow ADR-0016 and their owning milestones. TruePPM remains selected by ADR-0017. `flutter_accounting` is the intended library to qualify for bookkeeping; the owner's supplied description is not verified source, API, version or license evidence. M10-W08 must resolve and test the actual package before production selection. This direction does not convert every discussed alternative into a selected dependency.

## Consequences

- Original-product behavior remains the parity reference. Preserving it does not require retaining every original widget or internal implementation.
- Existing business services are extended with upstream bindings, rather than replaced wholesale. Shared generic engines may replace their current custom internals after verified migration.
- Native/web/server hosting is tested per dependency; neither a Dart package nor a WASM application establishes every target automatically.
- The [M10 register](../plans/milestones/M10-parity-web-migration.md) adds original-tool disposition, accounting integration and cross-tool workflow evidence. Specialist integration remains in M06/M07/M08/M09/M12.
- This is a planning decision. No dependency is installed, production path switched, historical task reopened or readiness gate passed by this amendment.
