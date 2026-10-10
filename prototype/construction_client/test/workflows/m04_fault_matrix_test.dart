import 'dart:io';

import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory tmp;
  ConstructionMount? mount;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('m04_fault_matrix_test');
    mount = _open(
      tmp,
      _Transport(
        (envelope) async => SyncOutcome(
          kind: SyncOutcomeKind.accepted,
          opId: envelope.opId,
          receipt: 'accepted-${envelope.opId}',
          serverSeq: 1,
        ),
      ),
    );
  });

  tearDown(() async {
    mount?.driver.close();
    mount = null;
    await tmp.delete(recursive: true);
  });

  DailyReportDraft draft(String id, {String remarks = 'Crew poured footing'}) =>
      DailyReportDraft(
        clientUuid: id,
        projectId: 'project-1',
        reportDate: '2026-10-10',
        remarks: remarks,
      );

  DailyReportLocalStore getStore() => DailyReportLocalStore(mount!);

  void reopenWith(SyncTransportPort transport) {
    mount!.driver.close();
    mount = _open(tmp, transport);
  }

  DailyLogSyncOrchestrator engine(
    SyncTransportPort transport, {
    int Function()? nowMs,
  }) => DailyLogSyncOrchestrator(
    mount: mount!,
    deviceId: 'device-1',
    random: _FixedRandom(),
    nowMs: nowMs ?? () => 1000,
    backoffBaseMs: 10,
    backoffCapMs: 100,
  );

  test('office edit conflict preserves the full local report and surfaces conflict health', () async {
    getStore().save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft('report-conflict-01'),
    );
    reopenWith(
      _Transport(
        (envelope) async => SyncOutcome(
          kind: SyncOutcomeKind.conflict,
          opId: envelope.opId,
          detail: 'server version changed',
        ),
      ),
    );
    final sync = engine(mount!.transport);

    final result = await sync.drain('acct-1');

    expect(result.conflicts, ['report-conflict-01']);
    expect(
      getStore().get('acct-1', 'report-conflict-01')?.remarks,
      'Crew poured footing',
    );
    expect(getStore().syncHealth('acct-1', 'tenant-1').conflicts, 1);
  });

  test(
    'permission revocation stops the batch and preserves subsequent reports',
    () async {
      getStore().save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft('a-report-revoked'),
      );
      getStore().save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft('z-report-pending'),
      );
      var sends = 0;
      reopenWith(
        _Transport((envelope) async {
          sends++;
          return SyncOutcome(
            kind: SyncOutcomeKind.revoked,
            opId: envelope.opId,
            detail: 'project access was revoked',
          );
        }),
      );
      final sync = engine(mount!.transport);

      final result = await sync.drain('acct-1');

      expect(result.stoppedFor, 'revoked');
      expect(sends, 1);
      expect(
        getStore().get('acct-1', 'z-report-pending')?.remarks,
        'Crew poured footing',
      );
      expect(
        mount!.pendingOps.getOp('acct-1', 'z-report-pending')?.state,
        'pending',
      );
    },
  );

  test('process restart replays the same in-flight op and records the original receipt', () async {
    getStore().save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft('report-restart-01'),
    );
    mount!.pendingOps.markInFlight('report-restart-01');
    mount!.driver.close();
    mount = _open(
      tmp,
      _Transport(
        (envelope) async => SyncOutcome(
          kind: SyncOutcomeKind.previouslyAccepted,
          opId: envelope.opId,
          receipt: 'original-server-receipt',
          serverSeq: 28,
        ),
      ),
    );
    final sync = engine(mount!.transport);

    final result = await sync.drain('acct-1');

    expect(result.previouslyAccepted, ['report-restart-01']);
    expect(
      mount!.pendingOps.getOp('acct-1', 'report-restart-01')?.acceptedReceipt,
      'original-server-receipt',
    );
    expect(
      DailyReportLocalStore(mount!).get('acct-1', 'report-restart-01')?.remarks,
      'Crew poured footing',
    );
  });

  test('slow network retry leaves a durable pending report until a later accepted response', () async {
    getStore().save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft('report-slow-net01'),
    );
    var now = 1000;
    var sends = 0;
    reopenWith(
      _Transport((envelope) async {
        sends++;
        if (sends == 1) {
          return SyncOutcome(
            kind: SyncOutcomeKind.retryable,
            opId: envelope.opId,
            detail: 'network timeout',
            retryAfterMs: 500,
          );
        }
        return SyncOutcome(
          kind: SyncOutcomeKind.accepted,
          opId: envelope.opId,
          receipt: 'accepted-after-retry',
        );
      }),
    );
    final sync = engine(mount!.transport, nowMs: () => now);

    final first = await sync.drain('acct-1');
    expect(first.retrying, ['report-slow-net01']);
    expect(
      getStore().get('acct-1', 'report-slow-net01')?.remarks,
      'Crew poured footing',
    );
    expect(
      getStore().syncHealth('acct-1', 'tenant-1').pendingOperationCount,
      1,
    );
    now = 2000;
    final second = await sync.drain('acct-1');
    expect(second.accepted, ['report-slow-net01']);
    expect(
      getStore().syncHealth('acct-1', 'tenant-1').pendingOperationCount,
      0,
    );
  });

  test('disk full rolls back the local domain row and its pending operation together', () {
    final pageCount = mount!.driver.pragmaValue('PRAGMA page_count') as int;
    mount!.driver.exec('PRAGMA max_page_count=${pageCount + 2}');
    final largeRemarks = List.filled(6 * 1024 * 1024, 'x').join();

    expect(
      () => getStore().save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft('report-disk-full1', remarks: largeRemarks),
      ),
      throwsA(isA<RepositoryError>()),
    );
    expect(getStore().get('acct-1', 'report-disk-full1'), isNull);
    expect(mount!.pendingOps.getOp('acct-1', 'report-disk-full1'), isNull);
    expect(
      mount!.driver
          .prepare('PRAGMA integrity_check')
          .get(const [])
          ?.values
          .first,
      'ok',
    );
  });
}

ConstructionMount _open(Directory root, SyncTransportPort transport) =>
    openMount(
      options: MountOptions(
        dbPath: '${root.path}/outbox.db',
        objectRoot: Directory('${root.path}/objects'),
        extraMigrations: const [kDailyReportLocalMigration],
      ),
      credentials: _Credentials(),
      transport: transport,
    );

class _Transport implements SyncTransportPort {
  final Future<SyncOutcome> Function(SyncEnvelope) respond;

  _Transport(this.respond);

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) => respond(envelope);
}

class _FixedRandom implements OrchestratorRandomPort {
  @override
  double next() => 0.5;
}

class _Credentials implements SecureCredentialStore {
  @override
  SecureStorageBinding get binding => SecureStorageBinding.linuxSecretService;

  @override
  Future<void> delete(CredentialRef ref) async {}

  @override
  Future<String?> load(CredentialRef ref) async => null;

  @override
  Future<void> save(CredentialRef ref, String value) async {}

  @override
  Future<void> wipeAll() async {}
}
