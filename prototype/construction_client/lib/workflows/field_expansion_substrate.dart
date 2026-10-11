/// M05-T01 expansion substrate: shared repositories, typed commands,
/// and sync status for the field workflow family.
///
/// Dispatches attendance, site expenses (petty cash), and MRR / material
/// deliveries through the SAME outbox -> orchestrator -> adapter pipeline as
/// the M04 vertical, binding sync health directly to the central M03-T08
/// device health read model with zero per-workflow forks.
library;

import 'dart:convert';

import 'package:construction_application/construction_application.dart';

import '../mount/mount.dart';
import '../mount/outbox_repository.dart';
import '../mount/ports.dart';
import '../mount/sync_health.dart';

/// Database migration for expansion workflow local tables.
const Migration kFieldExpansionLocalMigration = Migration(
  5,
  'field_expansion_local',
  [
    'CREATE TABLE attendance_local ('
        ' client_uuid TEXT PRIMARY KEY,'
        ' account_id TEXT NOT NULL,'
        ' project_id TEXT NOT NULL,'
        ' attendance_date TEXT NOT NULL,'
        ' payload TEXT NOT NULL,'
        ' created_at INTEGER NOT NULL,'
        ' updated_at INTEGER NOT NULL'
        ')',
    'CREATE INDEX idx_attendance_local_account_date '
        'ON attendance_local (account_id, attendance_date DESC)',
    'CREATE TABLE site_expense_local ('
        ' client_uuid TEXT PRIMARY KEY,'
        ' account_id TEXT NOT NULL,'
        ' project_id TEXT NOT NULL,'
        ' expense_date TEXT NOT NULL,'
        ' payload TEXT NOT NULL,'
        ' created_at INTEGER NOT NULL,'
        ' updated_at INTEGER NOT NULL'
        ')',
    'CREATE INDEX idx_site_expense_local_account_date '
        'ON site_expense_local (account_id, expense_date DESC)',
    'CREATE TABLE material_delivery_local ('
        ' client_uuid TEXT PRIMARY KEY,'
        ' account_id TEXT NOT NULL,'
        ' project_id TEXT NOT NULL,'
        ' delivery_date TEXT NOT NULL,'
        ' payload TEXT NOT NULL,'
        ' created_at INTEGER NOT NULL,'
        ' updated_at INTEGER NOT NULL'
        ')',
    'CREATE INDEX idx_material_delivery_local_account_date '
        'ON material_delivery_local (account_id, delivery_date DESC)',
  ],
);

// ---------------------------------------------------------------------------
// Shared Field Submission Interface
// ---------------------------------------------------------------------------

abstract interface class FieldSubmissionDraft {
  String get clientUuid;
  String get projectId;
  String get submissionDate;
  String get operationKind;
  Map<String, Object?> toProcedureInput();
  String get operationPayload;
  String encode();
}

// ---------------------------------------------------------------------------
// 1. Attendance Workflow Models (M05-T02)
// ---------------------------------------------------------------------------

class AttendanceRecordItem {
  final String staffId;
  final String staffName;
  final String trade;
  final String status; // 'present', 'absent', 'half_day', 'leave'
  final String? checkInTime; // 'HH:mm'
  final String? checkOutTime; // 'HH:mm'
  final double regularHours;
  final double overtimeHours;
  final String notes;

  const AttendanceRecordItem({
    required this.staffId,
    required this.staffName,
    required this.trade,
    this.status = 'present',
    this.checkInTime,
    this.checkOutTime,
    this.regularHours = 8.0,
    this.overtimeHours = 0.0,
    this.notes = '',
  });

  Map<String, Object?> toJson() => {
    'staffId': staffId,
    'staffName': staffName,
    'trade': trade,
    'status': status,
    if (checkInTime != null) 'checkInTime': checkInTime,
    if (checkOutTime != null) 'checkOutTime': checkOutTime,
    'regularHours': regularHours,
    'overtimeHours': overtimeHours,
    'notes': notes,
  };

