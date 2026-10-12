# M05-T05: Field Photos Pipeline — Single Manager, Digest Deduplication, EXIF Geotagging, and Office Review Visibility

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T05` — Field photos through the full pipeline (native camera/files adapters)
- **Dependencies:** `M05-T01` (Expansion substrate), `M04-T04` (Photo attachments)
- **Date:** 2026-10-12
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T05` completes the media attachment pipeline across all field workflows (daily reports, site expenses, material deliveries/MRR, and general progress media):
1. **One Unified Protocol & Journal**: All expansion workflows' attachments go through the SAME M03-T06 `AttachmentTransferManager` and reconciliation journal (`attachment` + `attachment_event` tables). No per-workflow transfer forks or secondary upload pipelines exist.
2. **Office Review Display Invariant**: Office review surfaces display **strictly registered photos** (`complete == true && receipt != null`). Incomplete, staging, finalizing, or failed uploads are never displayed as complete.
3. **Server-Side StoredFile Digest Deduplication**: Byte digests are computed using SHA-256; duplicate uploads of identical file contents (across devices or workflows) reuse the existing `StoredFile` without redundant storage.
4. **EXIF & Geotag Handling**: Capture timestamps, image dimensions, and GPS coordinates (latitude, longitude, altitude) are preserved throughout staging, registration, and office review.
5. **Real SHA-256 Digest Port Binding**: Native file and camera adapters bind directly to the mount's SHA-256 `DigestPort` and fail-closed object store.

---

## 2. Architecture & Transfer State Machine

### 2.1 The Four-Stage Pipeline (Identical to M04 Vertical)
Every photo attachment advances through the strict state machine:
```text
[Source File] ──► stageBytes() ──► [staging] ──► [staged] (temp key *.part + SHA-256 verified)
                       │
                       ▼
                 finalize() ──► [finalized] (atomic rename to final key + secondary digest check)
                       │
                       ▼
                 register() ──► [registered] (server receipt issued; complete == true)
```

1. **Stage (`stageBytes`)**:
   - Computes SHA-256 digest of incoming bytes.
   - Writes to temporary object key `attachments/<id>.part`.
   - Reads back and verifies digest against input.
   - Emits `stage_started` and `staged_verified` journal events.
2. **Finalize (`finalize`)**:
   - Performs atomic move from temporary key to canonical key `attachments/<id>`.
   - Verifies canonical bytes match stored digest.
   - Transitions state to `finalized` in local SQLite outbox.
3. **Register (`register`)**:
   - Sends chunked upload / registration envelope to server.
   - Receives server-authoritative `receipt`.
   - Transitions state to `registered`.
   - `complete` property evaluates to `true` only when `state == registered` and `receipt != null`.

### 2.2 Office Review Visibility Gate
In accordance with v3 §6 M05 bullet 4:
* `listRegisteredForEntity(entityId)` filters only photos where `complete == true && receipt != null`.
* Office reviewers never see placeholder corruption, partially uploaded chunks, or unacknowledged drafts.
* If a network interruption stalls upload at `staged` or `finalized`, the photo remains pending in the device outbox and is retryable/resumable via `resumeAll()`.

### 2.3 Server-Side StoredFile Deduplication
* `FieldPhotosRegistry` in `packages/native_adapter/src/field_photos.ts` indexes all registered media by 64-character SHA-256 lowercase hex digest.
* When two devices or two separate workflows attach identical image bytes, the server links the attachment to the existing `storedFileId` and returns receipt with `deduplicated: true`.

---

## 3. M00 Router-Inventory Writer Audit & Disposition

Per the M00 router inventory (`docs/reports/M00/inventory-routers.md`), photo and media writers are dispositioned as follows:

| Inventory Row | Source Router | Touched Models | Disposition | CDC / Feed Path | Flutter-Parity Path |
|---|---|---|---|---|---|
| **Row 25** | `field-photos.ts` | `FieldPhoto`, `StoredFile` | **Migrated Writer** | Atomic commit with `serverSeq` to sync feed table | Dispatches through `fieldPhotos.upload` outbox mutation envelope |
| **Row 26** | `field-submission.ts` | `FieldSubmission` | **Referenced In-Path** | Attachment IDs linked inside submission JSON | References verified via `inputReferences` adapter guard |
| **Row 44** | `material-grn.ts` | `MaterialReceipt` | **Referenced In-Path** | Delivery challan photos linked to MRR | Receipts referenced by receipt IDs |
| **Row 67** | `site-expense.ts` | `ExpenseAttachment` | **Referenced In-Path** | Petty cash bill photos linked to expense | Receipts referenced by receipt IDs |

---

## 4. Client Implementation

* **Component**: [`prototype/construction_client/lib/workflows/field_photo_pipeline.dart`](file:///Users/aakashdhakal/contractor/prototype/construction_client/lib/workflows/field_photo_pipeline.dart)
* **API**: `FieldWorkflowPhotoPort` / `FieldWorkflowPhotoService`
* **Features**:
  * Unified support across `FieldWorkflowMediaKind` (`dailyReport`, `siteExpenseReceipt`, `materialDeliveryReceipt`, `generalFieldPhoto`).
  * Direct binding to `AttachmentTransferManager`.
  * Real SHA-256 digest validation and byte quota enforcement ($\le 10\text{ MB}$).
  * JPEG and PNG magic byte validation.
  * Office display filtering ensuring only complete registered photos surface.

---

## 5. Automated Verification Results

### 5.1 Central Field Photos Registry & Dedup Tests (`packages/native_adapter/test/field_photos.test.ts`)
```text
✔ field photo registration: registers photo with durable receipt and preserves EXIF geotag metadata
✔ server-side StoredFile digest dedup: duplicate byte digests reuse the existing storedFileId
✔ office review visibility gate: incomplete or failed uploads are never displayed on office surfaces
✔ validation: invalid SHA-256 digest or exceeding byte quota (>10MB) rejects fail-closed
ℹ tests 4 | pass 4 | fail 0
native_adapter: contract, attendance, site expense, material delivery, and field photos tests PASSED (42 total tests passing)
```

### 5.2 Mount-Level Photo Pipeline Tests (`field_photo_pipeline_test.dart`)
```text
00:00 +0: stages, finalizes, and registers photo through the shared M03-T06 journal
00:00 +1: office review visibility: listRegisteredForEntity includes ONLY registered photos
00:00 +2: multiple expansion workflows share the same journal without per-workflow forks
00:00 +3: All tests passed!
```

### 5.3 Quality & Protocol Compliance
* Full Flutter test suite: **245 / 245 tests passing** (0 regressions).
* Flutter analyzer: **Clean, 0 errors, 0 warnings**.
* Protocol linter (`scripts/lint-protocol.mjs`): **All checks passed**.
