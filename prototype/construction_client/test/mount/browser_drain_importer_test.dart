import 'dart:io';

import 'package:construction_client/mount/browser_drain_importer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/os_scheduler.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:construction_client/workflows/field_expansion_substrate.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeCredentials implements SecureCredentialStore {
  @override
  SecureStorageBinding get binding => SecureStorageBinding.linuxSecretService;

  @override
  Future<void> delete(CredentialRef ref) async {}

  @override
  Future<String?> load(CredentialRef ref) async => 'mock-token';

  @override
  Future<void> save(CredentialRef ref, String value) async {}

  @override
  Future<void> wipeAll() async {}
}

class _RecordingTransport implements SyncTransportPort {
  final List<SyncEnvelope> sent = [];
  int seq = 1;

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async {
    sent.add(envelope);
    return SyncOutcome(
      kind: SyncOutcomeKind.accepted,
      opId: envelope.opId,
      receipt: 'rcpt-drain-${envelope.opId}',
      serverSeq: seq++,
    );
  }
}

void main() {
  late Directory tmp;
  late _RecordingTransport transport;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('browser_drain_test');
    transport = _RecordingTransport();
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  ConstructionMount open() => openMount(
    options: MountOptions(
      dbPath: '${tmp.path}/outbox.db',
      objectRoot: Directory('${tmp.path}/objects'),
      extraMigrations: const [
        kDailyReportLocalMigration,
        kFieldExpansionLocalMigration,
        kDurableSchedulerMigration,
      ],
    ),
    credentials: _FakeCredentials(),
    transport: transport,
  );

  test('browser drain importer: imports bundle into SQLite outbox and local tables with IDs intact', () async {
    final mount = open();
    final importer = BrowserDrainImporter(mount: mount);

    final bundle = {
      'version': 'cm-field-drain-v1',
      'exportedAt': '2026-10-12T00:00:00.000Z',
      'outbox': [
        {
          'id': 'pwa-att-001',
          'clientUuid': 'client-uuid-att-1',
          'userId': 'worker-john',
          'tenantId': 'tenant-acme',
          'type': 'attendance',
          'status': 'pending',
          'payload': {
            'projectId': 'proj-101',
            'attendanceDate': '2026-10-12',
            'records': [
              {'staffId': 's1', 'status': 'present', 'regularHours': 8, 'overtimeHours': 0},
            ],
          },
          'createdAt': 1700000000,
        },
        {
          'id': 'pwa-exp-002',
          'clientUuid': 'client-uuid-exp-2',
          'userId': 'worker-john',
          'tenantId': 'tenant-acme',
          'type': 'expense',
          'status': 'pending',
          'payload': {
            'projectId': 'proj-101',
            'expenseDate': '2026-10-12',
            'amount': 2500,
            'category': 'fuel',
          },
          'createdAt': 1700000010,
        },
        {
          'id': 'pwa-synced-003',
          'clientUuid': 'client-uuid-synced-3',
          'userId': 'worker-john',
          'tenantId': 'tenant-acme',
          'type': 'daily_report',
          'status': 'synced',
          'payload': {'projectId': 'proj-101'},
          'createdAt': 1700000020,
        },
      ],
      'drafts': [
        {
          'id': 'draft-mrr-100',
          'userId': 'worker-john',
          'type': 'material_delivery',
          'payload': {
            'projectId': 'proj-101',
            'supplierName': 'Everest Cement',
          },
          'updatedAt': 1700000030,
        },
      ],
    };

    final result = importer.importBundle(bundle);

    expect(result.isSuccess, isTrue);
    expect(result.importedOutboxCount, 2);
    expect(result.importedDraftsCount, 1);
    expect(result.skippedExistingCount, 1); // pwa-synced-003 skipped

    // Verify pending_op entries in SQLite
    final pendingOps = mount.driver.prepare('SELECT id, kind, state, payload FROM pending_op ORDER BY created_at').all(const []);
    expect(pendingOps.length, 2);
    expect(pendingOps[0]['id'], 'pwa-att-001');
    expect(pendingOps[0]['kind'], 'field_expansion.attendance.record');
    expect(pendingOps[0]['state'], 'pending');

    expect(pendingOps[1]['id'], 'pwa-exp-002');
    expect(pendingOps[1]['kind'], 'field_expansion.site_expense.create');
    expect(pendingOps[1]['state'], 'pending');

    // Verify local workflow stores
    final attendanceRows = mount.driver.prepare('SELECT client_uuid, project_id FROM attendance_local').all(const []);
    expect(attendanceRows.length, 1);
    expect(attendanceRows[0]['client_uuid'], 'client-uuid-att-1');

    final expenseRows = mount.driver.prepare('SELECT client_uuid, project_id FROM site_expense_local').all(const []);
    expect(expenseRows.length, 1);
    expect(expenseRows[0]['client_uuid'], 'client-uuid-exp-2');

    // Verify draft entry
    final drafts = mount.driver.prepare('SELECT id, kind FROM private_draft').all(const []);
    expect(drafts.length, 1);
    expect(drafts[0]['id'], 'draft-mrr-100');

    // Idempotent re-run: importing the exact same bundle again skips all existing
    final result2 = importer.importBundle(bundle);
    expect(result2.isSuccess, isTrue);
    expect(result2.importedOutboxCount, 0);
    expect(result2.skippedExistingCount, 3); // 2 existing outbox + 1 synced

    // Draining the imported items via native orchestrator succeeds completely!
    final orchestrator = DailyLogSyncOrchestrator(
      mount: mount,
      deviceId: 'device-test-01',
    );
    orchestrator.bindDrainTriggers(() => 'worker-john');

    await mount.drainTriggers.onLaunch();
    expect(transport.sent.length, 2);
    final drainedOps = mount.driver.prepare('SELECT state FROM pending_op').all(const []);
    expect(drainedOps.every((o) => o['state'] == 'accepted'), isTrue);

    mount.driver.close();
  });

  test('browser drain importer: rejects invalid bundle version', () {
    final mount = open();
    final importer = BrowserDrainImporter(mount: mount);

    final invalidBundle = {
      'version': 'invalid-version-99',
      'outbox': [],
    };

    final result = importer.importBundle(invalidBundle);
    expect(result.isSuccess, isFalse);
    expect(result.errors.first, contains('Unsupported bundle version'));

    mount.driver.close();
  });
}
