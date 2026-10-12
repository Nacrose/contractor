# M12-T04: Letters & Site Correspondence (.docx) Authoring in Dual UI Modes via WordCraft

- **Milestone:** M12 (Client documents & presentations)
- **Task:** `M12-T04` — Letters & site correspondence (.docx) authoring in dual UI modes via WordCraft (derived from `M12-W02`)
- **Status:** Complete · Dual UI modes (`full_editor` vs `embedded_view`) operational, construction correspondence template library codified, cursor & selection state transitions verified, track changes & comments supported, OpenXML (.docx) export verified
- **Normative References:** Platform Plan v3 §4 (Contracts), §6 M12, §10 (Architecture & UI Modes); ADR-0010 (Progressive Extension), ADR-0015 (ArtCraft Upstream Strategy), ADR-0016 (Suite In-Place Embedding & Dual UI Modes), ADR-0018 (Upstream Capabilities & Construction Integration); AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Deliverables

Milestone `M12-T04` delivers the production host adapter and contractual correspondence library integrating WordCraft into Contractor.

Per **Platform Plan v3 §6 M12** and **ADR-0016**:
> *"Full document editing retains upstream ribbons, menus, tools and canvas; embedded capability views inside construction workflows expose focused forms, template filling, and preview controls... Switching modes preserves identity, revisions, and pending work without cursor or state loss."*

### Key Accomplishments
1. **Dual UI Modes (ADR-0016):**
   - `full_editor` mode: Exposes upstream ribbons, formatting canvas, track changes, comments sidebar, and direct OpenXML document canvas editing.
   - `embedded_view` mode: Provides streamlined, form-focused input fields, highlighted placeholder tokens, and live letter preview without canvas clutter.
   - Seamless bidirectional mode transitions preserve active document cursor state (`paragraphIndex`, `characterOffset`, `activeFieldKey`) and selection boundaries without document mutation.
2. **FIDIC & Nepal Standard Correspondence Template Library:**
   - Codified 4 standard construction templates:
     - `FIDIC_NOTICE_OF_CLAIM`: FIDIC Red Book Sub-Clause 20.1 & 4.12 notice of physical conditions within the contractual 28-day notice period.
     - `ENGINEER_INSTRUCTION_ACK`: FIDIC Sub-Clause 3.3 instruction acknowledgment and cost/schedule impact notice.
     - `VARIATION_PROPOSAL_MEMO`: FIDIC Sub-Clause 13.2 value engineering and design modification memo.
     - `SITE_INSPECTION_MEMO`: Nepal MoPIT / FIDIC Request for Inspection (RFI) for structural reinforcement and concrete works.
3. **Automated Placeholder Validation:**
   - Detects all missing required template placeholders and verifies complete resolution of token parameters (`{{parameter}}`).
   - Rejects document issuance fail-closed if required contractual metadata is missing.
4. **Authoritative Financial & Table Integration:**
   - Enforces `DocumentAuthorityGuard` (from M12-T03) across correspondence tables and cost impact summaries. All monetary amounts must be `BigInt` Paisa with valid double-entry ledger sequence provenance. Client-side math is strictly rejected.
5. **Track Changes & Reviewer Comments:**
   - Records tracked revision deltas (`insert`, `delete`, `format`) with author attribution and timestamp.
   - Manages threaded reviewer comments with resolution states.
6. **OpenXML (.docx) Package Generation & Permanent Freeze:**
   - Generates compliant OpenXML package structures (`word/document.xml`, `word/comments.xml`, `word/settings.xml`, `docProps/core.xml`, `docProps/app.xml`).
   - Transitions to immutable `ISSUED` status with cryptographic SHA-256 snapshot hash, enforcing `FrozenDocumentModificationError` against post-issuance alteration.

---

## 2. Architecture & Dual UI Mode Mechanics (ADR-0016)

