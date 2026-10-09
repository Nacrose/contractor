/// Outbox repository for the Flutter mount (M04-T02).
///
/// Dart mirror of packages/native_outbox/src/repository.ts — the durable
/// local half of the sync engine — extended by the mount's documented v3
/// schema (six-value op state, acceptance server_seq, op scope claims).
///
/// Carried-over rules (repository.ts, pinned by tests on BOTH sides):
///   - A save commits the domain write AND its pending operation in ONE
///     SQLite transaction; a failure leaves neither visible.
///   - Pending operations, private drafts, and staged attachments are
///     durable data — no eviction path exists (retention methods are the
///     only deletions).
///   - Acceptance receipts are recorded ONLY from server outcomes; nothing
///     is ever auto-accepted locally.
///   - Every row is account-scoped; reads without an account scope cannot
///     exist on the API.
///   - Every state transition is a read-modify-write inside ONE immediate
///     transaction with the state guard as the last line of defense.
library;

import 'ports.dart';

/// The mount's op input — extends the TS PendingOpInput (outbox contract.ts
/// lines 45-58) with the scope claims the mount stores alongside the op
/// (revalidated server-side at dispatch; orchestrator contract.ts
/// PendingOpRecord.tenantId/role).
class PendingOpInput {
  final String opId;
  final String kind;
  final String payload;
  final String? digest;
  final List<String> dependsOnOpIds;
  final int? nextAttemptAtMs;
  final String? tenantId;
  final String? role;

  const PendingOpInput({
    required this.opId,
    required this.kind,
    required this.payload,
    this.digest,
    this.dependsOnOpIds = const [],
    this.nextAttemptAtMs,
    this.tenantId,
    this.role,
  });
}

/// Domain write + pending op, one transaction (repository.ts SaveMutationInput).
class SaveMutationInput {
  final String accountId;
  final String? projectId;
  final PendingOpInput op;

  /// Domain-table writes that belong to this save; they run inside the SAME
  /// transaction against app-owned tables (extra migrations). Pure SQL only
  /// — business rules stay in the domain service; this is a durability, not
  /// authority, layer.
  final void Function(SqlDriver tx)? domain;

  const SaveMutationInput({
    required this.accountId,
    required this.op,
    this.projectId,
    this.domain,
  });
}

/// Full outbox row including the mount's v3 extension columns.
class OutboxOpRecord {
  final String id;
  final String accountId;
  final String? projectId;
  final String kind;
  final String payload;
  final String state;
  final int attempts;
  final int? nextAttemptAtMs;
  final int createdAtMs;
  final int updatedAtMs;
  final String? lastError;
  final String? acceptedReceipt;
  final String? digest;
  final int? serverSeq;
  final String? tenantId;
  final String? role;

  const OutboxOpRecord({
    required this.id,
    required this.accountId,
    required this.projectId,
    required this.kind,
    required this.payload,
    required this.state,
    required this.attempts,
    required this.nextAttemptAtMs,
    required this.createdAtMs,
    required this.updatedAtMs,
    required this.lastError,
    required this.acceptedReceipt,
    required this.digest,
    required this.serverSeq,
    required this.tenantId,
    required this.role,
  });
}

/// Attachment staging states (outbox contract.ts AttachmentStageState) and
/// the legal edges (ATTACHMENT_TRANSITIONS).
const Map<String, List<String>> kAttachmentTransitions = {
  'staging': ['staged', 'failed'],
  'staged': ['finalized', 'failed'],
  'finalized': ['registered', 'failed'],
  'registered': [],
  'failed': [],
};

/// Shape-compatible with the M03-T02 identity package PendingWorkSummary.
class PendingWorkSummary {
  final int pendingOperations;
  final int? oldestPendingAgeMs;
  final int privateDrafts;
  final int attachmentsPending;

  const PendingWorkSummary({
    required this.pendingOperations,
    required this.oldestPendingAgeMs,
    required this.privateDrafts,
    required this.attachmentsPending,
  });
}

class OutboxRepository {
  final SqlDriver driver;
  bool _inTransaction = false;

  OutboxRepository(this.driver);

  // ------------------------------------------------------------------
  // Immediate-transaction guard (repository.ts TxGuard + withImmediateTransaction)
  // ------------------------------------------------------------------

  T withImmediateTransaction<T>(T Function() body) {
    if (_inTransaction) {
      throw RepositoryError('internal', 'Nested immediate transaction is not allowed.');
    }
    _inTransaction = true;
    try {
      driver.exec('BEGIN IMMEDIATE');
      try {
        final result = body();
        driver.exec('COMMIT');
        return result;
      } catch (_) {
        try {
          driver.exec('ROLLBACK');
        } catch (_) {
          // rollback of an already-dead transaction; reopen is the boundary
        }
        rethrow;
      }
    } finally {
      _inTransaction = false;
    }
  }

