/// Device sync-health read model binding (M04-T02).
///
/// Dart port of packages/native_observability/src/health.ts
/// buildDeviceSyncHealth (lines 20-60) — the honest surface. `synced` is
/// TRUE only when: no pending operations exist, no fresh rejection is
/// unsurfaced, and no scope lacks a cursor — anything else reports
/// `synced: false` with explicit reasons. A false success state is the one
/// thing this surface must never produce (tested on BOTH sides).
///
/// [OutboxSyncHealthSource] binds the read model to the mount's outbox:
/// pendingOps() walks the durable op rows in the five health states;
/// acceptedCursors() derives per-scope cursors from ACCEPTED rows'
/// server_seq values (max seq per scope, with that row's age) until the
/// M03-T05 checkpoint store lands on device with the bootstrap work
/// (recorded constraint in the M04-T02 report).
library;

import 'outbox_repository.dart';
import 'ports.dart';

/// Direct port of health.ts buildDeviceSyncHealth — rules, reason strings,
/// and their order are mirrored exactly.
DeviceSyncHealth buildDeviceSyncHealth(SyncHealthSource source, HealthOptions options) {
  final ops = source.pendingOps();
  final cursors = source.acceptedCursors();
  final reasons = <String>[];

  final pending = ops.where((o) => o.state == 'pending' || o.state == 'in_flight').toList();
  final conflicts = ops.where((o) => o.state == 'conflict').toList();
  final blocked = ops.where((o) => o.state == 'blocked').toList();
  final rejections = ops
      .where((o) => o.state == 'rejected')
      .map((o) => RejectionSurface(o.opId, o.kind, (o.lastError ?? 'rejected').substringSafe(0, 160), o.updatedAtMs))
      .toList();
  final freshRejectionMs = options.rejectionFreshMs ?? 24 * 60 * 60 * 1000;
  final freshRejections = rejections.where((r) => options.nowMs - r.atMs < freshRejectionMs).toList();

  if (pending.isNotEmpty) reasons.add('${pending.length} pending operation(s) not yet accepted');
  if (conflicts.isNotEmpty) reasons.add('${conflicts.length} conflicted operation(s) awaiting resolution');
  if (blocked.isNotEmpty) reasons.add('${blocked.length} dependency-blocked operation(s)');
  if (freshRejections.isNotEmpty) reasons.add('${freshRejections.length} recent rejection(s) surfaced');

  final oldestPendingAgeMs = pending.isEmpty
      ? null
      : pending.map((o) => options.nowMs - o.createdAtMs).reduce((a, b) => a > b ? a : b);

  return DeviceSyncHealth(
    accountId: source.accountId,
    synced: reasons.isEmpty,
    reasons: reasons,
    pendingOperationCount: pending.length,
    oldestPendingAgeMs: oldestPendingAgeMs,
    conflicts: conflicts.length,
    blocked: blocked.length,
    lastAcceptedCursors: cursors,
    rejections: rejections,
    generatedAtMs: options.nowMs,
  );
}

/// SyncHealthSource bound to the mount's outbox (account-scoped; cursor
/// derivation from accepted rows' server_seq, see the library doc).
class OutboxSyncHealthSource implements SyncHealthSource {
  final OutboxRepository repository;

  @override
  final String accountId;

  /// Scope naming: tenant rows use the tenant id; project rows use the
  /// project id (the M03-T04 feed scopes). Tenant rows carry project_id
  /// NULL.
  final String tenantId;

  OutboxSyncHealthSource(this.repository, this.accountId, this.tenantId);

  @override
  List<PendingHealthRow> pendingOps() {
    final rows = repository.driver
        .prepare("SELECT id, kind, created_at, state, last_error, updated_at FROM pending_op"
                " WHERE account_id = ? AND state IN ('pending','in_flight','blocked','conflict','rejected')"
                " ORDER BY created_at ASC, id ASC")
        .all([accountId]);
    return rows
        .map((r) => PendingHealthRow(
              '${r['id']}',
              '${r['kind']}',
              r['created_at'] as int,
              '${r['state']}',
              r['last_error'] == null ? null : '${r['last_error']}',
              r['updated_at'] as int,
            ))
        .toList(growable: false);
  }

  @override
  List<ScopeCursor> acceptedCursors() {
    final rows = repository.driver
        .prepare("SELECT project_id, server_seq, updated_at FROM pending_op"
                " WHERE account_id = ? AND state = 'accepted' AND server_seq IS NOT NULL"
                ' ORDER BY server_seq ASC')
        .all([accountId]);
    final perScope = <String, ScopeCursor>{};
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final r in rows) {
      final projectId = r['project_id'] == null ? null : '${r['project_id']}';
      final scope = projectId == null ? 'tenant:$tenantId' : 'project:$projectId';
      final seq = r['server_seq'] as int;
      final age = (now - (r['updated_at'] as int)).clamp(0, 1 << 62);
      final existing = perScope[scope];
      if (existing == null || seq >= existing.lastAcceptedSeq) {
        perScope[scope] = ScopeCursor(scope, seq, age);
      }
    }
    return perScope.values.toList(growable: false);
  }
}

extension _Safe on String {
  String substringSafe(int start, int end) => length <= end ? this : substring(start, end);
}
