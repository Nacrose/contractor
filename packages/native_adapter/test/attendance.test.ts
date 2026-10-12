import test from "node:test";
import assert from "node:assert/strict";
import {
  AttendanceSubmissionPayload,
  approveAttendanceRecords,
  deduplicateSubmissionLines,
  resolveAttendanceConvergence,
} from "../src/attendance.js";

test("central rule: duplicate worker lines within single submission are deduplicated", () => {
  const lines = [
    { staffId: "staff-1", staffName: "Ramesh", trade: "Mason", status: "present" as const, regularHours: 8, overtimeHours: 0 },
    { staffId: "staff-2", staffName: "Sita", trade: "Carpenter", status: "present" as const, regularHours: 8, overtimeHours: 0 },
    { staffId: "staff-1", staffName: "Ramesh", trade: "Mason", status: "present" as const, regularHours: 8, overtimeHours: 2 }, // duplicate line
  ];

  const deduped = deduplicateSubmissionLines(lines);
  assert.equal(deduped.length, 2);
  const ramesh = deduped.find((l) => l.staffId === "staff-1")!;
  assert.equal(ramesh.overtimeHours, 2); // keeps latest deterministic edit
});

test("central rule: two devices submitting same worker converge deterministically with 0 duplicates", () => {
  const submissionDeviceA: AttendanceSubmissionPayload = {
    clientUuid: "device-a-uuid-001",
    projectId: "proj-100",
    attendanceDate: "2026-10-12",
    records: [
      { staffId: "worker-1", staffName: "Bikash", trade: "Welder", status: "present", regularHours: 8, overtimeHours: 0 },
    ],
  };

  const submissionDeviceB: AttendanceSubmissionPayload = {
    clientUuid: "device-b-uuid-002",
    projectId: "proj-100",
    attendanceDate: "2026-10-12",
    records: [
      { staffId: "worker-1", staffName: "Bikash", trade: "Welder", status: "present", regularHours: 8, overtimeHours: 3 },
      { staffId: "worker-2", staffName: "Hari", trade: "Painter", status: "present", regularHours: 8, overtimeHours: 0 },
    ],
  };

  // Step 1: Device A arrives first at server (serverSeq: 501)
  const result1 = resolveAttendanceConvergence({
    existingRecords: [],
    incoming: submissionDeviceA,
    serverSeq: 501,
    serverReceivedAt: "2026-10-12T08:00:00.000Z",
    actorId: "supervisor-1",
  });

  assert.equal(result1.records.length, 1);
  assert.equal(result1.records[0].staffId, "worker-1");
  assert.equal(result1.records[0].overtimeHours, 0);

  // Step 2: Device B arrives later at server (serverSeq: 502)
  const result2 = resolveAttendanceConvergence({
    existingRecords: result1.records,
    incoming: submissionDeviceB,
    serverSeq: 502,
    serverReceivedAt: "2026-10-12T08:15:00.000Z",
    actorId: "supervisor-2",
  });

  // Must converge to exactly 2 worker records — ZERO duplicate entries for worker-1!
  assert.equal(result2.records.length, 2);
  assert.equal(result2.mergedCount, 1); // 1 record merged/updated
  const worker1 = result2.records.find((r) => r.staffId === "worker-1")!;
  assert.equal(worker1.overtimeHours, 3);
  assert.equal(worker1.serverSeq, 502);
});

