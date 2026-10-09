# ADR-0015: ArtCraft family as upstream-tracked candidate engines

- **Status:** Accepted (owner directive)
- **Date:** 2026-10-09
- **Deciders:** Repository owner (chat directive; recorded under protocol R8)
- **Related:** ADR-0013 (M01 stack decision — evidence-gated continuation), ADR-0014 (open-source-only posture), `docs/reports/prior-art-artcraft-family.md` (family evaluation), M04/M06/M07/M08 milestone files

## Context

The owner identified the ArtCraft family (`storytold/{gridcraft,cadcraft,pdfcraft,wordcraft}`) as directly relevant to this program and directed integration with a mechanism that allows direct updating from upstream. An org survey (2026-10-09, family report) added `craft-fonts` (font supply, MIT OR Apache-2.0); the same day the owner required **WordCraft and deckcraft** for letters/reports and presentations and **rejected photocraft for site-photo markup** in favour of a native overlay plus PdfCraft's annotation/export path; all adopt-track repos carry semver release tags (`v0.1.0`…`v0.4.0`), which are the pin targets.

Evaluated facts (2026-10-09, see family report): clean-room Rust reimplementations of Excel (GridCraft), AutoCAD (CADCraft), Acrobat (PdfCraft) and Word (WordCraft); **MIT OR Apache-2.0** dual license (satisfies ADR-0014); native + browser/WASM targets; every app exposes a **CLI** and a **headless MCP server** (in-process engine, JSON-RPC over stdio) built for agent driving; honest self-measured parity — GridCraft ≈65% weighted depth, CADCraft ≈29% overall but 2D drafting ≈55% with dimensions/hatches/blocks/layouts/plot done, PdfCraft P0 must-haves ≈93% shipped, WordCraft ≈62%. CADCraft consumes `acadrust` (MPL-2.0, crates.io v0.6.x, active) behind a byte-level bridge providing **DWG read *and* write (AC1015–AC1032)** — an OSI-approved alternative to our GPL LibreDWG subprocess with strictly more capability. Their own crates are **not published to crates.io**; the upstream repos are the distribution channel.

This intersects ADR-0013, which (a) keeps the existing TypeScript application as production authority, (b) rejected adopting a Rust *semantic kernel* on failed cross-language parity evidence, and (c) confines Flutter work to bounded prototypes. The ArtCraft family is a different proposition — third-party *applications* with stable CLI/MCP surfaces — but the parity and binding risks ADR-0013 records still apply to any deeper binding (FFI/WASM) of their engines.

## Decision

1. **Candidate engines, evidence-gated.** Each ArtCraft tool becomes a candidate engine for one capability area: GridCraft → M06 worksheet/BoQ; CADCraft → M07 CAD kernel/plot; PdfCraft → M08 PDF/takeoff **and the annotation/export path for site-photo markup (M04)**; **WordCraft → letters/reports/specs (.docx) and deckcraft → client-facing presentations — both owner-required (chat, 2026-10-09)**, pending registration of their capability areas (v3 registers neither; a follow-up `[PLAN-AMEND]` registers scope, and prototypes follow the M06/M07/M08 pattern); **craft-fonts → the font supply for any adopted engine** (font assets + per-font licences + SHA-256 manifest; consumed together with the engine that needs it). No production cutover happens without a fixture-based prototype comparison against the current authoritative engine (or, for new capability areas, an agreed reference) and a **per-engine adoption ADR**. ADR-0013's authority and parity rules are unchanged.
2. **Upstream tracking, no forks.** We never fork or edit upstream code. Consumption surfaces, in order of preference:
   - **CLI / headless MCP subprocess** pinned to an upstream release tag (server-side batch jobs, agent automation) — lowest binding risk, matches the M01 spike's subprocess posture.
   - **Cargo git dependency pinned to a tag or commit** (`{ git = "https://github.com/storytold/<repo>.git", tag = "..." }`) when a Rust integration binds crates directly.
   - WASM builds of their `-web` targets where the web app embeds a capability.
   Updating = a PR that bumps the pin. Upstream advances flow directly without reconciliation merges.
3. **Vendor registry.** `docs/vendor/ARTCRAFT.md` records, per tool: pinned tag/rev, upstream URL, license, carried attribution files (LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION), artifact hash, and a dated change log. A distribution that includes an ArtCraft component must carry those files.
4. **Patch policy.** If an upstream fix is needed before it lands upstream: file/propose it upstream first; if we must carry it locally, it lives in a separate overlay crate in *our* workspace that depends on theirs — upstream sources stay unmodified. Once upstream lands the fix, drop the overlay at the next pin bump.
5. **Sync cadence.** A monthly upstream-sync check (or at each milestone gate, whichever first) reviews new tags against the registry and opens pin-bump PRs; security-relevant bumps are expedited. Pre-1.0 upstreams may make breaking changes: pins are exact tags/revs, never branches.
6. **photocraft disposition — rejected for photo markup (owner, 2026-10-09).** The owner reviewed the options and rejected photocraft for site-photo annotation as "too much". The recorded approach for M04 photo markup: a **lightweight native overlay** (Flutter-rendered vector annotations stored in our own document model) for capture-time markup, plus the **PdfCraft annotation/export path** (photo embedded in a PDF; shapes/comments via its `annot` stack) when markup must be shared or printed — reusing the engine M08 already adopts. photocraft remains out of scope; this is not a licence call (it is family-licensed) but a fit decision.
7. **acadrust/LibreDWG sequencing.** CADCraft's DWG bridge is the preferred open-source DWG route *after* a fixture round-trip prototype (M00 fixtures) proves coverage and fidelity on our drawings; until then the LibreDWG subprocess remains the recorded fallback. Both are ADR-0014-compliant; MPL-2.0 compliance (file-level notices) is lighter than GPL for this use.

## Alternatives considered

1. **Hard fork the repos into our org.** Rejected — forks drift, lose upstream's measured agent velocity (their roadmaps show ~1k LOC/agent-hour progress), and create merge pain; the owner explicitly wants direct upstream updating.
2. **Wait for 1.0/alpha before touching them.** Rejected — early fixture evidence now shapes which engine we bet on, and our prototype cadence can proceed in parallel with upstream maturity.
3. **Adopt FFI/WASM bindings immediately for Flutter-native speed.** Rejected for now — M01-T14/T16 showed cross-language semantics and binding risk is real; CLI/MCP-first keeps the semantics boundary explicit and defers FFI to per-engine records.
4. **Continue with LibreDWG-only for DWG.** Kept as fallback, not as the goal — acadrust offers write support and a lighter license on the same isolation shape.

## Consequences

- M06/M07/M08 refinement (required before the M02 gate per their headers) must include one ArtCraft prototype task per milestone, each driving the tool via CLI/MCP over **M00 fixtures** and comparing against the authoritative engine, producing a report in `docs/reports/`.
- The per-capability authority map (v3 §9, ADR-0013) still lists TypeScript engines as authorities; ArtCraft tools are candidates until their adoption ADRs.
- Any distribution embedding an ArtCraft component ships the upstream license/attribution files; the registry is the compliance checklist.
- The program gains MCP-driveable engines — consistent with this repo's agent-execution protocol; MCP tool inventory belongs in each prototype report.
- Breaking upstream changes land only through pin-bump PRs; CI failures on a bump are resolved by overlay, pin rollback, or upstream issue — never by editing pinned sources.
