import 'dart:io';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
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

  test(
    'expired login stops the batch and leaves the report locally visible',
    () async {
      getStore().save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft('report-expired-login1'),
      );
      reopenWith(
        _Transport(
          (envelope) async => SyncOutcome(
            kind: SyncOutcomeKind.authenticationRequired,
            opId: envelope.opId,
            detail: 'session expired',
          ),
        ),
      );
      final sync = engine(mount!.transport);
      final result = await sync.drain('acct-1');
      expect(result.stoppedFor, 'authentication_required');
      expect(
        getStore().get('acct-1', 'report-expired-login1')?.remarks,
        'Crew poured footing',
      );
      expect(
        mount!.pendingOps.getOp('acct-1', 'report-expired-login1')?.state,
        'pending',
      );
    },
  );

  test('absent network requeues without losing the report', () async {
    getStore().save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: draft('report-network-off01'),
    );
    reopenWith(_Transport((_) async => throw const SocketException('offline')));
    final sync = engine(mount!.transport);
    final result = await sync.drain('acct-1');
    expect(result.retrying, ['report-network-off01']);
    expect(
      getStore().get('acct-1', 'report-network-off01')?.remarks,
      'Crew poured footing',
    );
    expect(
      getStore().syncHealth('acct-1', 'tenant-1').pendingOperationCount,
      1,
    );
  });

  test(
    'server rejection keeps the local report and rejection health visible',
    () async {
      getStore().save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft('report-rejected-001'),
      );
      reopenWith(
        _Transport(
          (envelope) async => SyncOutcome(
            kind: SyncOutcomeKind.rejected,
            opId: envelope.opId,
            detail: 'daily report permission denied',
          ),
        ),
      );
      final sync = engine(mount!.transport);
      final result = await sync.drain('acct-1');
      expect(result.rejected, ['report-rejected-001']);
      expect(
        getStore().get('acct-1', 'report-rejected-001')?.remarks,
        'Crew poured footing',
      );
      expect(
        mount!.pendingOps.getOp('acct-1', 'report-rejected-001')?.state,
        'rejected',
      );
      expect(
        getStore().syncHealth('acct-1', 'tenant-1').rejections,
        isNotEmpty,
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

  test(
    'lost acknowledgement replays the same mounted op without a second effect',
    () async {
      getStore().save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: draft('report-lost-ack001'),
      );
      SyncEnvelope? firstEnvelope;
      var serverEffects = 0;
      reopenWith(
        _Transport((envelope) async {
          firstEnvelope = envelope;
          serverEffects++;
          throw const SocketException('response lost after server commit');
        }),
      );
      final first = await engine(mount!.transport).drain('acct-1');
      expect(first.retrying, ['report-lost-ack001']);
      expect(
        getStore().get('acct-1', 'report-lost-ack001')?.remarks,
        'Crew poured footing',
      );
      expect(
        getStore().syncHealth('acct-1', 'tenant-1').pendingOperationCount,
        1,
      );

      SyncEnvelope? replayEnvelope;
      reopenWith(
        _Transport((envelope) async {
          replayEnvelope = envelope;
          return SyncOutcome(
            kind: SyncOutcomeKind.previouslyAccepted,
            opId: envelope.opId,
            receipt: 'receipt-from-first-commit',
            serverSeq: 42,
          );
        }),
      );
      final replay = await engine(
        mount!.transport,
        nowMs: () => 2000,
      ).drain('acct-1');

      expect(replay.previouslyAccepted, ['report-lost-ack001']);
      expect(replayEnvelope!.opId, firstEnvelope!.opId);
      expect(replayEnvelope!.payloadDigest, firstEnvelope!.payloadDigest);
      expect(serverEffects, 1);
      expect(
        mount!.pendingOps
            .getOp('acct-1', 'report-lost-ack001')
            ?.acceptedReceipt,
        'receipt-from-first-commit',
      );
      expect(
        getStore().syncHealth('acct-1', 'tenant-1').pendingOperationCount,
        0,
      );
    },
  );

  test('interrupted photo upload remains incomplete and resumes after mount reopen', () async {
    final bytes = Uint8List.fromList(List.generate(13, (index) => index + 1));
    final source = File('${tmp.path}/report-photo.jpg');
    await source.writeAsBytes(bytes, flush: true);
    final registrar = _PhotoRegistrar()..failAfterFirstChunk = true;
    var manager = AttachmentTransferManager(
      mount: mount!,
      registrar: registrar,
      nowMs: () => 1000,
      chunkBytes: 4,
      backoffBaseMs: 10,
    );
    manager.stageBytes(
      accountId: 'acct-1',
      id: 'photo-fault-0001',
      projectId: 'project-1',
      dailyReportId: 'report-photo-0001',
      sourcePath: source.path,
      bytes: bytes,
    );
    manager.finalize('acct-1', 'photo-fault-0001');

    final interrupted = await manager.register('acct-1', 'photo-fault-0001');
    expect(interrupted.state, AttachmentTransferState.failed);
    expect(interrupted.failureKind, AttachmentFailureKind.retryable);
    expect(manager.isComplete('acct-1', interrupted.id), isFalse);
    expect(mount!.outbox.pendingWorkSummary('acct-1').attachmentsPending, 1);

    mount!.driver.close();
    mount = _open(
      tmp,
      _Transport(
        (_) async => throw StateError('daily report sync must not be invoked'),
      ),
    );
    manager = AttachmentTransferManager(
      mount: mount!,
      registrar: registrar,
      nowMs: () => 50000,
      chunkBytes: 4,
    );
    final resumed = await manager.resumeAll('acct-1');

    expect(resumed.completed, ['photo-fault-0001']);
    expect(resumed.failed, isEmpty);
    expect(manager.isComplete('acct-1', 'photo-fault-0001'), isTrue);
    expect(registrar.uploaded, bytes);
    expect(
      manager.get('acct-1', 'photo-fault-0001')?.dailyReportId,
      'report-photo-0001',
    );
    expect(mount!.outbox.pendingWorkSummary('acct-1').attachmentsPending, 0);
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
        extraMigrations: kM04WorkflowMigrations,
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

class _PhotoRegistrar implements AttachmentRegistrarPort {
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
    if (offset != uploaded.length) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.internal,
        'server byte offset did not match upload chunk',
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
  ) async => 'photo-receipt';
}
