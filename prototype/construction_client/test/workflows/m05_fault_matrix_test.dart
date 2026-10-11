import 'dart:io';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/browser_drain_importer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/os_scheduler.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:construction_client/workflows/field_expansion_substrate.dart';
import 'package:construction_client/workflows/field_photo_pipeline.dart';
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

class _FixedRandom implements OrchestratorRandomPort {
  @override
  double next() => 0.5;
}

class _FakeRegistrar implements AttachmentRegistrarPort {
  Uint8List uploaded = Uint8List(0);
  bool failAfterFirstChunk = false;
  bool _failed = false;

  @override
  Future<String> openUpload({
    required String attachmentId,
    required String accountId,
    required String? projectId,
    required String? dailyReportId,
    required String digest,
    required int bytes,
  }) async => 'upload-$attachmentId';

  @override
  Future<int> queryUpload(String uploadId) async => uploaded.length;

  @override
  Future<int> putChunk(String uploadId, int offset, Uint8List chunk) async {
    if (failAfterFirstChunk && !_failed && offset > 0) {
      _failed = true;
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.retryable,
        'network interrupted',
      );
    }
    uploaded = Uint8List.fromList([...uploaded, ...chunk]);
    return uploaded.length;
  }

  @override
  Future<String> completeUpload(
    String uploadId,
    String digest,
    int bytes,
  ) async => 'photo-receipt-$uploadId';
}

typedef _SendHandler = Future<SyncOutcome> Function(SyncEnvelope envelope);

class _TestTransport implements SyncTransportPort {
  _SendHandler handler;
  final List<SyncEnvelope> sent = [];

  _TestTransport(this.handler);

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async {
    sent.add(envelope);
    return handler(envelope);
  }
}

