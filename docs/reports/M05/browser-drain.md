# M05-T07: Existing Browser Drafts/Queues — Safe Drain, Explicit Export/Import, and PWA Retirement Path

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T07` — Existing browser drafts/queues: explicit export/import or safe drain
- **Dependencies:** `M05-T02` (Attendance), `M05-T03` (Site expense), `M05-T04` (Material delivery)
- **Date:** 2026-10-12
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T07` establishes the safe migration and drain architecture for all legacy browser storage systems prior to field PWA code retirement:
1. **Target Browser Stores (Audited from M00-T09)**:
   - `cm-field-outbox` (IndexedDB v3):
     - `outbox` (v1): Pending field mutation operations (`daily_report`, `attendance`, `expense`, `material_delivery`).
     - `drafts` (v2): Unsent form draft state as typed by the user.
     - `queries` (v3): Read cache query snapshots for offline tab hydration.
   - `cm-offline-v2` (IndexedDB v2 Legacy):
     - `queue`: Pre-S2 legacy requests retaining stranded field mutations.
2. **Operation ID & Idempotency Key Invariance**:
   - Every pending browser outbox item drains into the unified engine preserving its exact `id`, `clientUuid`, and mutation payload.
   - Server-side deduplication guarantees that a drained item and an original submission converge to the same server receipt without double-posting.
3. **No Blanket IndexedDB Deletion**:
   - The drain enforces a strict per-store, per-record disposition rule: records are marked `acknowledged_and_archived` ONLY upon receiving an authoritative server receipt.
   - Network errors, timeouts, or unacknowledged items are kept in `retained_pending`. Wholesale `indexedDB.deleteDatabase()` is prohibited.
4. **Resumable & Crash-Safe Execution**:
   - An interrupted migration (browser tab killed or process crash mid-drain) re-runs safely: already-acknowledged items are skipped (`skipped_already_synced`), unacknowledged items are processed without data loss or duplication.
5. **Two Complementary Migration Paths**:
   - **Path A (Direct Web/PWA Drain)**: `BrowserDrainEngine.executeSafeDrain()` flushes IndexedDB directly to unified server adapter endpoints.
   - **Path B (Portable Bundle Export/Import)**: `BrowserDrainEngine.exportBundle()` exports a versioned `cm-field-drain-v1` JSON bundle, ingested by `BrowserDrainImporter` into native SQLite (`pending_op` + local tables).

---

## 2. Architecture & Data Contracts

### 2.1 The Portable Migration Bundle (`cm-field-drain-v1`)

```json
{
  "version": "cm-field-drain-v1",
  "exportedAt": "2026-10-12T00:00:00.000Z",
  "summary": {
    "outboxCount": 2,
    "draftsCount": 1,
    "queriesCount": 10,
    "legacyQueueCount": 2
  },
  "outbox": [
    {
      "id": "pwa-att-001",
      "clientUuid": "uuid-1234-abcd",
      "userId": "user-42",
      "tenantId": "tenant-acme",
      "type": "attendance",
      "status": "pending",
      "payload": { "projectId": "p1", "attendanceDate": "2026-10-12", "records": [...] },
      "createdAt": 1700000000
    }
  ],
  "drafts": [
    {
      "id": "draft-mrr-1",
      "userId": "user-42",
      "type": "material_delivery",
      "payload": { "projectId": "p1", "supplierName": "Everest Cement" },
      "updatedAt": 1700000030
    }
  ],
  "queries": [...],
  "legacyQueue": [...]
}
```

### 2.2 Per-Store Disposition Matrix

| Store | Record Type | Disposition Rule | Outcome on Server Ack | Outcome on Error/Crash |
|---|---|---|---|---|
| `cm-field-outbox/outbox` | Pending mutation | Dispatch via unified server port | `acknowledged_and_archived` (marked synced or purged) | `retained_pending` (retained in IndexedDB) |
| `cm-field-outbox/drafts` | Unsent form draft | Retained or exported to native `private_draft` | Retained intact until user submits | `retained_pending` (retained in IndexedDB) |
| `cm-field-outbox/queries` | Read query snapshot | LRU age check (>7 days) | Evicted if stale (`discarded_stale`); retained if fresh | Retained |
| `cm-offline-v2/queue` | Legacy pre-S2 request | Endpoint translation check | Mapped to field envelope and drained | `retained_pending` (retained for manual inspection) |

