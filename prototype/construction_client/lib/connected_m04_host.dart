import 'dart:convert';
import 'dart:io';

import 'package:construction_ui/construction_ui.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'mount/attachment_transfer.dart';
import 'mount/daily_report_snapshot.dart';
import 'mount/mount.dart';
import 'mount/native_identity.dart';
import 'mount/photo_upload_transport.dart';
import 'mount/ports.dart';
import 'mount/secure_store.dart';
import 'mount/sync_orchestrator.dart';
import 'mount/sync_transport.dart';
import 'mount/system_browser.dart';
import 'workflows/daily_report_photo_service.dart';
import 'workflows/daily_report_screen.dart';
import 'workflows/daily_report_workflow.dart';

/// Native ports around the same report widget used by the browser mount.
class ConnectedM04Host extends StatefulWidget {
  final Uri server;
  const ConnectedM04Host({required this.server, super.key});
  @override
  State<ConnectedM04Host> createState() => _ConnectedM04HostState();
}

class _ConnectedM04HostState extends State<ConnectedM04Host> {
  late final Future<_ConnectedServices> _services = _open();
  Future<_ConnectedWorkspace>? _workspace;
  bool _busy = false;
  String? _error;
  DailyReportSyncAccessIssue? _syncAccessIssue;

  void _handleSyncAuthEvent(String kind, String? _) {
    if (!mounted) return;
    final issue = switch (kind) {
      'authentication_required' =>
        DailyReportSyncAccessIssue.authenticationRequired,
      'revoked' => DailyReportSyncAccessIssue.revoked,
      _ => null,
    };
    if (issue != null) setState(() => _syncAccessIssue = issue);
  }

  Future<_ConnectedWorkspace> _connect(
    _ConnectedServices services,
    NativeSessionIdentity session,
  ) => services.connect(session, onAuthEvent: _handleSyncAuthEvent);

  Future<_ConnectedServices> _open() async {
    final support = await getApplicationSupportDirectory();
    final root = Directory('${support.path}/contractor_os');
    await root.create(recursive: true);
    final browser = UrlLauncherSystemBrowserPort();
    final rawHttp = http.Client();
    final credentials = MethodChannelSecureCredentialStore.create();
    late final ConstructionMount mount;
    final identity = NativeIdentityClient(
      server: widget.server,
      redirect: Uri.parse('$kNativeCallbackScheme://auth/callback'),
      credentials: credentials,
      browser: browser,
      client: rawHttp,
      platform: Platform.operatingSystem,
      deviceLabel: 'Contractor OS ${Platform.operatingSystem}',
      hasPendingWork: (accountId) {
        final pending = mount.outbox.pendingWorkSummary(accountId);
        return pending.pendingOperations > 0 ||
            pending.privateDrafts > 0 ||
            pending.attachmentsPending > 0;
      },
    );
    final transport = _ConnectedTransport();
    mount = openMount(
      options: MountOptions(
        // Preserve preview drafts in their existing file; account IDs isolate rows.
        dbPath: '${root.path}/offline-drafts.sqlite',
        objectRoot: Directory('${root.path}/objects'),
        extraMigrations: kM04WorkflowMigrations,
      ),
      credentials: credentials,
      transport: transport,
      systemBrowser: browser,
    );
    final services = _ConnectedServices(
      root,
      identity,
      browser,
      rawHttp,
      transport,
      mount,
    );
    try {
      await browser.startListening();
      final callback = browser.sink.takeBuffered();
      if (callback != null) await identity.completeSignIn(callback);
      final session = await identity.restoreSession();
      if (session != null) _workspace = _connect(services, session);
      return services;
    } catch (_) {
      await browser.stopListening();
      rawHttp.close();
      mount.driver.close();
      rethrow;
    }
  }