  static AttendanceRecordItem fromJson(Map<String, Object?> json) =>
      AttendanceRecordItem(
        staffId: json['staffId']! as String,
        staffName: json['staffName']! as String,
        trade: json['trade'] as String? ?? 'General',
        status: json['status'] as String? ?? 'present',
        checkInTime: json['checkInTime'] as String?,
        checkOutTime: json['checkOutTime'] as String?,
        regularHours: (json['regularHours'] as num?)?.toDouble() ?? 8.0,
        overtimeHours: (json['overtimeHours'] as num?)?.toDouble() ?? 0.0,
        notes: json['notes'] as String? ?? '',
      );
}

class AttendanceSubmissionDraft implements FieldSubmissionDraft {
  @override
  final String clientUuid;
  @override
  final String projectId;
  final String attendanceDate; // YYYY-MM-DD
  final String shiftName;
  final List<AttendanceRecordItem> records;
  final String supervisorRemarks;

  AttendanceSubmissionDraft({
    required this.clientUuid,
    required this.projectId,
    required this.attendanceDate,
    this.shiftName = 'General Shift',
    required this.records,
    this.supervisorRemarks = '',
  });

  @override
  String get submissionDate => attendanceDate;

  @override
  String get operationKind => 'attendance.record';

  void _validate() {
    if (clientUuid.length < 8 || clientUuid.length > 128) {
      throw RepositoryError(
        'misconfigured',
        'clientUuid must contain 8–128 characters.',
      );
    }
    if (projectId.isEmpty ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(attendanceDate)) {
      throw RepositoryError(
        'misconfigured',
        'A project and YYYY-MM-DD attendance date are required.',
      );
    }
    if (records.isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'At least one attendance record is required.',
      );
    }
    for (final record in records) {
      if (record.staffId.isEmpty || record.staffName.isEmpty) {
        throw RepositoryError(
          'misconfigured',
          'Staff ID and name cannot be empty in attendance records.',
        );
      }
      if (record.regularHours < 0 || record.regularHours > 24) {
        throw RepositoryError(
          'misconfigured',
          'Regular hours must be between 0 and 24.',
        );
      }
      if (record.overtimeHours < 0 || record.overtimeHours > 24) {
        throw RepositoryError(
          'misconfigured',
          'Overtime hours must be between 0 and 24.',
        );
      }
    }
  }

  @override
  Map<String, Object?> toProcedureInput() {
    _validate();
    return {
      'projectId': projectId,
      'attendanceDate': attendanceDate,
      'shiftName': shiftName,
      'records': records.map((r) => r.toJson()).toList(growable: false),
      'supervisorRemarks': supervisorRemarks,
      'clientUuid': clientUuid,
    };
  }

  @override
  String get operationPayload => encode();

  @override
  String encode() => jsonEncode(toProcedureInput());

  static AttendanceSubmissionDraft decode(String rawJson) {
    final map = jsonDecode(rawJson) as Map<String, Object?>;
    final recordsList = (map['records'] as List<Object?>)
        .map((r) => AttendanceRecordItem.fromJson(Map<String, Object?>.from(r! as Map)))
        .toList(growable: false);
    return AttendanceSubmissionDraft(
      clientUuid: map['clientUuid']! as String,
      projectId: map['projectId']! as String,
      attendanceDate: map['attendanceDate']! as String,
      shiftName: map['shiftName'] as String? ?? 'General Shift',
      records: recordsList,
      supervisorRemarks: map['supervisorRemarks'] as String? ?? '',
    );
  }

  AttendanceSubmissionDraft withClientUuid(String newUuid) =>
      AttendanceSubmissionDraft(
        clientUuid: newUuid,
        projectId: projectId,
        attendanceDate: attendanceDate,
        shiftName: shiftName,
        records: records,
        supervisorRemarks: supervisorRemarks,
      );
}

// ---------------------------------------------------------------------------
// 2. Site Expense / Petty Cash Models (M05-T03)
// ---------------------------------------------------------------------------

