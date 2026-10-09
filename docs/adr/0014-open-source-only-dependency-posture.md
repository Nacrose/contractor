# ADR-0014: Open-source-only dependency posture

- **Status:** Accepted (owner directive)
- **Date:** 2026-10-09
- **Deciders:** Repository owner (chat directive; recorded under protocol R8)
- **Related:** ADR-0013 (M01 stack decision), `docs/reports/M01/dwg-spike.md` (M01-T11), `docs/reports/M07/prior-art-cad-viewer.md`, M07 milestone (DWG capability rows)

## Context

The M01 DWG spike (`docs/reports/M01/dwg-spike.md`) surveyed DWG conversion routes: the native legacy reader (AC1012–AC1015), a LibreDWG `dwg2dxf` subprocess for modern generations, the ODA File Converter (free download, redistribution terms unverified), and Autodesk RealDWG (commercial SDK). The spike explicitly deferred converter selection to a "deliberately selected, licensed server backend" and to the owner.

The owner has now decided the procurement posture for the whole program: **no paid components of any kind — open source only.** This decision was made in chat on 2026-10-09 ("i dont want to buy anything, opensource all the way") and is recorded here as the binding owner decision that M01-T11/T12 and M07 require.

## Decision

**Every dependency the product ships, embeds, or bundles must carry an OSI-approved open-source license.** Commercial SDKs, paid parsers, and freeware-with-unclear-redistribution are excluded.

1. **Excluded by this decision:** Autodesk RealDWG (commercial), ODA Drawings SDK (commercial), ODA File Converter (freeware; redistribution terms unverified and license is not OSI open source), the `@mlightcad` proprietary DWG parser (paid, source unavailable), and any future per-seat/per-server licensed component.
2. **DWG route (unaffected by exclusions):** server-side LibreDWG `dwg2dxf` subprocess conversion for modern generations remains the selected open-source path, under the isolation and hardening controls already recorded in the M01 spike. GPL-3.0 compliance obligations are accepted where they arise (bundled or distributed converter builds comply with GPL for that component; server-side invocation keeps client proprietary code unlinked).
3. **Product-native format stays DXF.** The native legacy reader keeps explicit AC1012–AC1015 read coverage. No product scope expands into a full native modern-DWG parser on this decision alone; fidelity limits ship documented per M07-W04.
4. **GPL isolation pattern is the standing reference for DWG-adjacent integrations:** keep GPL converters out of proprietary client cores — behind a process/isolate/worker boundary with a narrow interchange contract — so a converter can be replaced or removed without touching the client core (see prior-art note on cad-viewer's parser-worker split).

## Alternatives considered

1. **Keep the commercial arms open (RealDWG quote, ODA terms, paid parsers) as fallback rows.** Rejected — the owner has removed paid components from consideration program-wide; keeping dead rows invites accidental adoption.
2. **Adopt a weak-copyleft-only posture (e.g., ban GPL, allow LGPL/Apache/MIT).** Not chosen — LibreDWG (GPL) invoked as a server-side subprocess is the only credible open-source modern-DWG reader; banning GPL outright would foreclose DWG entirely. Obligations are managed by boundary, not by avoidance.
3. **Defer the posture decision until M07 refinement.** Rejected — M06/M07 refinement and the M02 gate need the constraint now so refined tasks inherit it.

## Consequences

- M06/M07 refinement must not register tasks that assume paid dependencies; DWG capability-matrix rows record open-source coverage only, with fidelity gaps explicit.
- Dependency additions in all later milestones state their license; non-OSI licenses require a new owner ADR.
- If LibreDWG subprocess coverage proves insufficient for a needed generation or entity class, the accepted remedies are: extend the native reader, deepen DXF-first workflows, or a new owner decision — never a silent commercial dependency.
- This posture constrains components we ship/embed; hosted services the program already uses (source hosting, CI) are out of scope.
