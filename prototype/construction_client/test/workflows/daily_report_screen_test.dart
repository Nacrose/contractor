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

  for (final scenario in [
    (
      name: 'expired sync event reaches the screen and offers sign-in retry',
      outcome: SyncOutcomeKind.authenticationRequired,
      expectedIssue: DailyReportSyncAccessIssue.authenticationRequired,
      expectedHeading: 'Sign-in required to sync',
      expectedMessage:
          'Your report is saved locally. Sign in again to resume syncing.',
      expectedAction: 'Sign in again',
      remarks: 'Retain while the session is renewed',
    ),
    (
      name: 'revoked sync event reaches the screen and explains recovery',
      outcome: SyncOutcomeKind.revoked,
      expectedIssue: DailyReportSyncAccessIssue.revoked,
      expectedHeading: 'Project access changed',
      expectedMessage: 'Your report is saved locally. Ask a project admin to restore access, then sync again.',
      expectedAction: null,
      remarks: 'Retain while access is restored',
    ),
  ]) {
    testWidgets(scenario.name, (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      mount!.driver.close();
      mount = openMount(
        options: MountOptions(
          dbPath: '${tmp.path}/outbox.db',
          objectRoot: Directory('${tmp.path}/objects'),
          extraMigrations: kM04WorkflowMigrations,
        ),
        credentials: _Credentials(),
        transport: _Transport(
          (envelope) async => SyncOutcome(
            kind: scenario.outcome,
            opId: envelope.opId,
            detail: scenario.outcome == SyncOutcomeKind.revoked
                ? 'project access was revoked'
                : 'session expired',
          ),
        ),
      );
      final store = DailyReportLocalStore(mount!);
      DailyReportSyncAccessIssue? issue;
      late StateSetter updateHost;
      mount!.drainTriggers.bind(
        drain: (_) async => DailyLogSyncOrchestrator(
          mount: mount!,
          deviceId: 'device-1',
          random: _FixedRandom(),
          authEvents: _CallbackAuthEvents((kind, _) {
            updateHost(() {
              issue = switch (kind) {
                'authentication_required' =>
                  DailyReportSyncAccessIssue.authenticationRequired,
                'revoked' => DailyReportSyncAccessIssue.revoked,
                _ => null,
              };
            });
          }),
        ).drain('acct-1'),
        isDraining: () => false,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              updateHost = setState;
              return DailyReportScreen(
                store: store,
                accountId: 'acct-1',
                tenantId: 'tenant-1',
                role: 'field',
                projects: const [
                  DailyReportProjectOption(
                    id: 'project-1',
                    label: 'P-01 — Bridge',
                  ),
                ],
                syncAccessIssue: issue,
                onSignInAgain: () {},
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await _selectProject(tester);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Daily remarks'),
        scenario.remarks,
      );
      await tester.ensureVisible(find.text('Save locally'));
      await tester.tap(find.text('Save locally'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('More actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sync now'));
      await tester.pumpAndSettle();

      expect(issue, scenario.expectedIssue);
      expect(
        tester
            .widget<DailyReportScreen>(find.byType(DailyReportScreen))
            .syncAccessIssue,
        scenario.expectedIssue,
      );
      expect(store.savedReports('acct-1', 'tenant-1'), hasLength(1));
      expect(
        store.savedReports('acct-1', 'tenant-1').single.draft.remarks,
        scenario.remarks,
      );
      expect(mount!.pendingOps.listDue('acct-1', 9999999999999), hasLength(1));
      await tester.dragUntilVisible(
        find.text(scenario.expectedHeading),
        find.byKey(const ValueKey('daily-report-screen-list')),
        const Offset(0, 300),
      );
      expect(find.text(scenario.expectedMessage), findsOneWidget);
      if (scenario.expectedAction == null) {
        expect(find.text('Sign in again'), findsNothing);
      } else {
        expect(find.text(scenario.expectedAction!), findsOneWidget);
      }
    });
  }

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
        workProgress: const [
          {
            'taskDescription': 'Legacy task',
            'actualQty': 5.0,
            'unit': 'm3',
            'location': 'Zone B',
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
    expect(
      store.get('acct-1', 'report-reopen-001')?.workProgress.single,
      containsPair('boqDesc', 'Legacy task'),
    );
    expect(
      store.get('acct-1', 'report-reopen-001')?.workProgress.single,
      containsPair('batchedQty', 5.0),
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

  testWidgets('disk-full save keeps the open entry clear and retryable', (
    tester,
  ) async {
    final store = _RecoverableDiskFullStore(mount!);
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
    await _selectProject(tester);
    final remarks = find.widgetWithText(TextFormField, 'Daily remarks');
    await tester.ensureVisible(remarks);
    await tester.enterText(remarks, 'Keep this unsaved entry available');
    await tester.ensureVisible(find.text('Save locally'));
    await tester.tap(find.text('Save locally'));
    await tester.pumpAndSettle();
    expect(store.saveAttempts, 1);

    expect(
      find.byKey(const ValueKey('daily-report-save-error')),
      findsOneWidget,
    );
    expect(
      find.text('Save failed (full). Your entry is still open on this device.'),
      findsOneWidget,
    );
    expect(
      tester.widget<TextFormField>(remarks).controller?.text,
      'Keep this unsaved entry available',
    );
    expect(store.savedReports('acct-1', 'tenant-1'), isEmpty);
    expect(mount!.pendingOps.listDue('acct-1', 9999999999999), isEmpty);

    store.failDiskFull = false;
    await tester.tap(find.text('Save locally'));
    await tester.pumpAndSettle();
    expect(store.savedReports('acct-1', 'tenant-1'), hasLength(1));
    expect(
      store.savedReports('acct-1', 'tenant-1').single.draft.remarks,
      'Keep this unsaved entry available',
    );
  });

  testWidgets(
    'transport rejection reaches health and preserves correction path',
    (tester) async {
      mount!.driver.close();
      mount = openMount(
        options: MountOptions(
          dbPath: '${tmp.path}/outbox.db',
          objectRoot: Directory('${tmp.path}/objects'),
          extraMigrations: kM04WorkflowMigrations,
        ),
        credentials: _Credentials(),
        transport: _Transport(
          (envelope) async => SyncOutcome(
            kind: SyncOutcomeKind.rejected,
            opId: envelope.opId,
            detail: 'daily report permission denied',
          ),
        ),
      );
      final store = DailyReportLocalStore(mount!);
      mount!.drainTriggers.bind(
        drain: (_) async => DailyLogSyncOrchestrator(
          mount: mount!,
          deviceId: 'device-1',
          random: _FixedRandom(),
        ).drain('acct-1'),
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
      await _selectProject(tester);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Daily remarks'),
        'Rejected but retained report',
      );
      await tester.ensureVisible(find.text('Save locally'));
      await tester.tap(find.text('Save locally'));
      await tester.pumpAndSettle();
      await store.syncNow();
      await tester.pumpAndSettle();

      final saved = store.savedReports('acct-1', 'tenant-1').single;
      expect(saved.operationState, 'rejected');
      expect(saved.draft.remarks, 'Rejected but retained report');
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pumpAndSettle();
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
      await tester.dragUntilVisible(
        find.text('Device sync health'),
        find.byKey(const ValueKey('daily-report-screen-list')),
        const Offset(0, -300),
      );
      expect(find.text('Needs attention'), findsOneWidget);
      expect(find.text('1 recent rejection(s) surfaced'), findsOneWidget);
      await tester.ensureVisible(find.text('Saved on this device (1)'));
      await tester.tap(find.text('Saved on this device (1)'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text(saved.draft.reportDate).first);
      await tester.tap(find.text(saved.draft.reportDate).first);
      await tester.pumpAndSettle();
      expect(find.text('Save corrected copy'), findsOneWidget);
      final rejectionGuidance = find.textContaining(
        'This report was rejected by the server.',
      );
      await tester.dragUntilVisible(
        rejectionGuidance,
        find.byKey(const ValueKey('daily-report-screen-list')),
        const Offset(0, -300),
      );
      expect(rejectionGuidance, findsOneWidget);
    },
  );

  for (final scenario in [
    (
      name: 'offline sync remains visible and retries from the screen',
      failWithException: true,
      detail: 'offline',
    ),
    (
      name: 'retryable timeout remains visible and retries from the screen',
      failWithException: false,
      detail: 'network timeout',
    ),
  ]) {
    testWidgets(scenario.name, (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      mount!.driver.close();
      var requests = 0;
      var nowMs = DateTime.now().millisecondsSinceEpoch + 1000;
      mount = openMount(
        options: MountOptions(
          dbPath: '${tmp.path}/outbox.db',
          objectRoot: Directory('${tmp.path}/objects'),
          extraMigrations: kM04WorkflowMigrations,
        ),
        credentials: _Credentials(),
        transport: _Transport((envelope) async {
          requests++;
          if (requests == 1 && scenario.failWithException) {
            throw const SocketException('offline');
          }
          if (requests == 1) {
            return SyncOutcome(
              kind: SyncOutcomeKind.retryable,
              opId: envelope.opId,
              detail: scenario.detail,
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
      final reportId = scenario.failWithException
          ? 'report-health-offline1'
          : 'report-health-timeout1';
      final store = DailyReportLocalStore(mount!);
      store.save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: DailyReportDraft(
          clientUuid: reportId,
          projectId: 'project-1',
          reportDate: '2026-10-10',
          remarks: 'Pending until connectivity recovers',
        ),
      );
      mount!.drainTriggers.bind(
        drain: (_) async => DailyLogSyncOrchestrator(
          mount: mount!,
          deviceId: 'device-1',
          random: _FixedRandom(),
          nowMs: () => nowMs,
          backoffBaseMs: 10,
          backoffCapMs: 100,
        ).drain('acct-1'),
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
      await tester.tap(find.text('Sync now'));
      await tester.pumpAndSettle();

      expect(requests, 1);
      expect(mount!.pendingOps.getOp('acct-1', reportId)?.state, 'pending');
      expect(
        store.get('acct-1', reportId)?.remarks,
        'Pending until connectivity recovers',
      );
      expect(find.text('Needs attention'), findsOneWidget);
      expect(find.text('1 pending operation(s)'), findsOneWidget);
      expect(
        find.text('1 pending operation(s) not yet accepted'),
        findsOneWidget,
      );

      nowMs += 60_000;
      await tester.tap(find.byTooltip('More actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sync now'));
      await tester.pumpAndSettle();

      expect(requests, 2);
      expect(mount!.pendingOps.getOp('acct-1', reportId)?.state, 'accepted');
      expect(find.text('No pending work'), findsOneWidget);
    });
  }

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
      final syncHealth = find.text('No pending work');
      await tester.dragUntilVisible(
        syncHealth,
        find.byType(ListView),
        const Offset(0, 300),
      );
      expect(syncHealth, findsOneWidget);
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

    await tester.ensureVisible(find.text('Saved on this device (1)'));
    await tester.tap(find.text('Saved on this device (1)'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('2026-10-10').first);
    await tester.tap(find.text('2026-10-10').first);
    await tester.pumpAndSettle();

    expect(find.text('Save reviewed copy'), findsOneWidget);
    final conflictGuidance = find.textContaining(
      'Tap Sync now to refresh synced reports above',
    );
    await tester.scrollUntilVisible(
      conflictGuidance,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(conflictGuidance, findsOneWidget);
    final remarks = find.widgetWithText(TextFormField, 'Daily remarks');
    await tester.dragUntilVisible(
      remarks,
      find.byType(ListView),
      const Offset(0, -300),
    );
    await tester.enterText(remarks, 'Reviewed and reconciled report');
    await tester.ensureVisible(find.text('Save reviewed copy'));
    await tester.tap(find.text('Save reviewed copy'));
    await tester.pumpAndSettle();

    final original = mount!.pendingOps.getOp(
      'acct-1',
      'report-conflict-visible1',
    )!;
    expect(original.state, 'conflict');
    expect(original.payload, contains('Keep this report for review'));
    final recovered = mount!.pendingOps
        .listDue('acct-1', DateTime.now().millisecondsSinceEpoch + 1000)
        .single;
    expect(recovered.state, 'pending');
    expect(recovered.opId, isNot(original.opId));
    expect(recovered.payload, contains('Reviewed and reconciled report'));
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
      find.widgetWithText(TextFormField, 'BOQ code'),
      'B.01',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Task description'),
      'Pour footing',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Plan quantity'),
      '16',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Batched / placed quantity'),
      '12.5',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Payable quantity (IPC)'),
      '11.5',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Unit').first,
      'm3',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Location'),
      'Zone A',
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
    final visitorName = find.widgetWithText(TextFormField, 'Visitor name');
    await tester.ensureVisible(visitorName);
    await tester.enterText(visitorName, 'Client inspector');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Organization / authority'),
      'Client',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Purpose of visit'),
      'Joint inspection',
    );
    await tester.enterText(find.widgetWithText(TextFormField, 'Time'), '10:30');
    final meetingTopic = find.widgetWithText(TextFormField, 'Topic / subject');
    await tester.ensureVisible(meetingTopic);
    await tester.enterText(meetingTopic, 'Toolbox talk');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Attendees'),
      'Site crew',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Key notes / decisions'),
      'Reviewed safety controls',
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
    final siteVisits = jsonDecode(payload['siteVisits'] as String) as List;
    final meetings = jsonDecode(payload['meetings'] as String) as List;
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
      'boqCode': 'B.01',
      'boqDesc': 'Pour footing',
      'taskDescription': 'Pour footing',
      'plannedQty': 16.0,
      'actualQty': 12.5,
      'batchedQty': 12.5,
      'payableQty': 11.5,
      'unit': 'm3',
      'location': 'Zone A',
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
    expect(siteVisits.single, {
      'visitor': 'Client inspector',
      'organization': 'Client',
      'purpose': 'Joint inspection',
      'time': '10:30',
      'notes': null,
      'sortOrder': 0,
    });
    expect(meetings.single, {
      'topic': 'Toolbox talk',
      'attendees': 'Site crew',
      'notes': 'Reviewed safety controls',
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

class _RecoverableDiskFullStore extends DailyReportLocalStore {
  _RecoverableDiskFullStore(super.mount);

  bool failDiskFull = true;
  int saveAttempts = 0;

  @override
  String save({
    required String accountId,
    required String tenantId,
    required String role,
    required DailyReportDraft draft,
  }) {
    saveAttempts++;
    if (failDiskFull) throw RepositoryError('full', 'simulated disk full');
    return super.save(
      accountId: accountId,
      tenantId: tenantId,
      role: role,
      draft: draft,
    );
  }
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

class _CallbackAuthEvents implements AuthEventSink {
  final void Function(String kind, String? opId) callback;

  const _CallbackAuthEvents(this.callback);

  @override
  void onAuthEvent(String kind, String? opId) => callback(kind, opId);
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