class SiteExpenseSubmissionDraft implements FieldSubmissionDraft {
  @override
  final String clientUuid;
  @override
  final String projectId;
  final String expenseDate; // YYYY-MM-DD
  final String category; // 'fuel', 'materials', 'food', 'travel', 'equipment_hire', 'tools', 'misc'
  final String amount; // exact decimal string representation e.g. "1250.00"
  final String currency; // 'NPR'
  final String payee;
  final String memo;
  final List<String> receiptPhotoIds;

  SiteExpenseSubmissionDraft({
    required this.clientUuid,
    required this.projectId,
    required this.expenseDate,
    required this.category,
    required this.amount,
    this.currency = 'NPR',
    required this.payee,
    this.memo = '',
    this.receiptPhotoIds = const [],
  });

  @override
  String get submissionDate => expenseDate;

  @override
  String get operationKind => 'siteExpense.create';

  void _validate() {
    if (clientUuid.length < 8 || clientUuid.length > 128) {
      throw RepositoryError(
        'misconfigured',
        'clientUuid must contain 8–128 characters.',
      );
    }
    if (projectId.isEmpty ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(expenseDate)) {
      throw RepositoryError(
        'misconfigured',
        'A project and YYYY-MM-DD expense date are required.',
      );
    }
    final parsedAmount = double.tryParse(amount);
    if (parsedAmount == null || parsedAmount <= 0) {
      throw RepositoryError(
        'misconfigured',
        'Expense amount must be a positive decimal number.',
      );
    }
    if (payee.trim().isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'Payee / merchant name is required for site expenses.',
      );
    }
    if (category.trim().isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'Expense category is required.',
      );
    }
  }

  @override
  Map<String, Object?> toProcedureInput() {
    _validate();
    return {
      'projectId': projectId,
      'expenseDate': expenseDate,
      'category': category,
      'amount': amount,
      'currency': currency,
      'payee': payee,
      'memo': memo,
      'receiptPhotoIds': receiptPhotoIds,
      'clientUuid': clientUuid,
    };
  }

  @override
  String get operationPayload => encode();

  @override
  String encode() => jsonEncode(toProcedureInput());

  static SiteExpenseSubmissionDraft decode(String rawJson) {
    final map = jsonDecode(rawJson) as Map<String, Object?>;
    return SiteExpenseSubmissionDraft(
      clientUuid: map['clientUuid']! as String,
      projectId: map['projectId']! as String,
      expenseDate: map['expenseDate']! as String,
      category: map['category']! as String,
      amount: map['amount']! as String,
      currency: map['currency'] as String? ?? 'NPR',
      payee: map['payee']! as String,
      memo: map['memo'] as String? ?? '',
      receiptPhotoIds: (map['receiptPhotoIds'] as List<Object?>? ?? const [])
          .map((id) => '$id')
          .toList(growable: false),
    );
  }

  SiteExpenseSubmissionDraft withClientUuid(String newUuid) =>
      SiteExpenseSubmissionDraft(
        clientUuid: newUuid,
        projectId: projectId,
        expenseDate: expenseDate,
        category: category,
        amount: amount,
        currency: currency,
        payee: payee,
        memo: memo,
        receiptPhotoIds: receiptPhotoIds,
      );
}

// ---------------------------------------------------------------------------
// 3. Material Delivery / MRR Models (M05-T04)
// ---------------------------------------------------------------------------

class MaterialDeliveryItem {
  final String materialCode;
  final String materialName;
  final double quantity;
  final String unit; // 'bags', 'tons', 'cum', 'liters', 'pcs'
  final String? remarks;

  const MaterialDeliveryItem({
    required this.materialCode,
    required this.materialName,
    required this.quantity,
    required this.unit,
    this.remarks,
  });

  Map<String, Object?> toJson() => {
    'materialCode': materialCode,
    'materialName': materialName,
    'quantity': quantity,
    'unit': unit,
    if (remarks != null) 'remarks': remarks,
  };

