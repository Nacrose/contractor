# M12-T03: Document Data-Flow, Authority Contract & Financial Projection Boundaries

- **Milestone:** M12 (Client documents & presentations)
- **Task:** `M12-T03` — Document data-flow, authority contract & financial projection boundaries (derived from `M12-W01`)
- **Status:** Complete · Core package `@contractor/native-documents` active, read-only domain projection boundaries codified, strict zero presentation-layer financial calculation guard enforced, and immutable issuance lifecycle verified
- **Normative References:** Platform Plan v3 §4 (Contracts), §5.1 (Data Flow), §6 M12, §9 (Ledger Invariants); ADR-0010 (Progressive Extension), ADR-0015 (ArtCraft Upstream Strategy), ADR-0016 (Suite In-Place Embedding), ADR-0018 (Upstream Capabilities & Construction Integration); AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M12-T03` formalizes the data-flow architecture and authority contract governing how documents (.docx) and presentation decks (.pptx) interact with Contractor's underlying construction engineering databases.

As mandated by **Platform Plan v3 §6 M12** and **M12-W01**:
> *"Documents are projections of domain data — render inputs cross the service boundary as exact-decimal strings or scaled ints; financial arithmetic, permissions, and posting rules stay in existing services... Template versioning and document records defined so a regenerated document cannot silently diverge from the data it claims to represent. Drafts may refresh authorized source data; issued letters/reports/decks freeze source-record revisions, data snapshot, template/font versions and generation provenance."*

### Key Guarantees Implemented
1. **Documents as Pure Projections:** WordCraft and DeckCraft never compute billing formulas, apply tax/VAT rates, or perform double-entry ledger mutations. Documents are strictly read-only views projected from authoritative domain services.
2. **Exact Scaled-Integer Arithmetic:** All monetary quantities cross the boundary as 64-bit integer minor units (`BigInt` Paisa) or exact decimal strings, guaranteeing zero floating-point precision drift.
3. **Double-Entry Provenance Requirement:** Presentation fields must reference valid double-entry account codes and ledger sequence watermarks (`DocumentAuthorityGuard`).
4. **Permanent Issuance Freeze:** While drafts permit live data refreshing, formal document issuance permanently locks template version, data snapshot hashes, and authorized signatory identities (`FrozenDocumentModificationError`).

---

## 2. Architecture: Read-Only Projection Model

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Authoritative Domain Services                     │
 │                                                                        │
 │   [BoQ Billing Engine]     [Accounting Ledger]     [TruePPM Scheduler] │
 │   (Measurement Sheets)     (Double-Entry GL)       (CPM & Milestones)  │
 └─────────────────┬───────────────────┬───────────────────┬──────────────┘
                   │                   │                   │
                   ▼                   ▼                   ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │          Boundary Guard: DocumentAuthorityGuard (Fail-Closed)          │
 │  • Rejects client-calculated discounts, VAT, or floating-point rates   │
 │  • Asserts exact BigInt Paisa and valid source ledger sequence         │
 └─────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │           DocumentDataFlowEngine (@contractor/native-documents)        │
 │  • Assembles DocumentProjectionPayload                                 │
 │  • Computes SHA-256 cryptographic snapshot hash                        │
 │  • Tracks Template Version & Source Watermarks                         │
 └─────────────────────────────────────┬──────────────────────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
          ┌─────────────────────┐             ┌─────────────────────┐
          │      WordCraft      │             │      DeckCraft      │
          │  Letters & Specs    │             │  Progress Decks     │
          │  (DOCX Projection)  │             │  (PPTX Projection)  │
          └─────────────────────┘             └─────────────────────┘
```

---

## 3. Strict Boundary Invariants

| Invariant | Presentation Layer Rule | Domain Service Authority | Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **Monetary Precision** | Must receive `BigInt` minor units (Paisa). Float inputs throw. | `packages/native_accounting` (BigInt Paisa) | `DocumentAuthorityGuard.validateFinancialFigure` |
| **VAT / Deductions** | Cannot calculate VAT or retention % in document templates. | Retained construction billing service | Detection of presentation-layer tax fields throws fail-closed |
| **Ledger Provenance** | Every monetary figure must carry `sourceAccountCode` and `ledgerSeq`. | Monotonically increasing ledger sequence | Unanchored financial values rejected |
| **Draft Updates** | Drafts can refresh live figures from underlying project entities. | Active project change feed | Snapshot hash re-computed; previous hash tracked |
| **Issuance Lock** | Once issued, document template, content, and hashes are frozen. | Formal signatory authorization | `FrozenDocumentModificationError` blocks any subsequent update |

---

## 4. Document Lifecycle & Provenance Record

Every document managed by `@contractor/native-documents` maintains an immutable provenance header:

```typescript
interface DocumentProvenanceRecord {
  documentId: string;
  templateId: string;
  templateVersion: number;
  status: 'DRAFT' | 'ISSUED' | 'ARCHIVED';
  createdAt: string;
  author: string;
  issuedAt?: string;
  authorizedSignatory?: string;
  snapshotHash: string; // SHA-256 over entire projection payload
  sourceEntitiesWatermark: {
    ledgerSeq: number;
    boqRevision: number;
    scheduleRevision: number;
  };
}
```

When an engineer issues a formal contractual letter (e.g., FIDIC Notice) or IPC summary deck, `issueDocument()` is invoked with the authorized project director's credentials. Any subsequent attempt to alter the text, refresh data, or re-sign the document throws `FrozenDocumentModificationError` immediately.

---

## 5. Automated Verification Evidence

The test suite in [`packages/native_documents/test/authority_contract.test.ts`](file:///Users/aakashdhakal/contractor/packages/native_documents/test/authority_contract.test.ts) verifies all boundary conditions:

```bash
$ node packages/native_documents/tool/check.mjs
✔ DocumentAuthorityGuard: enforces BigInt Paisa and authoritative double-entry provenance (1.043791ms)
✔ DocumentAuthorityGuard: strictly blocks client-side VAT or discount arithmetic in presentation layer (0.087792ms)
✔ DocumentDataFlowEngine: creates draft, computes cryptographic snapshot hash, and verifies fidelity (1.294708ms)
✔ DocumentDataFlowEngine: allows draft update but freezes permanently upon issuance (0.207167ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6.765833
native_documents: all document authority and projection contract tests PASSED (M12-T03)
```

- **All 4 contract tests passed.**
- **Zero third-party runtime dependencies required; pure zero-install architecture.**
- **Full TypeScript strict compilation under pinned tsc 5.9.3.**

---

## 6. Conclusion & Next Steps

With the authority boundaries and read-only projection contracts established in `@contractor/native-documents`, document generation and correspondence authoring can proceed safely.

Next immediate step: **M12-T04** — Letters & site correspondence (.docx) authoring in dual UI modes via WordCraft.
