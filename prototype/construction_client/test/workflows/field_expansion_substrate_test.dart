import 'dart:convert';
import 'dart:io';

import 'package:construction_application/construction_application.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:construction_client/workflows/field_expansion_substrate.dart';
import 'package:flutter_test/flutter_test.dart';

class _Credentials implements SecureCredentialStore {
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
  bool rejectNext = false;
  String? rejectReason;

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async {
    sent.add(envelope);
    if (rejectNext) {
      return SyncOutcome(
        kind: SyncOutcomeKind.rejected,
        opId: envelope.opId,
        detail: rejectReason ?? 'rejected by server',
      );
    }
    return SyncOutcome(
      kind: SyncOutcomeKind.accepted,
      opId: envelope.opId,
      receipt: 'rcpt-${envelope.opId}',
      serverSeq: 101,
    );
  }
}

void main() {
  late Directory tmp;
  ConstructionMount? mounted;
  late _Credentials credentials;
  late _RecordingTransport transport;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('field_expansion_substrate_test');
    credentials = _Credentials();
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
    credentials: credentials,
    transport: transport,
  );

  group('Field Expansion Substrate: Atomic Persistence & Reopen', () {
    test('Attendance, Site Expense, and MRR save atomically and survive reopen', () {
      mounted = open();
      final store = FieldExpansionLocalStore(mounted!);

      // 1. Attendance Save
      final attendanceDraft = AttendanceSubmissionDraft(
        clientUuid: 'attend-uuid-0001',
        projectId: 'project-alpha',
        attendanceDate: '2026-10-12',
        shiftName: 'Morning Shift',
        records: const [
          AttendanceRecordItem(
            staffId: 'staff-101',
            staffName: 'Ramesh Sharma',
            trade: 'Mason',
            status: 'present',
            regularHours: 8.0,
            overtimeHours: 2.0,
          ),
          AttendanceRecordItem(
            staffId: 'staff-102',
            staffName: 'Sita Gurung',
            trade: 'Electrician',
            status: 'present',
            regularHours: 8.0,
          ),
        ],
        supervisorRemarks: 'Full masonry crew present.',
      );

      store.saveAttendance(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: attendanceDraft,
      );

      final attendanceOp = mounted!.pendingOps.getOp('acct-1', 'attend-uuid-0001')!;
      expect(attendanceOp.state, 'pending');
      expect(attendanceOp.kind, 'attendance.record');
      expect(attendanceOp.tenantId, 'tenant-1');
      expect(attendanceOp.role, 'field_supervisor');

      // 2. Site Expense Save
      final expenseDraft = SiteExpenseSubmissionDraft(
        clientUuid: 'expense-uuid-0001',
        projectId: 'project-alpha',
        expenseDate: '2026-10-12',
        category: 'fuel',
        amount: '4500.50',
        currency: 'NPR',
        payee: 'Himalayan Fuel Centre',
        memo: 'Generator diesel top-up (30 liters)',
        receiptPhotoIds: const ['receipt-photo-001'],
      );

      store.saveSiteExpense(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: expenseDraft,
      );

      final expenseOp = mounted!.pendingOps.getOp('acct-1', 'expense-uuid-0001')!;
      expect(expenseOp.state, 'pending');
      expect(expenseOp.kind, 'siteExpense.create');

      // 3. Material Delivery Save
      final deliveryDraft = MaterialDeliverySubmissionDraft(
        clientUuid: 'delivery-uuid-0001',
        projectId: 'project-alpha',
        deliveryDate: '2026-10-12',
        supplierName: 'Shree Cement Udhyog',
        challanNumber: 'CH-2026-889',
        vehicleNumber: 'BA 2 KHA 4455',
        items: const [
          MaterialDeliveryItem(
            materialCode: 'OPC-53',
            materialName: 'OPC 53 Grade Cement',
            quantity: 200,
            unit: 'bags',
          ),
        ],
        receiptPhotoIds: const ['receipt-challan-001'],
        remarks: '200 bags unloaded at Block B store',
      );

      store.saveMaterialDelivery(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: deliveryDraft,
      );

      final deliveryOp = mounted!.pendingOps.getOp('acct-1', 'delivery-uuid-0001')!;
      expect(deliveryOp.state, 'pending');
      expect(deliveryOp.kind, 'material.delivery');

      // Verify Shared Sync Health (M03-T08 read model)
      final health = store.syncHealth('acct-1', 'tenant-1');
      expect(health.synced, isFalse);
      expect(health.pendingOperationCount, 3);
      expect(health.reasons, contains('3 pending operation(s) not yet accepted'));

      // Reopen mount to prove durability across process restart
      mounted!.driver.close();
      mounted = open();
      final reopenedStore = FieldExpansionLocalStore(mounted!);

      final loadedAttendance = reopenedStore.getAttendance('acct-1', 'attend-uuid-0001')!;
      expect(loadedAttendance.records.length, 2);
      expect(loadedAttendance.records.first.staffName, 'Ramesh Sharma');

      final loadedExpense = reopenedStore.getSiteExpense('acct-1', 'expense-uuid-0001')!;
      expect(loadedExpense.amount, '4500.50');
      expect(loadedExpense.payee, 'Himalayan Fuel Centre');

      final loadedDelivery = reopenedStore.getMaterialDelivery('acct-1', 'delivery-uuid-0001')!;
      expect(loadedDelivery.challanNumber, 'CH-2026-889');
      expect(loadedDelivery.items.first.quantity, 200);

      // Verify pending ops survived exactly
      expect(reopenedStore.operationState('acct-1', 'attend-uuid-0001'), 'pending');
      expect(reopenedStore.operationState('acct-1', 'expense-uuid-0001'), 'pending');
      expect(reopenedStore.operationState('acct-1', 'delivery-uuid-0001'), 'pending');
    });
  });

  group('Field Expansion Substrate: Atomic Edits & Immutability', () {
    test('Edits unsent drafts and updates pending operation payload atomically', () {
      mounted = open();
      final store = FieldExpansionLocalStore(mounted!);

      final initialExpense = SiteExpenseSubmissionDraft(
        clientUuid: 'expense-edit-0001',
        projectId: 'project-alpha',
        expenseDate: '2026-10-12',
        category: 'food',
        amount: '800.00',
        payee: 'Local Canteen',
        memo: 'Tea and snacks',
      );

      store.saveSiteExpense(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: initialExpense,
      );

      expect(store.canEditUnsent('acct-1', 'expense-edit-0001'), isTrue);

      // Edit unsent
      final updatedExpense = SiteExpenseSubmissionDraft(
        clientUuid: 'expense-edit-0001',
        projectId: 'project-alpha',
        expenseDate: '2026-10-12',
        category: 'food',
        amount: '950.00',
        payee: 'Local Canteen',
        memo: 'Tea, snacks, and extra biscuits for night shift',
      );

      store.editUnsentSiteExpense(
        accountId: 'acct-1',
        draft: updatedExpense,
      );

      final loaded = store.getSiteExpense('acct-1', 'expense-edit-0001')!;
      expect(loaded.amount, '950.00');
      expect(loaded.memo, contains('extra biscuits'));

      final op = mounted!.pendingOps.getOp('acct-1', 'expense-edit-0001')!;
      final opPayload = jsonDecode(op.payload) as Map<String, Object?>;
      expect(opPayload['amount'], '950.00');
    });

    test('Dispatched operations cannot be edited locally (immutability rule)', () {
      mounted = open();
      final store = FieldExpansionLocalStore(mounted!);

      final initialAttendance = AttendanceSubmissionDraft(
        clientUuid: 'attend-locked-0001',
        projectId: 'project-alpha',
        attendanceDate: '2026-10-12',
        records: const [
          AttendanceRecordItem(
            staffId: 'staff-101',
            staffName: 'Ramesh Sharma',
            trade: 'Mason',
          ),
        ],
      );

      store.saveAttendance(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: initialAttendance,
      );

      // Simulate orchestrator marking operation in_flight
      mounted!.driver.prepare("UPDATE pending_op SET state = 'in_flight', attempts = 1 WHERE id = ?").run(['attend-locked-0001']);

      expect(store.canEditUnsent('acct-1', 'attend-locked-0001'), isFalse);

      expect(
        () => store.editUnsentAttendance(
          accountId: 'acct-1',
          draft: initialAttendance,
        ),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'illegal_transition')),
      );
    });
  });

  group('Field Expansion Substrate: Recovery Copies', () {
    test('Rejected operation can be duplicated with new UUID for review and retry', () {
      mounted = open();
      final store = FieldExpansionLocalStore(mounted!);

      final delivery = MaterialDeliverySubmissionDraft(
        clientUuid: 'del-rejected-0001',
        projectId: 'project-alpha',
        deliveryDate: '2026-10-12',
        supplierName: 'Wrong Supplier',
        challanNumber: 'CH-ERR-01',
        items: const [
          MaterialDeliveryItem(
            materialCode: 'SAND',
            materialName: 'Fine Sand',
            quantity: 10,
            unit: 'tons',
          ),
        ],
      );

      store.saveMaterialDelivery(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: delivery,
      );

      // Simulate server rejection
      mounted!.driver.prepare("UPDATE pending_op SET state = 'rejected', last_error = 'Invalid supplier' WHERE id = ?").run(['del-rejected-0001']);

      // Attempting to save recovery copy with SAME UUID throws
      expect(
        () => store.saveRecoveryMaterialDelivery(
          accountId: 'acct-1',
          tenantId: 'tenant-1',
          role: 'field_supervisor',
          sourceClientUuid: 'del-rejected-0001',
          draft: delivery,
        ),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'illegal_transition')),
      );

      // Correct recovery copy with new UUID
      final recoveryDraft = MaterialDeliverySubmissionDraft(
        clientUuid: 'del-recovery-0002',
        projectId: 'project-alpha',
        deliveryDate: '2026-10-12',
        supplierName: 'Correct Supplier Pvt Ltd',
        challanNumber: 'CH-ERR-01',
        items: delivery.items,
      );

      store.saveRecoveryMaterialDelivery(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        sourceClientUuid: 'del-rejected-0001',
        draft: recoveryDraft,
      );

      // Original rejected op remains intact for audit
      expect(store.operationState('acct-1', 'del-rejected-0001'), 'rejected');
      // New recovery op is pending
      expect(store.operationState('acct-1', 'del-recovery-0002'), 'pending');
      expect(
        store.getMaterialDelivery('acct-1', 'del-recovery-0002')?.supplierName,
        'Correct Supplier Pvt Ltd',
      );
    });
  });

  group('Field Expansion Substrate: Orchestrator Drain & Shared Pipeline', () {
    test('syncNow() dispatches expansion operations through the shared orchestrator and transport', () async {
      mounted = open();
      final orchestrator = DailyLogSyncOrchestrator(
        mount: mounted!,
        deviceId: 'device-test-01',
      );
      orchestrator.bindDrainTriggers(() => 'acct-1');

      final store = FieldExpansionLocalStore(mounted!);

      store.saveAttendance(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: AttendanceSubmissionDraft(
          clientUuid: 'attend-drain-0001',
          projectId: 'project-alpha',
          attendanceDate: '2026-10-12',
          records: const [
            AttendanceRecordItem(
              staffId: 'staff-1',
              staffName: 'Prem BK',
              trade: 'Welder',
            ),
          ],
        ),
      );

      store.saveSiteExpense(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field_supervisor',
        draft: SiteExpenseSubmissionDraft(
          clientUuid: 'expense-drain-0001',
          projectId: 'project-alpha',
          expenseDate: '2026-10-12',
          category: 'materials',
          amount: '1200.00',
          payee: 'Hardware Shop',
        ),
      );

      expect(transport.sent, isEmpty);

      // Trigger manual sync through shared pipeline
      await store.syncNow();

      expect(transport.sent, isNotEmpty);
      final opIds = transport.sent.map((e) => e.opId).toSet();
      expect(opIds, containsAll(['attend-drain-0001', 'expense-drain-0001']));

      // After accepted sync, operations are marked accepted and health becomes synced
      expect(store.operationState('acct-1', 'attend-drain-0001'), 'accepted');
      expect(store.operationState('acct-1', 'expense-drain-0001'), 'accepted');

      final health = store.syncHealth('acct-1', 'tenant-1');
      expect(health.synced, isTrue);
      expect(health.pendingOperationCount, 0);
    });
  });

  group('Field Expansion Substrate: Commands & Routes', () {
    test('Registry commands are available across all platforms', () {
      for (final platform in ConstructionPlatform.values) {
        final available = kFieldExpansionCommands.availableFor(
          platform,
          kFieldExpansionCapabilities,
        );
        expect(available.every((cmd) => cmd.available), isTrue);
        expect(available.length, 6);
      }
    });

    test('Registry navigation routes are available across all platforms', () {
      for (final platform in ConstructionPlatform.values) {
        final nav = kFieldExpansionRoutes.navigationFor(
          platform,
          kFieldExpansionCapabilities,
        );
        expect(nav.every((entry) => entry.available), isTrue);
        expect(nav.length, 3);
      }
    });
  });

  group('Field Expansion Substrate: Validation Constraints', () {
    test('Rejects invalid UUID, missing project, or malformed dates', () {
      expect(
        () => AttendanceSubmissionDraft(
          clientUuid: 'short',
          projectId: 'project-1',
          attendanceDate: '2026-10-12',
          records: const [AttendanceRecordItem(staffId: '1', staffName: 'A', trade: 'B')],
        ).toProcedureInput(),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );

      expect(
        () => SiteExpenseSubmissionDraft(
          clientUuid: 'valid-uuid-1234',
          projectId: '',
          expenseDate: '2026-10-12',
          category: 'fuel',
          amount: '100',
          payee: 'Payee',
        ).toProcedureInput(),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );

      expect(
        () => SiteExpenseSubmissionDraft(
          clientUuid: 'valid-uuid-1234',
          projectId: 'project-1',
          expenseDate: '2026-10-12',
          category: 'fuel',
          amount: '-500',
          payee: 'Payee',
        ).toProcedureInput(),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );

      expect(
        () => MaterialDeliverySubmissionDraft(
          clientUuid: 'valid-uuid-1234',
          projectId: 'project-1',
          deliveryDate: '2026-10-12',
          supplierName: '',
          challanNumber: 'CH-1',
          items: const [MaterialDeliveryItem(materialCode: 'C', materialName: 'Cement', quantity: 1, unit: 'bags')],
        ).toProcedureInput(),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
    });
  });
}
