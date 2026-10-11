import 'dart:io';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory tmp;
  ConstructionMount? mount;
  late _Registrar registrar;
  late AttachmentTransferManager manager;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('attachment_transfer_test');
    registrar = _Registrar();
    mount = _open(tmp);
    manager = AttachmentTransferManager(
      mount: mount!,
      registrar: registrar,
      nowMs: () => 1000,
      chunkBytes: 4,
      backoffBaseMs: 10,
    );
  });

  tearDown(() async {
    mount?.driver.close();
    mount = null;
    await tmp.delete(recursive: true);
  });

  test(
    'photo remains incomplete until finalize and server registration receipt',
    () async {
      final bytes = Uint8List.fromList(List.generate(11, (index) => index + 1));
      final source = File('${tmp.path}/source.jpg');
      await source.writeAsBytes(bytes, flush: true);

      final staged = manager.stageBytes(
        accountId: 'acct-1',
        id: 'photo-uuid-0001',
        projectId: 'project-1',
        dailyReportId: 'report-client-1',
        sourcePath: source.path,
        bytes: bytes,
      );
      expect(staged.state, AttachmentTransferState.staged);
      expect(manager.isComplete('acct-1', staged.id), isFalse);
      expect(mount!.outbox.pendingWorkSummary('acct-1').attachmentsPending, 1);

      final finalized = manager.finalize('acct-1', staged.id);
      expect(finalized.state, AttachmentTransferState.finalized);
      expect(manager.isComplete('acct-1', staged.id), isFalse);

      final registered = await manager.register('acct-1', staged.id);
      expect(registered.state, AttachmentTransferState.registered);
      expect(registered.receipt, 'stored-photo-receipt');
      expect(manager.isComplete('acct-1', staged.id), isTrue);
      expect(mount!.outbox.pendingWorkSummary('acct-1').attachmentsPending, 0);
      expect(registrar.uploaded, bytes);
      expect(registrar.lastDailyReportId, 'report-client-1');
      expect(
        manager.events('acct-1', staged.id).map((event) => event['kind']),
        [
          'stage_started',
          'staged_verified',
          'finalized',
          'upload_opened',
          'chunk_ack',
          'chunk_ack',
          'chunk_ack',
          'registered',
        ],
      );
    },
  );

  test(
    'resume uses server byte offset after interrupted upload and app reopen',
    () async {
      final bytes = Uint8List.fromList(
        List.generate(13, (index) => 30 + index),
      );
      final source = File('${tmp.path}/resume-source.jpg');
      await source.writeAsBytes(bytes, flush: true);
      manager.stageBytes(
        accountId: 'acct-1',
        id: 'photo-resume-0001',
        projectId: 'project-1',
        sourcePath: source.path,
        bytes: bytes,
      );
      manager.finalize('acct-1', 'photo-resume-0001');
      registrar.failAfterFirstChunk = true;

      final interrupted = await manager.register('acct-1', 'photo-resume-0001');
      expect(interrupted.state, AttachmentTransferState.failed);
      expect(interrupted.failureKind, AttachmentFailureKind.retryable);
      expect(manager.isComplete('acct-1', interrupted.id), isFalse);

      mount!.driver.close();
      mount = _open(tmp);
      manager = AttachmentTransferManager(
        mount: mount!,
        registrar: registrar,
        nowMs: () => 50000,
        chunkBytes: 4,
      );
      final summary = await manager.resumeAll('acct-1');

      expect(summary.completed, ['photo-resume-0001']);
      expect(summary.failed, isEmpty);
      expect(registrar.uploaded, bytes);
      expect(
        manager.get('acct-1', 'photo-resume-0001')!.receipt,
        'stored-photo-receipt',
      );
    },
  );

  test('sanitized server metadata survives reopening without replacing original bytes', () async {
    final bytes = Uint8List.fromList([1, 2, 3, 4]);
    final source = File('${tmp.path}/original.jpg');
    await source.writeAsBytes(bytes, flush: true);
    manager = AttachmentTransferManager(
      mount: mount!,
      registrar: _SanitizingRegistrar(),
    );
    final staged = manager.stageBytes(
      accountId: 'acct-1',
      id: 'sanitized-photo',
      projectId: 'project-1',
      sourcePath: source.path,
      bytes: bytes,
    );
    manager.finalize('acct-1', staged.id);
    await manager.register('acct-1', staged.id);
    mount!.driver.close();
    mount = _open(tmp);
    manager = AttachmentTransferManager(mount: mount!, registrar: registrar);
    final restored = manager.get('acct-1', staged.id)!;
    expect(restored.complete, isTrue);
    expect(restored.registeredDigest, List.filled(64, 'b').join());
    expect(restored.registeredBytes, 2);
    expect(restored.bytes, bytes.length);
    expect(mount!.objects.getBytes(restored.objectKey!), bytes);
  });

  test('a failed digest verification never marks a photo complete', () async {
    final bytes = Uint8List.fromList([1, 2, 3, 4]);
    final source = File('${tmp.path}/tamper-source.jpg');
    await source.writeAsBytes(bytes, flush: true);
    final corrupt = _CorruptingObjectStore(mount!.objects);
    manager = AttachmentTransferManager(
      mount: mount!,
      registrar: registrar,
      objects: corrupt,
      nowMs: () => 1000,
    );
    final staged = manager.stageBytes(
      accountId: 'acct-1',
      id: 'photo-tamper-0001',
      projectId: 'project-1',
      sourcePath: source.path,
      bytes: bytes,
    );
    expect(staged.state, AttachmentTransferState.staged);
    corrupt.corruptOnRename = true;
    final failed = manager.finalize('acct-1', staged.id);
    expect(failed.state, AttachmentTransferState.failed);
    expect(failed.failureKind, AttachmentFailureKind.digestMismatch);
    expect(manager.isComplete('acct-1', staged.id), isFalse);
  });

  test(
    'restore verifies registered bytes and is idempotent after completion',
    () async {
      final bytes = Uint8List.fromList([5, 8, 13, 21]);
      final fetcher = _Fetch(bytes);
      final restored = await manager.restoreRegistered(
        accountId: 'acct-restore',
        attachmentId: 'photo-restore-0001',
        projectId: 'project-1',
        dailyReportId: 'report-restore-1',
        objectId: 'object-123',
        receipt: 'receipt-123',
        expectedDigest: mount!.digest.digest(bytes),
        expectedBytes: bytes.length,
        sourcePath: '${tmp.path}/restored-source.jpg',
        scope: const ScopeClaims(
          tenantId: 'tenant-1',
          projectId: 'project-1',
          role: 'field',
        ),
        fetcher: fetcher,
      );

      expect(restored.state, AttachmentTransferState.registered);
      expect(restored.receipt, 'receipt-123');
      expect(restored.dailyReportId, 'report-restore-1');
      expect(restored.registeredDigest, mount!.digest.digest(bytes));
      expect(restored.registeredBytes, bytes.length);
      expect(manager.isComplete('acct-restore', restored.id), isTrue);
      expect(mount!.objects.getBytes(attachmentFinalKey(restored.id)), bytes);

      final repeated = await manager.restoreRegistered(
        accountId: 'acct-restore',
        attachmentId: 'photo-restore-0001',
        projectId: 'project-1',
        dailyReportId: 'report-restore-1',
        objectId: 'object-123',
        receipt: 'receipt-123',
        expectedDigest: mount!.digest.digest(bytes),
        expectedBytes: bytes.length,
        sourcePath: '${tmp.path}/restored-source.jpg',
        scope: const ScopeClaims(
          tenantId: 'tenant-1',
          projectId: 'project-1',
          role: 'field',
        ),
        fetcher: fetcher,
      );
      expect(repeated.id, restored.id);
      expect(fetcher.calls, 1);
    },
  );

  test('tampered restore bytes produce a typed incomplete record', () async {
    final restored = await manager.restoreRegistered(
      accountId: 'acct-restore',
      attachmentId: 'photo-restore-bad1',
      projectId: 'project-1',
      dailyReportId: 'report-restore-2',
      objectId: 'object-123',
      receipt: 'receipt-123',
      expectedDigest: 'wrong-digest',
      sourcePath: '${tmp.path}/restored-source.jpg',
      scope: const ScopeClaims(
        tenantId: 'tenant-1',
        projectId: 'project-1',
        role: 'field',
      ),
      fetcher: _Fetch(Uint8List.fromList([5, 8, 13, 21])),
    );

    expect(restored.state, AttachmentTransferState.failed);
    expect(restored.failureKind, AttachmentFailureKind.digestMismatch);
    expect(manager.isComplete('acct-restore', restored.id), isFalse);
  });
}