  Future<void> _signIn(_ConnectedServices services) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await services.identity.signIn();
      if (!mounted) return;
      setState(() {
        _syncAccessIssue = null;
        _workspace = _connect(services, session);
      });
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is NativeIdentityFailure
              ? error.message
              : 'Sign-in could not finish. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _services.then((services) async {
      await services.mount.drainTriggers.detach();
      await services.browser.stopListening();
      services.client.close();
      services.mount.driver.close();
    }).ignore();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<_ConnectedServices>(
    future: _services,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return _message(
          'Could not open Contractor OS',
          'Check secure storage and the configured server, then restart. Local drafts are retained.',
        );
      }
      if (!snapshot.hasData) return _loading();
      final services = snapshot.data!;
      if (_workspace == null) {
        return _message(
          'Sign in to Contractor OS',
          _error ??
              'Use your existing account to access your assigned projects.',
          action: FilledButton(
            onPressed: _busy ? null : () => _signIn(services),
            child: Text(_busy ? 'Signing in…' : 'Sign in'),
          ),
        );
      }
      return FutureBuilder<_ConnectedWorkspace>(
        future: _workspace,
        builder: (context, workspace) {
          if (workspace.hasError) {
            return _message(
              'Could not load your projects',
              'Reconnect and retry. If access has expired, sign in again. Local work is retained.',
              action: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextButton(
                    onPressed: () async {
                      final session = await services.identity.restoreSession();
                      if (mounted && session != null) {
                        setState(
                          () => _workspace = _connect(services, session),
                        );
                      }
                    },
                    child: const Text('Retry'),
                  ),
                  FilledButton(
                    onPressed: _busy ? null : () => _signIn(services),
                    child: const Text('Sign in again'),
                  ),
                ],
              ),
            );
          }
          if (!workspace.hasData) return _loading();
          final current = workspace.data!;
          if (current.projects.isEmpty) {
            return _message(
              'No assigned projects',
              'Your account needs project membership and Daily Programme access.',
            );
          }
          return Column(
            children: [
              if (current.offline || current.restoreWarning != null)
                MaterialBanner(
                  content: Text(
                    current.restoreWarning ?? 'Offline: showing your previously loaded projects. Save locally and sync when connected.',
                  ),
                  actions: const [SizedBox.shrink()],
                ),
              Expanded(
                child: DailyReportScreen(
                  key: ValueKey(current.session.accountId),
                  store: DailyReportLocalStore(services.mount),
                  accountId: current.session.accountId,
                  tenantId: current.session.organizationId,
                  role: 'member',
                  projects: current.projects,
                  photos: current.photos,
                  refreshAcceptedReports: current.refreshAcceptedReports,
                  syncAccessIssue: _syncAccessIssue,
                  onSignInAgain: _busy ? null : () => _signIn(services),
                  onSyncStarted: () {
                    if (mounted && _syncAccessIssue != null) {
                      setState(() => _syncAccessIssue = null);
                    }
                  },
                  acceptedReports: () => services.mount.driver
                      .prepare(
                        'SELECT report_id, payload FROM daily_report_replica '
                        'WHERE account_id=? AND tenant_id=? AND project_id IN ('
                        '${List.filled(current.projects.length, '?').join(',')})',
                      )
                      .all([
                        current.session.accountId,
                        current.session.organizationId,
                        ...current.projects.map((project) => project.id),
                      ])
                      .map(
                        (row) => {
                          ...Map<String, Object?>.from(
                            jsonDecode(row['payload'] as String) as Map,
                          ),
                          'id': row['report_id'],
                        },
                      )
                      .toList(growable: false),
                ),
              ),
            ],
          );
        },
      );
    },
  );

  Widget _loading() => const Scaffold(
    body: Padding(
      padding: EdgeInsets.all(24),
      child: ConstructionLoadingState(),
    ),
  );
  Widget _message(String title, String hint, {Widget? action}) => Scaffold(
    appBar: AppBar(title: const Text('Contractor OS')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: ConstructionEmptyState(title: title, hint: hint, action: action),
      ),
    ),
  );
}

