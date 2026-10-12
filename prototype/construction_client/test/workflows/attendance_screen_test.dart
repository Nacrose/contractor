import 'dart:io';

import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/workflows/attendance_screen.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:construction_client/workflows/field_expansion_substrate.dart';
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
      receipt: 'rcpt-attend-001',
      serverSeq: 201,
    );
  }
}

void main() {
  late Directory tmp;
  ConstructionMount? mounted;
  late _RecordingTransport transport;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('attendance_screen_test');
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
      home: AttendanceScreen(
        store: store,
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        projects: const [
          AttendanceProjectOption(id: 'proj-1', label: 'Project Alpha'),
          AttendanceProjectOption(id: 'proj-2', label: 'Project Beta'),
        ],
      ),
    );
  }

  testWidgets('renders attendance screen with header, workers roster, and KPI bar', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    expect(find.text('Daily Site Attendance'), findsOneWidget);
    expect(find.text('Project Alpha'), findsOneWidget);
    expect(find.text('General Day Shift'), findsOneWidget);
    expect(find.text('Site Crew Roster (5 workers)'), findsOneWidget);
    expect(find.text('Ramesh Sharma'), findsOneWidget);
    expect(find.text('Sita Gurung'), findsOneWidget);
    expect(find.text('Save Locally'), findsOneWidget);
  });

  testWidgets('toggling attendance status chips updates hours and KPI in real-time', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    // Initially 5 workers are present (8h reg each = 40h total)
    expect(find.text('40.0h'), findsOneWidget);

    // Tap "Half Day" on first worker
    final halfDayChips = find.text('Half Day');
    await tester.tap(halfDayChips.first);
    await tester.pumpAndSettle();

    // Regular hours should now be 36.0h (4*8 + 1*4)
    expect(find.text('36.0h'), findsOneWidget);

    // Tap "Absent" on second worker
    final absentChips = find.text('Absent');
    await tester.tap(absentChips.at(1));
    await tester.pumpAndSettle();

    // Regular hours should now be 28.0h (3*8 + 1*4 + 1*0)
    expect(find.text('28.0h'), findsOneWidget);
  });

  testWidgets('saving attendance commits locally and creates pending outbox op', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    // Tap "Save Locally"
    await tester.tap(find.text('Save Locally'));
    await tester.pumpAndSettle();

    expect(find.text('Saved attendance locally in durable outbox.'), findsOneWidget);

    // Verify in store
    final savedList = store.listAttendance('acct-1', 'tenant-1');
    expect(savedList.length, 1);
    expect(savedList.first.draft.projectId, 'proj-1');
    expect(savedList.first.draft.records.length, 5);
    expect(savedList.first.operationState, 'pending');

    // Button updates to "Update Local"
    expect(find.text('Update Local'), findsOneWidget);
  });

  testWidgets('adding a worker to roster expands the list and recalculates KPI', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    mounted = open();
    final store = FieldExpansionLocalStore(mounted!);

    await tester.pumpWidget(createWidgetUnderTest(store));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add Worker'));
    await tester.pumpAndSettle();

    expect(find.text('Add Worker to Roster'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Worker Name'), 'Kiran Shrestha');
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();

    expect(find.text('Site Crew Roster (6 workers)'), findsOneWidget);
    expect(find.text('Kiran Shrestha'), findsOneWidget);
    expect(find.text('48.0h'), findsOneWidget); // 6 * 8h
  });
}
