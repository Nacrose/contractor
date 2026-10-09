/// PendingOperationSource adapter — the mount's binding of the outbox onto
/// the M03-T07 orchestrator contract (M04-T02).
///
/// The surface is implemented 1:1 against orchestrator contract.ts lines
/// 178-193: listDue (due = pending and time-eligible, OLDEST FIRST, WITHOUT
/// dependency filtering — the orchestrator owns the prerequisite policy and
/// consults getOp for it), listInFlight, getOp, markInFlight (attempts
/// increment), recordAccepted (receipt + serverSeq), recordRejected,
/// requeue (backoff or null = immediately eligible), markBlocked and
/// markConflict (the mount's documented v3 schema extension; records are
/// PRESERVED — there is no delete path on any outcome).
library;

import 'outbox_repository.dart';
import 'ports.dart';

class OutboxPendingOperationSource implements PendingOperationSource {
  final OutboxRepository repository;

  OutboxPendingOperationSource(this.repository);

  @override
  List<PendingOpRecord> listDue(String accountId, int nowMs) {
    // Due = pending and time-eligible, oldest first — WITHOUT dependency
    // filtering: the orchestrator owns the prerequisite policy and consults
    // getOp for it (the repository's pendingBatch keeps its dispatch-eligible
    // shape for callers that want the filter).
    final rows = repository.driver
        .prepare("SELECT ${OutboxRepositoryAccess.opCols} FROM pending_op"
                " WHERE account_id = ? AND state = 'pending'"
                ' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)'
                ' ORDER BY created_at ASC, id ASC')
        .all([accountId, nowMs]);
    return rows.map(_rowToRecord).toList(growable: false);
  }

  @override
  List<PendingOpRecord> listInFlight(String accountId) {
    final rows = repository.driver
        .prepare("SELECT ${OutboxRepositoryAccess.opCols} FROM pending_op"
                " WHERE account_id = ? AND state = 'in_flight' ORDER BY created_at ASC, id ASC")
        .all([accountId]);
    return rows.map(_rowToRecord).toList(growable: false);
  }

  @override
  PendingOpRecord? getOp(String accountId, String opId) {
    final op = repository.getOp(accountId, opId);
    if (op == null) return null;
    return _toOrchestratorRecord(op);
  }

  @override
  PendingOpRecord markInFlight(String opId) {
    return _recordAfter(repository.markInFlight(opId));
  }

  @override
  PendingOpRecord recordAccepted(String opId, String receipt, int? serverSeq) {
    return _recordAfter(repository.recordAccepted(opId, receipt, serverSeq: serverSeq));
  }

  @override
  PendingOpRecord recordRejected(String opId, String reason) {
    return _recordAfter(repository.recordRejected(opId, reason));
  }

  @override
  PendingOpRecord requeue(String opId, int? nextAttemptAtMs) {
    return _recordAfter(repository.requeue(opId, nextAttemptAtMs));
  }

  @override
  void markBlocked(String opId, String reason) {
    repository.markBlocked(opId, reason);
  }

  @override
  void markConflict(String opId, String reason) {
    repository.markConflict(opId, reason);
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  PendingOpRecord _recordAfter(OutboxOpRecord op) => _toOrchestratorRecord(op);

  PendingOpRecord _rowToRecord(Map<String, Object?> row) {
    final op = OutboxRepositoryAccess.rowToOp(row);
    return _toOrchestratorRecord(op);
  }

  PendingOpRecord _toOrchestratorRecord(OutboxOpRecord op) {
    return PendingOpRecord(
      opId: op.id,
      accountId: op.accountId,
      projectId: op.projectId,
      kind: op.kind,
      payload: op.payload,
      digest: op.digest,
      dependsOnOpIds: repository.getDependencies(op.id),
      state: op.state,
      attempts: op.attempts,
      nextAttemptAtMs: op.nextAttemptAtMs,
      lastError: op.lastError,
      acceptedReceipt: op.acceptedReceipt,
      serverSeq: op.serverSeq,
      tenantId: op.tenantId,
      role: op.role,
    );
  }
}

/// Column/list helpers shared with the adapter without widening the
/// repository's public surface beyond the TS mirror.
extension OutboxRepositoryAccess on OutboxRepository {
  static const String opCols = 'id, account_id, project_id, kind, payload, state, attempts,'
      ' next_attempt_at, created_at, updated_at, last_error, accepted_receipt, digest,'
      ' server_seq, tenant_id, role';

  static OutboxOpRecord rowToOp(Map<String, Object?> row) {
    return OutboxOpRecord(
      id: '${row['id']}',
      accountId: '${row['account_id']}',
      projectId: row['project_id'] == null ? null : '${row['project_id']}',
      kind: '${row['kind']}',
      payload: '${row['payload']}',
      state: '${row['state']}',
      attempts: (row['attempts'] as int? ?? 0),
      nextAttemptAtMs: row['next_attempt_at'] as int?,
      createdAtMs: (row['created_at'] as int? ?? 0),
      updatedAtMs: (row['updated_at'] as int? ?? 0),
      lastError: row['last_error'] == null ? null : '${row['last_error']}',
      acceptedReceipt: row['accepted_receipt'] == null ? null : '${row['accepted_receipt']}',
      digest: row['digest'] == null ? null : '${row['digest']}',
      serverSeq: row['server_seq'] as int?,
      tenantId: row['tenant_id'] == null ? null : '${row['tenant_id']}',
      role: row['role'] == null ? null : '${row['role']}',
    );
  }
}
