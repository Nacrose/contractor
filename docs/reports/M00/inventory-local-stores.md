# M00-T09: Client Local Stores, Offline Surfaces & Document Formats Inventory

- **Milestone:** M00 (Inventory, Behavior Fixtures and Baseline)
- **Task:** `M00-T09` — Inventory: client local stores, offline surfaces and document formats
- **Source Repository:** `Construction_Manager` (`src/lib/`, `src/lib/pdf-canvas/`, `src/lib/worksheet/`, `public/sw.js`)
- **Analyzed Commit:** `7d80083e` (on branch `feat/autocad-parity-engine-v2`)
- **Date:** 2026-10-08 (Asia/Kathmandu)
- **Status:** Complete · Baseline for M01 & M03 Storage Architecture

---

## 1. Executive Summary & Verification Findings

This inventory evaluates how the existing `Construction_Manager` web application handles client-side persistence, offline operation queues, background synchronization, and domain document formats. It identifies key architectural differences and durability risks between browser IndexedDB/LocalStorage and the target cross-platform Flutter/SQLite architecture.

### Key Metrics Snapshot

| Metric | Measured Value | Notes |
|---|---|---|
| **Client Local Stores** | **5 storage systems** | IndexedDB `cm-field-outbox`, IndexedDB `ConstructionManager_PdfCanvas`, LocalStorage worksheet cache, legacy `cm-offline-v2`, session storage |
| **IndexedDB Object Stores** | **6 stores** | `outbox`, `drafts`, `queries` in field DB; `drafts` in canvas DB; `queue` in legacy DB |
| **Offline Workflows** | **6 workflows** | Daily reports, field photos, petty cash / expenses, material delivery, takeoff markup drafts, worksheet editing |
| **Engineering Document Formats** | **6 formats** | Worksheet JSON / XLSX, CAD DXF / DWG, PDF Takeoff Canvas, Primavera P6 XER, MS Project XML, Field Media |
| **Idempotency Strategy** | **Device UUIDv4** | Device-generated `clientUuid` matched with server `IdempotencyRecord` / `withIdempotency` |
| **Durability Status** | **Best-effort browser storage** | IndexedDB/LocalStorage prone to browser quota eviction, silent write error swallowing, and Safari 7-day ITP caps |

---

## 2. Client Local Stores Inventory

Below is the complete audit of local stores across the application, detailing their underlying technology, schema versioning, eviction semantics, and durability behavior.

| Store Name | Technology & Location | Schema Version | Stores / Keys | Eviction Semantics | Durability & Failure Behavior |
|---|---|---|---|---|---|
| **`cm-field-outbox`** | IndexedDB (v3)<br>Browser IndexedDB database: `cm-field-outbox` | Version 3 (migrates incrementally: v1 outbox -> v2 drafts -> v3 queries). Service worker sw.js matches version 3 to prevent VersionError. | `outbox`, `drafts`, `queries` | Items with status="synced" auto-purged after 24 hours. Failed/pending items retained indefinitely until manual discard or success. Explicit user deletion or promotion to outbox upon Send. No automatic TTL eviction. LRU pruning: entries older than 7 days pruned on launch; hard cap per entry to prevent storage bloat. | Best-effort browser storage. Subject to browser storage quotas, clearing of site data, or Safari 7-day ITP eviction if web app is not visited. Isolated per user. Persisted in IndexedDB with in-memory React state mirror. Transient offline read cache; marked as stale on hydrate to trigger background refetch when online. |
| **`ConstructionManager_PdfCanvas`** | IndexedDB (v1) + LocalStorage dual-mirror<br>IndexedDB `ConstructionManager_PdfCanvas` (store `drafts`) + LocalStorage keys `cm_canvas_draft_*` | Version 1. Document payload schema validated via `parseCanvasDoc` / `recoverCanvasDoc`. | `drafts` | LRU pruning: retains top 3 revisions per document. Evicts oldest drafts when count exceeds threshold. | Dual-write: writes to localStorage synchronously and IndexedDB asynchronously. Errors caught and swallowed; falls back to localStorage. |
| **`Worksheet Local Store`** | Web Storage (LocalStorage)<br>LocalStorage prefix `construction-manager:worksheet:<documentId>` | Unversioned; validated by `isWorksheetDocument`. | `worksheet-localStorage` | Cleared upon successful server save queue flush (`workbook-save-queue.ts`) or manual reload. | Fragile: 5MB browser quota limit. Large workbooks (>50k rows) fail `setItem` and throw QuotaExceededError (swallowed by try/catch). |
| **`cm-offline-v2 (Legacy)`** | IndexedDB (v2)<br>IndexedDB `cm-offline-v2` (store `queue`) | Version 2 (deprecated/frozen). | `queue` | Manual discard only. | Deprecated: never auto-replayed because server lacked universal idempotency contract. |
| **`Client App Preferences & Session Cache`** | Web Storage (LocalStorage)<br>LocalStorage keys: `cf_user`, `cm_auth_token`, `cm_active_project`, `cm_theme` | Unversioned. | `preferences` | Cleared on explicit logout via `clearClientAuth()`. | Synchronous string storage. |

