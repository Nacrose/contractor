import 'dart:io';

import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory tmp;
  ConstructionMount? mounted;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('daily_report_workflow_test');
  });

  tearDown(() async {
    mounted?.driver.close();
    mounted = null;
    await tmp.delete(recursive: true);
  });

  ConstructionMount open() => openMount(
    options: MountOptions(
      dbPath: '${tmp.path}/outbox.db',
      objectRoot: Directory('${tmp.path}/objects'),
      extraMigrations: const [kDailyReportLocalMigration],
    ),
    credentials: _Credentials(),
    transport: _Transport(),
  );

  DailyReportDraft draft({
    String uuid = 'report-uuid-0001',
    String remarks = 'Foundation poured',
  }) => DailyReportDraft(
    clientUuid: uuid,
    projectId: 'project-1',
    reportDate: '2026-10-10',
    weatherMorning: 'sunny',
    workforce: const [
      {'company': 'Thapa Construction', 'trade': 'rebar', 'headcount': '6'},
    ],
    remarks: remarks,
  );

  test(
    'local report and pending operation commit together and survive reopen',
    () {
      mounted = open();
      final store = DailyReportLocalStore(mounted!);

      store.save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft(),
      );

      final op = mounted!.pendingOps.getOp('acct-1', 'report-uuid-0001')!;
      expect(op.state, 'pending');
      expect(op.kind, 'workflow.dailyReport.createFieldReport');
      expect(op.tenantId, 'tenant-1');
      expect(
        store.get('acct-1', 'report-uuid-0001')?.remarks,
        'Foundation poured',
      );
      final health = store.syncHealth('acct-1', 'tenant-1');
      expect(health.synced, isFalse);
      expect(health.pendingOperationCount, 1);
      expect(
        health.reasons,
        contains('1 pending operation(s) not yet accepted'),
      );

      mounted!.driver.close();
      mounted = open();
      final reopened = DailyReportLocalStore(mounted!);
      expect(
        reopened.get('acct-1', 'report-uuid-0001')?.workforce.single['trade'],
        'rebar',
      );
      expect(
        mounted!.pendingOps.getOp('acct-1', 'report-uuid-0001')?.payload,
        op.payload,
      );
    },
  );

  test('an outbox insertion failure rolls back the local report row', () {
    mounted = open();
    final store = DailyReportLocalStore(mounted!);
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft(),
    );

    expect(
      () => store.save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft(uuid: 'report-uuid-0001', remarks: 'replacement'),
      ),
      throwsA(isA<RepositoryError>()),
    );
    expect(
      store.get('acct-1', 'report-uuid-0001')?.remarks,
      'Foundation poured',
    );
  });

  test(
    'unsent edit updates both rows; dispatched operations are immutable',
    () {
      mounted = open();
      final store = DailyReportLocalStore(mounted!);
      store.save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft(),
      );

      store.editUnsent(
        accountId: 'acct-1',
        draft: draft(remarks: 'Updated daily report'),
      );
      expect(
        store.get('acct-1', 'report-uuid-0001')?.remarks,
        'Updated daily report',
      );
      expect(
        mounted!.pendingOps.getOp('acct-1', 'report-uuid-0001')?.payload,
        contains('Updated daily report'),
      );

      mounted!.pendingOps.markInFlight('report-uuid-0001');
      expect(
        () => store.editUnsent(
          accountId: 'acct-1',
          draft: draft(remarks: 'late edit'),
        ),
        throwsA(isA<RepositoryError>()),
      );
    },
  );

  test('procedure input preserves product field names and validates useful content', () {
    final payload = draft().toProcedureInput();
    expect(payload['projectId'], 'project-1');
    expect(payload['clientUuid'], 'report-uuid-0001');
    expect(payload['reportDate'], '2026-10-10');
    expect(payload['workProgress'], '[]');
    expect(payload['photos'], isEmpty);
    expect(
      () => DailyReportDraft(
        clientUuid: 'report-uuid-0002',
        projectId: 'project-1',
        reportDate: '2026-10-10',
      ).toProcedureInput(),
      throwsA(isA<RepositoryError>()),
    );
  });
}

class _Transport implements SyncTransportPort {
  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async =>
      throw StateError('test transport must not be called');
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