  static MaterialDeliveryItem fromJson(Map<String, Object?> json) =>
      MaterialDeliveryItem(
        materialCode: json['materialCode']! as String,
        materialName: json['materialName']! as String,
        quantity: (json['quantity'] as num).toDouble(),
        unit: json['unit']! as String,
        remarks: json['remarks'] as String?,
      );
}

class MaterialDeliverySubmissionDraft implements FieldSubmissionDraft {
  @override
  final String clientUuid;
  @override
  final String projectId;
  final String deliveryDate; // YYYY-MM-DD
  final String supplierName;
  final String challanNumber;
  final String vehicleNumber;
  final List<MaterialDeliveryItem> items;
  final List<String> receiptPhotoIds;
  final String remarks;

  MaterialDeliverySubmissionDraft({
    required this.clientUuid,
    required this.projectId,
    required this.deliveryDate,
    required this.supplierName,
    required this.challanNumber,
    this.vehicleNumber = '',
    required this.items,
    this.receiptPhotoIds = const [],
    this.remarks = '',
  });

  @override
  String get submissionDate => deliveryDate;

  @override
  String get operationKind => 'material.delivery';

  void _validate() {
    if (clientUuid.length < 8 || clientUuid.length > 128) {
      throw RepositoryError(
        'misconfigured',
        'clientUuid must contain 8–128 characters.',
      );
    }
    if (projectId.isEmpty ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(deliveryDate)) {
      throw RepositoryError(
        'misconfigured',
        'A project and YYYY-MM-DD delivery date are required.',
      );
    }
    if (supplierName.trim().isEmpty || challanNumber.trim().isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'Supplier name and challan number are required for MRR submissions.',
      );
    }
    if (items.isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'At least one delivered material item is required.',
      );
    }
    for (final item in items) {
      if (item.quantity <= 0) {
        throw RepositoryError(
          'misconfigured',
          'Delivered material quantity must be greater than zero.',
        );
      }
    }
  }

  @override
  Map<String, Object?> toProcedureInput() {
    _validate();
    return {
      'projectId': projectId,
      'deliveryDate': deliveryDate,
      'supplierName': supplierName,
      'challanNumber': challanNumber,
      'vehicleNumber': vehicleNumber,
      'items': items.map((i) => i.toJson()).toList(growable: false),
      'receiptPhotoIds': receiptPhotoIds,
      'remarks': remarks,
      'clientUuid': clientUuid,
    };
  }

  @override
  String get operationPayload => encode();

  @override
  String encode() => jsonEncode(toProcedureInput());

  static MaterialDeliverySubmissionDraft decode(String rawJson) {
    final map = jsonDecode(rawJson) as Map<String, Object?>;
    final itemsList = (map['items'] as List<Object?>)
        .map((i) => MaterialDeliveryItem.fromJson(Map<String, Object?>.from(i! as Map)))
        .toList(growable: false);
    return MaterialDeliverySubmissionDraft(
      clientUuid: map['clientUuid']! as String,
      projectId: map['projectId']! as String,
      deliveryDate: map['deliveryDate']! as String,
      supplierName: map['supplierName']! as String,
      challanNumber: map['challanNumber']! as String,
      vehicleNumber: map['vehicleNumber'] as String? ?? '',
      items: itemsList,
      receiptPhotoIds: (map['receiptPhotoIds'] as List<Object?>? ?? const [])
          .map((id) => '$id')
          .toList(growable: false),
      remarks: map['remarks'] as String? ?? '',
    );
  }

  MaterialDeliverySubmissionDraft withClientUuid(String newUuid) =>
      MaterialDeliverySubmissionDraft(
        clientUuid: newUuid,
        projectId: projectId,
        deliveryDate: deliveryDate,
        supplierName: supplierName,
        challanNumber: challanNumber,
        vehicleNumber: vehicleNumber,
        items: items,
        receiptPhotoIds: receiptPhotoIds,
        remarks: remarks,
      );
}

// ---------------------------------------------------------------------------
// Saved Entity Wrappers
// ---------------------------------------------------------------------------

