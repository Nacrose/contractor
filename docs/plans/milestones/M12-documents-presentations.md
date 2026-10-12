# M12 — Client documents and presentations (letters, reports, specs, decks)

> Source of scope: **registered by owner directive** (chat, 2026-10-09) and recorded in [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md) §1 — the owner requires **WordCraft** for letters/reports/specs (.docx) and **deckcraft** for client-facing presentations. Platform plan v3 registers neither capability area; this `[PLAN-AMEND]` file is the scope of record (protocol R8/R9). Refined from WP level to task level (`M12-T01..M12-T11`) per Protocol R9 ahead of execution.
> Candidate engines: WordCraft ≈62% measured parity (389 commands; .docx round-trip, track changes, comments, references, mail merge) and deckcraft — both **MIT OR Apache-2.0**, CLI + headless MCP + WASM per [ADR-0015](../../adr/0015-artcraft-upstream-engine-strategy.md); family evaluation in [prior-art report](../../reports/prior-art-artcraft-family.md); licenses per [ADR-0014](../../adr/0014-open-source-only-dependency-posture.md); font supply via craft-fonts (no Devanagari coverage yet — tracked as a prototype risk, not a blocker for ASCII/Latin output).
> UI/update direction: [ADR-0016](../../adr/0016-artcraft-suite-in-place-embedding-and-table-modernization.md) requires full WordCraft/DeckCraft editors retaining upstream menus/toolbars plus embedded previews/focused editing/generation through reusable upstream components. Both modes share artifact identity and the adopted app/engine. CLI/MCP is the automation/evidence surface, not a substitute for the authoring UI.
> Consumption per ADR-0015/0016: supported app/component hosts and tag-pinned CLI/MCP or Cargo-git bindings; never forks or edited upstream code; pins recorded in [docs/vendor/ARTCRAFT.md](../../vendor/ARTCRAFT.md).

Dependencies: M02 (contracts/tokens), M03 (synced artifact storage), M06-T12 (shared upstream-update pipeline); data providers M06 (BoQ/IPC numbers through existing financial services) and M08 (PdfCraft PDF export/annotation path reuse). Integrated authoring and upgrade qualification wait for the named data providers and M06-T12. Integrated rollout waits for the shared sync gate.

Exit: owner-ratified feature matrix for documents and decks; generated documents embed correct project data with preserved provenance; no financial arithmetic, permissions, or authoritative domain rules duplicated into the document layer; identical rendering results native/web/server where applicable; print/export fidelity evidence.

Cross-tool integration: [ADR-0018](../../adr/0018-upstream-capabilities-and-construction-integration.md) preserves original-app context and typed domain providers rather than standalone exports. M10-W09 consumes M12's document/deck evidence for connected progress/schedule/report journeys; M12 does not depend on M10. Reuse upstream authoring/rendering/export, with Contractor templates and source bindings outside upstream.

---

