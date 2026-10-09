# M12 — Client documents and presentations (letters, reports, specs, decks)

> Source of scope: **registered by owner directive** (chat, 2026-10-09) and recorded in [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md) §1 — the owner requires **WordCraft** for letters/reports/specs (.docx) and **deckcraft** for client-facing presentations. Platform plan v3 registers neither capability area; this `[PLAN-AMEND]` file is the scope of record (protocol R8/R9). Registered at **WP level** — far-future milestones stay coarse until evidence supports their refinement (protocol R9); refinement must add WordCraft and deckcraft prototype tasks following the M06/M07/M08 pattern (CLI/MCP over fixtures vs an agreed reference, report in `docs/reports/`, per-engine adoption ADR before any production binding).
> Candidate engines: WordCraft ≈62% measured parity (389 commands; .docx round-trip, track changes, comments, references, mail merge) and deckcraft — both **MIT OR Apache-2.0**, CLI + headless MCP + WASM per [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md); family evaluation in [prior-art report](../../reports/prior-art-artcraft-family.md); licenses per [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md); font supply via craft-fonts (no Devanagari coverage yet — tracked as a prototype risk, not a blocker for ASCII/Latin output).
> Consumption per ADR-0015: tag-pinned CLI/MCP subprocess or Cargo-git dependency; never forks or edited upstream code; pins recorded in [docs/vendor/ARTCRAFT.md](../../vendor/ARTCRAFT.md).

Dependencies: M02 (contracts/tokens), M03 (synced artifact storage); data providers M06 (BoQ/IPC numbers through existing financial services) and M08 (PdfCraft PDF export/annotation path reuse). May be developed after M04/M05 in any order relative to M06–M11; integrated rollout waits for the shared sync gate.

Exit: owner-ratified feature matrix for documents and decks; generated documents embed correct project data with preserved provenance; no financial arithmetic, permissions, or authoritative domain rules duplicated into the document layer; identical rendering results native/web/server where applicable; print/export fidelity evidence.

---

- [ ] **M12-W01** — Document data-flow and authority contract
  - Acceptance sketch: documents are **projections** of domain data — render inputs cross the service boundary as exact-decimal strings/scaled ints; financial arithmetic, permissions, and posting rules stay in existing services (v3 §4, §5.1, §9). Template versioning and document records defined so a regenerated document cannot silently diverge from the data it claims to represent.

- [ ] **M12-W02** — Letters and site correspondence (.docx) via WordCraft
  - Acceptance sketch: template library with typed placeholders (project, client, date, BoQ references); WordCraft prototype task (CLI/MCP) precedes any binding decision; output validated as standards-compliant .docx round-trip; craft-fonts supply evaluated (Devanagari gap tracked).

- [ ] **M12-W03** — Reports and specifications assembly
  - Acceptance sketch: project data merge (daily logs, BoQ/IPC figures via existing financial services, photo/document references) into report/spec templates; every number in a generated document traces to an authoritative source record; versioned document records with regeneration provenance.

- [ ] **M12-W04** — Client-facing presentations via deckcraft
  - Acceptance sketch: progress/IPC/presentation decks generated from approved domain data only; deckcraft prototype task (CLI/MCP) precedes any binding decision; template governance mirrors M12-W02.

- [ ] **M12-W05** — Export and print path (PDF)
  - Acceptance sketch: PDF export/print fidelity through the PdfCraft path adopted for M08 (one engine, not a second PDF stack); letterhead, pagination, and font embedding verified; markup/export behavior consistent with the M04 photo-markup approach (ADR-0015 §6).

- [ ] **M12-W06** — Storage, sync and conflict integration
  - Acceptance sketch: documents/decks are synced artifacts through the M03 change feed with revision/conflict rules per v3 §5.4; pending edits and regeneration state follow the M02 save/sync model (M02-T05); no private bypass of the attachment/transfer protocol.

- [ ] **M12-W07** — Parity, workload and accessibility evidence
  - Acceptance sketch: identical generated output native/web/server for the agreed feature matrix; large-document and large-deck workload evidence per §7 bands; keyboard/screen-reader accessibility for any authoring UI via M02 shared components.

- [ ] **M12-W08** — 👤 GATE — M12 exit evidence
  - Acceptance sketch: feature matrix + provenance + parity + workload evidence aggregated; per-engine adoption ADRs (WordCraft, deckcraft) recorded or engines explicitly rejected with evidence; owner approval per protocol R8.

## Refinement contract

Before the M12 gate PR opens, refine to `M12-Tnn` tasks with scope, outputs, dependencies, and testable acceptance criteria via a `[PLAN-AMEND]` PR (protocol R9). Refinement must add one WordCraft prototype task and one deckcraft prototype task per ADR-0015 (CLI/MCP over fixtures vs an agreed reference — e.g. an independently produced .docx/PPTX corpus — with report and MCP tool inventory in `docs/reports/`).
