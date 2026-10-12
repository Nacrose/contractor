import 'dart:io';

import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:construction_client/workflows/field_expansion_substrate.dart';
import 'package:construction_client/workflows/site_expense_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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

class _RecordingTransport implements SyncTransportPort {
  final List<SyncEnvelope> sent = [];

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async {
    sent.add(envelope);
    return SyncOutcome(
      kind: SyncOutcomeKind.accepted,
      opId: envelope.opId,
      receipt: 'rcpt-exp-001',
      serverSeq: 301,
    );
  }
}

void main() {
  late Directory tmp;
  ConstructionMount? mounted;
  late _RecordingTransport transport;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('site_expense_screen_test');
    transport = _RecordingTransport();
  });

  tearDown(() async {
    mounted?.driver.close();
    mounted = null;
    await tmp.delete(recursive: true);
  });

  ConstructionMount open() => openMount(
    options: MountOptions(
      dbPath: '${tmp.path}/outbox.db',
      objectRoot: Directory('${tmp.path}/objects'),
      extraMigrations: const [
        kDailyReportLocalMigration,
        kFieldExpansionLocalMigration,
      ],
    ),
    credentials: _FakeCredentials(),
    transport: transport,
  );

  Widget createWidgetUnderTest(FieldExpansionWorkflowStore store) {
    return MaterialApp(
      home: SiteExpenseScreen(
        store: store,
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        projects: const [
          SiteExpenseProjectOption(id: 'proj-1', label: 'Kathmandu Tower Site'),
          SiteExpenseProjectOption(id: 'proj-2', label: 'Pokhara Villa Complex'),
        ],
      ),
    );
  }

  testWidgets('renders site expense screen with form fields and financial notice', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    expect(find.text('Site Expense & Petty Cash'), findsOneWidget);
    expect(find.text('Kathmandu Tower Site'), findsOneWidget);
    expect(find.text('Fuel & Diesel'), findsOneWidget);
    expect(find.text('Amount (NPR)'), findsOneWidget);
    expect(find.text('Payee / Merchant'), findsOneWidget);
    expect(find.text('Save Locally'), findsOneWidget);
    expect(
      find.textContaining('Site expenses land in submission state and require office manager authorization'),
      findsOneWidget,
    );
  });

  testWidgets('validates required fields before local save', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    // Tap "Save Locally" without entering amount or payee
    await tester.tap(find.text('Save Locally'));
    await tester.pumpAndSettle();

    expect(find.text('Please enter a valid expense amount.'), findsOneWidget);

    // Enter amount
    final amountFinder = find.widgetWithText(TextField, 'Amount (NPR)');
    await tester.enterText(amountFinder, '4500.50');
    await tester.tap(find.text('Save Locally'));
    await tester.pumpAndSettle();

    expect(find.text('Payee / merchant name is required.'), findsOneWidget);
  });

  testWidgets('saving site expense writes to local domain table and creates pending outbox op', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    // Enter valid details
    await tester.enterText(find.widgetWithText(TextField, 'Amount (NPR)'), '7500.00');
    await tester.enterText(find.widgetWithText(TextField, 'Payee / Merchant'), 'Pashupati Fuel Station');
    await tester.enterText(
      find.widgetWithText(TextField, 'Memo / Description / Reason for Purchase'),
      'Diesel for generator 50L',
    );

    // Tap Save Locally
    await tester.tap(find.text('Save Locally'));
    await tester.pumpAndSettle();

    expect(find.text('Saved site expense locally in durable outbox.'), findsOneWidget);
    expect(find.text('1 pending outbox expense(s)'), findsOneWidget);

    // Verify stored in FieldExpansionLocalStore
    final savedList = store.listSiteExpenses('acct-1', 'tenant-1');
    expect(savedList.length, 1);
    expect(savedList.first.draft.amount, '7500.00');
    expect(savedList.first.draft.payee, 'Pashupati Fuel Station');
    expect(savedList.first.draft.category, 'fuel');
    expect(savedList.first.operationState, 'pending');

    // Also verify pending op in SQLite
    final ops = mounted!.driver.prepare('SELECT kind, state FROM pending_op').all(const []);
    expect(ops.length, 1);
    expect(ops.first['kind'], 'siteExpense.create');
  });

  testWidgets('syncing outbox transmits site expense via transport and marks health synced', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final orchestrator = DailyLogSyncOrchestrator(
      mount: mounted!,
      deviceId: 'device-test-01',
    );
    orchestrator.bindDrainTriggers(() => 'acct-1');

    final store = FieldExpansionLocalStore(mounted!);

    // Pre-save an expense
    store.saveSiteExpense(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'field_supervisor',
      draft: SiteExpenseSubmissionDraft(
        clientUuid: 'exp-client-1234',
        projectId: 'proj-1',
        expenseDate: '2026-10-12',
        category: 'materials',
        amount: '1200.00',
        currency: 'NPR',
        payee: 'City Hardware',
        memo: 'Screws and wire',
      ),
    );

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    expect(find.text('1 pending outbox expense(s)'), findsOneWidget);
    expect(find.text('Rs. 1200.00 · City Hardware'), findsOneWidget);

    // Tap Sync Outbox
    await tester.tap(find.text('Sync Outbox'));
    await tester.pumpAndSettle();

    expect(transport.sent.length, 1);
    expect(transport.sent.first.kind, 'siteExpense.create');
    expect(find.text('All site expenses fully synced'), findsOneWidget);

    final updated = store.listSiteExpenses('acct-1', 'tenant-1');
    expect(updated.first.operationState, 'accepted');
  });
}
