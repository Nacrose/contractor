/// Authenticated project snapshot transport and durable local bootstrap.
///
/// The product route returns the same stable ordinal and decimal watermark
/// contract as the M03 snapshot package. Report rows are kept in a replica
/// table, separate from private drafts and the pending-operation outbox.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'mount.dart';
import 'ports.dart';

const Migration kDailyReportSnapshotMigration = Migration(
  7,
  'daily_report_snapshot_bootstrap',
  [
    'CREATE TABLE daily_report_replica ('
        ' account_id TEXT NOT NULL, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,'
        ' report_id TEXT NOT NULL, payload TEXT NOT NULL, snapshot_id TEXT NOT NULL,'
        ' PRIMARY KEY (account_id, tenant_id, project_id, report_id)'
        ')',
    'CREATE INDEX idx_daily_report_replica_project '
        'ON daily_report_replica (account_id, tenant_id, project_id)',
    'CREATE TABLE daily_report_snapshot_state ('
        ' account_id TEXT NOT NULL, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,'
        ' snapshot_id TEXT NOT NULL, watermark TEXT NOT NULL, object_count INTEGER NOT NULL,'
        ' rows_applied INTEGER NOT NULL, after_ord INTEGER NOT NULL, state TEXT NOT NULL,'
        ' updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, tenant_id, project_id)'
        ')',
    'CREATE TABLE daily_report_snapshot_page ('
        ' account_id TEXT NOT NULL, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,'
        ' snapshot_id TEXT NOT NULL, first_ord INTEGER NOT NULL, applied_at INTEGER NOT NULL,'
        ' PRIMARY KEY (account_id, tenant_id, project_id, snapshot_id, first_ord)'
        ') WITHOUT ROWID',
    'CREATE TABLE daily_report_feed_cursor ('
        ' account_id TEXT NOT NULL, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,'
        ' cursor TEXT NOT NULL, updated_at INTEGER NOT NULL,'
        ' PRIMARY KEY (account_id, tenant_id, project_id)'
        ')',
  ],
);

class DailyReportSnapshotFailure implements Exception {
  final String kind;
  final String message;
  final int? statusCode;

  const DailyReportSnapshotFailure(this.kind, this.message, [this.statusCode]);

  @override
  String toString() => '[$kind] $message';
}

class DailyReportSnapshotManifest {
  final String snapshotId;
  final String tenantId;
  final String projectId;
  final String watermark;
  final int objectCount;

  const DailyReportSnapshotManifest({
    required this.snapshotId,
    required this.tenantId,
    required this.projectId,
    required this.watermark,
    required this.objectCount,
  });

  factory DailyReportSnapshotManifest.fromJson(Map<String, dynamic> value) {
    final manifest = DailyReportSnapshotManifest(
      snapshotId: _requiredString(value, 'snapshotId'),
      tenantId: _requiredString(value, 'tenantId'),
      projectId: _requiredString(value, 'projectId'),
      watermark: _requiredString(value, 'watermark'),
      objectCount: _requiredInt(value, 'objectCount'),
    );
    if (manifest.objectCount < 0 ||
        BigInt.parse(manifest.watermark) < BigInt.zero) {
      throw const DailyReportSnapshotFailure(
        'protocol',
        'Snapshot manifest has invalid bounds.',
      );
    }
    return manifest;
  }
}

class DailyReportSnapshotRow {
  final int ord;
  final String reportId;
  final String payload;

  const DailyReportSnapshotRow(this.ord, this.reportId, this.payload);
}

class DailyReportSnapshotPage {
  final String snapshotId;
  final String tenantId;
  final String projectId;
  final String watermark;
  final int firstOrd;
  final List<DailyReportSnapshotRow> rows;
  final int nextAfterOrd;
  final bool hasMore;

  const DailyReportSnapshotPage({
    required this.snapshotId,
    required this.tenantId,
    required this.projectId,
    required this.watermark,
    required this.firstOrd,
    required this.rows,
    required this.nextAfterOrd,
    required this.hasMore,
  });