void main() {
  late Directory tmp;
  ConstructionMount? mount;
  late _TestTransport transport;
  var currentTimeMs = 100000;

  ConstructionMount openMountInstance(
    Directory dir,
    SyncTransportPort tp, {
    List<Migration>? migrations,
  }) {
    return openMount(
      options: MountOptions(
        dbPath: '${dir.path}/outbox.db',
        objectRoot: Directory('${dir.path}/objects'),
        extraMigrations: migrations ?? const [
          kDailyReportLocalMigration,
          kFieldExpansionLocalMigration,
          kDurableSchedulerMigration,
        ],
      ),
      credentials: _FakeCredentials(),
      transport: tp,
    );
  }

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('m05_fault_matrix_test');
    currentTimeMs = 100000;
    transport = _TestTransport(
      (envelope) async => SyncOutcome(
        kind: SyncOutcomeKind.accepted,
        opId: envelope.opId,
        receipt: 'rcpt-${envelope.opId}',
        serverSeq: 100,
      ),
    );
    mount = openMountInstance(tmp, transport);
  });

  tearDown(() async {
    mount?.driver.close();
    mount = null;
    await tmp.delete(recursive: true);
  });

  void reopenWith(SyncTransportPort tp, {List<Migration>? migrations}) {
    mount!.driver.close();
    mount = openMountInstance(tmp, tp, migrations: migrations);
  }

  FieldExpansionLocalStore getStore() => FieldExpansionLocalStore(mount!);

  DailyLogSyncOrchestrator getOrchestrator(SyncTransportPort tp) => DailyLogSyncOrchestrator(
    mount: mount!,
    deviceId: 'device-test-01',
    random: _FixedRandom(),
    nowMs: () => currentTimeMs,
  );

  test('M05 fault: attendance conflict preserves entry, surfaces in syncHealth, and survives reopen', () async {
    final store = getStore();
    final draft = AttendanceSubmissionDraft(
      clientUuid: 'att-conflict-01',
      projectId: 'proj-1',
      attendanceDate: '2026-10-12',
      shiftName: 'Day',
      records: const [
        AttendanceRecordItem(
          staffId: 'staff-1',
          staffName: 'Ramesh',
          trade: 'Mason',
          status: 'present',
          regularHours: 8,
          overtimeHours: 2,
        ),
      ],
      supervisorRemarks: 'Shift completed',
    );

    store.saveAttendance(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field_engineer',
      draft: draft,
    );

    // Simulate server returning conflict
    reopenWith(
      _TestTransport(
        (env) async => SyncOutcome(
          kind: SyncOutcomeKind.conflict,
          opId: env.opId,
          detail: 'attendance already finalized for date 2026-10-12',
        ),
      ),
    );

    final orchestrator = getOrchestrator(mount!.transport);
    final result = await orchestrator.drain('acct-1');

    expect(result.conflicts, ['att-conflict-01']);
    final conflictedOp = mount!.pendingOps.getOp('acct-1', 'att-conflict-01')!;
    expect(conflictedOp.state, 'conflict');
    expect(conflictedOp.lastError, contains('attendance already finalized'));

    // Local entity preserved intact (using fresh store from reopened mount)
    final localEntries = getStore().listAttendance('acct-1', 'tenant-1');
    expect(localEntries.length, 1);
    expect(localEntries.first.draft.records.first.staffId, 'staff-1');

    // Sync health surfaces conflict honestly
    final health = getStore().syncHealth('acct-1', 'tenant-1');
    expect(health.conflicts, 1);
    expect(health.synced, isFalse);

    // Process restart: conflict remains preserved and is NOT automatically re-sent
    reopenWith(
      _TestTransport(
        (env) async => throw StateError('conflicts must not be automatically retried'),
      ),
    );
    final reopenedOp = mount!.pendingOps.getOp('acct-1', 'att-conflict-01')!;
    expect(reopenedOp.state, 'conflict');
  });

  test('M05 fault: site expense permission revocation stops drain and preserves uncommitted work', () async {
    final store = getStore();
    final draft = SiteExpenseSubmissionDraft(
      clientUuid: 'exp-revoked-01',
      projectId: 'proj-1',
      expenseDate: '2026-10-12',
      amount: '4500.00',
      category: 'materials',
      payee: 'Himalayan Aggregate Supplies',
      memo: 'Emergency aggregate purchase',
    );

    store.saveSiteExpense(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field_engineer',
      draft: draft,
    );

    reopenWith(
      _TestTransport(
        (env) async => SyncOutcome(
          kind: SyncOutcomeKind.revoked,
          opId: env.opId,
          detail: 'user petty cash authorization revoked',
        ),
      ),
    );

    final orchestrator = getOrchestrator(mount!.transport);
    final result = await orchestrator.drain('acct-1');

    expect(result.stoppedFor, 'revoked');
    expect(result.dispatched, ['exp-revoked-01']);

    // On revocation, op is safely requeued so field user's unsynced work is not destroyed
    final revokedOp = mount!.pendingOps.getOp('acct-1', 'exp-revoked-01')!;
    expect(revokedOp.state, 'pending');

    // Local entity remains intact in SQLite
    final expenses = getStore().listSiteExpenses('acct-1', 'tenant-1');
    expect(expenses.length, 1);
    expect(expenses.first.draft.amount, '4500.00');
  });

  test('M05 fault: material delivery lost acknowledgement preserves original receipt on replay', () async {
    final store = getStore();
    final draft = MaterialDeliverySubmissionDraft(
      clientUuid: 'mrr-lost-ack-01',
      projectId: 'proj-1',
      deliveryDate: '2026-10-12',
      supplierName: 'Himalayan Steel',
      challanNumber: 'CH-888',
      items: const [
        MaterialDeliveryItem(materialCode: 'STEEL-12', materialName: 'Rebar 12mm', quantity: 50, unit: 'rods'),
      ],
    );

    store.saveMaterialDelivery(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field_engineer',
      draft: draft,
    );

    // Initial attempt simulates network timeout after server accepted
    var attempts = 0;
    final testTp = _TestTransport((env) async {
      attempts++;
      if (attempts == 1) {
        throw const SocketException('Connection reset by peer');
      }
      return SyncOutcome(
        kind: SyncOutcomeKind.accepted,
        opId: env.opId,
        receipt: 'authoritative-receipt-mrr-101',
        serverSeq: 300,
      );
    });

    reopenWith(testTp);
    var orchestrator = getOrchestrator(mount!.transport);

    // Attempt 1 fails transiently
    final res1 = await orchestrator.drain('acct-1');
    expect(res1.retrying, ['mrr-lost-ack-01']);
    expect(mount!.pendingOps.getOp('acct-1', 'mrr-lost-ack-01')!.state, 'pending');

    // Time advances past backoff window
    currentTimeMs += 100000;

    // Attempt 2 succeeds and receives authoritative receipt
    final res2 = await orchestrator.drain('acct-1');
    expect(res2.accepted, ['mrr-lost-ack-01']);
    final acceptedOp = mount!.pendingOps.getOp('acct-1', 'mrr-lost-ack-01')!;
    expect(acceptedOp.state, 'accepted');
    expect(acceptedOp.acceptedReceipt, 'authoritative-receipt-mrr-101');
  });

  test('M05 fault: field photo staging interruption excludes photo from office review', () async {
    final photoTmp = await Directory.systemTemp.createTemp('photo_fault_test');
    final registrar = _FakeRegistrar();
    registrar.failAfterFirstChunk = true;

    final photoMount = openMountInstance(
      photoTmp,
      _TestTransport((_) async => throw UnimplementedError()),
      migrations: kM04WorkflowMigrations,
    );

    final manager = AttachmentTransferManager(
      mount: photoMount,
      registrar: registrar,
      nowMs: () => currentTimeMs,
      chunkBytes: 4,
    );

    final photoService = FieldWorkflowPhotoService(
      manager: manager,
      accountId: 'acct-1',
      durableSourceDirectory: Directory('${photoTmp.path}/photos'),
    );

    final bytes = Uint8List.fromList([1, 2, 3, 4, 5, 6, 7, 8]);
    final source = File('${photoTmp.path}/photo.jpg')..writeAsBytesSync(bytes);

    manager.stageBytes(
      accountId: 'acct-1',
      id: 'photo-fault-001',
      projectId: 'proj-1',
      dailyReportId: 'rep-photo-001',
      sourcePath: source.path,
      bytes: bytes,
    );
    manager.finalize('acct-1', 'photo-fault-001');

    // Attempt registration: network fails mid-chunk
    final interrupted = await manager.register('acct-1', 'photo-fault-001');
    expect(interrupted.state, AttachmentTransferState.failed);
    expect(interrupted.failureKind, AttachmentFailureKind.retryable);
    expect(manager.isComplete('acct-1', interrupted.id), isFalse);

    // Office surface query: must filter out incomplete attachments
    final completedPhotos = photoService.listRegisteredForEntity('rep-photo-001');
    expect(completedPhotos, isEmpty);

    // Staging interruption: incomplete photo is NEVER complete in outbox summary
    final summary = photoMount.outbox.pendingWorkSummary('acct-1');
    expect(summary.attachmentsPending, 1);

    // Resume: network recovers, backoff time passes, and completes upload
    registrar.failAfterFirstChunk = false;
    currentTimeMs += 100000;
    final resumed = await manager.resumeAll('acct-1');
    expect(resumed.completed, ['photo-fault-001']);
    expect(manager.isComplete('acct-1', 'photo-fault-001'), isTrue);

    // Now office query shows the registered photo!
    final afterResumed = photoService.listRegisteredForEntity('rep-photo-001');
    expect(afterResumed.length, 1);
    expect(afterResumed.first.id, 'photo-fault-001');

    photoMount.driver.close();
    await photoTmp.delete(recursive: true);
  });

  test('M05 fault: migration replay invariant — interrupted drain replays with zero loss', () async {
    final importer = BrowserDrainImporter(mount: mount!);

    final bundle = {
      'version': 'cm-field-drain-v1',
      'exportedAt': '2026-10-12T00:00:00.000Z',
      'outbox': [
        {
          'id': 'drain-op-1',
          'clientUuid': 'uuid-drain-1',
          'userId': 'acct-1',
          'type': 'attendance',
          'status': 'pending',
          'payload': {
            'projectId': 'proj-1',
            'attendanceDate': '2026-10-12',
            'records': [
              {'staffId': 's1', 'status': 'present', 'regularHours': 8, 'overtimeHours': 0},
            ],
          },
          'createdAt': 1000,
        },
        {
          'id': 'drain-op-2',
          'clientUuid': 'uuid-drain-2',
          'userId': 'acct-1',
          'type': 'expense',
          'status': 'pending',
          'payload': {
            'projectId': 'proj-1',
            'expenseDate': '2026-10-12',
            'amount': '1000.00',
            'category': 'fuel',
            'payee': 'Local Station',
          },
          'createdAt': 2000,
        },
      ],
      'drafts': const [],
    };

    // 1. Import bundle into SQLite
    final importRes = importer.importBundle(bundle);
    expect(importRes.isSuccess, isTrue);
    expect(importRes.importedOutboxCount, 2);

    // 2. Interrupted drain: simulate network drop after 1st op
    var drainCount = 0;
    final interruptedTp = _TestTransport((env) async {
      drainCount++;
      if (drainCount == 1) {
        return SyncOutcome(
          kind: SyncOutcomeKind.accepted,
          opId: env.opId,
          receipt: 'rcpt-${env.opId}',
          serverSeq: 501,
        );
      }
      throw const SocketException('Network disconnected mid-drain');
    });

    reopenWith(interruptedTp);
    var orchestrator = getOrchestrator(mount!.transport);

    await orchestrator.drain('acct-1');

    // Verify interim state: op 1 accepted, op 2 retained pending (zero loss!)
    expect(mount!.pendingOps.getOp('acct-1', 'drain-op-1')!.state, 'accepted');
    expect(mount!.pendingOps.getOp('acct-1', 'drain-op-2')!.state, 'pending');

    // 3. Process restart / recovery: time advances past backoff window, network restores
    currentTimeMs += 100000;
    final normalTp = _TestTransport(
      (env) async => SyncOutcome(
        kind: SyncOutcomeKind.accepted,
        opId: env.opId,
        receipt: 'rcpt-${env.opId}',
        serverSeq: 502,
      ),
    );
    reopenWith(normalTp);
    orchestrator = getOrchestrator(mount!.transport);

    final finalResult = await orchestrator.drain('acct-1');
    expect(finalResult.accepted, ['drain-op-2']);

    // Final invariant: all unsynchronized work drained with zero loss
    final allOps = mount!.driver.prepare('SELECT state FROM pending_op').all(const []);
    expect(allOps.every((o) => o['state'] == 'accepted'), isTrue);
  });
}
