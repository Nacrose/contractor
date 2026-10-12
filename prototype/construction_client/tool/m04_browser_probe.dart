import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/browser_mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sqlite_driver_web.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:flutter/material.dart';

Future<String> probe() async {
  final name = 'm04-probe-${DateTime.now().millisecondsSinceEpoch}';
  final reportId = 'report-${DateTime.now().millisecondsSinceEpoch}';
  debugPrint('M04 browser probe: opening browser mount');
  var mount = await openBrowserMount(
    databaseName: name,
    credentials: _ProbeCredentialStore(),
    extraMigrations: kM04WorkflowMigrations,
    transport: _Transport(),
  );
  debugPrint('M04 browser probe: mount opened');
  final store = DailyReportLocalStore(mount);
  store.save(
    accountId: 'browser-probe-account',
    tenantId: 'browser-probe-tenant',
    role: 'field',
    draft: DailyReportDraft(
      clientUuid: reportId,
      projectId: 'browser-probe-project',
      reportDate: '2026-10-10',
      remarks: 'IndexedDB daily-report persistence probe',
    ),
  );
  await store.flushDurability();
  await (mount.driver as BrowserSqliteDriver).closeAndFlush();
  debugPrint('M04 browser probe: durable local save closed');

  mount = await openBrowserMount(
    databaseName: name,
    credentials: _ProbeCredentialStore(),
    extraMigrations: kM04WorkflowMigrations,
    transport: _Transport(),
  );
  debugPrint('M04 browser probe: mount reopened');
  final reopenedStore = DailyReportLocalStore(mount);
  final restored = reopenedStore.get('browser-probe-account', reportId);
  final op = mount.pendingOps.getOp('browser-probe-account', reportId);
  if (restored?.remarks != 'IndexedDB daily-report persistence probe' ||
      op?.state != 'pending' ||
      op?.kind != 'workflow.dailyReport.createFieldReport') {
    throw StateError('Daily-report restore mismatch: draft=$restored op=$op');
  }
  await (mount.driver as BrowserSqliteDriver).closeAndFlush();
  debugPrint('M04 browser probe: PASS');
  return 'PASS: daily report and matching pending operation survived IndexedDB close and reopen.';
}

void main() => runApp(
  MaterialApp(
    home: Scaffold(
      body: Center(
        child: FutureBuilder<String>(
          future: probe(),
          builder: (context, snapshot) => Text(
            snapshot.hasError
                ? 'FAIL: ${snapshot.error}'
                : snapshot.data ??
                      'Running IndexedDB report persistence probe…',
            textDirection: TextDirection.ltr,
          ),
        ),
      ),
    ),
  ),
);

class _ProbeCredentialStore implements SecureCredentialStore {
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

class _Transport implements SyncTransportPort {
  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async =>
      throw StateError('browser persistence probe must not sync');
}
