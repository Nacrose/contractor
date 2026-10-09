import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/migrations.dart';
import 'package:construction_client/mount/outbox_repository.dart';
import 'package:construction_client/mount/pending_operation_source.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sqlite_driver.dart';

/// The M04-T02 acceptance for the outbox adapter: it implements the
/// PendingOperationSource surface 1:1 (orchestrator contract.ts lines
/// 178-193) with no translation-layer drift — every field the orchestrator
/// reads round-trips exactly through the durable outbox.
void main() {
  late Directory tmp;
  late MountSqliteDriver driver;
  late OutboxRepository repo;
  late OutboxPendingOperationSource source;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mount_source_test');
    driver = openNativeSqliteDriver('${tmp.path}/outbox.db');
    migrateMount(driver);
    repo = OutboxRepository(driver);
    source = OutboxPendingOperationSource(repo);
  });

  tearDown(() async {
    driver.close();
    await tmp.delete(recursive: true);
  });

  String seed(String id,
      {List<String> dependsOn = const [], String? digest, String? tenantId, String? role}) {
    final input = PendingOpInput(
      opId: id,
      kind: 'fieldSubmission.submit',
      payload: '{"n":"$id"}',
      digest: digest ?? 'digest-$id',
      dependsOnOpIds: dependsOn,
      nextAttemptAtMs: null,
      tenantId: tenantId,
      role: role,
    );
    repo.saveMutation(SaveMutationInput(accountId: 'acc', projectId: 'proj-1', op: input));
    return id;
  }

  test('listDue returns time-eligible pending ops oldest-first WITHOUT dependency filtering', () {
    final now = DateTime.now().millisecondsSinceEpoch;
    final prereq = seed('prereq');
    seed('child', dependsOn: [prereq]);
    seed('later');
    repo.driver.prepare('UPDATE pending_op SET next_attempt_at = ? WHERE id = ?').run([now + 60000, 'later']);

    final due = source.listDue('acc', now);
    // The orchestrator owns the dependency policy; listDue exposes both ops
    // (the child stays dispatch-gated by the orchestrator's getOp check).
    expect(due.map((o) => o.opId), containsAll(['prereq', 'child']));
    expect(due.map((o) => o.opId), isNot(contains('later')));
    // Oldest first: creation order.
    expect(due.first.opId, 'prereq');
  });

  test('listDue excludes accepted/rejected/blocked/conflict ops (only pending dispatch)', () {
    final now = DateTime.now().millisecondsSinceEpoch;
    final a = seed('acc-1');
    repo.markInFlight(a);
    repo.recordAccepted(a, 'rcp');
    final b = seed('rej-1');
    repo.markInFlight(b);
    repo.recordRejected(b, 'no');
    final c = seed('blk-1');
    repo.markBlocked(c, 'prereq failed');
    final d = seed('cfl-1');
    repo.markInFlight(d);
    repo.markConflict(d, 'conflict');
    seed('pen-1');

    expect(source.listDue('acc', now).map((o) => o.opId), ['pen-1']);
  });

  test('getOp assembles the 12-field orchestrator record exactly (no drift)', () {
    final now = DateTime.now().millisecondsSinceEpoch;
    final prereq = seed('prereq-2');
    seed('full-op', dependsOn: [prereq], digest: 'sha-here', tenantId: 'tenant-9', role: 'lead');
    repo.markInFlight('full-op');
    final op = source.getOp('acc', 'full-op')!;

    expect(op.opId, 'full-op');
    expect(op.accountId, 'acc');
    expect(op.projectId, 'proj-1');
    expect(op.kind, 'fieldSubmission.submit');
    expect(op.payload, '{"n":"full-op"}');
    expect(op.digest, 'sha-here');
    expect(op.dependsOnOpIds, [prereq]);
    expect(op.state, 'in_flight');
    expect(op.attempts, 1);
    expect(op.nextAttemptAtMs, isNull);
    expect(op.lastError, isNull);
    expect(op.acceptedReceipt, isNull);
    expect(op.serverSeq, isNull);
    expect(op.tenantId, 'tenant-9');
    expect(op.role, 'lead');
    expect(now, isPositive, reason: 'timestamp sanity');
  });

  test('getOp returns null cross-account (account isolation holds at the adapter)', () {
    seed('iso-1');
    expect(source.getOp('acc', 'iso-1'), isNotNull);
    expect(source.getOp('other-account', 'iso-1'), isNull);
  });

  test('markInFlight / recordAccepted(+serverSeq) / recordRejected / requeue round-trip 1:1', () {
    final a = seed('flow-1');

    final inflight = source.markInFlight(a);
    expect(inflight.state, 'in_flight');
    expect(inflight.attempts, 1);

    final accepted = source.recordAccepted(a, 'rcp-flow', 777);
    expect(accepted.state, 'accepted');
    expect(accepted.acceptedReceipt, 'rcp-flow');
    expect(accepted.serverSeq, 777);

    final b = seed('flow-2');
    source.markInFlight(b);
    final rejected = source.recordRejected(b, 'malformed_request');
    expect(rejected.state, 'rejected');
    expect(rejected.lastError, 'malformed_request');

    final c = seed('flow-3');
    source.markInFlight(c);
    final requeued = source.requeue(c, 1234567890);
    expect(requeued.state, 'pending');
    expect(requeued.nextAttemptAtMs, 1234567890);
    expect(requeued.attempts, 1, reason: 'attempts stay — the counter counts dispatches');

    source.markInFlight(c);
    final immediate = source.requeue(c, null);
    expect(immediate.nextAttemptAtMs, isNull, reason: 'null backoff = immediately eligible');
  });

  test('listInFlight surfaces lost-ack recovery input', () {
    final a = seed('lost-1');
    final b = seed('lost-2');
    seed('done-1');
    source.markInFlight(a);
    source.markInFlight(b);

    final inflight = source.listInFlight('acc');
    expect(inflight.map((o) => o.opId).toSet(), {'lost-1', 'lost-2'});
  });

  test('markBlocked / markConflict preserve records with reasons (no deletion on any outcome)', () {
    final a = seed('ext-1');
    source.markBlocked(a, 'prerequisite failed terminally');
    final blocked = source.getOp('acc', a)!;
    expect(blocked.state, 'blocked');
    expect(blocked.lastError, 'prerequisite failed terminally');
    expect(blocked.payload, '{"n":"ext-1"}');
    expect(blocked.dependsOnOpIds, isEmpty);

    final b = seed('ext-2');
    source.markInFlight(b);
    source.markConflict(b, 'base-version mismatch');
    final conflict = source.getOp('acc', b)!;
    expect(conflict.state, 'conflict');
    expect(conflict.lastError, 'base-version mismatch');
  });

  test('serverSeq recorded at acceptance feeds the M03-T04 continuation shape', () {
    final a = seed('seq-1');
    source.markInFlight(a);
    source.recordAccepted(a, 'rcp-seq', 42);
    final op = source.getOp('acc', 'seq-1')!;
    expect(op.serverSeq, 42);
    expect(op.acceptedReceipt, 'rcp-seq');
    // Acceptance is terminal — a second dispatch attempt on an accepted op
    // is an illegal transition (accepted work never re-enters the drain).
    expect(
      () => source.markInFlight('seq-1'),
      throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'illegal_transition')),
    );
  });
}