class _ConnectedWorkspace {
  final NativeSessionIdentity session;
  final List<DailyReportProjectOption> projects;
  final DailyReportPhotoService photos;
  final bool offline;
  final String? restoreWarning;
  final Future<void> Function() refreshAcceptedReports;
  const _ConnectedWorkspace(
    this.session,
    this.projects,
    this.photos,
    this.offline,
    this.restoreWarning,
    this.refreshAcceptedReports,
  );
}

class _ConnectedServices {
  final Directory root;
  final NativeIdentityClient identity;
  final UrlLauncherSystemBrowserPort browser;
  final http.Client client;
  final _ConnectedTransport transport;
  final ConstructionMount mount;
  _ConnectedServices(
    this.root,
    this.identity,
    this.browser,
    this.client,
    this.transport,
    this.mount,
  );

  Future<_ConnectedWorkspace> connect(
    NativeSessionIdentity session, {
    required void Function(String kind, String? opId) onAuthEvent,
  }) async {
    final authorized = NativeAuthorizedClient(
      client,
      identity,
      session.accountId,
    );
    transport.delegate = HttpSyncTransport(
      endpoint: identity.server.resolve('/api/native/sync'),
      client: authorized,
    );
    final orchestrator = DailyLogSyncOrchestrator(
      mount: mount,
      deviceId: session.deviceId,
      authEvents: _CallbackAuthEventSink(onAuthEvent),
    );
    final manager = AttachmentTransferManager(
      mount: mount,
      registrar: HttpPhotoUploadRegistrar(
        endpoint: identity.server.resolve('/api/native/photos/upload'),
        accountId: session.accountId,
        client: authorized,
        authorizationHeaders: () async => const {},
        onAuthFailure: (kind) => onAuthEvent(kind, null),
      ),
    );
    final snapshotTransport = HttpDailyReportSnapshotTransport(
      endpoint: identity.server.resolve('/api/native/sync/snapshot'),
      client: authorized,
      bearerToken: () async => (await identity.authorizationHeaders(
        accountId: session.accountId,
      ))['authorization']?.replaceFirst('Bearer ', ''),
    );
    final snapshotRestorer = DailyReportSnapshotRestorer(mount: mount);
    final attachmentFetcher = HttpRegisteredAttachmentFetcher(
      server: identity.server,
      client: authorized,
    );
    final photos = DailyReportPhotoService(
      manager: manager,
      accountId: session.accountId,
      durableSourceDirectory: Directory('${root.path}/photo-sources'),
    );
    // Every trigger reconciles attachments before draining dependent reports.
    mount.drainTriggers.bind(
      isDraining: () => orchestrator.isDraining,
      drain: (_) async {
        await photos.resumeAll();
        await orchestrator.drain(session.accountId);
      },
    );
    await mount.drainTriggers.attach();
    var offline = false;
    late List<DailyReportProjectOption> projects;
    try {
      final response = await authorized
          .get(identity.server.resolve('/api/trpc/project.list'))
          .timeout(const Duration(seconds: 30));
      if (response.statusCode == 401 || response.statusCode == 403) {
        throw const NativeIdentityFailure(
          'authentication_required',
          'Sign in and check project access.',
        );
      }
      if (response.statusCode != 200) throw const FormatException();
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final data = decoded['result']['data'];
      final payload = data is Map && data.containsKey('json')
          ? data['json']
          : data;
      projects = (payload['projects'] as List)
          .map(
            (value) => DailyReportProjectOption(
              id: value['id'] as String,
              label: '${value['code'] ?? ''} ${value['name']}'.trim(),
            ),
          )
          .toList(growable: false);
      mount.outbox.withImmediateTransaction(() {
        mount.driver
            .prepare('DELETE FROM native_project_cache WHERE account_id=?')
            .run([session.accountId]);
        for (final project in projects) {
          mount.driver
              .prepare(
                'INSERT INTO native_project_cache (account_id, project_id, label) VALUES (?, ?, ?)',
              )
              .run([session.accountId, project.id, project.label]);
        }
      });
      await mount.flushDurability();
    } on NativeIdentityFailure {
      rethrow;
    } catch (_) {
      projects = mount.driver
          .prepare(
            'SELECT project_id, label FROM native_project_cache WHERE account_id=? ORDER BY label',
          )
          .all([session.accountId])
          .map(
            (row) => DailyReportProjectOption(
              id: row['project_id'] as String,
              label: row['label'] as String,
            ),
          )
          .toList();
      if (projects.isEmpty) rethrow;
      offline = true;
    }
    String? restoreWarning;
    for (final project in projects) {
      try {
        await snapshotRestorer.restore(
          accountId: session.accountId,
          tenantId: session.organizationId,
          projectId: project.id,
          transport: snapshotTransport,
          forceFresh: !offline,
        );
      } on NativeIdentityFailure {
        rethrow;
      } catch (_) {
        restoreWarning = 'Some accepted reports could not be restored. Reconnect and sync to retry.';
        continue;
      }
      final rows = mount.driver
          .prepare(
            'SELECT report_id, payload FROM daily_report_replica '
            'WHERE account_id=? AND tenant_id=? AND project_id=?',
          )
          .all([session.accountId, session.organizationId, project.id]);
      for (final row in rows) {
        final payload =
            jsonDecode(row['payload'] as String) as Map<String, dynamic>;
        final attachments = payload['attachments'];
        if (attachments is! List) continue;
        for (final raw in attachments) {
          if (raw is! Map) continue;
          final receipt = raw['registeredPhotoId'];
          final objectId = raw['storageKey'];
          final digest = raw['servedSha256'];
          if (receipt is! String || receipt.isEmpty) continue;
          final servedSize = raw['servedSize'];
          if (objectId is! String ||
              objectId.isEmpty ||
              digest is! String ||
              digest.isEmpty ||
              servedSize is! int ||
              servedSize < 1) {
            restoreWarning = 'A registered photo is missing its server digest and could not be restored.';
            continue;
          }
          final source =
              '${root.path}/photo-sources/restored-${Uri.encodeComponent(receipt)}.photo';
          try {
            final restored = await manager.restoreRegistered(
              accountId: session.accountId,
              attachmentId: receipt,
              projectId: project.id,
              dailyReportId: row['report_id'] as String,
              objectId: objectId,
              receipt: receipt,
              expectedDigest: digest,
              expectedBytes: servedSize,
              sourcePath: source,
              scope: ScopeClaims(
                tenantId: session.organizationId,
                projectId: project.id,
                role: 'member',
              ),
              fetcher: attachmentFetcher,
            );
            if (!restored.complete) {
              restoreWarning = 'Some registered photos could not be restored. Reconnect and sync to retry.';
            }
          } catch (_) {
            restoreWarning = 'Some registered photos could not be restored. Reconnect and sync to retry.';
          }
        }
      }
    }
    await mount.drainTriggers.onLaunch();
    return _ConnectedWorkspace(
      session,
      projects,
      photos,
      offline,
      restoreWarning,
      () async {
        for (final project in projects) {
          await snapshotRestorer.restore(
            accountId: session.accountId,
            tenantId: session.organizationId,
            projectId: project.id,
            transport: snapshotTransport,
            forceFresh: true,
          );
        }
      },
    );
  }
}

class _ConnectedTransport implements SyncTransportPort {
  SyncTransportPort? delegate;
  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) {
    final active = delegate;
    if (active == null) {
      throw const NativeIdentityFailure(
        'authentication_required',
        'Sign in to sync.',
      );
    }
    return active.send(envelope);
  }
}

class _CallbackAuthEventSink implements AuthEventSink {
  final void Function(String kind, String? opId) callback;
  const _CallbackAuthEventSink(this.callback);

  @override
  void onAuthEvent(String kind, String? opId) => callback(kind, opId);
}
