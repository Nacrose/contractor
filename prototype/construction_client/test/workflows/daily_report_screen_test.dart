import 'dart:io';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/workflows/daily_report_photo_port.dart';
import 'package:construction_client/workflows/daily_report_screen.dart';
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
    'shows only registered photo state from the injected photo port',
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
            photoPort: photos,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('P-01 — Bridge').last);
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, -3000));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose photo'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Registered'), findsOneWidget);
      expect(
        find.text('1 registered photo(s) will be attached to this report.'),
        findsOneWidget,
      );
    },
  );
}

class _Photos implements DailyReportPhotoPort {
  final List<AttachmentTransferRecord> records = [];

  @override
  List<AttachmentTransferRecord> list() => records;

  AttachmentTransferRecord _registered(String id) => AttachmentTransferRecord(
    id: id,
    accountId: 'acct-1',
    projectId: 'project-1',
    sourcePath: '/private/photo.jpg',
    objectKey: 'attachments/$id',
    digest: 'a' * 64,
    bytes: 1234,
    state: AttachmentTransferState.registered,
    failureKind: null,
    failureStep: null,
    failureDetail: null,
    attempts: 1,
    nextAttemptAtMs: null,
    receipt: 'server-photo-1',
    createdAtMs: 1,
    updatedAtMs: 2,
  );

  @override
  Future<AttachmentTransferRecord?> captureAndRegister({
    required String projectId,
    required PhotoCaptureSource source,
  }) async {
    final record = _registered('local-transfer-1');
    records.add(record);
    return record;
  }

  @override
  Future<AttachmentTransferRecord> retry(String attachmentId) async =>
      records.singleWhere((record) => record.id == attachmentId);

  @override
  Future<AttachmentResumeSummary> resumeAll() async =>
      const AttachmentResumeSummary(
        completed: [],
        stillPending: [],
        failed: [],
      );

  @override
  Uint8List? registeredBytes(String attachmentId) => null;
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
