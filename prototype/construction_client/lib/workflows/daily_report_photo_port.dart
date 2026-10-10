import 'dart:typed_data';

import '../mount/attachment_transfer.dart';

enum PhotoCaptureSource { camera, gallery }

/// UI-facing photo port. The editor never decides platform storage or
/// registration details, and it only receives displayable bytes for a
/// server-registered attachment.
abstract interface class DailyReportPhotoPort {
  List<AttachmentTransferRecord> list();

  Future<AttachmentTransferRecord?> captureAndRegister({
    required String projectId,
    required PhotoCaptureSource source,
  });

  Future<AttachmentTransferRecord> retry(String attachmentId);

  Future<AttachmentResumeSummary> resumeAll();

  Uint8List? registeredBytes(String attachmentId);
}
