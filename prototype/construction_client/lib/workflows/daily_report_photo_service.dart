import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

import '../mount/attachment_transfer.dart';
import 'daily_report_photo_port.dart';

/// Native photo picker plus durable source-file binding for M03-T06.
/// [durableSourceDirectory] must be an app-private persistent directory,
/// supplied by the host (for example its application-support directory).
class DailyReportPhotoService implements DailyReportPhotoPort {
  final AttachmentTransferManager manager;
  final String accountId;
  final Directory durableSourceDirectory;
  final ImagePicker picker;

  DailyReportPhotoService({
    required this.manager,
    required this.accountId,
    required this.durableSourceDirectory,
    ImagePicker? picker,
  }) : picker = picker ?? ImagePicker();

  @override
  List<AttachmentTransferRecord> list() => manager.list(accountId);

  @override
  Future<AttachmentTransferRecord?> captureAndRegister({
    required String projectId,
    required String dailyReportId,
    required PhotoCaptureSource source,
  }) async {
    if (projectId.isEmpty || dailyReportId.isEmpty) {
      throw StateError('Select a project and report before adding a photo.');
    }
    final selected = await picker.pickImage(
      source: source == PhotoCaptureSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: 1920,
      imageQuality: 85,
    );
    if (selected == null) return null;
    final bytes = await selected.readAsBytes();
    if (!_isJpeg(bytes) && !_isPng(bytes)) {
      throw const FormatException('Choose a JPEG or PNG photo.');
    }
    await durableSourceDirectory.create(recursive: true);
    final id = _newId();
    final sourceFile = File(
      '${durableSourceDirectory.path}${Platform.pathSeparator}$id.photo',
    );
    await sourceFile.writeAsBytes(bytes, flush: true);
    final staged = manager.stageBytes(
      accountId: accountId,
      id: id,
      projectId: projectId,
      dailyReportId: dailyReportId,
      sourcePath: sourceFile.path,
      bytes: bytes,
    );
    if (staged.state == AttachmentTransferState.failed) return staged;
    final finalized = manager.finalize(accountId, id);
    if (finalized.state == AttachmentTransferState.failed) return finalized;
    return manager.register(accountId, id);
  }

  @override
  Future<AttachmentTransferRecord> retry(String attachmentId) =>
      manager.retry(accountId, attachmentId);

  @override
  Future<AttachmentResumeSummary> resumeAll() => manager.resumeAll(accountId);

  @override
  Uint8List? registeredBytes(String attachmentId) {
    final record = manager.get(accountId, attachmentId);
    if (record == null || !record.complete || record.objectKey == null) {
      return null;
    }
    return manager.mount.objects.getBytes(record.objectKey!);
  }
}

String _newId() {
  final random = Random.secure();
  return List.generate(
    16,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

bool _isJpeg(Uint8List bytes) =>
    bytes.length >= 3 &&
    bytes[0] == 0xff &&
    bytes[1] == 0xd8 &&
    bytes[2] == 0xff;

bool _isPng(Uint8List bytes) =>
    bytes.length >= 8 &&
    bytes[0] == 0x89 &&
    bytes[1] == 0x50 &&
    bytes[2] == 0x4e &&
    bytes[3] == 0x47 &&
    bytes[4] == 0x0d &&
    bytes[5] == 0x0a &&
    bytes[6] == 0x1a &&
    bytes[7] == 0x0a;