  // ------------------------------------------------------------------
  // The save boundary (repository.ts saveMutation)
  // ------------------------------------------------------------------

  /// Commit the local mutation (domain writes) and its pending operation in
  /// ONE transaction. Any failure rolls back BOTH sides; neither row exists.
  String saveMutation(SaveMutationInput input) {
    _assertId(input.accountId, 'accountId');
    _assertId(input.op.opId, 'op.opId');
    if (input.op.kind.isEmpty) {
      throw RepositoryError('misconfigured', 'op.kind is required (server operation id).');
    }
    return withImmediateTransaction(() {
      input.domain?.call(driver);
      final now = DateTime.now().millisecondsSinceEpoch;
      driver
          .prepare('INSERT INTO pending_op (id, account_id, project_id, kind, payload, state, attempts,'
                  ' next_attempt_at, created_at, updated_at, digest, tenant_id, role)'
                  " VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?)")
          .run([
        input.op.opId,
        input.accountId,
        input.projectId,
        input.op.kind,
        input.op.payload,
        input.op.nextAttemptAtMs,
        now,
        now,
        input.op.digest,
        input.op.tenantId,
        input.op.role,
      ]);
      for (final dep in input.op.dependsOnOpIds) {
        _assertId(dep, 'dependsOnOpIds entry');
        driver.prepare('INSERT INTO op_dependency (pending_op_id, depends_on_op_id) VALUES (?, ?)').run([
          input.op.opId,
          dep,
        ]);
      }
      return input.op.opId;
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle transitions — recorded only from server outcomes
  // ------------------------------------------------------------------

  /// pending -> in_flight (dispatch attempt; attempts counter increments).
  OutboxOpRecord markInFlight(String opId) {
    return _transition(opId, 'pending', 'in_flight', incrementAttempts: true);
  }

  /// in_flight -> accepted. [receipt] is the server-issued durable receipt
  /// (required); [serverSeq] is the commit-order feed cursor (M03-T04).
  OutboxOpRecord recordAccepted(String opId, String receipt, {int? serverSeq}) {
    if (receipt.isEmpty) {
      throw RepositoryError('misconfigured', 'recordAccepted requires the server acceptance receipt.');
    }
    return _transition(
      opId,
      'in_flight',
      'accepted',
      acceptedReceipt: receipt,
      serverSeq: serverSeq,
      clearLastError: true,
    );
  }

  /// in_flight -> rejected with the server rejection reason (typed surface).
  OutboxOpRecord recordRejected(String opId, String reason) {
    if (reason.isEmpty) {
      throw RepositoryError('misconfigured', 'recordRejected requires the server rejection reason.');
    }
    return _transition(opId, 'in_flight', 'rejected', lastError: reason);
  }

  /// in_flight -> pending with bounded backoff ([nextAttemptAtMs] gates
  /// re-dispatch; null = immediately eligible).
  OutboxOpRecord requeue(String opId, int? nextAttemptAtMs) {
    return _transition(opId, 'in_flight', 'pending',
        nextAttemptAtMs: nextAttemptAtMs, clearNextAttemptAt: nextAttemptAtMs == null);
  }

  /// Mount extension (documented v3 schema): mark dependency-blocked —
  /// terminal for this op; the record is PRESERVED. Reachable from pending
  /// (a prerequisite failed terminally) and from in_flight (the server
  /// answered dependency_blocked) — exactly the orchestrator's two sites.
  void markBlocked(String opId, String reason) {
    _extendedStateTransition(opId, const ['pending', 'in_flight'], 'blocked', reason);
  }

  /// Mount extension (documented v3 schema): conflict surface — the record
  /// stays in `conflict` for app resolution; no data is dropped.
  void markConflict(String opId, String reason) {
    _extendedStateTransition(opId, const ['pending', 'in_flight'], 'conflict', reason);
  }

  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  OutboxOpRecord? getOp(String accountId, String opId) {
    final row = driver
        .prepare('SELECT $_opCols FROM pending_op WHERE id = ? AND account_id = ?')
        .get([opId, accountId]);
    return row == null ? null : _rowToOp(row);
  }

  List<String> getDependencies(String opId) {
    return driver
        .prepare('SELECT depends_on_op_id FROM op_dependency WHERE pending_op_id = ? ORDER BY depends_on_op_id')
        .all([opId])
        .map((r) => '${r['depends_on_op_id']}')
        .toList(growable: false);
  }

  /// Dispatch-eligible batch: pending, time-eligible, dependencies
  /// satisfied. Ordered by creation (repository.ts pendingBatch). The
  /// PendingOperationSource adapter exposes the RAW due list (listDue)
  /// without dependency filtering — the orchestrator owns that policy.
  List<OutboxOpRecord> pendingBatch(String accountId, {int? nowMs, int limit = 50}) {
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final boundedLimit = limit < 1 ? 1 : limit;
    return driver
        .prepare('SELECT $_opCols FROM pending_op p'
                ' WHERE p.account_id = ? AND p.state = \'pending\''
                ' AND (p.next_attempt_at IS NULL OR p.next_attempt_at <= ?)'
                ' AND NOT EXISTS ('
                '   SELECT 1 FROM op_dependency d JOIN pending_op q ON q.id = d.depends_on_op_id'
                '   WHERE d.pending_op_id = p.id AND q.state IN (\'pending\',\'in_flight\')'
                ' )'
                ' ORDER BY p.created_at ASC, p.id ASC LIMIT ?')
        .all([accountId, now, boundedLimit])
        .map(_rowToOp)
        .toList(growable: false);
  }

  /// Pending-work gate feed (M03-T02 shape; repository.ts pendingWorkSummary).
  PendingWorkSummary pendingWorkSummary(String accountId, {int? nowMs}) {
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final op = driver
        .prepare("SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM pending_op"
                " WHERE account_id = ? AND state IN ('pending','in_flight')")
        .get([accountId])!;
    final drafts = driver.prepare('SELECT COUNT(*) AS n FROM private_draft WHERE account_id = ?').get([accountId])!;
    final atts = driver
        .prepare("SELECT COUNT(*) AS n FROM attachment_stage WHERE account_id = ? AND state != 'registered'")
        .get([accountId])!;
    final oldestRaw = op['oldest'];
    final oldest = oldestRaw == null ? null : (oldestRaw as int);
    return PendingWorkSummary(
      pendingOperations: (op['n'] as int),
      oldestPendingAgeMs: oldest == null ? null : (now - oldest).clamp(0, 1 << 62),
      privateDrafts: (drafts['n'] as int),
      attachmentsPending: (atts['n'] as int),
    );
  }

  // ------------------------------------------------------------------
  // Private drafts (local-only until explicitly shared)
  // ------------------------------------------------------------------

  void createDraft(String accountId,
      {required String draftId, String? projectId, required String kind, required String body}) {
    _assertId(accountId, 'accountId');
    _assertId(draftId, 'draft.id');
    final now = DateTime.now().millisecondsSinceEpoch;
    driver
        .prepare('INSERT INTO private_draft (id, account_id, project_id, kind, body, created_at, updated_at)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run([draftId, accountId, projectId, kind, body, now, now]);
  }

  Map<String, Object?>? getDraft(String accountId, String draftId) {
    return driver
        .prepare('SELECT id, account_id, project_id, kind, body, created_at, updated_at'
                ' FROM private_draft WHERE id = ? AND account_id = ?')
        .get([draftId, accountId]);
  }

  /// Explicit, per-row delete. There is no other draft-removal path.
  void deleteDraft(String accountId, String draftId) {
    driver.prepare('DELETE FROM private_draft WHERE id = ? AND account_id = ?').run([draftId, accountId]);
  }

  // ------------------------------------------------------------------
  // Attachment staging (M03-T06 protocol lives above; this is durable state)
  // ------------------------------------------------------------------

  void stageAttachment(String accountId,
      {required String attachmentId,
      String? projectId,
      required String localPath,
      required String digest,
      required int bytes}) {
    _assertId(accountId, 'accountId');
    _assertId(attachmentId, 'attachment.id');
    if (bytes < 0) {
      throw RepositoryError('misconfigured', 'attachment bytes must be a non-negative number.');
    }
    final now = DateTime.now().millisecondsSinceEpoch;
    driver
        .prepare('INSERT INTO attachment_stage (id, account_id, project_id, local_path, digest, bytes, state, created_at, updated_at)'
                " VALUES (?, ?, ?, ?, ?, ?, 'staging', ?, ?)")
        .run([attachmentId, accountId, projectId, localPath, digest, bytes, now, now]);
  }

  String transitionAttachment(String accountId, String attachmentId, String to) {
    final row = driver.prepare('SELECT state FROM attachment_stage WHERE id = ? AND account_id = ?').get([
      attachmentId,
      accountId,
    ]);
    if (row == null) {
      throw RepositoryError('not_found', "Attachment '$attachmentId' not found for this account.");
    }
    final from = '${row['state']}';
    final allowed = kAttachmentTransitions[from] ?? const <String>[];
    if (!allowed.contains(to)) {
      throw RepositoryError('illegal_transition', 'Attachment cannot move $from -> $to.', {
        'from': from,
        'to': to,
        'allowed': allowed.join(','),
      });
    }
    driver
        .prepare('UPDATE attachment_stage SET state = ?, updated_at = ? WHERE id = ? AND account_id = ?')
        .run([to, DateTime.now().millisecondsSinceEpoch, attachmentId, accountId]);
    return to;
  }

  // ------------------------------------------------------------------
  // Explicit retention — the ONLY deletion paths (repository.ts)
  // ------------------------------------------------------------------

  /// Retention of accepted history: removes ONLY operations that are
  /// `accepted` WITH a durable receipt, older than the cutoff. Pending,
  /// in-flight, rejected operations, drafts and attachments are untouched.
  int deleteAcceptedBefore(String accountId, int cutoffMs) {
    final res = driver
        .prepare("DELETE FROM pending_op WHERE account_id = ? AND state = 'accepted'"
                ' AND accepted_receipt IS NOT NULL AND created_at <= ?')
        .run([accountId, cutoffMs]);
    return res.changes;
  }

  /// Full account wipe (explicit user action). Scoped strictly to the
  /// account; other accounts are untouched. Dependencies cascade via FKs.
  ({int pendingOps, int drafts, int attachments}) purgeAccount(String accountId) {
    _assertId(accountId, 'accountId');
    return withImmediateTransaction(() {
      final ops = driver.prepare('DELETE FROM pending_op WHERE account_id = ?').run([accountId]);
      final drafts = driver.prepare('DELETE FROM private_draft WHERE account_id = ?').run([accountId]);
      final atts = driver.prepare('DELETE FROM attachment_stage WHERE account_id = ?').run([accountId]);
      return (pendingOps: ops.changes, drafts: drafts.changes, attachments: atts.changes);
    });
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  static const String _opCols = 'id, account_id, project_id, kind, payload, state, attempts,'
      ' next_attempt_at, created_at, updated_at, last_error, accepted_receipt, digest,'
      ' server_seq, tenant_id, role';

  OutboxOpRecord _rowToOp(Map<String, Object?> row) {
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

  OutboxOpRecord _transition(
    String opId,
    String from,
    String to, {
    bool incrementAttempts = false,
    int? nextAttemptAtMs,
    bool clearNextAttemptAt = false,
    String? lastError,
    bool clearLastError = false,
    String? acceptedReceipt,
    int? serverSeq,
  }) {
    // Read-modify-write inside one immediate transaction; the CHECK
    // constraint on state is the last line of defense.
    return withImmediateTransaction(() {
      final row = driver.prepare('SELECT $_opCols FROM pending_op WHERE id = ?').get([opId]);
      if (row == null) {
        throw RepositoryError('not_found', "Pending operation '$opId' does not exist.");
      }
      final op = _rowToOp(row);
      if (op.state != from) {
        throw RepositoryError('illegal_transition',
            "Operation '$opId' is '${op.state}', expected '$from' for this transition.", {
          'from': op.state,
          'to': to,
        });
      }
      driver
          .prepare('UPDATE pending_op SET state = ?,'
                  ' attempts = ?,'
                  ' next_attempt_at = ?,'
                  ' updated_at = ?,'
                  ' last_error = ?,'
                  ' accepted_receipt = ?,'
                  ' server_seq = ?'
                  ' WHERE id = ?')
          .run([
        to,
        incrementAttempts ? op.attempts + 1 : op.attempts,
        clearNextAttemptAt ? null : (nextAttemptAtMs ?? op.nextAttemptAtMs),
        DateTime.now().millisecondsSinceEpoch,
        clearLastError ? null : (lastError ?? op.lastError),
        acceptedReceipt ?? op.acceptedReceipt,
        serverSeq ?? op.serverSeq,
        opId,
      ]);
      return getOp(op.accountId, opId)!;
    });
  }

  /// Mount extension transitions (blocked/conflict) — direct state write
  /// with the source-state guard; CHECK constraint is the last line.
  void _extendedStateTransition(String opId, List<String> fromStates, String to, String reason) {
    withImmediateTransaction(() {
      final row = driver.prepare('SELECT $_opCols FROM pending_op WHERE id = ?').get([opId]);
      if (row == null) {
        throw RepositoryError('not_found', "Pending operation '$opId' does not exist.");
      }
      final state = '${row['state']}';
      if (!fromStates.contains(state)) {
        throw RepositoryError('illegal_transition',
            "Operation '$opId' is '$state'; $to is reachable from ${fromStates.join('/')}.", {
          'from': state,
          'to': to,
        });
      }
      driver
          .prepare('UPDATE pending_op SET state = ?, last_error = ?, updated_at = ? WHERE id = ?')
          .run([to, reason, DateTime.now().millisecondsSinceEpoch, opId]);
    });
  }

  void _assertId(String value, String name) {
    if (value.trim().isEmpty) {
      throw RepositoryError('misconfigured', '$name must be a non-empty string.');
    }
  }
}
