import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'mount/mount.dart';
import 'mount/attachment_transfer.dart';
import 'mount/ports.dart';
import 'mount/system_browser.dart';
import 'workflows/daily_report_screen.dart';
import 'workflows/daily_report_workflow.dart';
import 'connected_m04_host.dart';

/// Native development host for the M04 daily-report workflow.
///
/// Drafts persist on this device. CONTRACTOR_SERVER_URL selects the connected
/// identity, sync, and photo ports; omitting it selects the local preview.
class ContractorOsApp extends StatelessWidget {
  const ContractorOsApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Contractor OS',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorSchemeSeed: const Color(0xFF176B5B),
      useMaterial3: true,
    ),
    home: const String.fromEnvironment('CONTRACTOR_SERVER_URL').isEmpty
        ? const _M04NativeHost()
        : ConnectedM04Host(
            server: Uri.parse(
              const String.fromEnvironment('CONTRACTOR_SERVER_URL'),
            ),
          ),
  );
}

class _M04NativeHost extends StatefulWidget {
  const _M04NativeHost();

  @override
  State<_M04NativeHost> createState() => _M04NativeHostState();
}

class _M04NativeHostState extends State<_M04NativeHost> {
  late final Future<_M04HostServices> _services = _openServices();

  Future<_M04HostServices> _openServices() async {
    final support = await getApplicationSupportDirectory();
    final root = Directory(
      '${support.path}${Platform.pathSeparator}contractor_os',
    );
    final objects = Directory('${root.path}${Platform.pathSeparator}objects');
    await root.create(recursive: true);
    final systemBrowser = UrlLauncherSystemBrowserPort();
    await systemBrowser.startListening();
    final mount = openMount(
      options: MountOptions(
        dbPath: '${root.path}${Platform.pathSeparator}offline-drafts.sqlite',
        objectRoot: objects,
        extraMigrations: kM04WorkflowMigrations,
      ),
      transport: _OfflinePreviewTransport(),
      systemBrowser: systemBrowser,
    );
    return _M04HostServices(
      mount: mount,
      store: _OfflinePreviewStore(DailyReportLocalStore(mount)),
      systemBrowser: systemBrowser,
    );
  }

  @override
  void dispose() {
    _services.then((services) async {
      await services.systemBrowser.stopListening();
      services.mount.driver.close();
    }).ignore();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<_M04HostServices>(
    future: _services,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Scaffold(
          appBar: AppBar(title: const Text('Contractor OS')),
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Could not open local report storage: ${snapshot.error}',
              ),
            ),
          ),
        );
      }
      if (!snapshot.hasData) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      final services = snapshot.data!;
      return Banner(
        message: 'LOCAL PREVIEW',
        location: BannerLocation.topEnd,
        child: DailyReportScreen(
          store: services.store,
          accountId: 'local-preview-account',
          tenantId: 'local-preview-tenant',
          role: 'field',
          projects: const [
            DailyReportProjectOption(
              id: 'local-preview-project',
              label: 'Local preview project',
            ),
          ],
        ),
      );
    },
  );
}

class _M04HostServices {
  const _M04HostServices({
    required this.mount,
    required this.store,
    required this.systemBrowser,
  });
  final ConstructionMount mount;
  final DailyReportWorkflowStore store;
  final UrlLauncherSystemBrowserPort systemBrowser;
}

class _OfflinePreviewTransport implements SyncTransportPort {
  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) => Future.error(
    StateError('Sync needs the authenticated Contractor OS server host.'),
  );
}

class _OfflinePreviewStore implements DailyReportWorkflowStore {
  const _OfflinePreviewStore(this.local);
  final DailyReportLocalStore local;

  @override
  Future<void> flushDurability() => local.flushDurability();
  @override
  String save({
    required String accountId,
    required String tenantId,
    required String role,
    required DailyReportDraft draft,
  }) => local.save(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    draft: draft,
  );
  @override
  void editUnsent({
    required String accountId,
    required DailyReportDraft draft,
  }) => local.editUnsent(accountId: accountId, draft: draft);
  @override
  String saveRecoveryCopy({
    required String accountId,
    required String tenantId,
    required String role,
    required String sourceClientUuid,
    required DailyReportDraft draft,
  }) => local.saveRecoveryCopy(
    accountId: accountId,
    tenantId: tenantId,
    role: role,
    sourceClientUuid: sourceClientUuid,
    draft: draft,
  );
  @override
  DailyReportDraft? get(String accountId, String clientUuid) =>
      local.get(accountId, clientUuid);
  @override
  String? operationState(String accountId, String clientUuid) =>
      local.operationState(accountId, clientUuid);
  @override
  List<SavedDailyReport> savedReports(String accountId, String tenantId) =>
      local.savedReports(accountId, tenantId);
  @override
  bool canEditUnsent(String accountId, String clientUuid) =>
      local.canEditUnsent(accountId, clientUuid);
  @override
  DeviceSyncHealth syncHealth(String accountId, String tenantId) =>
      local.syncHealth(accountId, tenantId);
  @override
  List<DailyReportFeedCursor> feedCursors(String accountId, String tenantId) =>
      local.feedCursors(accountId, tenantId);
  @override
  Future<void> syncNow() => Future.error(
    StateError(
      'This is local preview mode. Sign in to the connected product host to sync.',
    ),
  );
}
