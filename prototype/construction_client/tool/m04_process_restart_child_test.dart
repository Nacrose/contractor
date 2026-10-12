import 'dart:io';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/workflows/daily_report_workflow.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'prepare an in-flight daily report in a separate test process',
    () async {
      final dbPath = Platform.environment['M04_RESTART_DB'];
      final objectRoot = Platform.environment['M04_RESTART_OBJECT_ROOT'];
      expect(dbPath, isNotNull);
      expect(objectRoot, isNotNull);

      final mount = openMount(
        options: MountOptions(
          dbPath: dbPath!,
          objectRoot: Directory(objectRoot!),
          extraMigrations: kM04WorkflowMigrations,
        ),
        credentials: _Credentials(),
        transport: _UnusedTransport(),
      );
      addTearDown(mount.driver.close);

      DailyReportLocalStore(mount).save(
        accountId: 'acct-1',
        tenantId: 'tenant-1',
        role: 'field',
        draft: DailyReportDraft(
          clientUuid: 'report-restart-01',
          projectId: 'project-1',
          reportDate: '2026-10-10',
          remarks: 'Crew poured footing',
        ),
      );
      mount.pendingOps.markInFlight('report-restart-01');
      await mount.flushDurability();
      stdout.writeln('separate process prepared report-restart-01');
    },
  );
}

class _UnusedTransport implements SyncTransportPort {
  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async =>
      throw StateError('the restart child must not send sync requests');
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
