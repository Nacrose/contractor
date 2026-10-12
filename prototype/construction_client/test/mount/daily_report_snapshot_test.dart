import 'dart:io';
import 'dart:convert';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/daily_report_snapshot.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory tmp;
  ConstructionMount? mount;

  setUp(
    () async => tmp = await Directory.systemTemp.createTemp(
      'daily_report_snapshot_test',
    ),
  );
  tearDown(() async {
    mount?.driver.close();
    mount = null;
    await tmp.delete(recursive: true);
  });

  ConstructionMount open() => openMount(
    options: MountOptions(
      dbPath: '${tmp.path}/snapshot.db',
      objectRoot: Directory('${tmp.path}/objects'),
      extraMigrations: kM04WorkflowMigrations,
    ),
    credentials: _Credentials(),
    transport: _Transport(),
  );

  DailyReportSnapshotPage page({
    required int ord,
    required String id,
    required bool hasMore,
    required int next,
  }) => DailyReportSnapshotPage(
    snapshotId: 'snap-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    watermark: '9007199254740999',
    firstOrd: ord,
    rows: [
      DailyReportSnapshotRow(
        ord,
        id,
        jsonEncode({'id': id, 'projectId': 'project-1', 'remarks': id}),
      ),
    ],
    nextAfterOrd: next,
    hasMore: hasMore,
  );

  test('applies rows durably, resumes by ordinal, and commits decimal feed watermark', () async {
    mount = open();
    mount!.driver
        .prepare(
          'INSERT INTO daily_report_replica (account_id, tenant_id, project_id, report_id, payload, snapshot_id) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run([
          'acct-1',
          'tenant-1',
          'project-1',
          'stale',
          '{}',
          'old-snapshot',
        ]);
    final transport = _SnapshotTransport([
      page(ord: 0, id: 'report-1', hasMore: true, next: 1),
      page(ord: 1, id: 'report-2', hasMore: false, next: 2),
    ]);
    var result =
        await DailyReportSnapshotRestorer(
          mount: mount!,
          maxPagesPerRun: 1,
        ).restore(
          accountId: 'acct-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          transport: transport,
        );
    expect(result.complete, isFalse);
    expect(result.afterOrd, 1);
    expect(
      DailyReportSnapshotRestorer(mount: mount!).reports(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      ),
      hasLength(2),
      reason: 'manifest closure waits until every page has been applied',
    );

    mount!.driver.close();
    mount = open();
    final restorer = DailyReportSnapshotRestorer(mount: mount!);
    result = await restorer.restore(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      transport: transport,
    );
    expect(result.complete, isTrue);
    expect(result.applied, 2);
    expect(result.watermark, '9007199254740999');
    expect(
      restorer.feedCursor(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      ),
      '9007199254740999',
    );
    expect(
      restorer
          .reports(
            accountId: 'acct-1',
            tenantId: 'tenant-1',
            projectId: 'project-1',
          )
          .map((r) => r['report_id']),
      ['report-1', 'report-2'],
    );
    expect(
      transport.openCalls,
      1,
      reason:
          'restart resumes the persisted snapshot instead of opening another',
    );
  });

  test(
    'rejects payload scope mismatch before accepting a snapshot page',
    () async {
      mount = open();
      final bad = _SnapshotTransport([
        DailyReportSnapshotPage(
          snapshotId: 'snap-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          watermark: '4',
          firstOrd: 0,
          rows: [
            DailyReportSnapshotRow(
              0,
              'report-1',
              '{"id":"report-1","projectId":"other-project"}',
            ),
          ],
          nextAfterOrd: 1,
          hasMore: false,
        ),
      ], watermark: '4');
      await expectLater(
        DailyReportSnapshotRestorer(mount: mount!).restore(
          accountId: 'acct-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          transport: bad,
        ),
        throwsA(
          isA<DailyReportSnapshotFailure>().having(
            (error) => error.kind,
            'kind',
            'protocol',
          ),
        ),
      );
      expect(
        mount!.driver
            .prepare('SELECT COUNT(*) AS count FROM daily_report_replica')
            .get([])!['count'],
        0,
      );
      expect(
        DailyReportSnapshotRestorer(mount: mount!)
            .progress(
              accountId: 'acct-1',
              tenantId: 'tenant-1',
              projectId: 'project-1',
            )
            .complete,
        isFalse,
      );
    },
  );
}

class _SnapshotTransport implements DailyReportSnapshotTransport {
  final List<DailyReportSnapshotPage> pages;
  final String watermark;
  int openCalls = 0;

  _SnapshotTransport(this.pages, {this.watermark = '9007199254740999'});

  @override
  Future<DailyReportSnapshotManifest> open(String projectId) async {
    openCalls++;
    return DailyReportSnapshotManifest(
      snapshotId: 'snap-1',
      tenantId: 'tenant-1',
      projectId: projectId,
      watermark: watermark,
      objectCount: pages.fold(0, (sum, page) => sum + page.rows.length),
    );
  }

  @override
  Future<DailyReportSnapshotPage> readPage({
    required String snapshotId,
    required String projectId,
    required int afterOrd,
  }) async => pages.firstWhere(
    (page) =>
        page.nextAfterOrd > afterOrd ||
        (!page.hasMore && page.nextAfterOrd == afterOrd),
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