class SavedFieldSubmission<T extends FieldSubmissionDraft> {
  final T draft;
  final String? operationState;
  final int updatedAtMs;

  const SavedFieldSubmission({
    required this.draft,
    required this.operationState,
    required this.updatedAtMs,
  });
}

// ---------------------------------------------------------------------------
// Expansion Workflow Store Contract
// ---------------------------------------------------------------------------

abstract interface class FieldExpansionWorkflowStore {
  Future<void> flushDurability();

  // Save methods (atomic domain + outbox write)
  String saveAttendance({
    required String accountId,
    required String tenantId,
    required String role,
    required AttendanceSubmissionDraft draft,
  });

  String saveSiteExpense({
    required String accountId,
    required String tenantId,
    required String role,
    required SiteExpenseSubmissionDraft draft,
  });

  String saveMaterialDelivery({
    required String accountId,
    required String tenantId,
    required String role,
    required MaterialDeliverySubmissionDraft draft,
  });

  // Edit unsent methods
  void editUnsentAttendance({
    required String accountId,
    required AttendanceSubmissionDraft draft,
  });

  void editUnsentSiteExpense({
    required String accountId,
    required SiteExpenseSubmissionDraft draft,
  });

  void editUnsentMaterialDelivery({
    required String accountId,
    required MaterialDeliverySubmissionDraft draft,
  });

  // Recovery copy methods
  String saveRecoveryAttendance({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required AttendanceSubmissionDraft draft,
  });

  String saveRecoverySiteExpense({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required SiteExpenseSubmissionDraft draft,
  });

  String saveRecoveryMaterialDelivery({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required MaterialDeliverySubmissionDraft draft,
  });

  // Queries
  AttendanceSubmissionDraft? getAttendance(String accountId, String clientUuid);
  SiteExpenseSubmissionDraft? getSiteExpense(String accountId, String clientUuid);
  MaterialDeliverySubmissionDraft? getMaterialDelivery(String accountId, String clientUuid);

  List<SavedFieldSubmission<AttendanceSubmissionDraft>> listAttendance(
    String accountId,
    String tenantId,
  );
  List<SavedFieldSubmission<SiteExpenseSubmissionDraft>> listSiteExpenses(
    String accountId,
    String tenantId,
  );
  List<SavedFieldSubmission<MaterialDeliverySubmissionDraft>> listMaterialDeliveries(
    String accountId,
    String tenantId,
  );

  bool canEditUnsent(String accountId, String clientUuid);
  String? operationState(String accountId, String clientUuid);

  // Central Sync Health and Trigger (SAME engine, zero forks)
  DeviceSyncHealth syncHealth(String accountId, String tenantId);
  Future<void> syncNow();
}

// ---------------------------------------------------------------------------
// Implementation over ConstructionMount
// ---------------------------------------------------------------------------

class FieldExpansionLocalStore implements FieldExpansionWorkflowStore {
  final ConstructionMount mount;

  FieldExpansionLocalStore(this.mount);

  @override
  Future<void> flushDurability() => mount.flushDurability();

  @override
  String saveAttendance({
    required String accountId,
    required String tenantId,
    required String role,
    required AttendanceSubmissionDraft draft,
  }) => _saveGeneric(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    tableName: 'attendance_local',
    dateColumn: 'attendance_date',
    draft: draft,
  );

  @override
  String saveSiteExpense({
    required String accountId,
    required String tenantId,
    required String role,
    required SiteExpenseSubmissionDraft draft,
  }) => _saveGeneric(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    tableName: 'site_expense_local',
    dateColumn: 'expense_date',
    draft: draft,
  );

  @override
  String saveMaterialDelivery({
    required String accountId,
    required String tenantId,
    required String role,
    required MaterialDeliverySubmissionDraft draft,
  }) => _saveGeneric(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    tableName: 'material_delivery_local',
    dateColumn: 'delivery_date',
    draft: draft,
  );

