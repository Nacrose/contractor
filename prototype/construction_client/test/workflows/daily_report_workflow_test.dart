import 'dart:io';
import 'dart:convert';

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

  test(
    'accepted report edits queue a versioned native update and survive restart',
    () {
      mounted = open();
      final store = DailyReportLocalStore(mounted!);
      final edit = DailyReportDraft(
        clientUuid: 'report-update-0001',
        projectId: 'project-1',
        reportDate: '2026-10-10',
        serverReportId: 'server-report-1',
        expectedUpdatedAt: '2026-10-10T12:00:00.000Z',
        remarks: 'Inspection complete',
      );

      store.save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: edit,
      );

      final op = mounted!.pendingOps.getOp('acct-1', edit.clientUuid)!;
      final payload = jsonDecode(op.payload) as Map<String, Object?>;
      expect(op.kind, 'workflow.dailyReport.updateFieldReport');
      expect(payload['clientUuid'], edit.clientUuid);
      expect(payload['projectId'], 'project-1');
      expect(payload['reportId'], 'server-report-1');
      expect(payload['expectedUpdatedAt'], '2026-10-10T12:00:00.000Z');
      expect(payload['remarks'], 'Inspection complete');
      expect(payload.containsKey('reportDate'), isFalse);
      expect(
        store.get('acct-1', edit.clientUuid)?.serverReportId,
        'server-report-1',
      );

      mounted!.driver.close();
      mounted = open();
      final reopened = DailyReportLocalStore(mounted!);
      expect(
        reopened.get('acct-1', edit.clientUuid)?.expectedUpdatedAt,
        '2026-10-10T12:00:00.000Z',
      );
      expect(
        mounted!.pendingOps.getOp('acct-1', edit.clientUuid)?.payload,
        op.payload,
      );
    },
  );

  test('conflict recovery creates a new versioned update without changing the conflicted command', () {
    mounted = open();
    final store = DailyReportLocalStore(mounted!);
    final original = DailyReportDraft(
      clientUuid: 'report-update-0002',
      projectId: 'project-1',
      reportDate: '2026-10-10',
      serverReportId: 'server-report-1',
      expectedUpdatedAt: '2026-10-10T12:00:00.000Z',
      remarks: 'Mobile revision',
    );
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: original,
    );
    final originalPayload = mounted!.pendingOps
        .getOp('acct-1', original.clientUuid)!
        .payload;
    mounted!.pendingOps.markInFlight(original.clientUuid);
    mounted!.pendingOps.markConflict(
      original.clientUuid,
      'Report version changed.',
    );

    final recovery = original
        .withClientUuid('report-update-0003')
        .withExpectedUpdatedAt('2026-10-10T12:05:00.001Z');
    store.saveRecoveryCopy(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      sourceClientUuid: original.clientUuid,
      draft: recovery,
    );

    final oldOp = mounted!.pendingOps.getOp('acct-1', original.clientUuid)!;
    final newOp = mounted!.pendingOps.getOp('acct-1', recovery.clientUuid)!;
    final newPayload = jsonDecode(newOp.payload) as Map<String, Object?>;
    expect(oldOp.state, 'conflict');
    expect(oldOp.payload, originalPayload);
    expect(newOp.state, 'pending');
    expect(newOp.kind, 'workflow.dailyReport.updateFieldReport');
    expect(newPayload['reportId'], 'server-report-1');
    expect(newPayload['expectedUpdatedAt'], '2026-10-10T12:05:00.001Z');
  });

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

  test('saved report index is account-and-tenant-scoped with outbox state', () {
    mounted = open();
    final store = DailyReportLocalStore(mounted!);
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft(uuid: 'report-saved-a01'),
    );
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft(uuid: 'report-saved-b01', remarks: 'Later report'),
    );
    store.save(
      accountId: 'acct-2',
      tenantId: 'tenant-2',
      role: 'field',
      draft: draft(uuid: 'report-saved-x01'),
    );
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-2',
      role: 'field',
      draft: draft(uuid: 'report-saved-y01'),
    );
    mounted!.pendingOps.markInFlight('report-saved-a01');
    mounted!.pendingOps.recordRejected(
      'report-saved-a01',
      'Review this entry.',
    );

    final saved = store.savedReports('acct-1', 'tenant-1');
    expect(saved.map((report) => report.draft.clientUuid), [
      'report-saved-b01',
      'report-saved-a01',
    ]);
    expect(saved.first.operationState, 'pending');
    expect(saved.last.operationState, 'rejected');
    expect(
      store
          .savedReports('acct-2', 'tenant-2')
          .map((report) => report.draft.clientUuid),
      ['report-saved-x01'],
    );
    expect(
      store
          .savedReports('acct-1', 'tenant-2')
          .map((report) => report.draft.clientUuid),
      ['report-saved-y01'],
    );
  });

  test('server rejection correction creates a new operation and preserves the rejected copy', () async {
    mounted = open();
    final store = DailyReportLocalStore(mounted!);
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft(),
    );
    mounted!.pendingOps.markInFlight('report-uuid-0001');
    mounted!.pendingOps.recordRejected(
      'report-uuid-0001',
      'Report date is outside the project period.',
    );

    final corrected = draft(
      uuid: 'report-uuid-0002',
      remarks: 'Corrected date and site notes',
    );
    store.saveRecoveryCopy(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      sourceClientUuid: 'report-uuid-0001',
      draft: corrected,
    );

    expect(
      mounted!.pendingOps.getOp('acct-1', 'report-uuid-0001')!.state,
      'rejected',
    );
    expect(
      mounted!.pendingOps.getOp('acct-1', 'report-uuid-0001')!.payload,
      contains('Foundation poured'),
    );
    expect(
      mounted!.pendingOps.getOp('acct-1', 'report-uuid-0002')!.state,
      'pending',
    );
    expect(
      store.get('acct-1', 'report-uuid-0002')!.remarks,
      'Corrected date and site notes',
    );
    await store.flushDurability();
  });

  test('procedure input preserves product field names and validates useful content', () {
    final payload = draft().toProcedureInput();
    expect(payload['projectId'], 'project-1');
    expect(payload['clientUuid'], 'report-uuid-0001');
    expect(payload['reportDate'], '2026-10-10');
    expect(payload['workProgress'], '[]');
    expect(payload['photos'], isEmpty);
    final notes = DailyReportDraft(
      clientUuid: 'report-uuid-0008',
      projectId: 'project-1',
      reportDate: '2026-10-10',
      workforce: const [
        {'company': 'Crew'},
      ],
      problems: '  Access blocked  ',
      safetyNotes: '   ',
      remarks: '  Work continued  ',
    ).toProcedureInput();
    expect(notes['problems'], 'Access blocked');
    expect(notes['remarks'], 'Work continued');
    expect(notes.containsKey('safetyNotes'), isFalse);
    expect(
      () => DailyReportDraft(
        clientUuid: 'report-uuid-0002',
        projectId: 'project-1',
        reportDate: '2026-10-10',
      ).toProcedureInput(),
      throwsA(isA<RepositoryError>()),
    );
  });

  test(
    'daily-report validation matches product field limits and row rules',
    () {
      expect(
        () => DailyReportDraft(
          clientUuid: 'report-uuid-0003',
          projectId: 'project-1',
          reportDate: '2026-10-10',
          workProgress: const [
            {'unit': 'm', 'sortOrder': 0},
          ],
        ).toProcedureInput(),
        throwsA(isA<RepositoryError>()),
      );
      expect(
        () => DailyReportDraft(
          clientUuid: 'report-uuid-0004',
          projectId: 'project-1',
          reportDate: '2026-10-10',
          maxTempC: '71',
          remarks: 'Report content',
        ).toProcedureInput(),
        throwsA(isA<RepositoryError>()),
      );
      expect(
        () => DailyReportDraft(
          clientUuid: 'report-uuid-0005',
          projectId: 'project-1',
          reportDate: '2026-10-10',
          remarks: 'Report content',
          photos: List.generate(
            7,
            (index) => RegisteredDailyReportPhoto(
              attachmentId: 'photo-$index',
              receipt: 'receipt-$index',
              digest: 'digest-$index',
              bytes: 128,
            ),
          ),
        ).toProcedureInput(),
        throwsA(isA<RepositoryError>()),
      );
    },
  );

  test(
    'registered photos match the product contract and can be report content',
    () {
      final photoOnly = DailyReportDraft(
        clientUuid: 'report-uuid-0006',
        projectId: 'project-1',
        reportDate: '2026-10-10',
        photos: [
          RegisteredDailyReportPhoto(
            attachmentId: 'photo-1',
            receipt: 'receipt-1',
            digest: List.filled(64, 'a').join(),
            bytes: 128,
          ),
        ],
      ).toProcedureInput();
      expect(photoOnly['photos'], hasLength(1));

      for (final photo in [
        RegisteredDailyReportPhoto(
          attachmentId: '',
          receipt: 'receipt-1',
          digest: List.filled(64, 'a').join(),
          bytes: 128,
        ),
        RegisteredDailyReportPhoto(
          attachmentId: 'photo-1',
          receipt: '',
          digest: List.filled(64, 'a').join(),
          bytes: 128,
        ),
        const RegisteredDailyReportPhoto(
          attachmentId: 'photo-1',
          receipt: 'receipt-1',
          digest: 'not-a-sha256',
          bytes: 128,
        ),
      ]) {
        expect(
          () => DailyReportDraft(
            clientUuid: 'report-uuid-0007',
            projectId: 'project-1',
            reportDate: '2026-10-10',
            photos: [photo],
          ).toProcedureInput(),
          throwsA(isA<RepositoryError>()),
        );
      }
    },
  );

  test(
    'field report section arrays survive local encoding and sync mapping',
    () {
      final original = DailyReportDraft(
        clientUuid: 'report-uuid-0010',
        projectId: 'project-1',
        reportDate: '2026-10-10',
        workProgress: const [
          {
            'boqCode': 'B.01',
            'boqDesc': 'Concrete pour',
            'plannedQty': 20,
            'actualQty': 12,
            'batchedQty': 12,
            'payableQty': 10,
            'unit': 'm3',
            'location': 'Zone A',
          },
        ],
        siteVisits: const [
          {
            'visitor': 'Site engineer',
            'organization': 'Client',
            'purpose': 'Inspection',
            'time': '10:30',
            'notes': 'Slab accepted',
            'sortOrder': 0,
          },
        ],
        meetings: const [
          {
            'topic': 'Toolbox talk',
            'attendees': 'Crew A',
            'notes': 'Discussed site safety',
            'sortOrder': 0,
          },
        ],
      );

      final local = DailyReportDraft.decode(original.encode());
      final payload = local.toProcedureInput();
      expect(
        jsonDecode(payload['workProgress']! as String),
        original.workProgress,
      );
      expect(jsonDecode(payload['siteVisits']! as String), original.siteVisits);
      expect(jsonDecode(payload['meetings']! as String), original.meetings);
      expect(
        () => DailyReportDraft(
          clientUuid: 'report-uuid-0011',
          projectId: 'project-1',
          reportDate: '2026-10-10',
          siteVisits: const [
            {'visitor': 'Client inspector'},
          ],
        ).toProcedureInput(),
        returnsNormally,
      );
    },
  );
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
