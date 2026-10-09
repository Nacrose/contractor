import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/migrations.dart';
import 'package:construction_client/mount/outbox_repository.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sqlite_driver.dart';
import 'package:construction_client/mount/sync_health.dart';

/// The honest read model (M03-T08): `synced` is TRUE only when there is no
/// pending work, no fresh rejection, and no scope short a cursor. A false
/// success is the one thing this surface must never produce.
void main() {
  late Directory tmp;
  late MountSqliteDriver driver;
  late OutboxRepository repo;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mount_health_test');
    driver = openNativeSqliteDriver('${tmp.path}/outbox.db');
    migrateMount(driver);
    repo = OutboxRepository(driver);
  });

  tearDown(() async {
    driver.close();
    await tmp.delete(recursive: true);
  });

  PendingHealthRow row(String opId, String state,
      {int createdAtMs = 1000, int updatedAtMs = 2000, String? lastError}) {
    return PendingHealthRow(opId, 'fieldSubmission.submit', createdAtMs, state, lastError, updatedAtMs);
  }

  SyncHealthSource sourceOf(List<PendingHealthRow> rows, {List<ScopeCursor> cursors = const []}) {
    return _FakeSource(rows, cursors);
  }

  test('a clean device IS synced (no rows, cursors present)', () {
    final health = buildDeviceSyncHealth(
      sourceOf(const [], cursors: [const ScopeCursor('tenant:t1', 10, 5)]),
      const HealthOptions(nowMs: 100_000),
    );
    expect(health.synced, isTrue);
    expect(health.reasons, isEmpty);
    expect(health.pendingOperationCount, 0);
    expect(health.oldestPendingAgeMs, isNull);
  });

  test('pending work is never a false success', () {
    final health = buildDeviceSyncHealth(
      sourceOf([row('p1', 'pending', createdAtMs: 99_000)]),
      const HealthOptions(nowMs: 100_000),
    );
    expect(health.synced, isFalse);
    expect(health.reasons, ['1 pending operation(s) not yet accepted']);
    expect(health.pendingOperationCount, 1);
    expect(health.oldestPendingAgeMs, 1000);
    expect(health.conflicts, 0);
    expect(health.blocked, 0);
  });

  test('conflicts and blocked ops surface with their own reasons', () {
    final health = buildDeviceSyncHealth(
      sourceOf([row('c1', 'conflict'), row('b1', 'blocked')]),
      const HealthOptions(nowMs: 100_000),
    );
    expect(health.synced, isFalse);
    expect(health.reasons, [
      '1 conflicted operation(s) awaiting resolution',
      '1 dependency-blocked operation(s)',
    ]);
    expect(health.conflicts, 1);
    expect(health.blocked, 1);
  });

  test('a FRESH rejection blocks synced; an OLD one no longer does (default 24h freshness)', () {
    final fresh = buildDeviceSyncHealth(
      sourceOf([row('r1', 'rejected', updatedAtMs: 90_000, lastError: 'scope_revalidation_failed')]),
      const HealthOptions(nowMs: 100_000),
    );
    expect(fresh.synced, isFalse);
    expect(fresh.reasons, ['1 recent rejection(s) surfaced']);
    expect(fresh.rejections.single.reason, 'scope_revalidation_failed');
    expect(fresh.rejections.single.atMs, 90_000);

    final old = buildDeviceSyncHealth(
      sourceOf([row('r1', 'rejected', updatedAtMs: 1000)]),
      const HealthOptions(nowMs: 100_000 + 25 * 60 * 60 * 1000),
    );
    expect(old.synced, isTrue, reason: 'a rejection older than the window stops blocking');
  });

  test('rejection reasons are sanitized to the 160-char surface', () {
    final health = buildDeviceSyncHealth(
      sourceOf([row('r1', 'rejected', updatedAtMs: 90_000, lastError: 'x' * 500)]),
      const HealthOptions(nowMs: 100_000),
    );
    expect(health.rejections.single.reason.length, 160);
  });

  test('reason order mirrors health.ts exactly when everything is wrong at once', () {
    final health = buildDeviceSyncHealth(
      sourceOf([
        row('p1', 'pending'),
        row('c1', 'conflict'),
        row('b1', 'blocked'),
        row('r1', 'rejected', updatedAtMs: 99_000),
      ]),
      const HealthOptions(nowMs: 100_000),
    );
    expect(health.reasons, [
      '1 pending operation(s) not yet accepted',
      '1 conflicted operation(s) awaiting resolution',
      '1 dependency-blocked operation(s)',
      '1 recent rejection(s) surfaced',
    ]);
    expect(health.synced, isFalse);
  });

  test('OutboxSyncHealthSource derives rows and cursors from the durable outbox', () {
    // Seed through the real repository: accepted rows with serverSeq feed
    // the cursors; the five health states feed pendingOps().
    PendingOpInput op(String id) => PendingOpInput(opId: id, kind: 'fieldSubmission.submit', payload: '{}');

    final a = repo.saveMutation(SaveMutationInput(accountId: 'acc', projectId: null, op: op('h-acc')));
    repo.markInFlight(a);
    repo.recordAccepted(a, 'rcp', serverSeq: 12);
    final b = repo.saveMutation(SaveMutationInput(accountId: 'acc', projectId: 'proj-1', op: op('h-acc2')));
    repo.markInFlight(b);
    repo.recordAccepted(b, 'rcp2', serverSeq: 20);
    final c = repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('h-rej')));
    repo.markInFlight(c);
    repo.recordRejected(c, 'rejected by guard');
    repo.saveMutation(SaveMutationInput(accountId: 'acc', op: op('h-pen')));

    final source = OutboxSyncHealthSource(repo, 'acc', 'tenant-1');
    final rows = source.pendingOps();
    expect(rows.map((r) => r.state), containsAll(<String>['pending', 'rejected']));
    expect(rows.any((r) => r.state == 'accepted'), isFalse, reason: 'accepted ops are not health rows');

    final cursors = source.acceptedCursors();
    final scopes = {for (final c in cursors) c.scope: c};
    expect(scopes['tenant:tenant-1']!.lastAcceptedSeq, 12);
    expect(scopes['project:proj-1']!.lastAcceptedSeq, 20);

    // The full honesty check end-to-end over the real store.
    final health = buildDeviceSyncHealth(source, HealthOptions(nowMs: DateTime.now().millisecondsSinceEpoch));
    expect(health.synced, isFalse, reason: 'a pending op and a fresh rejection exist');
    expect(health.lastAcceptedCursors, isNotEmpty);
  });
}

class _FakeSource implements SyncHealthSource {
  final List<PendingHealthRow> rows;
  final List<ScopeCursor> cursors;

  const _FakeSource(this.rows, this.cursors);

  @override
  String get accountId => 'acc';

  @override
  List<PendingHealthRow> pendingOps() => rows;

  @override
  List<ScopeCursor> acceptedCursors() => cursors;
}
