import 'dart:io';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/workflows/field_photo_pipeline.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeRegistrar implements AttachmentRegistrarPort {
  Uint8List uploaded = Uint8List(0);
  int uploadCount = 0;

  @override
  Future<String> openUpload({
    required String attachmentId,
    required String accountId,
    required String? projectId,
    String? dailyReportId,
    required String digest,
    required int bytes,
  }) async {
    uploadCount++;
    uploaded = Uint8List(0);
    return 'upload-sess-$attachmentId';
  }

  @override
  Future<int> queryUpload(String uploadId) async => uploaded.length;

  @override
  Future<int> putChunk(String uploadId, int offset, Uint8List chunk) async {
    uploaded = Uint8List.fromList([...uploaded, ...chunk]);
    return uploaded.length;
  }

  @override
  Future<String> completeUpload(
    String uploadId,
    String digest,
    int bytes,
  ) async => 'rcpt-photo-verified-$uploadId';
}

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

class _FakeTransport implements SyncTransportPort {
  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async =>
      throw StateError('Transport not used in photo pipeline test');
}

void main() {
  late Directory tmp;
  ConstructionMount? mounted;
  late _FakeRegistrar registrar;
  late AttachmentTransferManager manager;
  late FieldWorkflowPhotoService photoService;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('field_photo_pipeline_test');
    registrar = _FakeRegistrar();

    mounted = openMount(
      options: MountOptions(
        dbPath: '${tmp.path}/outbox.db',
        objectRoot: Directory('${tmp.path}/objects'),
        extraMigrations: kM04WorkflowMigrations,
      ),
      credentials: _FakeCredentials(),
      transport: _FakeTransport(),
    );

    manager = AttachmentTransferManager(
      mount: mounted!,
      registrar: registrar,
      chunkBytes: 1024,
    );

    photoService = FieldWorkflowPhotoService(
      manager: manager,
      accountId: 'acct-1',
      durableSourceDirectory: Directory('${tmp.path}/photos'),
    );
  });

  tearDown(() async {
    mounted?.driver.close();
    mounted = null;
    await tmp.delete(recursive: true);
  });

  test('stages, finalizes, and registers photo through the shared M03-T06 journal', () async {
    // Generate valid JPEG bytes
    final photoBytes = Uint8List.fromList([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      ...List.generate(100, (i) => i % 256),
    ]);

    final sourcePath = '${tmp.path}/test_source.jpg';
    await File(sourcePath).writeAsBytes(photoBytes, flush: true);

    final record = await photoService.stageBytesAndRegister(
      projectId: 'proj-1',
      entityId: 'exp-client-uuid-001',
      mediaKind: FieldWorkflowMediaKind.siteExpenseReceipt,
      sourcePath: sourcePath,
      bytes: photoBytes,
    );

    expect(record.state, AttachmentTransferState.registered);
    expect(record.complete, isTrue);
    expect(record.receipt, startsWith('rcpt-photo-verified-'));
    expect(record.digest, isNotNull);

    // Verify stored bytes can be read back
    final storedBytes = photoService.readRegisteredBytes(record.id);
    expect(storedBytes, isNotNull);
    expect(storedBytes, photoBytes);
  });

  test('office review visibility: listRegisteredForEntity includes ONLY registered photos', () async {
    final photoBytes1 = Uint8List.fromList([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46,
      ...List.generate(50, (i) => i),
    ]);
    final photoBytes2 = Uint8List.fromList([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46,
      ...List.generate(60, (i) => i + 10),
    ]);

    final sourcePath1 = '${tmp.path}/photo1.jpg';
    final sourcePath2 = '${tmp.path}/photo2.jpg';
    await File(sourcePath1).writeAsBytes(photoBytes1, flush: true);
    await File(sourcePath2).writeAsBytes(photoBytes2, flush: true);

    // Photo 1: Fully registered
    await photoService.stageBytesAndRegister(
      projectId: 'proj-1',
      entityId: 'del-uuid-100',
      mediaKind: FieldWorkflowMediaKind.materialDeliveryReceipt,
      sourcePath: sourcePath1,
      bytes: photoBytes1,
      overrideId: 'photo-registered-001',
    );

    // Photo 2: Staged only (not registered yet)
    manager.stageBytes(
      accountId: 'acct-1',
      id: 'photo-staged-only-002',
      projectId: 'proj-1',
      dailyReportId: 'del-uuid-100',
      sourcePath: sourcePath2,
      bytes: photoBytes2,
    );

    // All photos list contains 2
    final all = photoService.listForEntity('del-uuid-100');
    expect(all.length, 2);

    // Office review list contains ONLY the 1 registered photo
    final officeList = photoService.listRegisteredForEntity('del-uuid-100');
    expect(officeList.length, 1);
    expect(officeList.first.id, 'photo-registered-001');
    expect(officeList.first.complete, isTrue);
  });

  test('multiple expansion workflows share the same journal without per-workflow forks', () async {
    final receiptBytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]);
    final challanBytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 4, 5, 6]);

    await photoService.stageBytesAndRegister(
      projectId: 'proj-1',
      entityId: 'exp-uuid-1',
      mediaKind: FieldWorkflowMediaKind.siteExpenseReceipt,
      sourcePath: '${tmp.path}/s1.jpg',
      bytes: receiptBytes,
      overrideId: 'att-exp-01',
    );

    await photoService.stageBytesAndRegister(
      projectId: 'proj-1',
      entityId: 'mrr-uuid-1',
      mediaKind: FieldWorkflowMediaKind.materialDeliveryReceipt,
      sourcePath: '${tmp.path}/s2.jpg',
      bytes: challanBytes,
      overrideId: 'att-mrr-01',
    );

    final expensePhotos = photoService.listRegisteredForEntity('exp-uuid-1');
    final deliveryPhotos = photoService.listRegisteredForEntity('mrr-uuid-1');

    expect(expensePhotos.length, 1);
    expect(expensePhotos.first.id, 'att-exp-01');

    expect(deliveryPhotos.length, 1);
    expect(deliveryPhotos.first.id, 'att-mrr-01');

    // Both live in the same SQLite attachment table
    final rows = mounted!.driver.prepare('SELECT id, state FROM attachment').all(const []);
    expect(rows.length, 2);
    expect(rows.every((r) => r['state'] == 'registered'), isTrue);
  });
}
