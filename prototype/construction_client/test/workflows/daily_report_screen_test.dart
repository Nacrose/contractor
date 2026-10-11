import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
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
        extraMigrations: kM04WorkflowMigrations,
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

  testWidgets(
    'shows exact snapshot feed cursors separately from operation sequences',
    (tester) async {
      mount!.driver
          .prepare(
            'INSERT INTO daily_report_feed_cursor '
            '(account_id, tenant_id, project_id, cursor, updated_at) '
            'VALUES (?, ?, ?, ?, ?)',
          )
          .run(['acct-1', 'tenant-1', 'project-1', '9007199254740993', 123]);

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

      expect(find.text('Accepted feed cursors'), findsOneWidget);
      expect(find.text('project:project-1: 9007199254740993'), findsOneWidget);
      expect(find.text('Accepted operation sequences'), findsOneWidget);
      expect(
        find.text('No accepted operation recorded on this device yet.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('explains expired sign-in and offers a recovery action', (
    tester,
  ) async {
    var signInAgainPressed = false;
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
          syncAccessIssue: DailyReportSyncAccessIssue.authenticationRequired,
          onSignInAgain: () => signInAgainPressed = true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign-in required to sync'), findsOneWidget);
    expect(
      find.text(
        'Your report is saved locally. Sign in again to resume syncing.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Sign in again'));
    expect(signInAgainPressed, isTrue);
  });

  testWidgets('revoked project access explains that local work is retained', (
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
          syncAccessIssue: DailyReportSyncAccessIssue.revoked,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Project access changed'), findsOneWidget);
    expect(
      find.text(
        'Your report is saved locally. Ask a project admin to restore access, then sync again.',
      ),
      findsOneWidget,
    );
    expect(find.text('Sign in again'), findsNothing);
  });

  testWidgets('shows accepted reports restored for assigned projects', (
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
          acceptedReports: () => [
            {
              'id': 'server-report-1',
              'projectId': 'project-1',
              'number': 'DSR-20261010-1',
              'reportDate': '2026-10-10T00:00:00.000Z',
              'status': 'submitted',
              'remarks': 'Restored accepted report',
            },
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Synced daily reports (1)'), findsOneWidget);
    await tester.tap(find.text('Synced daily reports (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('DSR-20261010-1'));
    await tester.pumpAndSettle();

    expect(find.text('Remarks: Restored accepted report'), findsOneWidget);
    expect(find.text('Date: 2026-10-10'), findsOneWidget);
  });

  testWidgets('reopens a locally saved report after the screen is recreated', (
    tester,
  ) async {
    final store = DailyReportLocalStore(mount!);
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: DailyReportDraft(
        clientUuid: 'report-reopen-001',
        projectId: 'project-1',
        reportDate: '2026-10-10',
        weatherMorning: 'Cloudy',
        workforce: const [
          {
            'company': 'Acme',
            'trade': 'Masonry',
            'skill': 'skilled',
            'headcount': 4.0,
            'regHours': 8.0,
            'otHours': 1.0,
            'sortOrder': 0,
          },
        ],
        remarks: 'Saved before leaving the screen',
      ),
    );

    Widget screen() => MaterialApp(
      home: DailyReportScreen(
        store: store,
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        projects: const [
          DailyReportProjectOption(id: 'project-1', label: 'P-01 — Bridge'),
        ],
      ),
    );

    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Saved on this device (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('2026-10-10').first);
    await tester.pumpAndSettle();

    final company = find.widgetWithText(TextFormField, 'Company');
    await tester.dragUntilVisible(
      company,
      find.byType(ListView),
      const Offset(0, -300),
    );
    expect(tester.widget<TextFormField>(company).controller?.text, 'Acme');
    final remarks = find.widgetWithText(TextFormField, 'Daily remarks');
    await tester.dragUntilVisible(
      remarks,
      find.byType(ListView),
      const Offset(0, -300),
    );
    expect(
      tester.widget<TextFormField>(remarks).controller?.text,
      'Saved before leaving the screen',
    );

    await tester.enterText(remarks, 'Corrected after reopening');
    await tester.ensureVisible(find.text('Update local draft'));
    await tester.tap(find.text('Update local draft'));
    await tester.pumpAndSettle();
    expect(
      store.get('acct-1', 'report-reopen-001')?.remarks,
      'Corrected after reopening',
    );
  });

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

    await _selectProject(tester);

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

  testWidgets('transport failure remains visible in the sync health surface', (
    tester,
  ) async {
    final store = DailyReportLocalStore(mount!);
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: DailyReportDraft(
        clientUuid: 'report-health-offline1',
        projectId: 'project-1',
        reportDate: '2026-10-10',
        remarks: 'Pending until the network returns',
      ),
    );

    await store.syncNow();

    expect(
      mount!.pendingOps.getOp('acct-1', 'report-health-offline1')?.state,
      'pending',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: DailyReportScreen(
          store: store,
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
    await tester.ensureVisible(find.text('Device sync health'));

    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.text('1 pending operation(s)'), findsOneWidget);
    expect(
      find.text('1 pending operation(s) not yet accepted'),
      findsOneWidget,
    );
  });

  testWidgets(
    'lost acknowledgement stays pending on screen and retry records one server effect',
    (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final receipts = <String, String>{};
      var serverEffects = 0;
      var requests = 0;
      mount!.driver.close();
      mount = openMount(
        options: MountOptions(
          dbPath: '${tmp.path}/outbox.db',
          objectRoot: Directory('${tmp.path}/objects'),
          extraMigrations: kM04WorkflowMigrations,
        ),
        credentials: _Credentials(),
        transport: _Transport((envelope) async {
          requests++;
          final receipt = receipts[envelope.opId];
          if (receipt != null) {
            return SyncOutcome(
              kind: SyncOutcomeKind.previouslyAccepted,
              opId: envelope.opId,
              receipt: receipt,
              serverSeq: 42,
            );
          }
          // Model the server committing once before its response is lost.
          serverEffects++;
          receipts[envelope.opId] = 'receipt-${envelope.opId}';
          throw const SocketException('response lost after server commit');
        }),
      );
      final store = DailyReportLocalStore(mount!);
      store.save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: DailyReportDraft(
          clientUuid: 'report-screen-lost-ack',
          projectId: 'project-1',
          reportDate: '2026-10-10',
          remarks: 'Retain this report until its receipt is recovered',
        ),
      );
      var nowMs = DateTime.now().millisecondsSinceEpoch + 1000;
      mount!.drainTriggers.bind(
        drain: (_) async {
          await DailyLogSyncOrchestrator(
            mount: mount!,
            deviceId: 'device-1',
            random: _FixedRandom(),
            nowMs: () => nowMs,
            backoffBaseMs: 10,
            backoffCapMs: 100,
          ).drain('acct-1');
        },
        isDraining: () => false,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: DailyReportScreen(
            store: store,
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
      await tester.tap(find.text('Saved on this device (1)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('2026-10-10').first);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('More actions'));
      await tester.pumpAndSettle();
      expect(find.text('Sync now'), findsOneWidget);
      await tester.tap(find.text('Sync now'));
      await tester.pumpAndSettle();

      expect(serverEffects, 1);
      expect(requests, 1);
      expect(
        mount!.pendingOps.getOp('acct-1', 'report-screen-lost-ack')?.state,
        'pending',
      );
      expect(find.text('Needs attention'), findsOneWidget);
      expect(find.text('1 pending operation(s)'), findsOneWidget);
      expect(
        find.text('1 pending operation(s) not yet accepted'),
        findsOneWidget,
      );
      final remarks = find.widgetWithText(TextFormField, 'Daily remarks');
      await tester.dragUntilVisible(
        remarks,
        find.byType(ListView),
        const Offset(0, -300),
      );
      expect(
        tester.widget<TextFormField>(remarks).controller?.text,
        'Retain this report until its receipt is recovered',
      );

      nowMs += 60_000;
      await tester.tap(find.byTooltip('More actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sync now'));
      await tester.pumpAndSettle();

      expect(serverEffects, 1);
      expect(requests, 2);
      expect(
        mount!.pendingOps.getOp('acct-1', 'report-screen-lost-ack')?.state,
        'accepted',
      );
      expect(
        mount!.pendingOps
            .getOp('acct-1', 'report-screen-lost-ack')
            ?.acceptedReceipt,
        'receipt-report-screen-lost-ack',
      );
      await tester.drag(find.byType(ListView), const Offset(0, 3000));
      await tester.pumpAndSettle();
      expect(find.text('No pending work'), findsOneWidget);
    },
  );

  testWidgets('conflicted report is retained and clearly surfaced for review', (
    tester,
  ) async {
    final store = DailyReportLocalStore(mount!);
    store.save(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field',
      draft: DailyReportDraft(
        clientUuid: 'report-conflict-visible1',
        projectId: 'project-1',
        reportDate: '2026-10-10',
        remarks: 'Keep this report for review',
      ),
    );
    mount!.pendingOps.markConflict(
      'report-conflict-visible1',
      'server version changed',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: DailyReportScreen(
          store: store,
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
    await tester.ensureVisible(find.text('Device sync health'));

    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.text('0 pending operation(s)'), findsOneWidget);
    expect(find.text('1 conflict(s) need review'), findsOneWidget);
    expect(
      find.text('1 conflicted operation(s) awaiting resolution'),
      findsOneWidget,
    );
    expect(
      mount!.pendingOps.getOp('acct-1', 'report-conflict-visible1')?.state,
      'conflict',
    );
    expect(
      store.get('acct-1', 'report-conflict-visible1')?.remarks,
      'Keep this report for review',
    );
  });

  testWidgets(
    'rejected report offers correction and saves a new immutable operation',
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
      await _selectProject(tester);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Daily remarks'),
        'Original report content',
      );
      await tester.ensureVisible(find.text('Save locally'));
      await tester.tap(find.text('Save locally'));
      await tester.pumpAndSettle();

      final oldId =
          mount!.driver
                  .prepare(
                    'SELECT client_uuid FROM daily_report_local WHERE account_id = ?',
                  )
                  .get(['acct-1'])!['client_uuid']
              as String;
      mount!.pendingOps.markInFlight(oldId);
      mount!.pendingOps.recordRejected(oldId, 'Correct the report and retry.');

      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pumpAndSettle();
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
      await tester.ensureVisible(find.text('Device sync health'));
      expect(find.text('Needs attention'), findsOneWidget);
      expect(find.text('1 recent rejection(s) surfaced'), findsOneWidget);
      await tester.ensureVisible(find.text('Saved on this device (1)'));
      await tester.tap(find.text('Saved on this device (1)'));
      await tester.pumpAndSettle();
      final savedDate = DailyReportLocalStore(mount!)
          .savedReports('acct-1', 'tenant-1')
          .single
          .draft
          .reportDate;
      await tester.ensureVisible(find.text(savedDate).first);
      await tester.tap(find.text(savedDate).first);
      await tester.pumpAndSettle();

      expect(find.text('Save corrected copy'), findsOneWidget);
      final remarks = find.widgetWithText(TextFormField, 'Daily remarks');
      await tester.dragUntilVisible(
        remarks,
        find.byType(ListView),
        const Offset(0, -300),
      );
      expect(
        tester.widget<TextFormField>(remarks).controller?.text,
        'Original report content',
      );
      await tester.enterText(remarks, 'Corrected report content');
      await tester.ensureVisible(find.text('Save corrected copy'));
      await tester.tap(find.text('Save corrected copy'));
      await tester.pumpAndSettle();

      final count = mount!.driver
          .prepare(
            'SELECT COUNT(*) AS count FROM pending_op WHERE account_id = ?',
          )
          .get(['acct-1'])!['count'];
      expect(count, 2);
      expect(mount!.pendingOps.getOp('acct-1', oldId)!.state, 'rejected');
      final replacement = mount!.pendingOps
          .listDue('acct-1', DateTime.now().millisecondsSinceEpoch + 1000)
          .single;
      expect(replacement.state, 'pending');
      expect(replacement.payload, contains('Corrected report content'));
      expect(replacement.opId, isNot(oldId));
    },
  );

  testWidgets('typed section rows save normalized procedure payloads', (
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
    await _selectProject(tester);

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Company'),
      'Acme',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Trade'),
      'Masonry',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Headcount'),
      '4',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Regular hours'),
      '8',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Task description'),
      'Pour footing',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Actual quantity'),
      '12.5',
    );
    await tester.ensureVisible(
      find.widgetWithText(TextFormField, 'Equipment name'),
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Equipment name'),
      'Excavator',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Working hours'),
      '7.5',
    );
    await tester.enterText(find.widgetWithText(TextFormField, 'Fuel'), '20');
    final ownership = find.byType(DropdownButtonFormField<String>).at(2);
    await tester.ensureVisible(ownership);
    await tester.pumpAndSettle();
    await tester.tap(ownership);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hired').last);
    await tester.pumpAndSettle();

    final receivedName = find
        .widgetWithText(TextFormField, 'Material name')
        .first;
    await tester.ensureVisible(receivedName);
    await tester.enterText(receivedName, 'Cement');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Quantity').first,
      '30',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Unit').at(1),
      'bag',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Supplier'),
      'Supplier A',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Vehicle'),
      'TRK-01',
    );

    final consumedName = find
        .widgetWithText(TextFormField, 'Material name')
        .last;
    await tester.ensureVisible(consumedName);
    await tester.enterText(consumedName, 'Aggregate');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Quantity').last,
      '4',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Unit').last,
      'm3',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Daily remarks'),
      'Crew on site',
    );
    await tester.ensureVisible(find.text('Save locally'));
    await tester.tap(find.text('Save locally'));
    await tester.pumpAndSettle();

    final op = mount!.pendingOps
        .listDue('acct-1', DateTime.now().millisecondsSinceEpoch + 1000)
        .single;
    final payload = jsonDecode(op.payload) as Map<String, dynamic>;
    final workforce = jsonDecode(payload['workforce'] as String) as List;
    final progress = jsonDecode(payload['workProgress'] as String) as List;
    final equipment = jsonDecode(payload['equipmentUsed'] as String) as List;
    final received = jsonDecode(payload['materialReceived'] as String) as List;
    final consumed = jsonDecode(payload['materialConsumed'] as String) as List;
    expect(workforce.single, {
      'company': 'Acme',
      'trade': 'Masonry',
      'skill': 'unskilled',
      'headcount': 4.0,
      'regHours': 8.0,
      'otHours': 0.0,
      'sortOrder': 0,
    });
    expect(progress.single, {
      'taskDescription': 'Pour footing',
      'unit': null,
      'actualQty': 12.5,
      'batchedQty': 12.5,
      'payableQty': 12.5,
      'location': null,
      'sortOrder': 0,
    });
    expect(equipment.single, {
      'name': 'Excavator',
      'type': '',
      'ownership': 'hired',
      'workingHours': 7.5,
      'fuel': 20.0,
      'sortOrder': 0,
    });
    expect(received.single, {
      'name': 'Cement',
      'qty': 30.0,
      'unit': 'bag',
      'supplier': 'Supplier A',
      'vehicle': 'TRK-01',
      'testStatus': 'none',
      'sortOrder': 0,
    });
    expect(consumed.single, {
      'materialId': null,
      'name': 'Aggregate',
      'quantity': 4.0,
      'unit': 'm3',
      'sortOrder': 0,
    });
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
      await _selectProject(tester);
      await tester.ensureVisible(find.text('Choose photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose photo'));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 1000));
      await tester.pumpAndSettle();

      expect(photos.lastProjectId, 'project-1');
      expect(photos.lastReportId, isNotEmpty);
      expect(find.text('Photo photo-re'), findsOneWidget);
      expect(find.text('Photo photo-fa'), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
      expect(find.text('Upload delayed'), findsOneWidget);
      expect(
        find.text('Pending work remains saved on this device.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Retry attachment uploads'));
      await tester.tap(find.text('Retry attachment uploads'));
      await tester.pumpAndSettle();
      expect(photos.retryCalls, ['photo-failed']);

      await tester.ensureVisible(find.text('Save locally'));
      await tester.tap(find.text('Save locally'));
      await tester.pumpAndSettle();
      await tester.dragUntilVisible(
        find.text(
          'Finish or retry each photo transfer before saving the report.',
        ),
        find.byType(ListView),
        const Offset(0, -300),
      );
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Finish or retry each photo transfer before saving the report.',
        ),
        findsOneWidget,
      );
      expect(mount!.pendingOps.listDue('acct-1', 9999999999999), isEmpty);

      photos.records.removeLast();
      final remarks = find.widgetWithText(TextFormField, 'Daily remarks');
      await tester.dragUntilVisible(
        remarks,
        find.byType(ListView),
        const Offset(0, -300),
      );
      await tester.enterText(remarks, 'Report with registered photo');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save locally'));
      await tester.tap(find.text('Save locally'));
      await tester.pumpAndSettle();

      final op = mount!.pendingOps.listDue('acct-1', 9999999999999).single;
      final payload = jsonDecode(op.payload) as Map<String, dynamic>;
      expect(payload['photos'], [
        {
          'attachmentId': 'receipt',
          'receipt': 'receipt',
          'digest': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'fileSize': 2,
        },
      ]);
    },
  );
}

Future<void> _selectProject(WidgetTester tester) async {
  final projectSelector = find.byType(DropdownButtonFormField<String>).first;
  await tester.ensureVisible(projectSelector);
  await tester.pumpAndSettle();
  await tester.tap(projectSelector);
  await tester.pumpAndSettle();
  await tester.tap(find.text('P-01 — Bridge').last);
  await tester.pumpAndSettle();
}

class _Photos implements DailyReportPhotoPort {
  String? lastProjectId;
  String? lastReportId;
  final records = <AttachmentTransferRecord>[];
  final retryCalls = <String>[];

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
  Future<AttachmentTransferRecord> retry(String attachmentId) async {
    retryCalls.add(attachmentId);
    return records.last;
  }

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
    registeredDigest: state == AttachmentTransferState.registered
        ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        : null,
    registeredBytes: state == AttachmentTransferState.registered ? 2 : null,
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
  _Transport([this.handler]);

  final Future<SyncOutcome> Function(SyncEnvelope envelope)? handler;

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async => handler == null
      ? throw StateError('test transport must not be called')
      : handler!(envelope);
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