  factory DailyReportSnapshotPage.fromJson(Map<String, dynamic> value) {
    final rawRows = value['rows'];
    if (rawRows is! List) {
      throw const DailyReportSnapshotFailure(
        'protocol',
        'Snapshot page rows are missing.',
      );
    }
    final rows = rawRows
        .map((raw) {
          if (raw is! Map ||
              raw['domain'] != 'daily-report' ||
              raw['op'] != 'upsert' ||
              raw['payload'] is! String) {
            throw const DailyReportSnapshotFailure(
              'protocol',
              'Snapshot contains an unsupported row.',
            );
          }
          return DailyReportSnapshotRow(
            _requiredInt(raw, 'ord'),
            _requiredString(raw, 'entityId'),
            raw['payload'] as String,
          );
        })
        .toList(growable: false);
    return DailyReportSnapshotPage(
      snapshotId: _requiredString(value, 'snapshotId'),
      tenantId: _requiredString(value, 'tenantId'),
      projectId: _requiredString(value, 'projectId'),
      watermark: _requiredString(value, 'watermark'),
      firstOrd: _requiredInt(value, 'firstOrd'),
      rows: rows,
      nextAfterOrd: _requiredInt(value, 'nextAfterOrd'),
      hasMore: value['hasMore'] == true,
    );
  }
}

abstract interface class DailyReportSnapshotTransport {
  Future<DailyReportSnapshotManifest> open(String projectId);

  Future<DailyReportSnapshotPage> readPage({
    required String snapshotId,
    required String projectId,
    required int afterOrd,
  });
}

/// Sends the bearer credential from the host's secure identity binding.
/// The route revalidates project permission for both opening and each page.
class HttpDailyReportSnapshotTransport implements DailyReportSnapshotTransport {
  final Uri endpoint;
  final Future<String?> Function() bearerToken;
  final http.Client client;
  final Duration timeout;

  HttpDailyReportSnapshotTransport({
    required this.endpoint,
    required this.bearerToken,
    http.Client? client,
    this.timeout = const Duration(seconds: 30),
  }) : client = client ?? http.Client();

  Future<Map<String, dynamic>> _decode(http.Response response) async {
    Object? body;
    try {
      body = jsonDecode(response.body);
    } catch (_) {
      body = null;
    }
    if (body is! Map<String, dynamic>) {
      throw DailyReportSnapshotFailure(
        'retryable',
        'Snapshot endpoint returned an unreadable response.',
        response.statusCode,
      );
    }
    if (response.statusCode == 410 || body['kind'] == 'resync_required') {
      throw DailyReportSnapshotFailure(
        'resync_required',
        'Snapshot expired; a fresh bootstrap is required.',
        response.statusCode,
      );
    }
    if (response.statusCode == 401 ||
        body['kind'] == 'authentication_required') {
      throw DailyReportSnapshotFailure(
        'authentication_required',
        'Sign in again before restoring reports.',
        response.statusCode,
      );
    }
    if (response.statusCode == 403 || body['kind'] == 'revoked') {
      throw DailyReportSnapshotFailure(
        'revoked',
        'Project access was revoked during restore.',
        response.statusCode,
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw DailyReportSnapshotFailure(
        body['kind'] as String? ?? 'retryable',
        body['detail'] as String? ?? 'Snapshot request failed.',
        response.statusCode,
      );
    }
    return body;
  }

  Future<Map<String, String>> _headers() async {
    final token = await bearerToken();
    if (token == null || token.isEmpty) {
      throw const DailyReportSnapshotFailure(
        'authentication_required',
        'No signed-in device credential is available.',
      );
    }
    return {
      'authorization': 'Bearer $token',
      'content-type': 'application/json',
    };
  }

  @override
  Future<DailyReportSnapshotManifest> open(String projectId) async {
    final response = await client
        .post(
          endpoint,
          headers: await _headers(),
          body: jsonEncode({'projectId': projectId}),
        )
        .timeout(timeout);
    final body = await _decode(response);
    if (body['kind'] != 'snapshot_opened') {
      throw const DailyReportSnapshotFailure(
        'protocol',
        'Snapshot endpoint did not open a snapshot.',
      );
    }
    return DailyReportSnapshotManifest.fromJson(body);
  }

  @override
  Future<DailyReportSnapshotPage> readPage({
    required String snapshotId,
    required String projectId,
    required int afterOrd,
  }) async {
    final uri = endpoint.replace(
      queryParameters: {
        ...endpoint.queryParameters,
        'snapshotId': snapshotId,
        'projectId': projectId,
        'afterOrd': '$afterOrd',
      },
    );
    final response = await client
        .get(uri, headers: await _headers())
        .timeout(timeout);
    final body = await _decode(response);
    if (body['kind'] != 'snapshot_page') {
      throw const DailyReportSnapshotFailure(
        'protocol',
        'Snapshot endpoint returned the wrong page type.',
      );
    }
    return DailyReportSnapshotPage.fromJson(body);
  }
}

class DailyReportSnapshotProgress {
  final int applied;
  final bool complete;
  final int afterOrd;
  final String watermark;

