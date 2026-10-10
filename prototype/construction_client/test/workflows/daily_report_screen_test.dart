import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/workflows/daily_report_screen.dart';
import 'package:construction_client/workflows/daily_report_photo_port.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory tmp;
  ConstructionMount? mount;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('daily_report_screen_test');
    mount = openMount(
      options: MountOptions(
        dbPath: '${tmp.path}/outbox.db',
        objectRoot: Directory('${tmp.path}/objects'),
        extraMigrations: const [kDailyReportLocalMigration],
      ),
      credentials: _Credentials(),
      transport: _Transport(),
    );
  });

  tearDown(() async {
    mount?.driver.close();
    mount = null;
    await tmp.delete(recursive: true);
  });

  testWidgets(
    'renders the registered daily-report route with shared status and actions',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: DailyReportScreen(
            store: DailyReportLocalStore(mount!),
            accountId: 'acct-1',
            tenantId: 'tenant-1',
            role: 'field',
            projects: const [
              DailyReportProjectOption(id: 'project-1', label: 'P-01 — Bridge'),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('New daily report'), findsOneWidget);
      expect(find.text('Save locally'), findsOneWidget);
      expect(find.text('Save and sync'), findsOneWidget);
      expect(find.text('Workforce'), findsOneWidget);
      expect(find.text('Materials consumed'), findsOneWidget);
    },
  );

  testWidgets('project selection and local save create an outbox item', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: DailyReportScreen(
          store: DailyReportLocalStore(mount!),
          accountId: 'acct-1',
          tenantId: 'tenant-1',
          role: 'field',
          projects: const [
            DailyReportProjectOption(id: 'project-1', label: 'P-01 — Bridge'),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('P-01 — Bridge').last);
    await tester.pumpAndSettle();

    final remarks = find.widgetWithText(TextFormField, 'Daily remarks');
    await tester.ensureVisible(remarks);
    await tester.enterText(remarks, 'Foundation poured');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save locally'));
    await tester.pumpAndSettle();

    expect(find.text('Update local draft'), findsOneWidget);
    final rows = mount!.pendingOps.listDue(
      'acct-1',
      DateTime.now().millisecondsSinceEpoch + 1000,
    );
    expect(rows, hasLength(1));
    expect(rows.single.kind, 'workflow.dailyReport.createFieldReport');
  });

  testWidgets(
    'photo capture binds the stable report id and previews registered photos only',
    (tester) async {
      final photos = _Photos();
      await tester.pumpWidget(
        MaterialApp(
          home: DailyReportScreen(
            store: DailyReportLocalStore(mount!),
            accountId: 'acct-1',
            tenantId: 'tenant-1',
            role: 'field',
            projects: const [
              DailyReportProjectOption(id: 'project-1', label: 'P-01 — Bridge'),
            ],
            photos: photos,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('P-01 — Bridge').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Choose photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose photo'));
      await tester.pumpAndSettle();

      expect(photos.lastProjectId, 'project-1');
      expect(photos.lastReportId, isNotEmpty);
      expect(find.text('Photo photo-re'), findsOneWidget);
      expect(find.text('Photo photo-fa'), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    },
  );
}

class _Photos implements DailyReportPhotoPort {
  String? lastProjectId;
  String? lastReportId;
  final records = <AttachmentTransferRecord>[];

  @override
  List<AttachmentTransferRecord> list() => records;

  @override
  Future<AttachmentTransferRecord?> captureAndRegister({
    required String projectId,
    required String dailyReportId,
    required PhotoCaptureSource source,
  }) async {
    lastProjectId = projectId;
    lastReportId = dailyReportId;
    records
      ..clear()
      ..add(
        _record(
          'photo-registered',
          dailyReportId,
          AttachmentTransferState.registered,
        ),
      )
      ..add(
        _record('photo-failed', dailyReportId, AttachmentTransferState.failed),
      );
    return records.first;
  }

  @override
  Future<AttachmentTransferRecord> retry(String attachmentId) async =>
      records.last;

  @override
  Future<AttachmentResumeSummary> resumeAll() async =>
      const AttachmentResumeSummary(
        completed: [],
        stillPending: [],
        failed: [],
      );

  @override
  Uint8List? registeredBytes(String attachmentId) =>
      attachmentId == 'photo-registered'
      ? base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        )
      : null;

  AttachmentTransferRecord _record(
    String id,
    String reportId,
    AttachmentTransferState state,
  ) => AttachmentTransferRecord(
    id: id,
    accountId: 'acct-1',
    projectId: 'project-1',
    dailyReportId: reportId,
    sourcePath: '/private/photo',
    objectKey: state == AttachmentTransferState.registered
        ? 'registered'
        : null,
    digest: state == AttachmentTransferState.registered ? 'sha256' : null,
    bytes: state == AttachmentTransferState.registered ? 3 : null,
    state: state,
    failureKind: state == AttachmentTransferState.failed
        ? AttachmentFailureKind.retryable
        : null,
    failureStep: state == AttachmentTransferState.failed
        ? AttachmentTransferStep.register
        : null,
    failureDetail: state == AttachmentTransferState.failed ? 'network' : null,
    attempts: 0,
    nextAttemptAtMs: null,
    receipt: state == AttachmentTransferState.registered ? 'receipt' : null,
    createdAtMs: 1,
    updatedAtMs: 1,
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