ConstructionMount _open(Directory tmp) => openMount(
  options: MountOptions(
    dbPath: '${tmp.path}/outbox.db',
    objectRoot: Directory('${tmp.path}/objects'),
    extraMigrations: kM04WorkflowMigrations,
  ),
  credentials: _Credentials(),
  transport: _Transport(),
);

class _SanitizingRegistrar extends _Registrar
    implements VerifiedAttachmentRegistrarPort {
  @override
  Future<VerifiedAttachmentRegistration> completeVerifiedUpload(
    String uploadId,
    String digest,
    int bytes,
  ) async => VerifiedAttachmentRegistration(
    'stored-photo-receipt',
    List.filled(64, 'b').join(),
    2,
  );
}

class _Registrar implements AttachmentRegistrarPort {
  Uint8List uploaded = Uint8List(0);
  String? lastDailyReportId;
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
  }) async {
    lastDailyReportId = dailyReportId;
    return 'upload-$attachmentId';
  }

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
        'offset mismatch',
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
  ) async => 'stored-photo-receipt';
}

class _Fetch implements RegisteredAttachmentFetchPort {
  final Uint8List bytes;
  int calls = 0;
  _Fetch(this.bytes);

  @override
  Future<Uint8List> fetchRegistered({
    required String receipt,
    required String objectId,
    required ScopeClaims scope,
  }) async {
    calls++;
    return bytes;
  }
}

class _CorruptingObjectStore implements ObjectStore {
  final ObjectStore inner;
  bool corruptOnRename = false;

  _CorruptingObjectStore(this.inner);

  @override
  void putBytes(String key, Uint8List bytes) => inner.putBytes(key, bytes);

  @override
  Uint8List getBytes(String key) => inner.getBytes(key);

  @override
  int? statBytes(String key) => inner.statBytes(key);

  @override
  void removeBytes(String key) => inner.removeBytes(key);

  @override
  void renameBytes(String fromKey, String toKey) {
    inner.renameBytes(fromKey, toKey);
    if (corruptOnRename) {
      inner.putBytes(toKey, Uint8List.fromList([9, 9, 9, 9]));
    }
  }

  @override
  List<String> listKeys(String prefix) => inner.listKeys(prefix);
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