  const DailyReportSnapshotProgress({
    required this.applied,
    required this.complete,
    required this.afterOrd,
    required this.watermark,
  });
}

class DailyReportSnapshotRestorer {
  final ConstructionMount mount;
  final int maxPagesPerRun;

  DailyReportSnapshotRestorer({
    required this.mount,
    this.maxPagesPerRun = 1000,
  });

  DailyReportSnapshotProgress progress({
    required String accountId,
    required String tenantId,
    required String projectId,
  }) {
    final row = mount.driver
        .prepare(
          'SELECT rows_applied, after_ord, watermark, state FROM daily_report_snapshot_state '
          'WHERE account_id = ? AND tenant_id = ? AND project_id = ?',
        )
        .get([accountId, tenantId, projectId]);
    if (row == null) {
      return const DailyReportSnapshotProgress(
        applied: 0,
        complete: false,
        afterOrd: -1,
        watermark: '0',
      );
    }
    return DailyReportSnapshotProgress(
      applied: row['rows_applied'] as int,
      afterOrd: row['after_ord'] as int,
      watermark: '${row['watermark']}',
      complete: row['state'] == 'complete',
    );
  }

  Future<DailyReportSnapshotProgress> restore({
    required String accountId,
    required String tenantId,
    required String projectId,
    required DailyReportSnapshotTransport transport,
    bool forceFresh = false,
  }) async {
    var state = _state(accountId, tenantId, projectId);
    DailyReportSnapshotManifest manifest;
    if (state != null && state['state'] == 'complete' && !forceFresh) {
      return progress(
        accountId: accountId,
        tenantId: tenantId,
        projectId: projectId,
      );
    }
    if (state == null || forceFresh) {
      manifest = await transport.open(projectId);
      if (manifest.projectId != projectId || manifest.tenantId != tenantId) {
        throw const DailyReportSnapshotFailure(
          'scope_mismatch',
          'Snapshot manifest does not match the requested project scope.',
        );
      }
      _begin(accountId, tenantId, projectId, manifest);
      await mount.flushDurability();
      state = _state(accountId, tenantId, projectId)!;
    } else {
      manifest = DailyReportSnapshotManifest(
        snapshotId: '${state['snapshot_id']}',
        tenantId: tenantId,
        projectId: projectId,
        watermark: '${state['watermark']}',
        objectCount: state['object_count'] as int,
      );
    }

    var pages = 0;
    var expiredRestarted = false;
    while (pages < maxPagesPerRun) {
      final current = _state(accountId, tenantId, projectId)!;
      late final DailyReportSnapshotPage page;
      try {
        page = await transport.readPage(
          snapshotId: manifest.snapshotId,
          projectId: projectId,
          afterOrd: current['after_ord'] as int,
        );
      } on DailyReportSnapshotFailure catch (error) {
        if (error.kind != 'resync_required' || expiredRestarted) rethrow;
        expiredRestarted = true;
        manifest = await transport.open(projectId);
        if (manifest.projectId != projectId || manifest.tenantId != tenantId) {
          throw const DailyReportSnapshotFailure(
            'scope_mismatch',
            'Replacement snapshot does not match the requested project scope.',
          );
        }
        _begin(accountId, tenantId, projectId, manifest);
        await mount.flushDurability();
        continue;
      }
      _validatePage(page, manifest, current['after_ord'] as int);
      _apply(accountId, tenantId, projectId, manifest, page);
      await mount.flushDurability();
      pages++;
      if (!page.hasMore) {
        _complete(accountId, tenantId, projectId, manifest);
        await mount.flushDurability();
        return progress(
          accountId: accountId,
          tenantId: tenantId,
          projectId: projectId,
        );
      }
    }
    return progress(
      accountId: accountId,
      tenantId: tenantId,
      projectId: projectId,
    );
  }

