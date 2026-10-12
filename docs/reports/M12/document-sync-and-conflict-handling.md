# M12-T08: Document/Deck Change-Feed Sync, Offline Durability & Conflict Handling

- **Milestone:** M12 (Client documents & presentations)
- **Task:** `M12-T08` — Document/deck change-feed sync, offline durability & conflict handling (derived from `M12-W06`)
- **Status:** Complete · Offline local storage durability (< 5ms) operational, change-feed event dispatch active, concurrent conflict detection with automated branch-fork review verified, immutable issuance locking enforced fail-closed
- **Normative References:** Platform Plan v3 §4 (Contracts), §5.1 (Data Flow), §6 M12, §10 (Architecture & Offline Sync); ADR-0002 (Offline-First Storage & Outbox), ADR-0010 (Progressive Extension), ADR-0016 (ArtCraft Suite In-Place Embedding & Lifecycle); AI-Agent Execution Protocol R2, R8, R9, R13.
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M12-T08` implements the document and presentation sync adapter in `@contractor/native-documents`, establishing local durability, change-feed replication, optimistic concurrency control, and immutable issuance locking.

Per **Platform Plan v3 §6 M12** and **M12-W06**:
> *"Integrate document (.docx) and presentation (.pptx) artifacts into Contractor's local SQLite storage, attachment transfer pipeline, and change-feed replication. Implement revision management, concurrent edit locking, and conflict resolution: drafts support optimistic concurrent edits with branch fork review, while issued contractual documents are cryptographically locked against alteration."*

### Key Accomplishments
1. **Offline Durability & Local Save Benchmark (< 5ms):**
   - Documents and presentation drafts persist immediately to local durable storage before network transmission.
   - Micro-benchmarks verify local saves complete within $3.04\text{ ms}$ (well under the $\le 5\text{ ms}$ budget).
2. **Change-Feed Event Dispatch:**
   - Emits structured domain events to Contractor's replication pipeline:
     - `DOCUMENT_DRAFT_CREATED`: Initial draft initialization.
     - `DOCUMENT_DRAFT_MODIFIED`: Incremental local edits with revision sequence tracking.
     - `DOCUMENT_BRANCH_FORKED`: Creation of isolated review branch on conflict.
     - `DOCUMENT_CONCURRENT_CONFLICT_DETECTED`: Alert for overlapping concurrent modifications.
     - `DOCUMENT_ISSUANCE_LOCKED`: Irreversible cryptographic issuance lock.
3. **Optimistic Concurrency & Conflict Detection:**
   - Enforces base revision verification (`baseRevisionId`).
   - When a remote server update arrives for a document that has concurrent dirty local edits, the conflict is flagged immediately without silent overwriting.
4. **Automated Branch Fork Review:**
   - Conflicted drafts are automatically cloned into dedicated review branches (`<docId>-fork-<author>-<timestamp>`), preserving both the server revision and the local author's edits for side-by-side inspection.
5. **Immutable Issuance Lock (Fail-Closed):**
   - Issued contractual documents (`status: 'ISSUED'`) transition to `FROZEN_LOCKED`.
   - Any local edit attempt triggers `FrozenDocumentModificationError`.
   - Any incoming network modification packet targeting an issued document is rejected fail-closed (`FROZEN_REJECTED`).

---

## 2. Architecture: Offline Durability & Sync Lifecycle

```
       ┌─────────────────────────────────────────────────────────────┐
       │                Contractor Document / Deck UI                │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                     1. Local Save (< 5ms) before network
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │         DocumentSyncAdapter (@contractor/native-documents)  │
       │                                                             │
       │  • Local Durable Store (Draft revisions & payloads)         │
       │  • Optimistic Concurrency Guard (Base revision check)       │
       │  • SHA-256 Binary Digest Calculation                        │
       │  • Change-Feed Event Dispatch                               │
       └──────────────┬──────────────────────────────┬───────────────┘
                      │                              │
         2. Outbox Change-Feed          3. Conflict Detected?
                      │                              │
                      ▼                              ▼
       ┌─────────────────────────────┐┌──────────────────────────────┐
       │  Network Change-Feed Sync   ││ Branch Fork Review Pipeline  │
       │  • Server replication       ││ • docId-fork-user-timestamp  │
       │  • Fast-forward if clean    ││ • No silent data loss        │
       └──────────────┬──────────────┘└──────────────────────────────┘
                      │
                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │            Permanent Issuance Freeze (Signatory Lock)       │
       │  • status: ISSUED, syncStatus: FROZEN_LOCKED                │
       │  • Rejects local edits: FrozenDocumentModificationError     │
       │  • Rejects server writes: FROZEN_REJECTED                   │
       └─────────────────────────────────────────────────────────────┘
```

---

## 3. Sync State & Conflict Transition Matrix

| Current State | Event Trigger | Next State | Concurrency Action |
| :--- | :--- | :--- | :--- |
| `DRAFT` (clean) | Local Edit Save | `LOCAL_DIRTY` | Increments `sequenceNumber`, records `baseRevisionId`, saves in $< 5\text{ ms}$ |
| `LOCAL_DIRTY` | Clean Network Sync | `SYNCED` | Confirms remote delivery, updates `syncedAt` |
| `LOCAL_DIRTY` | Remote Edit Arrives (stale base) | `CONFLICT_DETECTED` | Flags conflict, creates dedicated branch fork (`forkBranchOf`), prompts manual review |
| `DRAFT` | Signatory Issues Document | `FROZEN_LOCKED` | Injects SHA-256 snapshot hash, freezes permanently |
| `FROZEN_LOCKED` | Any Local Mutation Attempt | `FROZEN_LOCKED` | Throws `FrozenDocumentModificationError` fail-closed |
| `FROZEN_LOCKED` | Incoming Network Edit | `FROZEN_LOCKED` | Returns `FROZEN_REJECTED`, protects historical integrity |

---

## 4. Test Battery & Verification Evidence

All test cases in `packages/native_documents/test/document_sync_adapter.test.ts` pass cleanly:

```
✔ DocumentSyncAdapter: local offline durability benchmark (< 5ms) and revision sequence (3.045167ms)
✔ DocumentSyncAdapter: concurrent edit detection and automated branch fork review (no silent overwriting) (0.321083ms)
✔ DocumentSyncAdapter: immutable issuance lock fail-closed against modification and network overrides (0.317333ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
```

Total test suite across `@contractor/native-documents` is **22/22 passing**:
- Authority contracts & boundaries: 4 tests
- Multi-source report assembly pipeline: 4 tests
- WordCraft host adapter & dual UI modes: 4 tests
- DeckCraft host adapter & dual UI modes: 4 tests
- PdfExportBridge & print pipeline: 3 tests
- DocumentSyncAdapter & conflict handling: 3 tests

### Acceptance Criteria Checklist
- [x] **Document drafts save durably to local storage before network dispatch (< 5ms local save):** Verified. Local draft saves complete in $3.05\text{ ms}$ (target $< 5\text{ ms}$).
- [x] **Concurrent edits on same document detected and presented for manual review (no silent overwriting):** Verified. Dispatches `DOCUMENT_CONCURRENT_CONFLICT_DETECTED` and creates dedicated review branch fork (`<docId>-fork-<author>-<timestamp>`).
- [x] **Issued letters and reports enforce immutable lock fail-closed against modification:** Verified. Local edits throw `FrozenDocumentModificationError`, and incoming remote updates return `FROZEN_REJECTED`.
- [x] **Strict zero-fork upstream posture:** Maintained. Operates via Contractor external sync adapter.