- [x] **M12-T01** — WordCraft prototype & headless MCP verification over .docx fixtures (PR #128)
  - Depends on: M01-T01, M06-T01, M08-T01 · Output: `docs/reports/M12/wordcraft-prototype-and-contract.md`, WordCraft MCP driver, fixture test suite.
  - Scope: drive pinned WordCraft upstream via CLI / headless MCP against an agreed .docx corpus (letters, engineering specifications, site memos, contractual notices) per ADR-0015. Verify commands, track changes, comments, and round-trip fidelity against reference outputs. Record MCP tool inventory and adoption trade-offs before production binding.
  - Acceptance:
    - 100% test pass on pinned upstream WordCraft headless MCP commands.
    - Lossless round-trip of standard construction letter and specification fixtures.
    - Evidence report and tool inventory recorded in `docs/reports/M12/wordcraft-prototype-and-contract.md`.

- [x] **M12-T02** — DeckCraft prototype & headless MCP verification over .pptx fixtures (PR #129)
  - Depends on: M01-T01, M06-T01, M12-T01 · Output: `docs/reports/M12/deckcraft-prototype-and-contract.md`, DeckCraft MCP driver, fixture test suite.
  - Scope: drive pinned DeckCraft upstream via CLI / headless MCP against an agreed .pptx corpus (monthly progress presentations, client executive reviews, IPC financial summaries) per ADR-0015. Verify slide layouts, shapes, charts, tables, and slide master fidelity against reference outputs. Record MCP tool inventory before production binding.
  - Acceptance:
    - 100% test pass on pinned upstream DeckCraft headless MCP commands.
    - Round-trip fidelity of sample construction progress deck fixture.
    - Evidence report and tool inventory recorded in `docs/reports/M12/deckcraft-prototype-and-contract.md`.

- [x] **M12-T03** — Document data-flow, authority contract & financial projection boundaries (PR #130)
  - Depends on: M02-T01, M06-T07, M10-T04 · Output: `docs/reports/M12/document-data-flow-and-authority.md`, `@contractor/native-documents` package core contracts.
  - Scope: establish the architectural boundary where documents and decks are strictly read-only projections of authoritative domain data (derived from M12-W01). Render inputs cross the service boundary as exact-decimal strings or scaled integer minor units (`BigInt` Paisa). Zero financial math, billing formulas, or permission checks duplicated in the document layer. Define template versioning and document generation provenance records (snapshot timestamp, creator, source record hashes).
  - Acceptance:
    - Boundary guard rejects document-layer financial calculations or ledger mutations fail-closed.
    - Document projection models verify exact match with source accounting and BoQ figures.
    - Template version and source data snapshots permanently frozen upon document issuance.

- [x] **M12-T04** — Letters & site correspondence (.docx) authoring in dual UI modes via WordCraft (PR #131)
  - Depends on: M02-T05, M12-T01, M12-T03 · Output: `docs/reports/M12/letters-and-correspondence-wordcraft.md`, WordCraft host adapter, template library.
  - Scope: implement dual UI modes for letters and site correspondence per ADR-0016 (derived from M12-W02): (1) `full_editor` mode preserving WordCraft upstream ribbons, menus, track changes, and comments; (2) `embedded_view` mode providing focused template filling, preview, and placeholder substitution. Build construction correspondence template library (FIDIC notice of claim, engineer instruction, variation memo, site memo). Verify mode switching without document state loss.
  - Acceptance:
    - Seamless mode transition between full ribbon editor and embedded form view without cursor or state loss.
    - Placeholder fields bound to live project metadata with automated validation.
    - Track changes and reviewer comments preserved across save and round-trip cycles.

- [x] **M12-T05** — Reports & technical specifications assembly from live project records (PR #132)
  - Depends on: M04-T02, M06-T07, M09-T02, M12-T04 · Output: `docs/reports/M12/reports-and-specifications-assembly.md`, report assembly pipeline.
  - Scope: assemble multi-section engineering reports and contract specifications from disparate project subsystems (derived from M12-W03): daily site logs (M04), BoQ/IPC measurements (M06), material delivery receipts (M05), and TruePPM milestone schedules (M09). Ensure every embedded tabular figure, date, and progress metric traces cryptographically to an immutable source record revision.
  - Acceptance:
    - Multi-source report generation produces complete, validated DOCX document.
    - Cryptographic provenance chain verifies every table entry and figure back to source entity.
    - Stale data alerts prompt regeneration when underlying project records change.

- [x] **M12-T06** — Client presentation deck authoring in dual UI modes via DeckCraft (PR #133)
  - Depends on: M02-T05, M09-T08, M12-T02, M12-T03 · Output: `docs/reports/M12/client-decks-deckcraft.md`, DeckCraft host adapter, slide templates.
  - Scope: implement dual UI modes for client presentations per ADR-0016 (derived from M12-W04): (1) `full_editor` mode preserving DeckCraft slide canvas, master layouts, shapes, and toolbars; (2) `embedded_view` mode providing one-click progress deck generation and slide preview. Bind TruePPM EVM S-curves, milestone timelines, financial billings, and site progress photos into standardized slide templates.
  - Acceptance:
    - Automated generation of monthly client progress deck directly from TruePPM and BoQ data.
    - Dual mode switching preserves slide deck structure, customized annotations, and speaker notes.
    - Output validates cleanly against OpenXML PresentationML (.pptx) standards.

- [x] **M12-T07** — High-fidelity PDF export & vector print pipeline via shared PdfCraft path (PR #134)
  - Depends on: M08-T02, M12-T04, M12-T06 · Output: `docs/reports/M12/pdf-export-and-print-fidelity.md`, export bridge.
  - Scope: integrate WordCraft documents and DeckCraft presentations with the existing PdfCraft rendering pipeline (M08) for PDF export and high-fidelity vector printing (derived from M12-W05). Reuse the single unified PDF engine rather than bundling separate PDF export stacks. Validate header/footer letterheads, pagination, page numbering, bleed margins, and font embedding across web and native targets.
  - Acceptance:
    - Bit-identical PDF generation from DOCX and PPTX sources through PdfCraft engine.
    - Embedded vectors, fonts, and letterheads render with 100% visual fidelity.
    - Print dialog integration produces clean paginated output matching ISO 216 paper sizes (A4, A3).

- [x] **M12-T08** — Document/deck change-feed sync, offline durability & conflict handling (PR #135)
  - Depends on: M03-T04, M12-T04, M12-T06 · Output: `docs/reports/M12/document-sync-and-conflict-handling.md`, document sync adapter.
  - Scope: integrate document (.docx) and presentation (.pptx) artifacts into Contractor's local SQLite storage, attachment transfer pipeline, and change-feed replication (derived from M12-W06). Implement revision management, concurrent edit locking, and conflict resolution: drafts support optimistic concurrent edits with branch fork review, while issued contractual documents are cryptographically locked against alteration.
  - Acceptance:
    - Document drafts save durably to local storage before network dispatch (< 5ms local save).
    - Concurrent edits on same document detected and presented for manual review (no silent overwriting).
    - Issued letters and reports enforce immutable lock fail-closed against modification.

- [x] **M12-T09** — Cross-platform rendering parity, performance workloads & accessibility (PR #136)
  - Depends on: M10-T06, M12-T04, M12-T06 · Output: `docs/reports/M12/document-parity-and-workloads.md`, benchmark test suite.
  - Scope: evaluate document and presentation rendering fidelity and authoring performance across Flutter Web, desktop, and mobile targets (derived from M12-W07). Benchmark large document workloads (500-page specification manuals, 100-slide master decks). Validate WCAG 2.1 AA accessibility, keyboard navigation through toolbars/ribbons, screen-reader text flows, and craft-fonts font fallback (tracking Devanagari Unicode coverage).
  - Acceptance:
    - Identical document rendering across web canvas, native macOS/Windows/Linux, and mobile viewers.
    - 500-page document loads in $< 1.5\text{ s}$; scrolling maintains $\ge 60\text{ fps}$ without frame drops.
    - Keyboard navigation and screen reader accessibility meet WCAG 2.1 AA requirements.

- [ ] **M12-T10** — WordCraft, DeckCraft & craft-fonts release-update qualification
  - Depends on: M06-T12, M11-T05, M12-T04, M12-T06 · Output: `docs/reports/M12/wordcraft-deckcraft-update-qualification.md`, update scripts, vendor registry updates.
  - Scope: integrate WordCraft, DeckCraft, and craft-fonts into Contractor's unified upstream update command (`update-artcraft.mjs`) per ADR-0015/ADR-0016 (derived from M12-W09). Execute live version upgrades and rollbacks between two pinned upstream releases for both engines independently. Verify compatibility of existing DOCX/PPTX files across upgrades, template persistence, and font notice compliance without requiring engine forks.
  - Acceptance:
    - Independent upgrade and rollback drills for WordCraft and DeckCraft complete cleanly without data corruption.
    - Pinned versions, checksums, and license notices registered in `docs/vendor/ARTCRAFT.md`.
    - Strict zero-fork upstream posture verified across all document packages.

- [ ] **M12-T11** — 👤 GATE — Client documents & presentations exit evidence
  - Depends on: M12-T01…T10 · Output: `[M12-GATE]` evidence packet (`docs/reports/M12/m12-exit-gate.md`) and formal owner approval.
  - Scope: aggregate comprehensive evidence covering WordCraft/DeckCraft prototype reports, document authority contracts, correspondence templates, multi-source report assembly, presentation deck generation, PdfCraft export fidelity, change-feed sync durability, workload benchmarks, and upstream update qualification (derived from M12-W08). Present final exit packet for owner review under Protocol R8.
  - Acceptance:
    - Exit sentence proven: owner-ratified feature matrix for documents and decks; generated documents embed correct project data with preserved provenance; no financial arithmetic, permissions, or authoritative domain rules duplicated into the document layer; identical rendering results native/web/server where applicable; print/export fidelity evidence.
    - Owner approval recorded under Protocol R8 before milestone sign-off.

---

## Refinement contract

This milestone is refined to task level under Protocol R9 ahead of execution. All 9 work packages have been mapped to concrete tasks `M12-T01` through `M12-T11` with explicit dependencies, deliverable outputs, implementation scopes, and testable acceptance criteria, preserving both full editor and embedded view UI modes (ADR-0016), independent upstream prototype verification (ADR-0015), and the zero-fork upstream posture.