  Map<String, Object?>? _state(
    String accountId,
    String tenantId,
    String projectId,
  ) => mount.driver
      .prepare(
        'SELECT snapshot_id, watermark, object_count, rows_applied, after_ord, state FROM daily_report_snapshot_state '
        'WHERE account_id = ? AND tenant_id = ? AND project_id = ?',
      )
      .get([accountId, tenantId, projectId]);

  void _begin(
    String accountId,
    String tenantId,
    String projectId,
    DailyReportSnapshotManifest manifest,
  ) {
    mount.driver.exec('BEGIN IMMEDIATE');
    try {
      mount.driver
          .prepare(
            'INSERT INTO daily_report_snapshot_state '
            '(account_id, tenant_id, project_id, snapshot_id, watermark, object_count, rows_applied, after_ord, state, updated_at) '
            "VALUES (?, ?, ?, ?, ?, ?, 0, -1, 'applying', ?) "
            'ON CONFLICT(account_id, tenant_id, project_id) DO UPDATE SET '
            'snapshot_id=excluded.snapshot_id, watermark=excluded.watermark, object_count=excluded.object_count, '
            "rows_applied=0, after_ord=-1, state='applying', updated_at=excluded.updated_at",
          )
          .run([
            accountId,
            tenantId,
            projectId,
            manifest.snapshotId,
            manifest.watermark,
            manifest.objectCount,
            DateTime.now().millisecondsSinceEpoch,
          ]);
      mount.driver
          .prepare(
            'DELETE FROM daily_report_snapshot_page WHERE account_id = ? AND tenant_id = ? AND project_id = ?',
          )
          .run([accountId, manifest.tenantId, manifest.projectId]);
      mount.driver.exec('COMMIT');
    } catch (_) {
      mount.driver.exec('ROLLBACK');
      rethrow;
    }
  }

  void _validatePage(
    DailyReportSnapshotPage page,
    DailyReportSnapshotManifest manifest,
    int afterOrd,
  ) {
    if (page.snapshotId != manifest.snapshotId ||
        page.tenantId != manifest.tenantId ||
        page.projectId != manifest.projectId ||
        page.watermark != manifest.watermark) {
      throw const DailyReportSnapshotFailure(
        'scope_mismatch',
        'Snapshot page does not match its manifest.',
      );
    }
    final ordinalsAreContiguous = page.rows.indexed.every(
      (entry) => entry.$2.ord == (afterOrd < 0 ? 0 : afterOrd) + entry.$1,
    );
    final cursorMatchesRows = page.rows.isEmpty
        ? page.firstOrd == -1 && page.nextAfterOrd == afterOrd
        : page.firstOrd == page.rows.first.ord &&
              page.nextAfterOrd == page.rows.last.ord + 1;
    if ((page.rows.isEmpty && page.hasMore) ||
        page.nextAfterOrd < afterOrd ||
        !ordinalsAreContiguous ||
        !cursorMatchesRows) {
      throw const DailyReportSnapshotFailure(
        'protocol',
        'Snapshot page cursor did not advance monotonically.',
      );
    }
  }

  void _apply(
    String accountId,
    String tenantId,
    String projectId,
    DailyReportSnapshotManifest manifest,
    DailyReportSnapshotPage page,
  ) {
    mount.driver.exec('BEGIN IMMEDIATE');
    try {
      final dedup = mount.driver
          .prepare(
            'INSERT OR IGNORE INTO daily_report_snapshot_page '
            '(account_id, tenant_id, project_id, snapshot_id, first_ord, applied_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run([
            accountId,
            tenantId,
            projectId,
            manifest.snapshotId,
            page.firstOrd,
            DateTime.now().millisecondsSinceEpoch,
          ]);
      if (dedup.changes == 1) {
        for (final row in page.rows) {
          final payload = jsonDecode(row.payload);
          if (payload is! Map ||
              payload['id'] != row.reportId ||
              payload['projectId'] != projectId) {
            throw const DailyReportSnapshotFailure(
              'protocol',
              'Daily-report payload does not match its row scope.',
            );
          }
          mount.driver
              .prepare(
                'INSERT INTO daily_report_replica (account_id, tenant_id, project_id, report_id, payload, snapshot_id) '
                'VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, tenant_id, project_id, report_id) '
                'DO UPDATE SET payload=excluded.payload, snapshot_id=excluded.snapshot_id',
              )
              .run([
                accountId,
                tenantId,
                projectId,
                row.reportId,
                row.payload,
                manifest.snapshotId,
              ]);
        }
        mount.driver
            .prepare(
              'UPDATE daily_report_snapshot_state SET rows_applied = rows_applied + ?, after_ord = MAX(after_ord, ?), updated_at = ? '
              'WHERE account_id = ? AND tenant_id = ? AND project_id = ? AND snapshot_id = ?',
            )
            .run([
              page.rows.length,
              page.nextAfterOrd,
              DateTime.now().millisecondsSinceEpoch,
              accountId,
              tenantId,
              projectId,
              manifest.snapshotId,
            ]);
      }
      mount.driver.exec('COMMIT');
    } catch (_) {
      mount.driver.exec('ROLLBACK');
      rethrow;
    }
  }