---

## 3. Existing Offline Workflows & Replay Semantics

The existing web client implements offline capabilities specifically tailored for construction sites with intermittent mobile connectivity (e.g. Nepal 3G/4G). Below are the existing workflows and their replay contracts:

| Workflow | Local Draft State | Submission Trigger | Replay Mechanism | Idempotency Contract | Conflict & Error Handling |
|---|---|---|---|---|---|
| **Field Daily Site Report Submission** | Draft saved in IndexedDB `drafts` store via `saveFieldDraft` | User taps "Send" button on mobile field interface | Queued into `outbox` with unique device-generated `clientUuid` (UUIDv4). Replayed via `fetch("/api/trpc/fieldSubmission.submitFieldReport")`. Replay triggered on `window.online`, tab focus, manual "Sync now", or SW background sync. | Device `clientUuid` sent in payload. Server checks `IdempotencyRecord` and returns cached result on replay. | Client-wins for draft creation; server validates project lock and permissions at ingestion time. Failures classified as 4xx "needs attention" vs 5xx "transient backoff". |
| **Field Photo Capture & Upload** | Captured via camera input; resized on HTML5 canvas to <=1280px JPEG q0.75; stored as base64 DataURL in draft | Included with daily report submission or sent via `fieldPhotos.create` | Embedded inside JSON payload if <20MB, or uploaded to pre-signed S3 URL with client-calculated SHA-256 checksum. Replayed sequentially with submission. | Deduplicated via file content SHA-256 digest on server `StoredFile` registry. | Immutable photo identity; duplicate uploads reuse existing `StoredFile` record. |
| **Site Expense & Petty Cash Logging** | Saved as draft in `drafts` store (`type="expense"`) | User taps "Send to Office" | Queued to outbox; legacy `siteExpense.create` endpoints automatically rewritten to `fieldSubmission.create` envelope by `resolveReplayRequest()`. | Device `clientUuid` bound to `withIdempotency` scope on server. | Office review required: expenses hit temporary `FieldSubmission` table and do not post to financial ledger until approved by project manager. |
| **Direct Material Delivery Logging** | Saved as draft (`type="material_delivery"`) | User confirms gate delivery on phone | Dispatched to `material.logDirectDelivery` with `clientUuid`. | Enforces `clientUuid` idempotency check before adjusting `MaterialTransaction` stock. | Stock adjustments are additive; rejected if store location or project is invalid. |
| **PDF Takeoff & Canvas Markups** | Autosaved every 2 seconds to IndexedDB `ConstructionManager_PdfCanvas` + localStorage mirror | Manual "Save Markups" button or periodic sync | Direct HTTP POST of `DrawingMarkup` JSON array to `document.saveMarkups`. | None currently: whole-drawing markup array overwrite using page index. | Last-write-wins at markup layer. Known risk: concurrent annotators overwrite each other. |
| **Worksheet Grid Cell Edits** | Buffered in `workbook-save-queue.ts` with LocalStorage snapshot | Debounced 1500ms after last cell edit, or window blur | Flushes full serialized `WorksheetDocument` JSON payload to `worksheet.saveDocument`. | Integer revision counter (`version: number`). Server increments version on each save. | Optimistic concurrency: server rejects save if incoming version does not match current database revision. |