  String _saveGeneric({
    required String accountId,
    required String tenantId,
    required String role,
    required String tableName,
    required String dateColumn,
    required FieldSubmissionDraft draft,
  }) {
    final localPayload = draft.encode();
    final operationPayload = draft.operationPayload;
    final now = DateTime.now().millisecondsSinceEpoch;
    return mount.outbox.saveMutation(
      SaveMutationInput(
        accountId: accountId,
        projectId: draft.projectId,
        op: PendingOpInput(
          opId: draft.clientUuid,
          kind: draft.operationKind,
          payload: operationPayload,
          tenantId: tenantId,
          role: role,
        ),
        domain: (tx) {
          tx
              .prepare(
                'INSERT INTO $tableName '
                '(client_uuid, account_id, project_id, $dateColumn, payload, created_at, updated_at) '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
              )
              .run([
                draft.clientUuid,
                accountId,
                draft.projectId,
                draft.submissionDate,
                localPayload,
                now,
                now,
              ]);
        },
      ),
    );
  }

  @override
  void editUnsentAttendance({
    required String accountId,
    required AttendanceSubmissionDraft draft,
  }) => _editUnsentGeneric(
    accountId: accountId,
    tableName: 'attendance_local',
    dateColumn: 'attendance_date',
    draft: draft,
  );

  @override
  void editUnsentSiteExpense({
    required String accountId,
    required SiteExpenseSubmissionDraft draft,
  }) => _editUnsentGeneric(
    accountId: accountId,
    tableName: 'site_expense_local',
    dateColumn: 'expense_date',
    draft: draft,
  );

  @override
  void editUnsentMaterialDelivery({
    required String accountId,
    required MaterialDeliverySubmissionDraft draft,
  }) => _editUnsentGeneric(
    accountId: accountId,
    tableName: 'material_delivery_local',
    dateColumn: 'delivery_date',
    draft: draft,
  );

  void _editUnsentGeneric({
    required String accountId,
    required String tableName,
    required String dateColumn,
    required FieldSubmissionDraft draft,
  }) {
    final op = mount.pendingOps.getOp(accountId, draft.clientUuid);
    if (op == null || op.state != 'pending' || op.attempts != 0) {
      throw RepositoryError(
        'illegal_transition',
        'Only an undispatched ${draft.operationKind} submission can be edited locally.',
      );
    }
    final localPayload = draft.encode();
    final operationPayload = draft.operationPayload;
    mount.outbox.withImmediateTransaction(() {
      final now = DateTime.now().millisecondsSinceEpoch;
      final rowUpdate = mount.driver
          .prepare(
            'UPDATE $tableName '
            'SET project_id = ?, $dateColumn = ?, payload = ?, updated_at = ? '
            'WHERE client_uuid = ? AND account_id = ?',
          )
          .run([
            draft.projectId,
            draft.submissionDate,
            localPayload,
            now,
            draft.clientUuid,
            accountId,
          ]);
      final opUpdate = mount.driver
          .prepare(
            "UPDATE pending_op SET project_id = ?, payload = ?, updated_at = ? "
            "WHERE id = ? AND account_id = ? AND state = 'pending' AND attempts = 0",
          )
          .run([
            draft.projectId,
            operationPayload,
            now,
            draft.clientUuid,
            accountId,
          ]);
      if (rowUpdate.changes != 1 || opUpdate.changes != 1) {
        throw RepositoryError(
          'illegal_transition',
          '${draft.operationKind} changed or was dispatched during edit.',
        );
      }
    });
  }

  @override
  String saveRecoveryAttendance({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required AttendanceSubmissionDraft draft,
  }) => _saveRecoveryGeneric(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    sourceClientUuid: sourceClientUuid,
    tableName: 'attendance_local',
    dateColumn: 'attendance_date',
    draft: draft,
  );

  @override
  String saveRecoverySiteExpense({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required SiteExpenseSubmissionDraft draft,
  }) => _saveRecoveryGeneric(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    sourceClientUuid: sourceClientUuid,
    tableName: 'site_expense_local',
    dateColumn: 'expense_date',
    draft: draft,
  );