test("server-authoritative time: device clock skew cannot reorder or forge posting sequence", () => {
  const skewedDeviceInFuture: AttendanceSubmissionPayload = {
    clientUuid: "skewed-future-001",
    projectId: "proj-100",
    attendanceDate: "2026-10-12",
    deviceCapturedAt: "2099-01-01T00:00:00.000Z", // 50+ years in future
    records: [
      { staffId: "worker-1", staffName: "Bikash", trade: "Welder", status: "present", regularHours: 8, overtimeHours: 0 },
    ],
  };

  const validDeviceNow: AttendanceSubmissionPayload = {
    clientUuid: "valid-now-002",
    projectId: "proj-100",
    attendanceDate: "2026-10-12",
    deviceCapturedAt: "2026-10-12T08:05:00.000Z",
    records: [
      { staffId: "worker-1", staffName: "Bikash", trade: "Welder", status: "half_day", regularHours: 4, overtimeHours: 0 },
    ],
  };

  // Even though device 1 claims it was captured in 2099, server ingested it at 08:00 (seq 10)
  const r1 = resolveAttendanceConvergence({
    existingRecords: [],
    incoming: skewedDeviceInFuture,
    serverSeq: 10,
    serverReceivedAt: "2026-10-12T08:00:00.000Z",
    actorId: "user-1",
  });

  // Device 2 is received by server later at 08:05 (seq 11)
  const r2 = resolveAttendanceConvergence({
    existingRecords: r1.records,
    incoming: validDeviceNow,
    serverSeq: 11,
    serverReceivedAt: "2026-10-12T08:05:00.000Z",
    actorId: "user-2",
  });

  // Server sequence 11 wins; clock skew in device 1 had zero effect on authoritative ordering
  const w1 = r2.records.find((r) => r.staffId === "worker-1")!;
  assert.equal(w1.serverSeq, 11);
  assert.equal(w1.status, "half_day");
  assert.equal(w1.regularHours, 4);
});

test("approval distinctness: client self-approval is forbidden", () => {
  const selfApprovePayload: AttendanceSubmissionPayload = {
    clientUuid: "self-approve-001",
    projectId: "proj-100",
    attendanceDate: "2026-10-12",
    submittedStatus: "approved", // Forbidden
    records: [
      { staffId: "worker-1", staffName: "Bikash", trade: "Welder", status: "present", regularHours: 8, overtimeHours: 0 },
    ],
  };

  assert.throws(
    () =>
      resolveAttendanceConvergence({
        existingRecords: [],
        incoming: selfApprovePayload,
        serverSeq: 1,
        serverReceivedAt: "2026-10-12T08:00:00Z",
        actorId: "field-sup",
      }),
    /Self-approval forbidden/,
  );
});

test("approval distinctness: office approval preserves integrity against field overwrites", () => {
  const initialSubmission: AttendanceSubmissionPayload = {
    clientUuid: "sub-001",
    projectId: "proj-100",
    attendanceDate: "2026-10-12",
    records: [
      { staffId: "worker-1", staffName: "Bikash", trade: "Welder", status: "present", regularHours: 8, overtimeHours: 0 },
    ],
  };

  const initial = resolveAttendanceConvergence({
    existingRecords: [],
    incoming: initialSubmission,
    serverSeq: 1,
    serverReceivedAt: "2026-10-12T08:00:00Z",
    actorId: "field-sup",
  });

  // Non-manager cannot approve
  assert.throws(
    () =>
      approveAttendanceRecords({
        records: initial.records,
        staffIdsToApprove: ["worker-1"],
        approverId: "field-sup",
        approverRole: "field_supervisor",
        serverTimestamp: "2026-10-12T10:00:00Z",
      }),
    /Permission denied/,
  );

  // Manager approves
  const approved = approveAttendanceRecords({
    records: initial.records,
    staffIdsToApprove: ["worker-1"],
    approverId: "pm-1",
    approverRole: "manager",
    serverTimestamp: "2026-10-12T10:00:00Z",
  });

  assert.equal(approved[0].approvalState, "approved");
  assert.equal(approved[0].approvedBy, "pm-1");

  // Subsequent field edit attempt is rejected because record is already approved
  assert.throws(
    () =>
      resolveAttendanceConvergence({
        existingRecords: approved,
        incoming: {
          clientUuid: "sub-002",
          projectId: "proj-100",
          attendanceDate: "2026-10-12",
          records: [
            { staffId: "worker-1", staffName: "Bikash", trade: "Welder", status: "absent", regularHours: 0, overtimeHours: 0 },
          ],
        },
        serverSeq: 2,
        serverReceivedAt: "2026-10-12T11:00:00Z",
        actorId: "field-sup",
      }),
    /Cannot overwrite approved attendance/,
  );
});
