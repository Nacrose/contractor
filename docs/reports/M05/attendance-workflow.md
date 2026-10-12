# M05-T02: Attendance Submissions — Central Deduplication, Server-Authoritative Sequencing, and Workflow UI

- **Milestone:** M05 (Field Workflow Expansion)
- **Task:** `M05-T02` — Attendance submissions (duplicate rules central; server-authoritative time and sequence)
- **Dependencies:** `M05-T01` (Expansion substrate)
- **Date:** 2026-10-11
- **Status:** Complete · All acceptance criteria verified

---

## 1. Executive Summary

`M05-T02` implements the field attendance submission workflow across native and web, establishing:
1. **One Central Deduplication Rule**: Tested central convergence logic (`packages/native_adapter/src/attendance.ts`) enforcing `(projectId, attendanceDate, staffId)` uniqueness across devices.
2. **Server-Authoritative Time & Sequencing**: Ingestion order derives strictly from `serverSeq` and server commit timestamps; device clock skew cannot alter sequence or backdate authority.
3. **Approval Distinctness**: Client submissions land in the `"submitted"` state; field self-approval is forbidden and rejected at the boundary; office approvals remain a separate server action requiring manager role.
4. **Attendance Workflow UI**: A complete Flutter client workflow (`AttendanceScreen`) with crew rosters, status chips (Present, Half Day, Absent, Leave), real-time KPI recalculation, local persistence, outbox queueing, and central sync health binding.

---

## 2. Central Deduplication & Convergence Invariants

### 2.1 The Single Convergence Rule
Rather than relying on client-side state checks, attendance convergence is enforced centrally via `resolveAttendanceConvergence()`:

* **Uniqueness Key**: Composite key `(projectId:attendanceDate:staffId)`.
* **Convergence Behavior**:
  * If two devices submit attendance for the same worker on the same date (e.g. Device A sets 8h regular, Device B sets 8h regular + 2h OT):
    * The server assigns strictly ascending sequence numbers (`serverSeq: 501`, then `serverSeq: 502`).
    * The second submission updates the canonical worker line deterministically.
    * **Zero Duplicate Rows**: Exactly 1 active record exists per worker-date; zero duplicate payroll hours.
  * Within a single submission payload, duplicate entries for the same `staffId` are normalized deterministically (latest edit preserved).

### 2.2 Invariance to Device Clock Skew
* Device field capture timestamps (`deviceCapturedAt`) are stored solely for audit provenance.
* A device with a skewed clock (e.g. set 50 years in the future or 20 years in the past) **cannot** reorder feed events or forge authority. Posting sequence and change-feed commits are strictly ordered by `serverSeq` and server ingestion time.

### 2.3 Approval Boundary & Self-Approval Prevention
* Attendance submissions cannot assert `submittedStatus: 'approved'`. Attempting to do so triggers an immediate validation rejection.
* Once a record is marked `"approved"` by a manager via `approveAttendanceRecords()`, subsequent field submissions cannot overwrite it without explicit manager action.

---

## 3. M00 Router-Inventory Writer Audit & Disposition

Per the M00 router inventory (`docs/reports/M00/inventory-routers.md`), attendance-related writes are dispositioned as follows:

| Inventory Row | Source Router | Touched Models | Disposition | CDC / Feed Path | Flutter-Parity Path |
|---|---|---|---|---|---|
| **Row 43** | `leave.ts` | `LeaveRequest`, `LeaveBalance`, `StaffAttendance` | **Office Retained** | Emits CDC feed event on leave approval / manual HR edit | Office HR web views; native client reads balance via snapshot bootstrap (M03-T05) |
| **Row 39** | `hr.ts` | `Person`, `ProjectStaffAssignment`, `Position` | **Office Retained** | Staff roster updates emit change-feed entries | Project member & staff roster syncs via change-feed pull (M03-T04) |
| **Row 26** | `field-submission.ts` | `FieldSubmission` | **Migrated Writer** | Atomic commit with `serverSeq` to sync feed table | Dispatches through `attendance.record` outbox mutation envelope |

No silent or un-audited attendance writers exist in the codebase.

---

## 4. Client Screen Implementation

* **Component**: [`prototype/construction_client/lib/workflows/attendance_screen.dart`](file:///Users/aakashdhakal/contractor/prototype/construction_client/lib/workflows/attendance_screen.dart)
* **Capabilities**:
  * Project selector, ISO date picker (`YYYY-MM-DD`), and shift name.
  * Worker roster with trade labels and quick status chips:
    * **Present** (8.0 reg hours)
    * **Half Day** (4.0 reg hours)
    * **Absent** (0.0 reg hours)
    * **Leave** (0.0 reg hours)
  * Overtime hours stepper and per-worker task notes.
  * Real-time KPI summary bar: Crew count, Present count, Total Regular Hours, Total Overtime Hours.
  * Atomic local save into `attendance_local` + `pending_op`.
  * Manual sync trigger dispatching through the shared orchestrator.
  * Saved submissions list with reload and recovery copy support.

---

## 5. Automated Verification Results

### 5.1 Central Rules & Convergence Tests (`packages/native_adapter/test/attendance.test.ts`)
```text
✔ central rule: duplicate worker lines within single submission are deduplicated
✔ central rule: two devices submitting same worker converge deterministically with 0 duplicates
✔ server-authoritative time: device clock skew cannot reorder or forge posting sequence
✔ approval distinctness: client self-approval is forbidden
✔ approval distinctness: office approval preserves integrity against field overwrites
ℹ tests 5 | pass 5 | fail 0
native_adapter: contract and attendance tests PASSED (28 total tests passing)
```

### 5.2 Attendance Screen Widget Tests (`attendance_screen_test.dart`)
```text
00:00 +0: renders attendance screen with header, workers roster, and KPI bar
00:00 +1: toggling attendance status chips updates hours and KPI in real-time
00:01 +2: saving attendance commits locally and creates pending outbox op
00:01 +3: adding a worker to roster expands the list and recalculates KPI
00:01 +4: All tests passed!
```

### 5.3 Quality & Protocol Compliance
* Full Flutter test suite: **233 / 233 tests passing** (0 regressions).
* Flutter analyzer: **Clean, 0 errors, 0 warnings**.
* Protocol linter (`scripts/lint-protocol.mjs`): **Passed** (13 milestone files, 132 tasks).
