# Prior art — ArtCraft family (storytold): GridCraft · CADCraft · PdfCraft · WordCraft

Evaluated 2026-10-09 by cloning all four repos at recent HEAD (shallow, ~50 commits) and inspecting crates, roadmaps, manifests, and integration surfaces. Owner directive: integrate with direct upstream updating → strategy in [ADR-0015](../adr/0015-artcraft-upstream-engine-strategy.md).

## What they are

Clean-room Rust reimplementations of the four Office/CAD/PDF pillars, by the ArtCraft community project (getartcraft.com). Common shape across all four:

- **License: MIT OR Apache-2.0** (dual, SPDX `MIT OR Apache-2.0`) — ADR-0014-compliant. DWG support via `acadrust` **MPL-2.0** (crates.io, unmodified dependency, byte-level bridge).
- **Structure:** one Cargo workspace per app: library `crates/*` + `apps/<app>` (desktop, egui), `apps/<app>-cli` (headless), `apps/<app>-web` (WASM). `#![forbid(unsafe_code)]` and strict clippy lints throughout the crates inspected.
- **Agent surfaces:** per-app **MCP server** (JSON-RPC 2.0 over stdio; `Headless` backend hosts the engine in-process — no GUI needed) + CLI + loopback control channel for a running desktop instance. This matches our own agent-execution operating model.
- **Honest roadmaps:** parity measured by `cargo xtask parity` against the incumbent product; estimates in agent-hours.

## Per-tool snapshot (2026-10-07 upstream self-measurements)

