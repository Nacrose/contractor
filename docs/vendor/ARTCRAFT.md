# Vendor registry — ArtCraft family

> Companion to [ADR-0015](../adr/0015-artcraft-upstream-engine-strategy.md) and [ADR-0016](../adr/0016-artcraft-suite-in-place-embedding-and-table-modernization.md). Human-readable registry of declared/effective pins, integration evidence and distribution attribution. M06-T12 must add machine-readable effective build inputs; keep this registry synchronized **in the same PR** that bumps a pin. Markdown declarations alone do not fetch, build or verify a dependency.

Policy reminders (ADR-0015): exact tag/rev pins only, never branches; no edits to upstream code (patches = overlay crates in our workspace); attribution files carried into distributions; monthly or per-gate sync check.

## Pins

| Tool | Upstream | Consumed as | Pin (tag/rev) | Pinned on | License | Attribution to carry |
|---|---|---|---|---|---|---|
| GridCraft | https://github.com/storytold/gridcraft | Adopted calculation engine per ADR-0019 (Full editor & embedded table host) | `v0.3.0` (`fb823899c57b41703edcad2b6476cf4b8a01dfc4`) | 2026-10-12 | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| CADCraft | https://github.com/storytold/cadcraft | *(none yet — prototype pending)* | — | — | MIT OR Apache-2.0 (+ `acadrust` MPL-2.0) | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION; MPL notice for acadrust |
| PdfCraft | https://github.com/storytold/pdfcraft | *(none yet — prototype pending)* | — | — | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| craft-fonts | https://github.com/storytold/craft-fonts | *(with the first adopted engine)* | — | — | MIT OR Apache-2.0 (per-font licences in `fonts/`) | ATTRIBUTION.md, per-font licence dirs, manifest.txt |
| WordCraft | https://github.com/storytold/wordcraft | *(none yet — prototype pending; capability area M12)* | — | — | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| DeckCraft | https://github.com/storytold/deckcraft | *(none yet — prototype pending; capability area M12)* | — | — | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |

Upstream release tags observed 2026-10-09 (pin targets for prototypes): gridcraft `v0.3.0`, cadcraft `v0.3.0`, pdfcraft `v0.4.0`, wordcraft `v0.3.0`.

Related upstream-published dependencies:

| Crate | Upstream | Version at evaluation | License | Notes |
|---|---|---|---|---|
| `acadrust` | crates.io (`acadrust`) | 0.6.1 in CADCraft manifest; crates.io max 0.6.3 (2026-10-08) | MPL-2.0 | DWG read/write AC1015–AC1032; "used unmodified" per CADCraft `crates/dwg`; verify on our fixtures before reliance |

## Change log

| Date | PR | Change |
|---|---|---|
| 2026-10-09 | — | Registry created with ADR-0015; no pins yet (prototype tasks pending in M06/M07/M08 refinement). |
| 2026-10-09 | M12 registration | Documents/decks capability area registered as milestone M12; WordCraft/DeckCraft rows updated from "unregistered" to "M12, prototype pending". |
| 2026-10-12 | PR #66 | GridCraft pinned to release tag `v0.3.0` for M06-T01 prototype driver and fixture evidence. |
| 2026-10-12 | PR #69 | GridCraft adopted per ADR-0019 at commit `fb823899c57b41703edcad2b6476cf4b8a01dfc4` with actual 20-tool MCP inventory and f64 numeric characterization (M06-T04). |


## Release-update contract (planned tooling)

- M06-T12 implements the shared command, proposed as `scripts/update-artcraft <app> <release>`, and independent app/font registrations. It does not exist merely because this registry names it.
- Effective configuration must resolve each tag to an immutable commit and record artifact digests, lockfiles and build inputs. Unconsumed apps retain no effective pin; record missing registrations explicitly.
- Full editors preserve upstream chrome; embedded views use supported component/configuration APIs. All customization stays in Contractor adapters, with missing hooks proposed upstream.
- Each app's milestone must demonstrate an actual two-release upgrade and rollback: GridCraft M06-T12, CADCraft M07-T11, PdfCraft M08-T09, WordCraft/DeckCraft M12-W09. Both UI modes and previous-release documents are covered. Font updates exercise affected apps/exports.
- Monthly/per-gate checks identify updates for review; security fixes are expedited. Retain prior artifacts and compatible data/history or tested migration/restore. Zero-fork does not guarantee zero adapter changes.

## Sync checklist (per pin-bump PR)

1. Read upstream release notes/changelog since the previous pin; flag breaking changes touching the crates we consume.
2. Use the shared update command once implemented to bump the machine-readable release/immutable revision and refresh build inputs/artifact hashes; mirror them here. Run actual upstream fixtures and both full/embedded host checks, including protection/permissions, domain bindings, file fidelity, local recovery, sync conflicts and platform/performance evidence.
3. Re-verify licenses unchanged (`MIT OR Apache-2.0`; `acadrust` still MPL-2.0) and refresh carried attribution files if updated upstream.
4. Test previous-release documents/operations and rollback; retain prior artifacts and compatible checkpoints or prove migration/restore before enabling incompatible writes.
5. Record the bump above; note adapter changes and any overlay crates dropped (fix landed upstream) or still carried. No production promotion without required checks and existing gates.
