/// M04-T03 daily-report domain model and durable local write boundary.
///
/// Field names and section JSON match the current product procedure
/// `workflow.dailyReport.createFieldReport`. Photo bytes are deliberately
/// excluded here; M04-T04 stages them through the attachment protocol.
library;

import 'dart:convert';

import '../mount/mount.dart';
import '../mount/outbox_repository.dart';
import '../mount/ports.dart';

const Migration kDailyReportLocalMigration = Migration(
  4,
  'daily_report_local',
  [
    'CREATE TABLE daily_report_local ('
        ' client_uuid TEXT PRIMARY KEY,'
        ' account_id TEXT NOT NULL,'
        ' project_id TEXT NOT NULL,'
        ' report_date TEXT NOT NULL,'
        ' payload TEXT NOT NULL,'
        ' created_at INTEGER NOT NULL,'
        ' updated_at INTEGER NOT NULL'
        ')',
    'CREATE INDEX idx_daily_report_local_account_date '
        'ON daily_report_local (account_id, report_date DESC)',
  ],
);

/// A field report in the exact section shape used by the existing product
/// daily-report form. Section rows stay JSON objects and are serialized into
/// the string fields expected by `createFieldReport`.
class DailyReportDraft {
  final String clientUuid;
  final String projectId;
  final String reportDate;
  final String weatherMorning;
  final String weatherAfternoon;
  final String weatherEvening;
  final String maxTempC;
  final String minTempC;
  final String rainfallMm;
  final List<Map<String, Object?>> workforce;
  final List<Map<String, Object?>> workProgress;
  final List<Map<String, Object?>> equipmentUsed;
  final List<Map<String, Object?>> materialReceived;
  final List<Map<String, Object?>> materialConsumed;
  final String problems;
  final String safetyNotes;
  final String remarks;

  DailyReportDraft({
    required this.clientUuid,
    required this.projectId,
    required this.reportDate,
    this.weatherMorning = '',
    this.weatherAfternoon = '',
    this.weatherEvening = '',
    this.maxTempC = '',
    this.minTempC = '',
    this.rainfallMm = '',
    this.workforce = const [],
    this.workProgress = const [],
    this.equipmentUsed = const [],
    this.materialReceived = const [],
    this.materialConsumed = const [],
    this.problems = '',
    this.safetyNotes = '',
    this.remarks = '',
  });

  Map<String, Object?> toProcedureInput() {
    _validate();
    return {
      'projectId': projectId,
      'clientUuid': clientUuid,
      'reportDate': reportDate,
      if (weatherMorning.isNotEmpty) 'weatherMorning': weatherMorning,
      if (weatherAfternoon.isNotEmpty) 'weatherAfternoon': weatherAfternoon,
      if (weatherEvening.isNotEmpty) 'weatherEvening': weatherEvening,
      if (maxTempC.trim().isNotEmpty) 'maxTempC': _number(maxTempC, 'maxTempC'),
      if (minTempC.trim().isNotEmpty) 'minTempC': _number(minTempC, 'minTempC'),
      if (rainfallMm.trim().isNotEmpty)
        'rainfallMm': _number(rainfallMm, 'rainfallMm'),
      'workforce': jsonEncode(workforce),
      'workProgress': jsonEncode(workProgress),
      'equipmentUsed': jsonEncode(equipmentUsed),
      'materialReceived': jsonEncode(materialReceived),
      'materialConsumed': jsonEncode(materialConsumed),
      if (problems.isNotEmpty) 'problems': problems,
      if (safetyNotes.isNotEmpty) 'safetyNotes': safetyNotes,
      if (remarks.isNotEmpty) 'remarks': remarks,
      'photos': const <Object?>[],
    };
  }

  String encode() => jsonEncode(toProcedureInput());

  static DailyReportDraft decode(String json) {
    final input = jsonDecode(json) as Map<String, Object?>;
    List<Map<String, Object?>> rows(String key) {
      final raw = input[key];
      if (raw == null) return const [];
      final decoded = jsonDecode(raw as String) as List<Object?>;
      return decoded
          .map((row) => Map<String, Object?>.from(row! as Map))
          .toList();
    }

    return DailyReportDraft(
      clientUuid: input['clientUuid']! as String,
      projectId: input['projectId']! as String,
      reportDate: input['reportDate']! as String,
      weatherMorning: input['weatherMorning'] as String? ?? '',
      weatherAfternoon: input['weatherAfternoon'] as String? ?? '',
      weatherEvening: input['weatherEvening'] as String? ?? '',
      maxTempC: input['maxTempC']?.toString() ?? '',
      minTempC: input['minTempC']?.toString() ?? '',
      rainfallMm: input['rainfallMm']?.toString() ?? '',
      workforce: rows('workforce'),
      workProgress: rows('workProgress'),
      equipmentUsed: rows('equipmentUsed'),
      materialReceived: rows('materialReceived'),
      materialConsumed: rows('materialConsumed'),
      problems: input['problems'] as String? ?? '',
      safetyNotes: input['safetyNotes'] as String? ?? '',
      remarks: input['remarks'] as String? ?? '',
    );
  }

