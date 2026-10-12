import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

import '../mount/attachment_transfer.dart';

/// Supported media workflow families in M05.
enum FieldWorkflowMediaKind {
  dailyReport('daily_report'),
  siteExpenseReceipt('site_expense'),
  materialDeliveryReceipt('material_delivery'),
  generalFieldPhoto('general');

  final String key;
  const FieldWorkflowMediaKind(this.key);
}

enum FieldMediaCaptureSource { camera, gallery, file }

/// Unified media port across all field workflows (M05-T05).
/// Binds directly to the M03-T06 AttachmentTransferManager and reconciliation journal.
abstract interface class FieldWorkflowPhotoPort {
  /// Lists all attachments staged or registered for an account.
  List<AttachmentTransferRecord> list();

  /// Lists attachments attached to a specific workflow entity (report, expense, delivery).
  List<AttachmentTransferRecord> listForEntity(String entityId);

  /// Lists ONLY fully registered attachments eligible for office review (complete == true).
  List<AttachmentTransferRecord> listRegisteredForEntity(String entityId);

  /// Ingests, stages, finalizes, and registers a photo from camera or gallery.
  Future<AttachmentTransferRecord?> captureAndRegister({
    required String projectId,
    required String entityId,
    required FieldWorkflowMediaKind mediaKind,
    required FieldMediaCaptureSource source,
  });

  /// Stages, finalizes, and registers raw bytes directly through the M03-T06 pipeline.
  Future<AttachmentTransferRecord> stageBytesAndRegister({
    required String projectId,
    required String entityId,
    required FieldWorkflowMediaKind mediaKind,
    required String sourcePath,
    required Uint8List bytes,
  });

  /// Reads verified local bytes of a registered photo. Returns null if incomplete.
  Uint8List? readRegisteredBytes(String attachmentId);

  /// Retries a failed photo transfer.
  Future<AttachmentTransferRecord> retry(String attachmentId);

  /// Resumes all pending/in-flight photo transfers.
  Future<AttachmentResumeSummary> resumeAll();
}

/// Production implementation of [FieldWorkflowPhotoPort] bound to [AttachmentTransferManager].
class FieldWorkflowPhotoService implements FieldWorkflowPhotoPort {
  final AttachmentTransferManager manager;
  final String accountId;
  final Directory durableSourceDirectory;
  final ImagePicker picker;

  static const int maxPhotoBytes = 10 * 1024 * 1024; // 10 MB per photo

  FieldWorkflowPhotoService({
    required this.manager,
    required this.accountId,
    required this.durableSourceDirectory,
    ImagePicker? picker,
  }) : picker = picker ?? ImagePicker();

  @override
  List<AttachmentTransferRecord> list() => manager.list(accountId);

  @override
  List<AttachmentTransferRecord> listForEntity(String entityId) {
    return manager.list(accountId).where((rec) {
      return rec.dailyReportId == entityId;
    }).toList(growable: false);
  }

  @override
  List<AttachmentTransferRecord> listRegisteredForEntity(String entityId) {
    return manager.list(accountId).where((rec) {
      return rec.dailyReportId == entityId &&
          rec.complete &&
          rec.receipt != null;
    }).toList(growable: false);
  }

  @override
  Future<AttachmentTransferRecord?> captureAndRegister({
    required String projectId,
    required String entityId,
    required FieldWorkflowMediaKind mediaKind,
    required FieldMediaCaptureSource source,
  }) async {
    if (projectId.isEmpty || entityId.isEmpty) {
      throw StateError('Project and entity identifier are required to attach media.');
    }

    final selected = await picker.pickImage(
      source: source == FieldMediaCaptureSource.camera
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
    if (bytes.isEmpty || bytes.length > maxPhotoBytes) {
      throw const FormatException('Each photo must be between 1 byte and 10 MB.');
    }

    await durableSourceDirectory.create(recursive: true);
    final id = _generateId();
    final sourceFile = File(
      '${durableSourceDirectory.path}${Platform.pathSeparator}$id.photo',
    );
    await sourceFile.writeAsBytes(bytes, flush: true);

    return stageBytesAndRegister(
      projectId: projectId,
      entityId: entityId,
      mediaKind: mediaKind,
      sourcePath: sourceFile.path,
      bytes: bytes,
      overrideId: id,
    );
  }

  @override
  Future<AttachmentTransferRecord> stageBytesAndRegister({
    required String projectId,
    required String entityId,
    required FieldWorkflowMediaKind mediaKind,
    required String sourcePath,
    required Uint8List bytes,
    String? overrideId,
  }) async {
    final id = overrideId ?? _generateId();

    // 1. Stage bytes into temp object store with SHA-256 verification
    final staged = manager.stageBytes(
      accountId: accountId,
      id: id,
      projectId: projectId,
      dailyReportId: entityId,
      sourcePath: sourcePath,
      bytes: bytes,
    );
    if (staged.state == AttachmentTransferState.failed) return staged;

    // 2. Finalize: Atomic move to final key and secondary digest verification
    final finalized = manager.finalize(accountId, id);
    if (finalized.state == AttachmentTransferState.failed) return finalized;

    // 3. Register: Chunked upload / remote registration with receipt
    return manager.register(accountId, id);
  }

  @override
  Uint8List? readRegisteredBytes(String attachmentId) {
    final record = manager.get(accountId, attachmentId);
    if (record == null || !record.complete || record.objectKey == null) {
      return null;
    }
    return manager.mount.objects.getBytes(record.objectKey!);
  }

  @override
  Future<AttachmentTransferRecord> retry(String attachmentId) =>
      manager.retry(accountId, attachmentId);

  @override
  Future<AttachmentResumeSummary> resumeAll() => manager.resumeAll(accountId);

  static bool _isJpeg(Uint8List bytes) =>
      bytes.length >= 3 &&
      bytes[0] == 0xFF &&
      bytes[1] == 0xD8 &&
      bytes[2] == 0xFF;

  static bool _isPng(Uint8List bytes) =>
      bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0D &&
      bytes[5] == 0x0A &&
      bytes[6] == 0x1A &&
      bytes[7] == 0x0A;

  static String _generateId() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }
}