```
       ┌─────────────────────────────────────────────────────────────┐
       │                Contractor Construction App                  │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                 Mode Switch Toggle (ADR-0016)
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │     embedded_view         │             │        full_editor        │
   │  • Focused Form Inputs    │ ◄─────────► │  • WordCraft Ribbon Bar   │
   │  • Highlight Placeholders │  Cursor &   │  • Margin & Ruler Canvas  │
   │  • Instant Letter Preview │  Selection  │  • Track Changes Sidebar  │
   │  • Streamlined Workflow   │  Preserved  │  • Comment Annotation    │
   └─────────────┬─────────────┘             └─────────────┬─────────────┘
                 │                                         │
                 └────────────────────┬────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │        WordCraftHostAdapter (@contractor/native-documents)          │
   │  • Template Library & Live Metadata Binding                         │
   │  • DocumentAuthorityGuard (BigInt Paisa & Ledger Provenance)        │
   │  • Revisions & Reviewer Comments Storage                            │
   │  • Automated Placeholder Completeness Validator                     │
   └──────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │               OpenXML (.docx) Serialization Engine                  │
   │  • word/document.xml (paragraphs, formatted runs, tables)          │
   │  • word/comments.xml (reviewer annotations & timestamps)            │
   │  • word/settings.xml (trackRevisions enabled)                       │
   │  • docProps/core.xml (title, author, creation timestamp)            │
   └──────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                  Immutable Issuance & Lock Layer                    │
   │  • SHA-256 Snapshot Hash & Signatory Watermark                      │
   │  • FrozenDocumentModificationError (Fail-Closed on Mutate)          │
   └─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Template Library Specifications

| Template ID | Contract Standard | Purpose | Key Placeholders |
| :--- | :--- | :--- | :--- |
| `FIDIC_NOTICE_OF_CLAIM` | FIDIC Red Book (1999/2017) | Formal notice under Sub-Clause 20.1 & 4.12 for unforeseen ground / hydrological conditions | `referenceNumber`, `date`, `clientName`, `engineerName`, `eventDate`, `chainageOrLocation`, `conditionDescription`, `clausesReferenced`, `authorizedSignatory` |
| `ENGINEER_INSTRUCTION_ACK` | FIDIC Red Book Sub-Clause 3.3 | Acknowledgment of Engineer's site instruction recording variation status and cost/time impact | `referenceNumber`, `date`, `engineerName`, `instructionRef`, `instructionDate`, `scopeSummary`, `impactNarrative`, `authorizedSignatory` |
| `VARIATION_PROPOSAL_MEMO` | FIDIC Red Book Sub-Clause 13.2 | Value engineering submission to optimize design, accelerate schedule, or reduce cost | `referenceNumber`, `date`, `engineerName`, `proposedModification`, `technicalBenefits`, `netSavingsNpr`, `scheduleAccelerationDays`, `authorizedSignatory` |
| `SITE_INSPECTION_MEMO` | Nepal MoPIT / FIDIC General | Request for Inspection (RFI) for structural pours, rebar placement, or stage approvals | `referenceNumber`, `date`, `residentEngineer`, `locationChainage`, `activityDescription`, `scheduledDateTime`, `drawingReference`, `authorizedSignatory` |

---

## 4. Test Battery & Verification Evidence

All test cases in `packages/native_documents/test/wordcraft_adapter.test.ts` pass cleanly under pinned Node.js v26 and TypeScript v5.9.3:

```
✔ DocumentAuthorityGuard: enforces BigInt Paisa and authoritative double-entry provenance (1.018625ms)
✔ DocumentAuthorityGuard: strictly blocks client-side VAT or discount arithmetic in presentation layer (0.088875ms)
✔ DocumentDataFlowEngine: creates draft, computes cryptographic snapshot hash, and verifies fidelity (1.523417ms)
✔ DocumentDataFlowEngine: allows draft update but freezes permanently upon issuance (0.242333ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0

✔ WordCraftHostAdapter: dual UI mode transitions and configuration (ADR-0016) (0.935917ms)
✔ WordCraftHostAdapter: correspondence template library and placeholder validation (0.383875ms)
✔ WordCraftHostAdapter: track changes, reviewer comments, and authoritative financial figures (1.230125ms)
✔ WordCraftHostAdapter: freeze and issuance lock & OpenXML (.docx) package generation (0.722ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0

native_documents: all document authority, WordCraft host adapter, and correspondence tests PASSED (M12-T04)
```

### Acceptance Criteria Checklist
- [x] **Seamless mode transition between full ribbon editor and embedded form view without cursor or state loss:** Verified. Cursor position (`paragraphIndex`, `characterOffset`, `activeFieldKey`) is preserved identically across `embedded_view` $\leftrightarrow$ `full_editor` mode toggles.
- [x] **Placeholder fields bound to live project metadata with automated validation:** Verified. Detects missing mandatory placeholders and verifies zero unresolved `{{token}}` variables before document issuance.
- [x] **Track changes and reviewer comments preserved across save and round-trip cycles:** Verified. Revisions (`insert`, `delete`, `format`) and comments with resolve state are captured and serialized into OpenXML `word/comments.xml` and `word/settings.xml`.
- [x] **Strict zero-fork upstream posture:** Maintained. WordCraft host adapter operates externally without modifying upstream WordCraft engine packages.