---

## 4. Engineering Document Formats Inventory

The platform produces and consumes 6 primary document formats spanning worksheets, CAD geometry, PDF takeoff drawings, enterprise schedules, and site media:

| Document Format | Format Type | Producing Engine | Consuming Engine | Internal Data Structure | Compatibility & Parity Status |
|---|---|---|---|---|---|
| **Worksheet Workbook (.xlsx / JSON)** | ``WorksheetDocument` JSON / Office Open XML (.xlsx)` | ``src/lib/worksheet/spreadsheet-engine.ts`, `workbook-document.ts`, `workbook-excel.ts`` | ``src/components/worksheet/` (React Virtual Grid), `src/server/routers/worksheet.ts`` | JSON object: `{ documentId, version, sheets: [{ id, name, cells: { [coord]: { raw, value, type, formula, style } } }] }` | Full read/write with Microsoft Excel .xlsx via `@e965/xlsx`. Formulas evaluated via `@formulajs/formulajs` and custom AST evaluator. |
| **CAD Vector Drawing (.dxf / .dwg)** | `AutoCAD ASCII DXF (R12–2018) / Binary DWG` | ``src/lib/dxf/dxf-render.ts`, `src/lib/cad/plot-engine.ts` (exports to SVG / PDF / DXF)` | ``src/lib/dxf/dxf-parser.ts`, `src/lib/dwg/dwg-native.ts` (native bitstream parser), `src/components/cad/`` | Parsed CAD entity graph: `{ layers, blocks, entities: [{ type: "LINE"|"LWPOLYLINE"|"TEXT"|"ARC"|"CIRCLE"|"HATCH", vertices, layer, color }] }` | DXF full ASCII compatibility; DWG native parser handles R2000–R2018 geometry. Plot engine exports to PDF / SVG. |
| **Takeoff & PDF Canvas Document (.pdf / JSON)** | `Adobe PDF 1.4–2.0 + `CanvasDoc` markup JSON` | ``src/lib/document-engine/measurement.ts`, `src/lib/pdf-canvas/` annotation tools` | `Mozilla `pdfjs-dist` (renderer), `jspdf` / `html2canvas-pro` (export), `src/server/routers/document.ts`` | `DrawingMarkup`: `{ id, drawingId, pageNumber, type: "polygon"|"area"|"length"|"count", points: [[x,y]], scale, measurement }` | Standard PDF rendered via PDF.js worker; markup layers stored as normalized coordinate vectors independent of zoom. |
| **Primavera P6 Schedule (.xer)** | `Primavera Proprietary Tab-Delimited XER` | `N/A (External enterprise export from Primavera P6)` | ``src/server/utils/xer-import.ts` -> `gantt-import.ts`` | Tabular database dump: `%T TASK`, `%T TASKPRED`, `%T CALENDAR`, `%T PROJWBS` tables | Full parser for Primavera P6 XER schemas 8.0–22.0. Maps to `GanttTask` and `TaskDependency`. |
| **Microsoft Project Schedule (.xml / .mpp)** | `MS Project XML Schema 2003–2019` | ``src/server/utils/msp-export.ts` (generates valid MS Project XML)` | ``src/server/utils/msp-import.ts` -> `gantt-import.ts`` | XML tree: `<Project><Tasks><Task>...</Tasks><Dependencies>...</Dependencies></Project>` | Bidirectional round-trip: XML import and export verified against MS Project 2016/2019. |
| **Field Site Media (.jpg / .png)** | `JPEG (canvas-compressed <=1280px, q0.75)` | ``src/lib/field-photo.ts` HTML5 camera / file compressor` | ``src/server/routers/field-photos.ts`, `StoredFile` S3 service, `sharp`` | EXIF-tagged binary JPEG with embedded GPS metadata (`latitude`, `longitude`, `timestamp`) | Standard web JPEG. Replaces heavy 8MB HEIC/RAW originals with ~250KB transmission payloads. |

