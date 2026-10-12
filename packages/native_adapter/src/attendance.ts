/**
 * Central Attendance Rules & Deduplication Engine (M05-T02).
 *
 * Implements the normative central duplicate rules, server-authoritative
 * sequencing, and distinct approval boundaries for attendance submissions.
 *
 * Requirements (platform plan v3 §6 M05 bullet 3):
 *  - Duplicate attendance is prevented by ONE central rule (single definition,
 *    tested) — not per-client validation.
 *  - Two devices submitting the same attendance converge deterministically with
 *    zero duplicate payroll hours.
 *  - Posting sequence and approval order derive strictly from server-received
 *    order (commit-order feed seq / server timestamps); device clock skew cannot
 *    reorder, forge sequence, or backdate authority.
 *  - Approval remains a distinct server-side action; field clients cannot
 *    self-approve.
 */

export interface AttendanceRecordLine {
  staffId: string;
  staffName: string;
  trade: string;
  status: "present" | "absent" | "half_day" | "leave";
  regularHours: number;
  overtimeHours: number;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
}

export interface AttendanceSubmissionPayload {
  clientUuid: string;
  projectId: string;
  attendanceDate: string; // YYYY-MM-DD
  shiftName?: string;
  records: AttendanceRecordLine[];
  supervisorRemarks?: string;
  deviceCapturedAt?: string; // Informational only; NEVER authoritative for sequencing
  submittedStatus?: "submitted" | "approved"; // If client asserts "approved", central validator rejects
}

export interface CanonicalAttendanceRecord {
  id: string;
  projectId: string;
  attendanceDate: string;
  staffId: string;
  staffName: string;
  trade: string;
  status: "present" | "absent" | "half_day" | "leave";
  regularHours: number;
  overtimeHours: number;
  shiftName: string;
  notes: string;
  submissionClientUuid: string;
  serverSeq: number;
  serverReceivedAt: string;
  approvalState: "submitted" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: string;
}

export interface ConvergenceResult {
  records: CanonicalAttendanceRecord[];
  mergedCount: number;
  updatedStaffIds: string[];
}

/**
 * Deduplicates multiple lines for the same worker within a single submission.
 * Deterministic rule: the last occurrence for a given staffId within the
 * submission payload is preserved.
 */
export function deduplicateSubmissionLines(lines: AttendanceRecordLine[]): AttendanceRecordLine[] {
  const byStaff = new Map<string, AttendanceRecordLine>();
  for (const line of lines) {
    if (!line.staffId || line.staffId.trim() === "") continue;
    // Bounded hours validation per central rule
    const regularHours = Math.max(0, Math.min(24, line.regularHours ?? 8));
    const overtimeHours = Math.max(0, Math.min(24, line.overtimeHours ?? 0));
    byStaff.set(line.staffId, {
      ...line,
      regularHours,
      overtimeHours,
    });
  }
  return Array.from(byStaff.values());
}

/**
 * Evaluates deterministic convergence across multiple submissions for the same
 * (projectId, attendanceDate).
 *
 * Rules:
 *  1. Unique composite key: (projectId, attendanceDate, staffId).
 *  2. Server sequence is strictly authoritative: serverSeq and serverReceivedAt
 *     govern the ordering; client deviceCapturedAt cannot alter sequence or reorder.
 *  3. Convergence: If a record already exists for (projectId, attendanceDate, staffId),
 *     the later serverSeq updates the existing line rather than inserting a duplicate.
 *  4. Approval preservation: If an existing line is already "approved" by office,
 *     a field update cannot overwrite it without explicit rejection/reset by manager.
 *  5. Zero self-approval: Client submissions always land in "submitted" state.
 */
export function resolveAttendanceConvergence(args: {
  existingRecords: CanonicalAttendanceRecord[];
  incoming: AttendanceSubmissionPayload;
  serverSeq: number;
  serverReceivedAt: string;
  actorId: string;
}): ConvergenceResult {
  const { existingRecords, incoming, serverSeq, serverReceivedAt } = args;

  // 1. Verify client is not attempting self-approval
  if (incoming.submittedStatus === "approved") {
    throw new Error(
      "Self-approval forbidden: attendance submissions cannot assert 'approved' status from field devices.",
    );
  }

  // 2. Index existing canonical records by (projectId:attendanceDate:staffId)
  const canonicalMap = new Map<string, CanonicalAttendanceRecord>();
  for (const record of existingRecords) {
    const key = `${record.projectId}:${record.attendanceDate}:${record.staffId}`;
    canonicalMap.set(key, record);
  }

  const deduplicatedLines = deduplicateSubmissionLines(incoming.records);
  let mergedCount = 0;
  const updatedStaffIds: string[] = [];

  for (const line of deduplicatedLines) {
    const key = `${incoming.projectId}:${incoming.attendanceDate}:${line.staffId}`;
    const existing = canonicalMap.get(key);

    if (existing) {
      // If already office-approved, field device cannot silently overwrite
      if (existing.approvalState === "approved") {
        throw new Error(
          `Cannot overwrite approved attendance for staff '${line.staffId}' on date '${incoming.attendanceDate}'.`,
        );
      }

      // Converge deterministically: update the record with latest server sequence
      canonicalMap.set(key, {
        ...existing,
        staffName: line.staffName,
        trade: line.trade,
        status: line.status,
        regularHours: line.regularHours,
        overtimeHours: line.overtimeHours,
        shiftName: incoming.shiftName ?? existing.shiftName,
        notes: line.notes ?? existing.notes,
        submissionClientUuid: incoming.clientUuid,
        serverSeq,
        serverReceivedAt,
        approvalState: "submitted",
      });
      mergedCount++;
      updatedStaffIds.push(line.staffId);
    } else {
      // Insert new canonical record
      canonicalMap.set(key, {
        id: `att-${incoming.projectId}-${incoming.attendanceDate}-${line.staffId}`,
        projectId: incoming.projectId,
        attendanceDate: incoming.attendanceDate,
        staffId: line.staffId,
        staffName: line.staffName,
        trade: line.trade,
        status: line.status,
        regularHours: line.regularHours,
        overtimeHours: line.overtimeHours,
        shiftName: incoming.shiftName ?? "General Shift",
        notes: line.notes ?? "",
        submissionClientUuid: incoming.clientUuid,
        serverSeq,
        serverReceivedAt,
        approvalState: "submitted",
      });
      updatedStaffIds.push(line.staffId);
    }
  }

  return {
    records: Array.from(canonicalMap.values()),
    mergedCount,
    updatedStaffIds,
  };
}

/**
 * Server-authoritative office approval action.
 * Distinct action requiring manager authority.
 */
export function approveAttendanceRecords(args: {
  records: CanonicalAttendanceRecord[];
  staffIdsToApprove: string[];
  approverId: string;
  approverRole: string;
  serverTimestamp: string;
}): CanonicalAttendanceRecord[] {
  const { records, staffIdsToApprove, approverId, approverRole, serverTimestamp } = args;

  if (approverRole !== "manager" && approverRole !== "admin") {
    throw new Error(
      `Permission denied: role '${approverRole}' cannot approve attendance records. Manager authority required.`,
    );
  }

  const toApproveSet = new Set(staffIdsToApprove);
  return records.map((record) => {
    if (toApproveSet.has(record.staffId)) {
      return {
        ...record,
        approvalState: "approved" as const,
        approvedBy: approverId,
        approvedAt: serverTimestamp,
      };
    }
    return record;
  });

}