  void _validate() {
    if (clientUuid.length < 8 || clientUuid.length > 128) {
      throw RepositoryError(
        'misconfigured',
        'clientUuid must contain 8–128 characters.',
      );
    }
    if (projectId.isEmpty ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(reportDate)) {
      throw RepositoryError(
        'misconfigured',
        'A project and YYYY-MM-DD report date are required.',
      );
    }
    final hasRows = [
      workforce,
      workProgress,
      equipmentUsed,
      materialReceived,
      materialConsumed,
    ].any((rows) => rows.any(_rowHasUserContent));
    if (!hasRows &&
        problems.trim().isEmpty &&
        safetyNotes.trim().isEmpty &&
        remarks.trim().isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'Add report content before saving.',
      );
    }
  }

  bool _rowHasUserContent(Map<String, Object?> row) => row.entries.any((entry) {
    // Product selects default to skill=unskilled and ownership=owned;
    // those defaults alone do not make a blank template row report data.
    if (entry.key == 'skill' || entry.key == 'ownership') return false;
    final value = entry.value;
    return value != null && value.toString().trim().isNotEmpty;
  });

  double _number(String value, String field) {
    final parsed = double.tryParse(value);
    if (parsed == null || !parsed.isFinite) {
      throw RepositoryError('misconfigured', '$field must be a valid number.');
    }
    return parsed;
  }
}

abstract interface class DailyReportWorkflowStore {
  String save({
    required String accountId,
    required String tenantId,
    required String role,
    required DailyReportDraft draft,
  });

  void editUnsent({required String accountId, required DailyReportDraft draft});

  DailyReportDraft? get(String accountId, String clientUuid);

  String? operationState(String accountId, String clientUuid);

  Future<void> syncNow();
}

class DailyReportLocalStore implements DailyReportWorkflowStore {
  final ConstructionMount mount;

  DailyReportLocalStore(this.mount);

  /// Creates a local report row and pending server operation in the same
  /// SQLite transaction, so neither half can survive alone.
  @override
  String save({
    required String accountId,
    required String tenantId,
    required String role,
    required DailyReportDraft draft,
  }) {
    final payload = draft.encode();
    final now = DateTime.now().millisecondsSinceEpoch;
    return mount.outbox.saveMutation(
      SaveMutationInput(
        accountId: accountId,
        projectId: draft.projectId,
        op: PendingOpInput(
          opId: draft.clientUuid,
          kind: 'workflow.dailyReport.createFieldReport',
          payload: payload,
          tenantId: tenantId,
          role: role,
        ),
        domain: (tx) {
          tx
              .prepare(
                'INSERT INTO daily_report_local '
                '(client_uuid, account_id, project_id, report_date, payload, created_at, updated_at) '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
              )
              .run([
                draft.clientUuid,
                accountId,
                draft.projectId,
                draft.reportDate,
                payload,
                now,
                now,
              ]);
        },
      ),
    );
  }

  /// Edits an unsent local row and its queued operation atomically. Once an
  /// attempt has started, the op is immutable so a server idempotency key can
  /// never be replayed with different content.
  @override
  void editUnsent({
    required String accountId,
    required DailyReportDraft draft,
  }) {
    final payload = draft.encode();
    final op = mount.pendingOps.getOp(accountId, draft.clientUuid);
    if (op == null || op.state != 'pending' || op.attempts != 0) {
      throw RepositoryError(
        'illegal_transition',
        'Only a never-dispatched daily report can be edited locally.',
      );
    }
    mount.outbox.withImmediateTransaction(() {
      final now = DateTime.now().millisecondsSinceEpoch;
      final reportUpdate = mount.driver
          .prepare(
            'UPDATE daily_report_local '
            'SET project_id = ?, report_date = ?, payload = ?, updated_at = ? '
            'WHERE client_uuid = ? AND account_id = ?',
          )
          .run([
            draft.projectId,
            draft.reportDate,
            payload,
            now,
            draft.clientUuid,
            accountId,
          ]);
      final opUpdate = mount.driver
          .prepare(
            "UPDATE pending_op SET project_id = ?, payload = ?, updated_at = ? "
            "WHERE id = ? AND account_id = ? AND state = 'pending' AND attempts = 0",
          )
          .run([draft.projectId, payload, now, draft.clientUuid, accountId]);
      if (reportUpdate.changes != 1 || opUpdate.changes != 1) {
        throw RepositoryError(
          'illegal_transition',
          'Daily report changed or was dispatched during edit.',
        );
      }
    });
  }

  @override
  DailyReportDraft? get(String accountId, String clientUuid) {
    final row = mount.driver
        .prepare(
          'SELECT payload FROM daily_report_local '
          'WHERE account_id = ? AND client_uuid = ?',
        )
        .get([accountId, clientUuid]);
    return row == null ? null : DailyReportDraft.decode('${row['payload']}');
  }

  @override
  String? operationState(String accountId, String clientUuid) =>
      mount.pendingOps.getOp(accountId, clientUuid)?.state;

  @override
  Future<void> syncNow() => mount.drainTriggers.manual();
}