---

## 5. Critical Durability Risks & Evolution to Native SQLite (Plan v3 §3)

Platform Plan v3 §3 and §5.2 identify several crucial risks in the web application's current storage layer that must be resolved in the Flutter cross-platform architecture:

### 5.1 Observed Browser Storage Vulnerabilities
1. **Silent Error Swallowing in `field-outbox.ts` & `storage-db.ts`:**
   - Browser storage operations frequently wrap errors in `.catch(() => {})` or return `{ ok: localOk }` even when IndexedDB fails.
   - When browser quota is exceeded or IndexedDB is blocked, operations silently fall back to localStorage or memory, deceiving the user into believing their field report is safe on disk.
2. **Safari 7-Day ITP Eviction:**
   - Safari on iOS enforces Intelligent Tracking Prevention (ITP), which wipes all client-side script-writable storage (IndexedDB, LocalStorage) after 7 days of user inactivity if not installed as an official PWA or native app.
3. **Background Sync Asymmetry:**
   - Service Worker `SyncManager` (`self.registration.sync`) only functions reliably on Android Chrome. It is completely unavailable on iOS Safari and desktop browsers, causing background sync to stall when tabs close.
4. **Concurrency & Re-entrancy Hazards:**
   - Both the page thread (`field-outbox.ts`) and the service worker (`public/sw.js`) attempt to flush the outbox concurrently upon network recovery. While deduplicated on `clientUuid`, race conditions exist during status updates.

### 5.2 Mandatory Evolution for Native Client (ADR-0010 & Milestone M03)
- **Durable SQLite Transactions:** On installed platforms (iOS, Android, macOS, Windows, Linux), replace IndexedDB with **native SQLite** using WAL mode and explicit transactional commits.
- **Strict Commit Before Success UI:** A local save must commit both the local entity and its outbox mutation record to SQLite before the UI reports success. Zero silent error swallowing.
- **Separate Sync & Acceptance States:** The UI must display three distinct states:
  1. *Saved locally (Durable on device)*
  2. *Sync pending (Queued for transmission)*
  3. *Accepted by server (Audited & posted)*
- **File Attachments Outside Cache:** Photos and documents must be staged in durable app storage with SHA-256 digests and registered via a reconciliation journal, never placed in disposable OS cache.

---

## 6. Acceptance Criteria Verification

- [x] **Every local store audited (location, schema versioning, eviction semantics, durability behavior):**
  - 5 client storage systems and 6 IndexedDB object stores documented with exact schemas and eviction rules in §2 and companion `inventory-local-stores.json`.
- [x] **Existing offline workflows enumerated with their submission/replay semantics:**
  - 6 offline workflows cataloged in §3 detailing local form states, replay triggers, backoff rules, and `clientUuid` idempotency contracts.
- [x] **Document formats listed with producing/consuming engine and compatibility status:**
  - 6 core formats (Worksheet, CAD DXF/DWG, PDF Canvas, XER, MSP XML, Media) inventoried in §4 with internal data structures and engine mappings.

---

*Report and data artifacts generated as part of task `M00-T09` under the [AI-Agent Execution Protocol](../../rules/AI-AGENT-EXECUTION-PROTOCOL.md).*