  void _complete(
    String accountId,
    String tenantId,
    String projectId,
    DailyReportSnapshotManifest manifest,
  ) {
    mount.driver.exec('BEGIN IMMEDIATE');
    try {
      final state = _state(accountId, tenantId, projectId)!;
      if (state['snapshot_id'] != manifest.snapshotId ||
          state['rows_applied'] != manifest.objectCount) {
        throw const DailyReportSnapshotFailure(
          'incomplete',
          'Snapshot manifest count does not match applied rows.',
        );
      }
      // Manifest closure removes stale accepted replicas only after every row
      // is applied. Pending local report IDs remain protected from cleanup.
      mount.driver
          .prepare(
            'DELETE FROM daily_report_replica WHERE account_id = ? AND tenant_id = ? AND project_id = ? AND snapshot_id != ? '
            'AND report_id NOT IN (SELECT id FROM pending_op WHERE account_id = ? AND project_id = ? AND state != \'accepted\')',
          )
          .run([
            accountId,
            tenantId,
            projectId,
            manifest.snapshotId,
            accountId,
            projectId,
          ]);
      mount.driver
          .prepare(
            "UPDATE daily_report_snapshot_state SET state = 'complete', updated_at = ? "
            'WHERE account_id = ? AND tenant_id = ? AND project_id = ? AND snapshot_id = ?',
          )
          .run([
            DateTime.now().millisecondsSinceEpoch,
            accountId,
            tenantId,
            projectId,
            manifest.snapshotId,
          ]);
      mount.driver
          .prepare(
            'INSERT INTO daily_report_feed_cursor (account_id, tenant_id, project_id, cursor, updated_at) VALUES (?, ?, ?, ?, ?) '
            'ON CONFLICT(account_id, tenant_id, project_id) DO UPDATE SET cursor=excluded.cursor, updated_at=excluded.updated_at',
          )
          .run([
            accountId,
            tenantId,
            projectId,
            manifest.watermark,
            DateTime.now().millisecondsSinceEpoch,
          ]);
      mount.driver
          .prepare(
            'DELETE FROM daily_report_snapshot_page WHERE account_id = ? AND tenant_id = ? AND project_id = ? AND snapshot_id != ?',
          )
          .run([accountId, tenantId, projectId, manifest.snapshotId]);
      mount.driver.exec('COMMIT');
    } catch (_) {
      mount.driver.exec('ROLLBACK');
      rethrow;
    }
  }

  List<Map<String, Object?>> reports({
    required String accountId,
    required String tenantId,
    required String projectId,
  }) => mount.driver
      .prepare(
        'SELECT report_id, payload FROM daily_report_replica WHERE account_id = ? AND tenant_id = ? AND project_id = ? ORDER BY report_id',
      )
      .all([accountId, tenantId, projectId]);

  String? feedCursor({
    required String accountId,
    required String tenantId,
    required String projectId,
  }) {
    final row = mount.driver
        .prepare(
          'SELECT cursor FROM daily_report_feed_cursor WHERE account_id = ? AND tenant_id = ? AND project_id = ?',
        )
        .get([accountId, tenantId, projectId]);
    return row?['cursor'] as String?;
  }
}

String _requiredString(Map value, String key) {
  final result = value[key];
  if (result is! String || result.isEmpty) {
    throw DailyReportSnapshotFailure(
      'protocol',
      'Snapshot field $key is missing.',
    );
  }
  return result;
}

int _requiredInt(Map value, String key) {
  final result = value[key];
  if (result is! int) {
    throw DailyReportSnapshotFailure(
      'protocol',
      'Snapshot field $key is invalid.',
    );
  }
  return result;
}