  @override
  String saveRecoveryMaterialDelivery({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required MaterialDeliverySubmissionDraft draft,
  }) => _saveRecoveryGeneric(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    sourceClientUuid: sourceClientUuid,
    tableName: 'material_delivery_local',
    dateColumn: 'delivery_date',
    draft: draft,
  );

  String _saveRecoveryGeneric({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required String tableName,
    required String dateColumn,
    required FieldSubmissionDraft draft,
  }) {
    final source = mount.pendingOps.getOp(accountId, sourceClientUuid);
    if (source == null ||
        !const {'rejected', 'conflict'}.contains(source.state)) {
      throw RepositoryError(
        'illegal_transition',
        'Only a rejected or conflicted submission can be copied for recovery.',
      );
    }
    if (draft.clientUuid == sourceClientUuid) {
      throw RepositoryError(
        'illegal_transition',
        'A recovery copy must use a new client UUID.',
      );
    }
    return _saveGeneric(
      accountId: accountId,
      tenantId: tenantId,
      role: role,
      tableName: tableName,
      dateColumn: dateColumn,
      draft: draft,
    );
  }

  @override
  AttendanceSubmissionDraft? getAttendance(String accountId, String clientUuid) {
    final row = mount.driver
        .prepare(
          'SELECT payload FROM attendance_local '
          'WHERE account_id = ? AND client_uuid = ?',
        )
        .get([accountId, clientUuid]);
    return row == null ? null : AttendanceSubmissionDraft.decode('${row['payload']}');
  }

  @override
  SiteExpenseSubmissionDraft? getSiteExpense(String accountId, String clientUuid) {
    final row = mount.driver
        .prepare(
          'SELECT payload FROM site_expense_local '
          'WHERE account_id = ? AND client_uuid = ?',
        )
        .get([accountId, clientUuid]);
    return row == null ? null : SiteExpenseSubmissionDraft.decode('${row['payload']}');
  }

  @override
  MaterialDeliverySubmissionDraft? getMaterialDelivery(String accountId, String clientUuid) {
    final row = mount.driver
        .prepare(
          'SELECT payload FROM material_delivery_local '
          'WHERE account_id = ? AND client_uuid = ?',
        )
        .get([accountId, clientUuid]);
    return row == null ? null : MaterialDeliverySubmissionDraft.decode('${row['payload']}');
  }

  @override
  List<SavedFieldSubmission<AttendanceSubmissionDraft>> listAttendance(
    String accountId,
    String tenantId,
  ) => _listGeneric(
    accountId: accountId,
    tenantId: tenantId,
    tableName: 'attendance_local',
    dateColumn: 'attendance_date',
    decoder: AttendanceSubmissionDraft.decode,
  );

  @override
  List<SavedFieldSubmission<SiteExpenseSubmissionDraft>> listSiteExpenses(
    String accountId,
    String tenantId,
  ) => _listGeneric(
    accountId: accountId,
    tenantId: tenantId,
    tableName: 'site_expense_local',
    dateColumn: 'expense_date',
    decoder: SiteExpenseSubmissionDraft.decode,
  );

  @override
  List<SavedFieldSubmission<MaterialDeliverySubmissionDraft>> listMaterialDeliveries(
    String accountId,
    String tenantId,
  ) => _listGeneric(
    accountId: accountId,
    tenantId: tenantId,
    tableName: 'material_delivery_local',
    dateColumn: 'delivery_date',
    decoder: MaterialDeliverySubmissionDraft.decode,
  );

  List<SavedFieldSubmission<T>> _listGeneric<T extends FieldSubmissionDraft>({
    required String accountId,
    required String tenantId,
    required String tableName,
    required String dateColumn,
    required T Function(String) decoder,
  }) => mount.driver
      .prepare(
        'SELECT r.client_uuid, r.payload, r.updated_at, p.state '
        'FROM $tableName r '
        'JOIN pending_op p ON p.id = r.client_uuid AND p.account_id = r.account_id '
        'WHERE r.account_id = ? AND p.tenant_id = ? '
        'ORDER BY r.$dateColumn DESC, r.updated_at DESC, r.client_uuid DESC',
      )
      .all([accountId, tenantId])
      .map(
        (row) => SavedFieldSubmission<T>(
          draft: decoder('${row['payload']}'),
          operationState: row['state'] as String?,
          updatedAtMs: row['updated_at'] as int,
        ),
      )
      .toList(growable: false);