### 2.3 Native SQLite Import (`BrowserDrainImporter`)

When migrating to the Flutter native client:
- Validates bundle schema version `cm-field-drain-v1`.
- Performs atomic transaction inserting:
  - `pending_op`: stores `id`, `kind`, `clientUuid`, `payload`, `state='pending'`.
  - Local workflow tables: `attendance_local`, `site_expense_local`, `material_delivery_local`, `daily_report_local`.
  - `private_draft`: stores unsent drafts.
- Idempotent re-runs skip existing records (`skippedExistingCount`).
- Mount lifecycle triggers (`drainTriggers.onLaunch()`) seamlessly drain imported mutations to the server.

---

## 3. PWA Retirement Path & Staging Plan (v3 §6 M05 bullet 5)

Actual code removal occurs in **M05-T09** after the contract suite pass (**M05-T08**). The roadmap and scope boundaries are established here:

### 3.1 Components Retiring in M05-T09
- `src/lib/field-outbox.ts`: legacy IndexedDB queue and retry loops.
- `src/lib/field-db.ts`: legacy IndexedDB database wrappers (`cm-field-outbox`).
- `src/lib/field-drafts.ts`: browser-local draft state abstractions.
- `public/sw.js` background sync handlers: `cm-field-sync` registration and service worker drain loops.
- Legacy mobile PWA field routes: `/m/log` and dedicated mobile field submission wrappers.

### 3.2 Components Retained (Non-Field Web Surfaces)
- Desktop web app routes and office management dashboards.
- Office review surfaces (`/admin/field-submissions`, `/reports/daily`, `/finance/petty-cash`).
- React virtual grid (`src/components/worksheet/`) and Excel import/export engines.
- PDF Canvas Takeoff system (`ConstructionManager_PdfCanvas`).
- CAD DXF/DWG vector rendering engines.

### 3.3 Rollback Procedures
- **Pre-retirement export**: Before applying M05-T09 retirement, an automated drain check asserts `outbox.pending == 0`.
- **Database preservation**: IndexedDB databases are never dropped programmatically; even after retiring PWA code, existing browser IndexedDB databases remain physically accessible for forensic recovery.
- **Git Reversion**: M05-T09 retirement is isolated to a dedicated branch/PR with clean reversal paths.

---

## 4. Verification Evidence

### 4.1 TypeScript Adapter & Drain Test Suite (`packages/native_adapter`)

```bash
$ node tool/check.mjs
...
✔ M05-T07: operationId and clientUuid are preserved intact across drain (1.145875ms)
✔ M05-T07: server dedup treats migrated submission and original identically (0.133666ms)
✔ M05-T07: no blanket IndexedDB deletion — per-store, per-record disposition rule (0.397208ms)
✔ M05-T07: crash-safety and resumability — interrupted drain resumes with 0 loss and 0 duplicates (1.504667ms)
✔ M05-T07: exportBundle produces compliant cm-field-drain-v1 schema (0.903666ms)
ℹ tests 47
ℹ suites 0
ℹ pass 47
ℹ fail 0
native_adapter: contract, attendance, site expense, material delivery, field photos, and browser drain tests PASSED
```

### 4.2 Flutter Native Importer Test Suite (`prototype/construction_client`)

```bash
$ flutter test test/mount/browser_drain_importer_test.dart
00:00 +0: browser drain importer: imports bundle into SQLite outbox and local tables with IDs intact
00:00 +1: browser drain importer: rejects invalid bundle version
00:00 +2: All tests passed!
```

### 4.3 Full Test Suite Regression Pass

```bash
$ flutter test
00:21 +252: All tests passed!

$ flutter analyze
Analyzing construction_client...
No issues found! (ran in 4.0s)
```

---

## 5. Acceptance Criteria Checklist

- [x] **Operation IDs & idempotency preserved:** Original `id` and `clientUuid` are preserved intact across export, import, and drain.
- [x] **Server-side dedup invariance:** Server dedup treats migrated submissions and originals identically (0 double-posts).
- [x] **No blanket IndexedDB deletion:** Per-store, per-record disposition tested (synced/acked -> archived; failed/unacked -> retained).
- [x] **Idempotent and resumable drain:** Re-running after a mid-stream crash causes 0 loss and 0 duplicate server dispatches.
- [x] **PWA retirement path documented:** Detailed scoping of retiring vs retained web components and rollback safeguards.