| Tool | Maps to | Maturity (upstream's own numbers) | Key crates for us | Notes |
|---|---|---|---|---|
| **GridCraft** (Excel) | M06 worksheet/BoQ | ~93% of Excel's ~545 functions; ~65% weighted feature depth; ~80% to alpha | `formula`, `functions`, `calc`, `engine`, `xlsx`, `pdf` (export), `mcp` | XLSX native format; PivotTable round-trip; 332 tests; recalc perf work ongoing |
| **CADCraft** (AutoCAD 2D-first) | M07 CAD kernel/plot | ~29% overall parity; **2D drafting ≈55%**; dims/MTEXT/leaders/tables/hatch/blocks/constraints/layouts/plot-to-PDF done; ~75% to alpha | `dxf` (clean-room tag reader/writer, zero deps), `dwg` (bridge→`acadrust`), `geom`, `constraints`, `engine`, `render`, `mcp` | "early development" badge; DWG read **and** write AC1015–AC1032 via acadrust; 3D is the big gap (irrelevant to us) |
| **PdfCraft** (Acrobat) | M08 PDF/takeoff | P0 must-haves **93.4% weighted shipped**; 411/806 features overall (~30–35% weighted); most active repo (PRs #400+) | `measure` (ISO 32000-2 §12.9 calibrated **distance/perimeter/area**), `annot`, `render`, `cos`, `engine`, `forms`, `sign`, `ocr`, `mcp`/`automation` | Own renderer/font engine still the long pole; threaded comments; CLI validates page ops |
| **WordCraft** (Word) | (new scope — deferred) | ~62% real parity; ~85% to alpha; 389 commands | `docx`, `layout`, `render`, `proof`, `pdf` | .docx round-trip, track changes, comments, references, mail merge; 1.4 ms relayout |

## Why this matters to our program

1. **M06 (worksheet/BoQ):** GridCraft's formula/calc engine covers the spreadsheet semantics our BoQ worksheets need; XLSX is its native format. Candidate authority for sheet-engine semantics, driven headlessly via MCP/CLI while our TS engine remains authority.
2. **M07 (CAD):** CADCraft is the same scope as M07-W01…W04 (command registry, geometry, hatches/blocks/dims, layouts/plot). Its `dxf` crate is a clean-room, zero-dependency, `forbid(unsafe_code)` DXF reader/writer; the `dwg` bridge gives DWG→DXF **and DXF→DWG** via MPL-2.0 acadrust — strictly more than our LibreDWG `dwg2dxf` plan (read-only, GPL).
3. **M08 (takeoff):** PdfCraft's `measure` crate implements calibrated PDF measurements (distance/perimeter/area with `/Measure` dictionaries) — the exact semantic core of PDF takeoff, as annotations we can persist and sync.
4. **Agent-native:** every tool is MCP-drivable headlessly — our agent protocol can drive them exactly like it drives our own repo (evidence-first, scripted, fixture-based).

## Integration mechanics (per ADR-0015)

- Their own crates are **not on crates.io** (verified) → consume via **Cargo git deps pinned to tags**, or **CLI/MCP subprocess pinned to releases**; never branches (pre-1.0 breaking changes). Update = pin-bump PR. Registry: `docs/vendor/ARTCRAFT.md`.
- Recommended binding order per capability: (1) CLI/MCP subprocess prototype against M00 fixtures; (2) if adopted, per-engine ADR; (3) FFI/WASM only with its own record (M01-T14 cross-language parity failure remains the cautionary evidence).
- Carry `LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`, `ATTRIBUTION` into any distribution; acadrust adds MPL-2.0 notice obligations (file-level).

## Risks / open questions

- **Early-stage maturity:** CADCraft self-reports ~29% parity; "command exists" ≠ "as deep as the incumbent". Fixture evidence decides, not badges.
- **Single-team velocity + pre-1.0 churn:** breaking changes expected; exact pins + monthly sync contain this. Bus-factor risk mitigated by MIT/Apache license (worst case: our pin freezes a working copy — fork becomes possible *then*, not now).
- **acadrust provenance:** MPL-2.0 and "used unmodified" per their plan/ADR and NOTICE; we independently verify coverage/fidelity on our fixtures before relying on it. crated as `acadrust = "0.6.1"` in their manifest; crates.io shows v0.6.3 (updated 2026-10-08, 22.5k downloads).
- **egui desktop UI is irrelevant to us** (we keep React web + Flutter native); only engine/CLI/MCP/WASM surfaces matter.

## Org survey (github.com/storytold, 2026-10-09)

The org hosts 30 repositories. Family apps share the same shape (Rust workspace, MIT OR Apache-2.0, CLI + MCP + web). Triage:

| Disposition | Repos | Reason |
|---|---|---|
| **Adopt-track (in ADR-0015)** | gridcraft, cadcraft, pdfcraft, craft-fonts, wordcraft, deckcraft | Capability-area candidates: M06/M07/M08 + documents (letters/reports/specs) + presentations (both owner-required 2026-10-09; capability areas to be registered) + font supply |
| **Rejected/deferred** | photocraft | Owner rejected for site-photo markup ("too much", 2026-10-09): M04 uses a lightweight native overlay plus PdfCraft's annotation/export path (ADR-0015 §6). Not a licence call — a fit decision. |
| **Reference only, NOT consumable** | artcraft, artcraft-services | Non-OSI "ArtCraft License (WIP)"; their product hub and backend (Rust+TS monorepo). Under ADR-0014 these cannot ship in our product. Useful as reading for their release/update infrastructure. |
| **Excluded — no licence** | cloud-worker (video-model rig) | No LICENSE file = all rights reserved; also out of domain. |
| **Out of domain / third-party** | spark (World Labs 3DGS renderer, MIT), irsa-manager (EKS IAM, MIT, third-party), filmcraft, effectcraft, lightcraft, soundcraft, vectorcraft, designcraft, storyteller-*, bevy-mocap, vits-finetuning, xsens-packet-send, FineTrainers-Conditioning, github-media, html_test, placeholder-artcraft, photocraft-corpus | Media/art creation, ML/mocap research, infra forks, test corpora — no construction-program need today. spark is a plausible future watch for 3D site capture, not registered. |

**Release cadence (update-mechanism evidence):** all adopt-track repos carry semver release tags — gridcraft/cadcraft/wordcraft `v0.1.0`→`v0.3.0`, pdfcraft `v0.1.0`→`v0.4.0` (verified via `git ls-remote --tags`, 2026-10-09). Tags are the pin targets per ADR-0015; no pin exists until prototype tasks run.

## Disposition

No checkbox ticked (R2). Registered strategy: ADR-0015. M06/M07/M08 refinement PRs must add one ArtCraft prototype task each (CLI/MCP over M00 fixtures, comparison against the authoritative engine). WordCraft and deckcraft capability areas (documents, presentations) await scope registration via follow-up `[PLAN-AMEND]`; photocraft is rejected for photo markup per owner.
