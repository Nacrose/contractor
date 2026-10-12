import 'dart:io';

import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:construction_client/workflows/field_expansion_substrate.dart';
import 'package:construction_client/workflows/material_delivery_screen.dart';
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
      receipt: 'rcpt-mrr-001',
      serverSeq: 401,
    );
  }
}

void main() {
  late Directory tmp;
  ConstructionMount? mounted;
  late _RecordingTransport transport;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('material_delivery_screen_test');
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
      home: MaterialDeliveryScreen(
        store: store,
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'site_engineer',
        projects: const [
          MaterialDeliveryProjectOption(id: 'proj-1', label: 'Kathmandu Tower Site'),
          MaterialDeliveryProjectOption(id: 'proj-2', label: 'Pokhara Villa Complex'),
        ],
      ),
    );
  }

  testWidgets('renders material delivery screen with form fields and review notice', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    expect(find.text('Material Delivery & MRR'), findsOneWidget);
    expect(find.text('Kathmandu Tower Site'), findsOneWidget);
    expect(find.text('Supplier / Vendor'), findsOneWidget);
    expect(find.text('Challan / Waybill No.'), findsOneWidget);
    expect(find.text('Delivered Materials (1)'), findsOneWidget);
    expect(find.text('Save Locally'), findsOneWidget);
    expect(
      find.textContaining('Material delivery submissions land in pending review status.'),
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

    // Tap "Save Locally" without supplier
    await tester.tap(find.text('Save Locally'));
    await tester.pumpAndSettle();

    expect(find.text('Supplier / vendor name is required.'), findsOneWidget);

    // Enter supplier
    await tester.enterText(find.widgetWithText(TextField, 'Supplier / Vendor'), 'Shivam Cement Ltd.');
    await tester.tap(find.text('Save Locally'));
    await tester.pumpAndSettle();

    expect(find.text('Challan / waybill number is required.'), findsOneWidget);
  });

  testWidgets('adding and removing material items dynamically updates item count', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    expect(find.text('Delivered Materials (1)'), findsOneWidget);

    // Tap "Add Material"
    await tester.tap(find.text('Add Material'));
    await tester.pumpAndSettle();

    expect(find.text('Delivered Materials (2)'), findsOneWidget);

    // Remove the second item
    final removeButtons = find.byIcon(Icons.remove_circle_outline);
    expect(removeButtons, findsNWidgets(2));
    await tester.tap(removeButtons.last);
    await tester.pumpAndSettle();

    expect(find.text('Delivered Materials (1)'), findsOneWidget);
  });

  testWidgets('saving delivery writes to local domain table and creates pending outbox op', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    // Enter valid details
    await tester.enterText(find.widgetWithText(TextField, 'Supplier / Vendor'), 'Hulas Steel Industries');
    await tester.enterText(find.widgetWithText(TextField, 'Challan / Waybill No.'), 'HL-99201');
    await tester.enterText(find.widgetWithText(TextField, 'Vehicle / Truck No.'), 'NA 5 KHA 1234');
    await tester.enterText(
      find.widgetWithText(TextField, 'Unloading Remarks / Condition Notes'),
      'Bundles inspected at site gate, no rust.',
    );

    // Tap Save Locally
    await tester.tap(find.text('Save Locally'));
    await tester.pumpAndSettle();

    expect(find.text('Saved MRR delivery locally in durable outbox.'), findsOneWidget);
    expect(find.text('1 pending outbox delivery(ies)'), findsOneWidget);

    // Verify stored in FieldExpansionLocalStore
    final savedList = store.listMaterialDeliveries('acct-1', 'tenant-1');
    expect(savedList.length, 1);
    expect(savedList.first.draft.supplierName, 'Hulas Steel Industries');
    expect(savedList.first.draft.challanNumber, 'HL-99201');
    expect(savedList.first.draft.items.length, 1);
    expect(savedList.first.draft.items.first.quantity, 100.0);
    expect(savedList.first.operationState, 'pending');

    // Also verify pending op in SQLite
    final ops = mounted!.driver.prepare('SELECT kind, state FROM pending_op').all(const []);
    expect(ops.length, 1);
    expect(ops.first['kind'], 'material.delivery');
  });

  testWidgets('syncing outbox transmits delivery via transport and marks health synced', (tester) async {
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

    // Pre-save a delivery
    store.saveMaterialDelivery(
      accountId: 'acct-1',
      tenantId: 'tenant-1',
      role: 'site_engineer',
      draft: MaterialDeliverySubmissionDraft(
        clientUuid: 'del-client-1234',
        projectId: 'proj-1',
        deliveryDate: '2026-10-12',
        supplierName: 'Nepal Aggregates Pvt.',
        challanNumber: 'AG-1002',
        vehicleNumber: 'BA 3 KHA 9081',
        items: const [
          MaterialDeliveryItem(
            materialCode: 'MAT-AGG-20MM',
            materialName: 'Crushed Aggregate 20mm',
            quantity: 15.0,
            unit: 'cum',
          ),
        ],
        remarks: 'Direct dump to batching plant bin',
      ),
    );

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    expect(find.text('1 pending outbox delivery(ies)'), findsOneWidget);
    expect(find.textContaining('Nepal Aggregates Pvt.'), findsOneWidget);

    // Tap Sync Outbox
    await tester.tap(find.text('Sync Outbox'));
    await tester.pumpAndSettle();

    expect(transport.sent.length, 1);
    expect(transport.sent.first.kind, 'material.delivery');
    expect(find.text('All deliveries fully synced'), findsOneWidget);

    final updated = store.listMaterialDeliveries('acct-1', 'tenant-1');
    expect(updated.first.operationState, 'accepted');
  });
}
