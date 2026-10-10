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

class _Registrar implements AttachmentRegistrarPort {
  Uint8List uploaded = Uint8List(0);
  bool failAfterFirstChunk = false;
  bool _failed = false;

  @override
  Future<String> openUpload({
    required String attachmentId,
    required String accountId,
    required String? projectId,
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
