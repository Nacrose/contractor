import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/migrations.dart';
import 'package:construction_client/mount/outbox_repository.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sqlite_driver.dart';

void main() {
  late Directory tmp;
  late MountSqliteDriver driver;
  late OutboxRepository repo;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mount_outbox_test');
    driver = openNativeSqliteDriver('${tmp.path}/outbox.db');
    migrateMount(driver);
    repo = OutboxRepository(driver);
  });

  tearDown(() async {
    driver.close();
    await tmp.delete(recursive: true);
  });

  PendingOpInput op(String id, {List<String> dependsOn = const [], String? digest}) => PendingOpInput(
        opId: id,
        kind: 'fieldSubmission.submit',
        payload: '{"id":"$id"}',
        digest: digest,
        dependsOnOpIds: dependsOn,
        tenantId: 'tenant-1',
        role: 'projectLead',
      );

  group('the save boundary', () {
    test('commits the domain write and the pending op in ONE transaction', () {
      repo.driver.exec('CREATE TABLE domain_row (id TEXT PRIMARY KEY, v TEXT)');
      final opId = repo.saveMutation(SaveMutationInput(
        accountId: 'acc',
        projectId: 'proj-1',
        op: op('op-1', digest: 'aa'),
        domain: (tx) => tx.prepare('INSERT INTO domain_row VALUES (?, ?)').run(['r1', 'x']),
      ));
      expect(opId, 'op-1');
      expect(repo.driver.prepare('SELECT v FROM domain_row WHERE id = ?').get(['r1']), isNotNull);
      final saved = repo.getOp('acc', 'op-1')!;
      expect(saved.state, 'pending');
      expect(saved.attempts, 0);
      expect(saved.digest, 'aa');
      expect(saved.tenantId, 'tenant-1');
      expect(saved.role, 'projectLead');
    });

    test('a domain-callback failure rolls back BOTH sides (neither row exists)', () {
      repo.driver.exec('CREATE TABLE domain_row2 (id TEXT PRIMARY KEY, v TEXT)');
      expect(
        () => repo.saveMutation(SaveMutationInput(
          accountId: 'acc',
          op: op('op-2'),
          domain: (tx) {
            tx.prepare('INSERT INTO domain_row2 VALUES (?, ?)').run(['r2', 'x']);
            throw StateError('domain rule fails');
          },
        )),
        throwsStateError,
      );
      expect(repo.getOp('acc', 'op-2'), isNull);
      expect(repo.driver.prepare('SELECT id FROM domain_row2').all(const []), isEmpty);
    });

    test('misconfiguration is typed (empty kind, empty ids)', () {
      expect(
        () => repo.saveMutation(
            SaveMutationInput(accountId: 'acc', op: PendingOpInput(opId: 'op-3', kind: '', payload: '{}'))),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
      expect(
        () => repo.saveMutation(SaveMutationInput(accountId: ' ', op: op('op-3'))),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
    });
  });

  group('lifecycle transitions (recorded only from server outcomes)', () {
    late String opId;

    setUp(() => opId = repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('op-t'))));

    test('markInFlight increments the attempts counter', () {
      final inflight = repo.markInFlight(opId);
      expect(inflight.state, 'in_flight');
      expect(inflight.attempts, 1);
      // A second markInFlight on the SAME op is an illegal transition
      // (pending -> in_flight only).
      expect(
        () => repo.markInFlight(opId),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'illegal_transition')),
      );
      final fresh = repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('op-t2')));
      expect(repo.markInFlight(fresh).attempts, 1);
    });

    test('recordAccepted requires the receipt, records receipt + serverSeq, clears lastError', () {
      repo.markInFlight(opId);
      expect(
        () => repo.recordAccepted(opId, ''),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
      final accepted = repo.recordAccepted(opId, 'rcp-1', serverSeq: 4242);
      expect(accepted.state, 'accepted');
      expect(accepted.acceptedReceipt, 'rcp-1');
      expect(accepted.serverSeq, 4242);
      expect(accepted.lastError, isNull);
    });

    test('recordRejected requires the reason and records it as the typed surface', () {
      repo.markInFlight(opId);
      expect(
        () => repo.recordRejected(opId, ''),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
      final rejected = repo.recordRejected(opId, 'scope_revalidation_failed');
      expect(rejected.state, 'rejected');
      expect(rejected.lastError, 'scope_revalidation_failed');
    });

    test('requeue returns to pending; null backoff means immediately eligible', () {
      repo.markInFlight(opId);
      final delayed = repo.requeue(opId, DateTime.now().millisecondsSinceEpoch + 60000);
      expect(delayed.state, 'pending');
      expect(delayed.nextAttemptAtMs, isNotNull);

      repo.markInFlight(opId);
      final immediate = repo.requeue(opId, null);
      expect(immediate.state, 'pending');
      expect(immediate.nextAttemptAtMs, isNull);
    });

    test('illegal transitions are typed (accepted op cannot go back in flight)', () {
      repo.markInFlight(opId);
      repo.recordAccepted(opId, 'rcp-2');
      expect(
        () => repo.markInFlight(opId),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'illegal_transition')),
      );
      expect(
        () => repo.markInFlight('missing-op'),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'not_found')),
      );
    });

    test('pendingBatch: time-eligible pending ops oldest-first with unsatisfied dependencies excluded', () {
      // Fresh account so the group fixture's op does not pollute the batch.
      final now = DateTime.now().millisecondsSinceEpoch;
      final a = repo.saveMutation(SaveMutationInput(accountId: 'iso', op: op('dep-prereq')));
      repo.saveMutation(SaveMutationInput(accountId: 'iso', op: op('dep-child', dependsOn: [a])));
      repo.saveMutation(SaveMutationInput(accountId: 'iso', op: op('dep-later')));
      repo.driver
          .prepare('UPDATE pending_op SET next_attempt_at = ? WHERE id = ?')
          .run([now + 60000, 'dep-later']);

      final batch = repo.pendingBatch('iso', nowMs: now);
      expect(batch.map((o) => o.id).toList(), ['dep-prereq'],
          reason: 'child is dependency-gated; later op is not time-eligible yet');

      // Accepting the prerequisite frees the child (prerequisites never overtaken).
      repo.markInFlight(a);
      repo.recordAccepted(a, 'rcp-dep');
      final after = repo.pendingBatch('iso', nowMs: now);
      expect(after.map((o) => o.id).toList(), ['dep-child']);
    });

    test('pendingWorkSummary counts pending+in_flight, drafts and unregistered attachments', () {
      // Fresh account so the group fixture's op does not pollute the counts.
      final now = DateTime.now().millisecondsSinceEpoch;
      repo.saveMutation(SaveMutationInput(accountId: 'sum', op: op('s1')));
      repo.saveMutation(SaveMutationInput(accountId: 'sum', op: op('s2')));
      repo.markInFlight('s2');
      repo.saveMutation(SaveMutationInput(accountId: 'sum', op: op('s3')));
      repo.markInFlight('s3');
      repo.recordAccepted('s3', 'rcp');
      repo.createDraft('sum', draftId: 'd1', kind: 'log', body: 'body');
      repo.stageAttachment('sum',
          attachmentId: 'att1', localPath: '/tmp/x', digest: 'dd', bytes: 10);
      final summary = repo.pendingWorkSummary('sum', nowMs: now);
      expect(summary.pendingOperations, 2);
      expect(summary.privateDrafts, 1);
      expect(summary.attachmentsPending, 1);
      expect(summary.oldestPendingAgeMs, isNotNull);
    });
  });

  group('mount extensions (documented v3 schema)', () {
    test('markBlocked is reachable from pending and in_flight and PRESERVES the record', () {
      final a = repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('blk-1')));
      repo.markBlocked(a, 'prerequisite failed terminally');
      final blocked = repo.getOp('acc', a)!;
      expect(blocked.state, 'blocked');
      expect(blocked.lastError, 'prerequisite failed terminally');

      final b = repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('blk-2')));
      repo.markInFlight(b);
      repo.markBlocked(b, 'dependency blocked server-side');
      final blocked2 = repo.getOp('acc', b)!;
      expect(blocked2.state, 'blocked');
      expect(blocked2.payload, '{"id":"blk-2"}', reason: 'data preserved — no deletion on any outcome');
    });

    test('markConflict keeps the record for app resolution', () {
      final a = repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('cfl-1')));
      repo.markInFlight(a);
      repo.markConflict(a, 'base-version mismatch');
      final conflict = repo.getOp('acc', a)!;
      expect(conflict.state, 'conflict');
      expect(conflict.lastError, 'base-version mismatch');
      expect(conflict.acceptedReceipt, isNull);
    });

    test('extended transitions guard their source states', () {
      final a = repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('cfl-2')));
      repo.markInFlight(a);
      repo.recordAccepted(a, 'rcp');
      expect(
        () => repo.markConflict(a, 'late conflict'),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'illegal_transition')),
      );
      expect(
        () => repo.markBlocked('nope', 'missing'),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'not_found')),
      );
    });
  });

  group('retention — the only deletion paths', () {
    test('deleteAcceptedBefore removes only accepted-with-receipt rows older than the cutoff', () {
      repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('r-acc')));
      repo.markInFlight('r-acc');
      repo.recordAccepted('r-acc', 'rcp-acc');
      repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('r-rej')));
      repo.markInFlight('r-rej');
      repo.recordRejected('r-rej', 'nope');
      repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('r-pending')));

      final removed = repo.deleteAcceptedBefore('acc', DateTime.now().millisecondsSinceEpoch + 1000);
      expect(removed, 1);
      expect(repo.getOp('acc', 'r-acc'), isNull);
      expect(repo.getOp('acc', 'r-rej'), isNotNull, reason: 'rejected ops are not retention targets');
      expect(repo.getOp('acc', 'r-pending'), isNotNull);
    });

    test('purgeAccount is strictly account-scoped', () {
      repo.saveMutation(SaveMutationInput(accountId: 'acc-1', op: op('p-1')));
      repo.saveMutation(SaveMutationInput(accountId: 'acc-2', op: op('p-2')));
      final counts = repo.purgeAccount('acc-1');
      expect(counts.pendingOps, 1);
      expect(repo.getOp('acc-1', 'p-1'), isNull);
      expect(repo.getOp('acc-2', 'p-2'), isNotNull);
    });
  });

  group('private drafts', () {
    test('create/get/delete round-trip; delete is explicit and per-row', () {
      repo.createDraft('acc', draftId: 'd-1', kind: 'log', body: 'secret body');
      final draft = repo.getDraft('acc', 'd-1')!;
      expect(draft['body'], 'secret body');
      expect(repo.getDraft('other', 'd-1'), isNull, reason: 'account-scoped reads only');
      repo.deleteDraft('acc', 'd-1');
      expect(repo.getDraft('acc', 'd-1'), isNull);
    });
  });

  group('attachment staging', () {
    test('legal staging machine transitions', () {
      repo.stageAttachment('acc',
          attachmentId: 'a-1', localPath: '/tmp/pic.jpg', digest: 'dd', bytes: 12);
      expect(repo.transitionAttachment('acc', 'a-1', 'staged'), 'staged');
      expect(repo.transitionAttachment('acc', 'a-1', 'finalized'), 'finalized');
      expect(repo.transitionAttachment('acc', 'a-1', 'registered'), 'registered');
      expect(
        () => repo.transitionAttachment('acc', 'a-1', 'staging'),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'illegal_transition')),
      );
    });

    test('negative bytes and unknown attachments are typed errors', () {
      expect(
        () => repo.stageAttachment('acc',
            attachmentId: 'a-2', localPath: '/x', digest: 'd', bytes: -1),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
      expect(
        () => repo.transitionAttachment('acc', 'ghost', 'staged'),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'not_found')),
      );
    });
  });
}
