# Vendor registry — ArtCraft family

> Companion to [ADR-0015](../adr/0015-artcraft-upstream-engine-strategy.md). This registry is the single source of truth for which upstream ArtCraft components this program consumes, at which pin, and what attribution must ship with any distribution. Update it **in the same PR** that bumps a pin.

Policy reminders (ADR-0015): exact tag/rev pins only, never branches; no edits to upstream code (patches = overlay crates in our workspace); attribution files carried into distributions; monthly or per-gate sync check.

## Pins

| Tool | Upstream | Consumed as | Pin (tag/rev) | Pinned on | License | Attribution to carry |
|---|---|---|---|---|---|---|
| GridCraft | https://github.com/storytold/gridcraft | *(none yet — prototype pending)* | — | — | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| CADCraft | https://github.com/storytold/cadcraft | *(none yet — prototype pending)* | — | — | MIT OR Apache-2.0 (+ `acadrust` MPL-2.0) | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION; MPL notice for acadrust |
| PdfCraft | https://github.com/storytold/pdfcraft | *(none yet — prototype pending)* | — | — | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| craft-fonts | https://github.com/storytold/craft-fonts | *(with the first adopted engine)* | — | — | MIT OR Apache-2.0 (per-font licences in `fonts/`) | ATTRIBUTION.md, per-font licence dirs, manifest.txt |
| WordCraft | https://github.com/storytold/wordcraft | *(none yet — documents/decks capability area unregistered)* | — | — | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| DeckCraft | https://github.com/storytold/deckcraft | *(none yet — documents/decks capability area unregistered)* | — | — | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |

Upstream release tags observed 2026-10-09 (pin targets for prototypes): gridcraft `v0.3.0`, cadcraft `v0.3.0`, pdfcraft `v0.4.0`, wordcraft `v0.3.0`.

Related upstream-published dependencies:

| Crate | Upstream | Version at evaluation | License | Notes |
|---|---|---|---|---|
| `acadrust` | crates.io (`acadrust`) | 0.6.1 in CADCraft manifest; crates.io max 0.6.3 (2026-10-08) | MPL-2.0 | DWG read/write AC1015–AC1032; "used unmodified" per CADCraft `crates/dwg`; verify on our fixtures before reliance |

## Change log

| Date | PR | Change |
|---|---|---|
| 2026-10-09 | — | Registry created with ADR-0015; no pins yet (prototype tasks pending in M06/M07/M08 refinement). |

## Sync checklist (per pin-bump PR)

1. Read upstream release notes/changelog since the previous pin; flag breaking changes touching the crates we consume.
2. Bump the pin to the exact new tag/rev; run our test suites + fixture prototypes.
3. Re-verify licenses unchanged (`MIT OR Apache-2.0`; `acadrust` still MPL-2.0) and refresh carried attribution files if updated upstream.
4. Record the bump above; note any overlay crates dropped (fix landed upstream) or still carried.
