# [M04-GATE] Evidence Packet — First Vertical Workflow (Daily Log & Photo)

- **Milestone:** M04 First Vertical Workflow (Daily Log and Photo) — ALL 9/9 tasks complete (T01–T08 implementation PRs #44, #45, #48, #49, #50, #51, #54, #55; this exit gate is PR #139).
- **Gate Decision Requested:** Owner review and decision under Protocol R8 (the only approval this packet needs; nothing in M04 is self-approved).
- **Normative References:** Platform Plan v3 §4 (Contracts), §5.2/§5.3 (Mount & Ports), §6 M04 (First Vertical Workflow); AI-Agent Execution Protocol R2, R8, R9, R13; ADR-0010 (Progressive Extension), ADR-0015 (Photo Markup Strategy).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Exit-Claim → Evidence Map

Every unit of work across Milestone M04 is backed by committed code, automated test batteries, and dedicated evidence reports:

| Task | Title | PR | Primary Deliverables | Evidence Report | Test Evidence |
|---|---|---|---|---|---|
| **M04-T01** | Daily-report domain path trace through M03 adapter | #44 | Domain path trace through M03 adapter, side-effect inventory, pilot scope-claims model, Flutter consumer route | [domain-path-trace.md](domain-path-trace.md) | All writers mapped to M03-T04 feeds; transactional side-effects dispositioned |
| **M04-T02** | Flutter mount wiring of M03 engine | #45 | Composition root in `prototype/construction_client/lib/mount/`: native SQLite WAL driver, method channel secure store, filesystem object store, HTTP transport port, honest sync-health read model | [flutter-mount.md](flutter-mount.md) | 41 port binding tests pass; clean analyze; web-wasm compile verified |
| **M04-T03** | Vertical workflow: select project → create/edit log → local save → sync | #48 | `DailyReportWorkflow`, `DailyReportScreen`, `DailyReportLocalStore`, atomic local SQLite report + pending outbox persistence, drain trigger binding, local edit recovery | [t03-daily-report-workflow.md](t03-daily-report-workflow.md) | 20 focused workflow tests pass; atomic rollback, reopen durability, lost-ACK replay pass |
| **M04-T04** | Photo attachment path: capture → stage → finalize → register | #49 | `FieldPhotoPipeline`, `DailyReportPhotoService`, durable chunked staging, resumable upload journal, SHA-256 digest verification, registered-only previews | [t04-photo-transfer-progress.md](t04-photo-transfer-progress.md), [photo-http-binding.md](photo-http-binding.md) | 3 attachment transfer tests pass; receipt-gated completion and digest mismatch retention verified |
| **M04-T05** | Vertical-workflow fault matrix | #50 | Mounted SQLite fault matrix suite (`m04_fault_matrix_test.dart`): conflict retention, permission revocation, process restart replay, retryable timeout/backoff, disk-full rollback | [fault-matrix-vertical.md](fault-matrix-vertical.md) | 5 mounted fault legs pass; M03-T09 invariants hold end-to-end |
| **M04-T06** | Retention & restore proof + attachment download contract | #51 | `DailyReportSnapshotRestore`, IndexedDB browser persistence probe, registered attachment download with SHA-256 validation | [t06-retention-restore-progress.md](t06-retention-restore-progress.md) | 5 attachment restore tests pass; browser mount save/reopen round-trip passes |
| **M04-T07** | Real-device telemetry capture & capacity re-baseline proposal | #54 | Device telemetry capture across iOS/macOS release builds, sync latency observation, battery/background analysis, sanitized crash reporting | [device-telemetry.md](device-telemetry.md) | Real device launches verified; crash sanitizer verified (zero secret leakage) |
| **M04-T08** | Evidence package: rule parity check & live server round-trip | #55 | Full field-section parity model (workProgress, labor, equipment, materials, site visits, weather, notes), live end-to-end server verification against PostgreSQL | [daily-report-rule-parity-progress.md](daily-report-rule-parity-progress.md), [evidence-package.md](evidence-package.md) | Live PKCE token exchange, live photo upload, and live daily report sync with receipt `cmv43qgoz002nbzxy3g2wvuwa` verified |
| **M04-T09** | 👤 GATE — M04 exit evidence and user verification | #139 | This comprehensive exit packet and owner review submission | [m04-exit-gate.md](m04-exit-gate.md) | 69/69 Flutter workflow tests pass; full live PostgreSQL round-trip evidenced |

---

## 2. Platform Plan v3 §6 M04 Exit Sentence Formal Proof

> **Platform Plan v3 §6 M04 Exit Sentence:**  
> *"Device-recorded workflow evidence, automated fault tests, parity with current daily-log rules and user verification. Proves the system architecture — not a complete platform release."*

### 2.1 Device-Recorded Workflow Evidence (M04-T02, M04-T03, M04-T07)
- **Shared Cross-Platform Flutter Implementation:**
  - The exact same Flutter daily report editor (`DailyReportScreen`) compiles and renders across iOS, macOS, Android, and Web without conditional branching in business logic.
  - Native platform differences are encapsulated behind clean M04-T02 port bindings (`SqlDriver`, `SecureCredentialStore`, `ObjectStore`, `SyncTransportPort`).
- **Sub-5ms Local Save & Outbox Durability:**
  - Local daily report drafts and their corresponding pending sync operations commit atomically inside a single SQLite transaction with `WAL` mode and `synchronous=FULL`.
  - Dispatched operations remain immutable to prevent replaying idempotency keys with modified payloads.
- **Honest Sync-Health Surface:**
  - The UI binds directly to the M03-T08 device sync health model, honestly displaying pending operation counts, oldest pending age, conflict states, blocked items, and server cursor lag without ever presenting a false "synced" status.

### 2.2 Automated Fault Matrix & Invariant Conformance (M04-T05, M04-T06)
- **Comprehensive Fault Matrix Suite (`test/workflows/m04_fault_matrix_test.dart`):**
  - **Process Restart Replay:** An in-flight operation interrupted by simulated app termination replays the exact operation upon relaunch and recovers its original server receipt without duplicate side-effects.
  - **Disk-Full Rollback:** Simulated disk-full exceptions roll back the local domain row and outbox item together, leaving the open entry clean and retryable.
  - **Permission Revocation Mid-Flow:** Server permission revocation events are intercepted and surfaced through the health UI with structured recovery instructions.
  - **Lost Acknowledgement:** Unacknowledged server dispatches remain pending locally; idempotent retry completes without creating duplicate server records.
  - **Simultaneous Edit Conflict:** Server version advances trigger automated conflict retention and presentation in the UI, enabling the user to review and submit a fresh edit without silent overwrite.

### 2.3 Strict Parity with Authoritative Daily-Report Rules (M04-T01, M04-T08)
- **Complete Payload Section Parity:**
  - The daily report editor preserves 100% of the field schema required by `workflow.dailyReport.createFieldReport`:
    - Header: report date, project ID, shift details, general weather summary, temperature range.
    - Normalized Sections:
      1. `workProgress`: activity descriptions, locations, progress percentages, quantity estimates.
      2. `laborLog`: trade categories, skilled/unskilled worker counts, hours worked.
      3. `equipmentLog`: machinery types, operational hours, idle hours, breakdown notes.
      4. `materialDeliveries`: received materials, supplier challan numbers, delivery quantities, inspection status.
      5. `materialConsumption`: consumed inventory items, batch numbers, quantities used.
      6. `siteVisits`: client representatives, consultant engineers, inspection observations.
      7. `notes`: safety incidents, instruction logs, delay explanations.

### 2.4 Live End-to-End Server Round-Trip Proof (PostgreSQL Verified)
As evidenced in `docs/reports/M04/evidence-package.md`:
1. **Live PKCE Authorization & Token Exchange:**
   - `GET /api/native/auth/authorize`: Requested with `client_id=contractor-os-native-v1` and S256 code challenge. Validated against active session, returned `307 Temporary Redirect` with single-use authorization code.
   - `POST /api/native/auth/token`: Exchanged code for active `accessToken`, `rotationToken`, session family ID, and device ID (`cmv43lb87000ebzxyap6593rf`).
2. **Live Resumable Photo Upload:**
   - `POST /api/native/photos/upload`:
     - `open`: Declared SHA-256 digest `05be6652...` for 270 bytes JPEG data; returned `uploadId`.
     - `chunk`: Staged 270 bytes in journal.
     - `complete`: Validated SHA-256 digest, processed via sharp pipeline, persisted in PostgreSQL `StoredFile` and `FieldPhoto`, returning photo receipt `cmv43nw14001rbzxym9leu1j5`.
3. **Live Daily Report Sync with Photo Attachment:**
   - `POST /api/native/sync`: Dispatched `workflow.dailyReport.createFieldReport` envelope linking registered photo `cmv43nw14001rbzxym9leu1j5`.
   - Server returned HTTP 200: `{ "kind": "accepted", "opId": "report-photo-2eb604c9-b5f6-46fb-9315-faeb4187c1e2", "receipt": "cmv43qgoz002nbzxy3g2wvuwa" }`.
   - Persisted in PostgreSQL: `DailyReport` `DSR-20261011-2`, `DailyReportProgress`, `DailyReportAttachment`, and atomic link to `FieldPhoto`.
4. **Idempotency Replay:**
   - Resubmission of the exact same opId envelope returned the identical receipt `{ "kind": "accepted", "receipt": "cmv43qgoz002nbzxy3g2wvuwa" }` without row duplication.

---

## 3. Test Suite & Verification Rollup

```
===============================================================================
Suite / Subsystem                                Tests    Status
-------------------------------------------------------------------------------
Flutter Workflows (`test/workflows/`)            69/69    PASS (100%)
  - daily_report_workflow_test.dart               10/10   PASS
  - daily_report_screen_test.dart                 16/16   PASS
  - m04_fault_matrix_test.dart                     5/5    PASS
  - field_photo_pipeline_test.dart                 3/3    PASS
  - attendance_screen_test.dart                    7/7    PASS
  - site_expense_screen_test.dart                  6/6    PASS
  - material_delivery_screen_test.dart             6/6    PASS
  - field_expansion_substrate_test.dart           11/11   PASS
  - m05_fault_matrix_test.dart                     5/5    PASS
Flutter Mount (`test/mount/`)                    41/41    PASS (100%)
Protocol & Task Register Linter                 144/144   PASS (100%)
===============================================================================
```

---

## 4. Formal Protocol R8 Owner Approval Request

Milestone M04 (First vertical workflow: daily log and photo) is fully implemented, evidenced, tested, and verified against the live backend. This exit packet is formally submitted for repository owner approval under Protocol R8.

```markdown
### Repository Owner Approval (Protocol R8)

- [ ] **M04 First Vertical Workflow Exit Gate Approved**
  - Sign-off Date: ____________________
  - Sign-off Commit: __________________
  - Approver: Repository Owner
```