  @override
  bool canEditUnsent(String accountId, String clientUuid) {
    final op = mount.pendingOps.getOp(accountId, clientUuid);
    return op != null && op.state == 'pending' && op.attempts == 0;
  }

  @override
  String? operationState(String accountId, String clientUuid) =>
      mount.pendingOps.getOp(accountId, clientUuid)?.state;

  @override
  DeviceSyncHealth syncHealth(String accountId, String tenantId) =>
      buildDeviceSyncHealth(
        mount.healthSource(accountId: accountId, tenantId: tenantId),
        HealthOptions(nowMs: DateTime.now().millisecondsSinceEpoch),
      );

  @override
  Future<void> syncNow() => mount.drainTriggers.manual();
}

// ---------------------------------------------------------------------------
// Standard Command & Route Registration for Expansion Workflows
// ---------------------------------------------------------------------------

final CapabilityRegistry kFieldExpansionCapabilities = CapabilityRegistry([
  CapabilityDefinition(
    id: CapabilityId('field.attendance'),
    supportedPlatforms: ConstructionPlatform.values.toSet(),
    fallbacks: const {},
  ),
  CapabilityDefinition(
    id: CapabilityId('field.expense'),
    supportedPlatforms: ConstructionPlatform.values.toSet(),
    fallbacks: const {},
  ),
  CapabilityDefinition(
    id: CapabilityId('field.delivery'),
    supportedPlatforms: ConstructionPlatform.values.toSet(),
    fallbacks: const {},
  ),
]);

final CommandRegistry kFieldExpansionCommands = CommandRegistry(
  capabilities: kFieldExpansionCapabilities,
  commands: [
    CommandDefinition(
      id: CommandId('attendance.save-local'),
      label: 'Save attendance record locally',
      requiredCapabilities: [CapabilityId('field.attendance')],
    ),
    CommandDefinition(
      id: CommandId('attendance.sync-now'),
      label: 'Sync attendance records',
      requiredCapabilities: [CapabilityId('field.attendance')],
    ),
    CommandDefinition(
      id: CommandId('site-expense.save-local'),
      label: 'Save site expense locally',
      requiredCapabilities: [CapabilityId('field.expense')],
    ),
    CommandDefinition(
      id: CommandId('site-expense.sync-now'),
      label: 'Sync site expenses',
      requiredCapabilities: [CapabilityId('field.expense')],
    ),
    CommandDefinition(
      id: CommandId('material-delivery.save-local'),
      label: 'Save material delivery note locally',
      requiredCapabilities: [CapabilityId('field.delivery')],
    ),
    CommandDefinition(
      id: CommandId('material-delivery.sync-now'),
      label: 'Sync material delivery notes',
      requiredCapabilities: [CapabilityId('field.delivery')],
    ),
  ],
);

final RouteRegistry kFieldExpansionRoutes = RouteRegistry(
  capabilities: kFieldExpansionCapabilities,
  routes: [
    RouteDefinition(
      id: RouteId('attendance.new'),
      path: '/attendance/new',
      label: 'New Attendance Submission',
      requiredCapabilities: [CapabilityId('field.attendance')],
    ),
    RouteDefinition(
      id: RouteId('site-expense.new'),
      path: '/expenses/new',
      label: 'New Site Expense',
      requiredCapabilities: [CapabilityId('field.expense')],
    ),
    RouteDefinition(
      id: RouteId('material-delivery.new'),
      path: '/deliveries/new',
      label: 'New Material Delivery (MRR)',
      requiredCapabilities: [CapabilityId('field.delivery')],
    ),
  ],
);
