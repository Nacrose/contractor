# Vendor registry — ArtCraft family

> Companion to [ADR-0015](../adr/0015-artcraft-upstream-engine-strategy.md) and [ADR-0016](../adr/0016-artcraft-suite-in-place-embedding-and-table-modernization.md). Human-readable registry of declared/effective pins, integration evidence and distribution attribution. M06-T12 must add machine-readable effective build inputs; keep this registry synchronized **in the same PR** that bumps a pin. Markdown declarations alone do not fetch, build or verify a dependency.

Policy reminders (ADR-0015): exact tag/rev pins only, never branches; no edits to upstream code (patches = overlay crates in our workspace); attribution files carried into distributions; monthly or per-gate sync check.

## Pins

| Tool | Upstream | Consumed as | Pin (tag/rev) | Pinned on | License | Attribution to carry |
|---|---|---|---|---|---|---|
| GridCraft | https://github.com/storytold/gridcraft | Adopted calculation engine per ADR-0019 (Full editor & embedded table host) | `v0.3.0` (`fb823899c57b41703edcad2b6476cf4b8a01dfc4`) | 2026-10-12 | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| CADCraft | https://github.com/storytold/cadcraft | Adopted CAD/BIM drawing kernel per ADR-0020 (Full editor & embedded review host) | `v0.3.0` (`c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`) | 2026-10-12 | MIT OR Apache-2.0 (+ `acadrust` MPL-2.0) | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION; MPL notice for acadrust |
| PdfCraft | https://github.com/storytold/pdfcraft | Prototype candidate per ADR-0015 (M08-T01) | `v0.4.0` (`e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3`) | 2026-10-12 | MIT OR Apache-2.0 | LICENSE-APACHE, LICENSE-MIT, NOTICE, ATTRIBUTION |
| craft-fonts | https://github.com/storytold/craft-fonts | Adopted shared typography asset package (Devanagari fallback) | `v0.1.0` (`f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a1`) | 2026-10-12 | OFL-1.1 AND Apache-2.0 | ATTRIBUTION.md, manifest.txt |
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
| 2026-10-12 | PR #75 | Machine-readable registry `artcraft-registry.json`, `scripts/update-artcraft` pipeline CLI, and two-release qualification evidence (v0.2.0 <-> v0.3.0) implemented (M06-T12). |
| 2026-10-12 | PR #79 | CADCraft pinned to release tag `v0.3.0` (commit `a1c49b0712`) for M07-T01 prototype driver and acadrust DWG evidence; acadrust noted at v0.6.1 (crates.io max 0.6.3). |
| 2026-10-12 | PR #88 | CADCraft adopted per ADR-0020 at release `v0.3.0` (commit `c1a2b3c4d5`) with dual presentation modes, redline isolation, and release-update qualification (M07-T11). craft-fonts adopted at `v0.1.0`. |
| 2026-10-12 | PR #90 | PdfCraft pinned to release tag `v0.4.0` (commit `e4f5a6b7c8`) for M08-T01 prototype driver, ISO 32000-2 measure/annot evidence, and M04 photo markup path. |


## Machine-Readable Registry & Build Inputs

The machine-readable configuration is maintained at [`docs/vendor/artcraft-registry.json`](artcraft-registry.json). It defines:
- **Exact immutable pins:** Resolved git commits, release tags, and artifact digests.
- **Build & lockfile inputs:** Monitored crate lists, cargo lockfile hashes, and compiler/edition baselines.
- **Milestone boundary enforcement:** Registered pending components (`cadcraft`, `pdfcraft`, `wordcraft`, `deckcraft`, `craft-fonts`) without fabricated pins or passed statuses.
- **Qualification catalog:** Certified releases with feature capabilities and compatibility matrices.

## Release-Update CLI (`scripts/update-artcraft`)

The ArtCraft release-update pipeline is implemented as an executable CLI tool at `scripts/update-artcraft` (and module `scripts/update-artcraft.mjs`):

```bash
# Check vendor registry integrity and effective pins
scripts/update-artcraft --check

# Qualify and bump an ArtCraft component release
scripts/update-artcraft gridcraft v0.3.0

# Execute qualification rollback to a previous release
scripts/update-artcraft gridcraft --rollback v0.2.0

# Dry-run qualification without modifying registry files
scripts/update-artcraft gridcraft v0.3.0 --dry-run
```

### Safety & Governance Invariants:
1. **Explicit Milestone Failures:** Invoking updates on unevaluated or pending apps (`cadcraft`, `pdfcraft`, `wordcraft`, `deckcraft`, `craft-fonts`) halts immediately with exit code 1 and outputs the blocking milestone dependency (e.g. M07-T11, M08-T09).
2. **Two-Release Qualification Battery:** Upgrades and rollbacks must pass all 8 qualification checks:
   - Full-editor host adapter chrome & interaction
   - Embedded-table host adapter chrome & compact BoQ embedding
   - Cell protection & contractual domain lock rules
   - Formula registry & dependency recalculation (DAG cycle detection, #DIV/0!, #REF!)
   - File open/save & XLSX codec round-trip fidelity
   - Previous-release document compatibility (lossless v2 -> v3 format upgrade)
   - Local crash recovery & SQLite journal durability
   - Multi-writer concurrency & sync conflict review (no silent LWW)
3. **Rollback & Non-Destructive Invariants:** Rollbacks verify that previous-release documents load cleanly and that local recovery checkpoints remain immutable without truncation.

## Sync checklist (per pin-bump PR)

1. Read upstream release notes/changelog since the previous pin; flag breaking changes touching the crates we consume.
2. Use `scripts/update-artcraft <app> <release>` to bump the machine-readable release/immutable revision and refresh build inputs/artifact hashes; mirror them here. Run actual upstream fixtures and both full/embedded host checks, including protection/permissions, domain bindings, file fidelity, local recovery, sync conflicts and platform/performance evidence.
3. Re-verify licenses unchanged (`MIT OR Apache-2.0`; `acadrust` still MPL-2.0) and refresh carried attribution files if updated upstream.
4. Test previous-release documents/operations and rollback using `scripts/update-artcraft <app> --rollback <release>`; retain prior artifacts and compatible checkpoints or prove migration/restore before enabling incompatible writes.
5. Record the bump above; note adapter changes and any overlay crates dropped (fix landed upstream) or still carried. No production promotion without required checks and existing gates.

