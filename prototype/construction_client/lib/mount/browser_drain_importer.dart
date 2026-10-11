import 'dart:convert';

import 'mount.dart';

/// Result of importing a browser drain bundle into the native client.
class BrowserDrainImportResult {
  final int importedOutboxCount;
  final int importedDraftsCount;
  final int skippedExistingCount;
  final List<String> errors;

  const BrowserDrainImportResult({
    required this.importedOutboxCount,
    required this.importedDraftsCount,
    required this.skippedExistingCount,
    required this.errors,
  });

  bool get isSuccess => errors.isEmpty;
}

/// Imports exported browser outbox items and drafts into the native SQLite mount (M05-T07).
///
/// Preserves operation IDs, clientUuids, and payload idempotency keys intact.
/// Server deduplication and SQLite transactions guarantee crash-safety and 0 double-posts.
class BrowserDrainImporter {
  final ConstructionMount mount;
  final String defaultTenantId;
  final String defaultRole;

  BrowserDrainImporter({
    required this.mount,
    this.defaultTenantId = 'tenant-default',
    this.defaultRole = 'field_engineer',
  });

  BrowserDrainImportResult importBundle(Map<String, dynamic> bundle) {
    final version = bundle['version'];
    if (version != 'cm-field-drain-v1') {
      return BrowserDrainImportResult(
        importedOutboxCount: 0,
        importedDraftsCount: 0,
        skippedExistingCount: 0,
        errors: ['Unsupported bundle version: $version; expected cm-field-drain-v1'],
      );
    }

    final outboxItems = (bundle['outbox'] as List<dynamic>?) ?? [];
    final draftItems = (bundle['drafts'] as List<dynamic>?) ?? [];

    int importedOutbox = 0;
    int importedDrafts = 0;
    int skippedExisting = 0;
    final errors = <String>[];

    mount.driver.exec('BEGIN IMMEDIATE');
    try {
      // 1. Process Outbox items
      for (final raw in outboxItems) {
        if (raw is! Map<String, dynamic>) continue;

        final id = raw['id'] as String?;
        final clientUuid = raw['clientUuid'] as String?;
        final userId = raw['userId'] as String?;
        final type = raw['type'] as String?;
        final status = raw['status'] as String?;
        final payloadRaw = raw['payload'];
        final createdAt = (raw['createdAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch;
        final tenantId = (raw['tenantId'] as String?) ?? defaultTenantId;

        if (id == null || clientUuid == null || userId == null || type == null) {
          errors.add('Malformed outbox entry in bundle: missing required fields');
          continue;
        }

        // Synced items were already accepted on server; no need to re-enqueue
        if (status == 'synced') {
          skippedExisting++;
          continue;
        }

        // Check if already in pending_op
        final existing = mount.driver.prepare('SELECT id FROM pending_op WHERE id = ?').all([id]);
        if (existing.isNotEmpty) {
          skippedExisting++;
          continue;
        }

        final payload = payloadRaw is Map ? Map<String, dynamic>.from(payloadRaw) : <String, dynamic>{};
        final payloadJson = jsonEncode(payload);
        final projectId = payload['projectId'] as String?;

        String opKind;
        String? tableName;
        String? dateColumn;
        String? dateValue;

        switch (type) {
          case 'attendance':
            opKind = 'field_expansion.attendance.record';
            tableName = 'attendance_local';
            dateColumn = 'attendance_date';
            dateValue = (payload['attendanceDate'] ?? payload['date']) as String?;
            break;
          case 'expense':
            opKind = 'field_expansion.site_expense.create';
            tableName = 'site_expense_local';
            dateColumn = 'expense_date';
            dateValue = (payload['expenseDate'] ?? payload['date']) as String?;
            break;
          case 'material_delivery':
            opKind = 'field_expansion.material_delivery.create';
            tableName = 'material_delivery_local';
            dateColumn = 'delivery_date';
            dateValue = (payload['deliveryDate'] ?? payload['date']) as String?;
            break;
          case 'daily_report':
            opKind = 'daily_report_submit';
            tableName = 'daily_report_local';
            dateColumn = 'report_date';
            dateValue = (payload['reportDate'] ?? payload['date']) as String?;
            break;
          default:
            errors.add('Unknown workflow type "$type" for item $id');
            continue;
        }

        // Insert into pending_op preserving exact id and clientUuid
        mount.driver.prepare(
          'INSERT INTO pending_op (id, account_id, project_id, kind, payload, state, attempts,'
          ' next_attempt_at, created_at, updated_at, digest, tenant_id, role)'
          " VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?, NULL, ?, ?)",
        ).run([
          id,
          userId,
          projectId,
          opKind,
          payloadJson,
          createdAt,
          createdAt,
          tenantId,
          defaultRole,
        ]);

        // Insert into local workflow table so the item is immediately visible in local read models
        final now = DateTime.now().millisecondsSinceEpoch;
        mount.driver.prepare(
          'INSERT OR REPLACE INTO $tableName '
          '(client_uuid, account_id, project_id, $dateColumn, payload, created_at, updated_at) '
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run([
          clientUuid,
          userId,
          projectId,
          dateValue ?? DateTime.now().toIso8601String().split('T').first,
          payloadJson,
          createdAt,
          now,
        ]);

        importedOutbox++;
      }

      // 2. Process Draft items (Stored in private_draft table)
      for (final raw in draftItems) {
        if (raw is! Map<String, dynamic>) continue;
        final id = raw['id'] as String?;
        final userId = raw['userId'] as String?;
        final type = raw['type'] as String?;
        final payloadRaw = raw['payload'];
        final updatedAt = (raw['updatedAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch;

        if (id == null || userId == null || type == null) continue;

        final payload = payloadRaw is Map ? Map<String, dynamic>.from(payloadRaw) : <String, dynamic>{};
        final projectId = payload['projectId'] as String?;
        final bodyJson = jsonEncode(payload);

        mount.driver.prepare(
          'INSERT OR REPLACE INTO private_draft (id, account_id, project_id, kind, body, created_at, updated_at) '
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run([
          id,
          userId,
          projectId,
          'draft_$type',
          bodyJson,
          updatedAt,
          updatedAt,
        ]);

        importedDrafts++;
      }

      mount.driver.exec('COMMIT');
    } catch (e) {
      mount.driver.exec('ROLLBACK');
      errors.add('Failed to import bundle: $e');
    }

    return BrowserDrainImportResult(
      importedOutboxCount: importedOutbox,
      importedDraftsCount: importedDrafts,
      skippedExistingCount: skippedExisting,
      errors: errors,
    );
  }
}
