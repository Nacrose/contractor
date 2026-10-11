import 'dart:math';

import 'package:construction_application/construction_application.dart';
import 'package:construction_ui/construction_ui.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'daily_report_workflow.dart';
import 'daily_report_photo_port.dart';
import '../mount/attachment_transfer.dart';
import '../mount/ports.dart';

class DailyReportProjectOption {
  const DailyReportProjectOption({required this.id, required this.label});

  final String id;
  final String label;
}

enum DailyReportSyncAccessIssue { authenticationRequired, revoked }

/// Shared native/web daily-report editor. The host supplies its signed-in
/// scope, active projects, and durable M04 mount; this widget owns no auth or
/// permission decision.
class DailyReportScreen extends StatefulWidget {
  const DailyReportScreen({
    required this.store,
    required this.accountId,
    required this.tenantId,
    required this.role,
    required this.projects,
    this.photos,
    this.acceptedReports,
    this.refreshAcceptedReports,
    this.syncAccessIssue,
    this.onSignInAgain,
    this.onSyncStarted,
    super.key,
  });

  final DailyReportWorkflowStore store;
  final String accountId;
  final String tenantId;
  final String role;
  final List<DailyReportProjectOption> projects;
  final DailyReportPhotoPort? photos;
  final List<Map<String, Object?>> Function()? acceptedReports;
  final Future<void> Function()? refreshAcceptedReports;
  final DailyReportSyncAccessIssue? syncAccessIssue;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onSyncStarted;

  @override
  State<DailyReportScreen> createState() => _DailyReportScreenState();
}

class _DailyReportScreenState extends State<DailyReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _actionCoordinator = ConstructionActionCoordinator();
  String _clientUuid = _uuid();
  late final TextEditingController _date = TextEditingController(
    text: _today(),
  );
  late final TextEditingController _morning = TextEditingController();
  late final TextEditingController _midday = TextEditingController();
  late final TextEditingController _evening = TextEditingController();
  late final TextEditingController _minTemp = TextEditingController();
  late final TextEditingController _maxTemp = TextEditingController();
  late final TextEditingController _rain = TextEditingController();
  final List<_ReportRow> _workforceRows = [
    _ReportRow(
      {
        'company': '',
        'trade': '',
        'headcount': '',
        'regHours': '',
        'otHours': '',
      },
      selections: {'skill': 'unskilled'},
    ),
  ];
  final List<_ReportRow> _progressRows = [
    _ReportRow({
      'taskDescription': '',
      'unit': '',
      'actualQty': '',
      'location': '',
    }),
  ];
  final List<_ReportRow> _equipmentRows = [
    _ReportRow(
      {'name': '', 'workingHours': '', 'fuel': ''},
      selections: {'ownership': 'owned'},
    ),
  ];
  final List<_ReportRow> _receivedRows = [
    _ReportRow({
      'name': '',
      'qty': '',
      'unit': '',
      'supplier': '',
      'vehicle': '',
    }),
  ];
  final List<_ReportRow> _consumedRows = [
    _ReportRow({'name': '', 'quantity': '', 'unit': ''}),
  ];
  late final TextEditingController _problems = TextEditingController();
  late final TextEditingController _safety = TextEditingController();
  late final TextEditingController _remarks = TextEditingController();
  String? _projectId;
  String? _savedId;
  String? _photoReportId;
  List<RegisteredDailyReportPhoto> _inheritedRegisteredPhotos = const [];
  String? _error;
  bool _saving = false;
  bool _saved = false;
  bool _photoBusy = false;

  static final CapabilityRegistry _capabilities = CapabilityRegistry(const []);
  static final RouteRegistry _routes = RouteRegistry(
    capabilities: _capabilities,
    routes: [
      RouteDefinition(
        id: RouteId('daily-report.new'),
        path: '/daily-reports/new',
        label: 'New daily report',
        requiredCapabilities: const [],
      ),
    ],
  );
  static final CommandRegistry _commands = CommandRegistry(
    capabilities: _capabilities,
    commands: [
      CommandDefinition(
        id: CommandId('daily-report.save-local'),
        label: 'Save daily report locally',
        requiredCapabilities: const [],
      ),
      CommandDefinition(
        id: CommandId('daily-report.sync-now'),
        label: 'Sync daily report',
        requiredCapabilities: const [],
      ),
    ],
  );

  ConstructionPlatform get _platform {
    if (kIsWeb) return ConstructionPlatform.web;
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => ConstructionPlatform.android,
      TargetPlatform.iOS => ConstructionPlatform.ios,
      TargetPlatform.macOS => ConstructionPlatform.macos,
      TargetPlatform.windows => ConstructionPlatform.windows,
      TargetPlatform.linux => ConstructionPlatform.linux,
      TargetPlatform.fuchsia => ConstructionPlatform.android,
    };
  }

  @override
  void dispose() {
    for (final controller in [
      _date,
      _morning,
      _midday,
      _evening,
      _minTemp,
      _maxTemp,
      _rain,
      _problems,
      _safety,
      _remarks,
    ]) {
      controller.dispose();
    }
    for (final row in [
      ..._workforceRows,
      ..._progressRows,
      ..._equipmentRows,
      ..._receivedRows,
      ..._consumedRows,
    ]) {
      row.dispose();
    }
    _actionCoordinator.dispose();
    super.dispose();
  }

  DailyReportDraft _draft() => DailyReportDraft(
    clientUuid: _savedId ?? _clientUuid,
    projectId: _projectId ?? '',
    reportDate: _date.text.trim(),
    weatherMorning: _morning.text.trim(),
    weatherAfternoon: _midday.text.trim(),
    weatherEvening: _evening.text.trim(),
    minTempC: _minTemp.text.trim(),
    maxTempC: _maxTemp.text.trim(),
    rainfallMm: _rain.text.trim(),
    workforce: _workforceRows
        .where(
          (row) => row.hasText([
            'company',
            'trade',
            'headcount',
            'regHours',
            'otHours',
          ]),
        )
        .indexed
        .map((entry) {
          final (index, row) = entry;
          return {
            'company': row.value('company'),
            'trade': row.value('trade'),
            'skill': row.selections['skill'] ?? 'unskilled',
            'headcount': row.number('headcount'),
            'regHours': row.number('regHours'),
            'otHours': row.number('otHours'),
            'sortOrder': index,
          };
        })
        .toList(growable: false),
    workProgress: _progressRows
        .where(
          (row) => row.hasText(['taskDescription', 'actualQty', 'location']),
        )
        .indexed
        .map((entry) {
          final (index, row) = entry;
          final quantity = row.number('actualQty');
          return {
            'taskDescription': row.value('taskDescription'),
            'unit': row.nullableValue('unit'),
            'actualQty': quantity,
            'batchedQty': quantity,
            'payableQty': quantity,
            'location': row.nullableValue('location'),
            'sortOrder': index,
          };
        })
        .toList(growable: false),
    equipmentUsed: _equipmentRows
        .where((row) => row.hasText(['name', 'workingHours', 'fuel']))
        .indexed
        .map((entry) {
          final (index, row) = entry;
          return {
            'name': row.value('name'),
            'type': '',
            'ownership': row.selections['ownership'] ?? 'owned',
            'workingHours': row.number('workingHours'),
            'fuel': row.number('fuel'),
            'sortOrder': index,
          };
        })
        .toList(growable: false),
    materialReceived: _receivedRows
        .where((row) => row.hasText(['name', 'qty', 'supplier', 'vehicle']))
        .indexed
        .map((entry) {
          final (index, row) = entry;
          return {
            'name': row.value('name'),
            'qty': row.number('qty'),
            'unit': row.nullableValue('unit'),
            'supplier': row.nullableValue('supplier'),
            'vehicle': row.nullableValue('vehicle'),
            'testStatus': 'none',
            'sortOrder': index,
          };
        })
        .toList(growable: false),
    materialConsumed: _consumedRows
        .where((row) => row.hasText(['name', 'quantity']))
        .indexed
        .map((entry) {
          final (index, row) = entry;
          return {
            'materialId': null,
            'name': row.value('name'),
            'quantity': row.number('quantity'),
            'unit': row.nullableValue('unit'),
            'sortOrder': index,
          };
        })
        .toList(growable: false),
    problems: _problems.text,
    safetyNotes: _safety.text,
    remarks: _remarks.text,
    photos: _registeredPhotoReferences,
  );

  List<AttachmentTransferRecord> get _reportPhotos =>
      widget.photos
          ?.list()
          .where(
            (photo) =>
                photo.dailyReportId ==
                    (_photoReportId ?? _savedId ?? _clientUuid) ||
                (photo.complete &&
                    photo.receipt != null &&
                    _inheritedRegisteredPhotos.any(
                      (reference) => reference.receipt == photo.receipt,
                    )),
          )
          .toList(growable: false) ??
      const <AttachmentTransferRecord>[];

  List<RegisteredDailyReportPhoto> get _registeredPhotoReferences {
    final byReceipt = <String, RegisteredDailyReportPhoto>{
      for (final photo in _inheritedRegisteredPhotos) photo.receipt: photo,
    };
    for (final photo in _reportPhotos) {
      if (!photo.complete ||
          photo.receipt == null ||
          photo.digest == null ||
          photo.bytes == null) {
        continue;
      }
      // The product reference names the registered FieldPhoto row; the local
      // journal UUID remains the capture/retry identity.
      byReceipt[photo.receipt!] = RegisteredDailyReportPhoto(
        attachmentId: photo.receipt!,
        receipt: photo.receipt!,
        digest: photo.registeredDigest ?? photo.digest!,
        bytes: photo.registeredBytes ?? photo.bytes!,
      );
    }
    return byReceipt.values.toList(growable: false);
  }

  bool get _canAddPhotos =>
      _savedId == null ||
      widget.store.canEditUnsent(widget.accountId, _savedId!);

  bool get _canEditCurrentReport {
    final savedId = _savedId;
    if (savedId == null) return true;
    return const {
          'rejected',
          'conflict',
        }.contains(widget.store.operationState(widget.accountId, savedId)) ||
        widget.store.canEditUnsent(widget.accountId, savedId);
  }

  void _openSavedReport(SavedDailyReport saved) {
    final draft = saved.draft;
    void replaceRows(
      List<_ReportRow> target,
      List<Map<String, Object?>> values,
      List<String> textKeys,
      _ReportRow Function() emptyRow, {
      Map<String, Map<String, String>> selectOptions = const {},
    }) {
      for (final row in target) {
        row.dispose();
      }
      target
        ..clear()
        ..addAll(
          values.map((value) {
            final textValues = {
              for (final key in textKeys) key: value[key]?.toString() ?? '',
            };
            final selections = <String, String>{};
            for (final entry in selectOptions.entries) {
              final valueForKey = value[entry.key]?.toString();
              selections[entry.key] = entry.value.containsKey(valueForKey)
                  ? valueForKey!
                  : entry.value.keys.first;
            }
            return _ReportRow(textValues, selections: selections);
          }),
        );
      if (target.isEmpty) target.add(emptyRow());
    }

    setState(() {
      _savedId = draft.clientUuid;
      _photoReportId = draft.clientUuid;
      _inheritedRegisteredPhotos = draft.photos;
      _projectId = draft.projectId;
      _date.text = draft.reportDate;
      _morning.text = draft.weatherMorning;
      _midday.text = draft.weatherAfternoon;
      _evening.text = draft.weatherEvening;
      _minTemp.text = draft.minTempC;
      _maxTemp.text = draft.maxTempC;
      _rain.text = draft.rainfallMm;
      _problems.text = draft.problems;
      _safety.text = draft.safetyNotes;
      _remarks.text = draft.remarks;
      _saved = true;
      _error = null;
      replaceRows(
        _workforceRows,
        draft.workforce,
        const ['company', 'trade', 'headcount', 'regHours', 'otHours'],
        () => _ReportRow(
          {
            'company': '',
            'trade': '',
            'headcount': '',
            'regHours': '',
            'otHours': '',
          },
          selections: const {'skill': 'unskilled'},
        ),
        selectOptions: const {
          'skill': {
            'unskilled': 'Unskilled',
            'semi': 'Semi-skilled',
            'skilled': 'Skilled',
          },
        },
      );
      replaceRows(
        _progressRows,
        draft.workProgress,
        const ['taskDescription', 'unit', 'actualQty', 'location'],
        () => _ReportRow({
          'taskDescription': '',
          'unit': '',
          'actualQty': '',
          'location': '',
        }),
      );
      replaceRows(
        _equipmentRows,
        draft.equipmentUsed,
        const ['name', 'workingHours', 'fuel'],
        () => _ReportRow(
          {'name': '', 'workingHours': '', 'fuel': ''},
          selections: const {'ownership': 'owned'},
        ),
        selectOptions: const {
          'ownership': {'owned': 'Owned', 'hired': 'Hired'},
        },
      );
      replaceRows(
        _receivedRows,
        draft.materialReceived,
        const ['name', 'qty', 'unit', 'supplier', 'vehicle'],
        () => _ReportRow({
          'name': '',
          'qty': '',
          'unit': '',
          'supplier': '',
          'vehicle': '',
        }),
      );
      replaceRows(_consumedRows, draft.materialConsumed, const [
        'name',
        'quantity',
        'unit',
      ], () => _ReportRow({'name': '', 'quantity': '', 'unit': ''}));
    });
  }

  void _startNewReport() {
    void resetRows(List<_ReportRow> target, List<_ReportRow> initial) {
      for (final row in target) {
        row.dispose();
      }
      target
        ..clear()
        ..addAll(initial);
    }

    setState(() {
      _savedId = null;
      _photoReportId = null;
      _inheritedRegisteredPhotos = const [];
      _clientUuid = _uuid();
      _projectId = null;
      _date.text = _today();
      _morning.clear();
      _midday.clear();
      _evening.clear();
      _minTemp.clear();
      _maxTemp.clear();
      _rain.clear();
      _problems.clear();
      _safety.clear();
      _remarks.clear();
      _saved = false;
      _error = null;
      resetRows(_workforceRows, [
        _ReportRow(
          {
            'company': '',
            'trade': '',
            'headcount': '',
            'regHours': '',
            'otHours': '',
          },
          selections: const {'skill': 'unskilled'},
        ),
      ]);
      resetRows(_progressRows, [
        _ReportRow({
          'taskDescription': '',
          'unit': '',
          'actualQty': '',
          'location': '',
        }),
      ]);
      resetRows(_equipmentRows, [
        _ReportRow(
          {'name': '', 'workingHours': '', 'fuel': ''},
          selections: const {'ownership': 'owned'},
        ),
      ]);
      resetRows(_receivedRows, [
        _ReportRow({
          'name': '',
          'qty': '',
          'unit': '',
          'supplier': '',
          'vehicle': '',
        }),
      ]);
      resetRows(_consumedRows, [
        _ReportRow({'name': '', 'quantity': '', 'unit': ''}),
      ]);
    });
  }

  Future<void> _save() async {
    if (_reportPhotos.any((photo) => !photo.complete)) {
      setState(() {
        _error =
            'Finish or retry each photo transfer before saving the report.';
      });
      return;
    }
    if (!_formKey.currentState!.validate()) return;
    if (_projectId == null || _projectId!.isEmpty) {
      setState(() => _error = 'Choose a project before saving.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final draft = _draft();
      await _actionCoordinator.run('Saving daily report', () async {
        if (_savedId == null) {
          widget.store.save(
            accountId: widget.accountId,
            tenantId: widget.tenantId,
            role: widget.role,
            draft: draft,
          );
          _savedId = draft.clientUuid;
        } else if (const {
          'rejected',
          'conflict',
        }.contains(widget.store.operationState(widget.accountId, _savedId!))) {
          final sourceId = _savedId!;
          final corrected = draft.withClientUuid(_uuid());
          widget.store.saveRecoveryCopy(
            accountId: widget.accountId,
            tenantId: widget.tenantId,
            role: widget.role,
            sourceClientUuid: sourceId,
            draft: corrected,
          );
          _photoReportId = sourceId;
          _savedId = corrected.clientUuid;
        } else {
          widget.store.editUnsent(accountId: widget.accountId, draft: draft);
        }
        await widget.store.flushDurability();
      });
      if (mounted) setState(() => _saved = true);
    } catch (error) {
      if (mounted) setState(() => _error = _safeError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _syncNow() async {
    widget.onSyncStarted?.call();
    try {
      await widget.store.syncNow();
      await widget.refreshAcceptedReports?.call();
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) setState(() => _error = _safeError(error));
    }
  }

  Future<void> _capturePhoto(PhotoCaptureSource source) async {
    final photos = widget.photos;
    if (photos == null) return;
    if (!_canAddPhotos) {
      setState(() {
        _error =
            'Photos cannot be added after this report has been dispatched.';
      });
      return;
    }
    if (_reportPhotos.length >= kDailyReportMaxPhotos) {
      setState(() => _error = 'A daily report can contain at most 6 photos.');
      return;
    }
    if (_projectId == null || _projectId!.isEmpty) {
      setState(() => _error = 'Choose a project before adding a photo.');
      return;
    }
    setState(() {
      _photoBusy = true;
      _error = null;
    });
    try {
      await photos.captureAndRegister(
        projectId: _projectId!,
        dailyReportId: _savedId ?? _clientUuid,
        source: source,
      );
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) setState(() => _error = _safeError(error));
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _retryPhoto(String id) async {
    final photos = widget.photos;
    if (photos == null) return;
    setState(() => _photoBusy = true);
    try {
      await photos.retry(id);
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) setState(() => _error = _safeError(error));
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _retryFailedPhotos() async {
    final failedIds = _reportPhotos
        .where((photo) => photo.state == AttachmentTransferState.failed)
        .map((photo) => photo.id)
        .toList(growable: false);
    for (final id in failedIds) {
      await _retryPhoto(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final route = _routes[RouteId('daily-report.new')];
    final commandAvailability = _commands.availableFor(
      _platform,
      _capabilities,
    );
    final canSave =
        commandAvailability
            .firstWhere(
              (entry) => entry.command.id.value == 'daily-report.save-local',
            )
            .available &&
        _canEditCurrentReport;
    final opState = _savedId == null
        ? null
        : widget.store.operationState(widget.accountId, _savedId!);
    final health = widget.store.syncHealth(widget.accountId, widget.tenantId);
    final feedCursors = widget.store.feedCursors(
      widget.accountId,
      widget.tenantId,
    );
    final reportPhotos = _reportPhotos;
    final failedPhotoIds = reportPhotos
        .where((photo) => photo.state == AttachmentTransferState.failed)
        .map((photo) => photo.id)
        .toList(growable: false);
    final hasIncompletePhotos = reportPhotos.any((photo) => !photo.complete);
    final attachmentState = reportPhotos.isEmpty
        ? AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_NOT_REQUIRED
        : reportPhotos.every((photo) => photo.complete)
        ? AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_COMPLETE
        : reportPhotos.any(
            (photo) =>
                photo.failureKind == AttachmentFailureKind.rejection ||
                photo.failureKind == AttachmentFailureKind.revoked,
          )
        ? AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_REJECTED
        : reportPhotos.any(
            (photo) => photo.state == AttachmentTransferState.failed,
          )
        ? AttachmentCompletionState
              .ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE
        : AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_UPLOADING;
    final status = SaveSyncStatus(
      localPersistence: _saved
          ? LocalPersistenceState.LOCAL_PERSISTENCE_STATE_SAVED
          : LocalPersistenceState.LOCAL_PERSISTENCE_STATE_NOT_STARTED,
      serverAcceptance: switch (opState) {
        'accepted' => ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_ACCEPTED,
        'in_flight' => ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_SENDING,
        'rejected' => ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_REJECTED,
        'pending' => ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_QUEUED,
        _ => ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_NOT_QUEUED,
      },
      attachmentCompletion: attachmentState,
      backup: BackupState.BACKUP_STATE_NOT_CONFIGURED,
      pendingWorkRetained:
          (opState != null && opState != 'accepted') || hasIncompletePhotos,
      nextUserAction: opState == 'rejected'
          ? NextUserAction.NEXT_USER_ACTION_REVIEW_SERVER_REJECTION
          : failedPhotoIds.isNotEmpty
          ? NextUserAction.NEXT_USER_ACTION_RETRY_ATTACHMENTS
          : NextUserAction.NEXT_USER_ACTION_UNSPECIFIED,
    );

    return Scaffold(
      appBar: AppBar(title: Text(route.label)),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      _error!,
                      key: const ValueKey('daily-report-save-error'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                ),
              ActionBar(
                ariaLabel: 'Daily report actions',
                primary: FilledButton.icon(
                  onPressed: canSave && !_saving ? _save : null,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(
                    opState == 'rejected'
                        ? 'Save corrected copy'
                        : opState == 'conflict'
                        ? 'Save reviewed copy'
                        : _saved && !_canEditCurrentReport
                        ? 'Saved report'
                        : _saved
                        ? 'Update local draft'
                        : 'Save locally',
                  ),
                ),
                actions: [
                  ActionBarAction(
                    label: 'Sync now',
                    icon: Icons.sync,
                    onPressed: _saved ? _syncNow : null,
                    disabled: !_saved,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      body: ListView(
        key: const ValueKey('daily-report-screen-list'),
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 16),
          _AcceptedDailyReports(
            reports: widget.acceptedReports?.call() ?? const [],
            projects: widget.projects,
            photos: widget.photos,
          ),
          _SavedDailyReports(
            reports: widget.store.savedReports(
              widget.accountId,
              widget.tenantId,
            ),
            projects: widget.projects,
            selectedId: _savedId,
            onOpen: _openSavedReport,
          ),
          if (_savedId != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _startNewReport,
                icon: const Icon(Icons.add),
                label: const Text('New report'),
              ),
            ),
          SaveSyncStatusPanel(
            status: status,
            onNextAction: opState == 'rejected'
                ? null
                : failedPhotoIds.isNotEmpty
                ? _retryFailedPhotos
                : opState == 'pending'
                ? _syncNow
                : null,
          ),
          _SyncHealthCard(
            health: health,
            feedCursors: feedCursors,
            accessIssue: widget.syncAccessIssue,
            onSignInAgain: widget.onSignInAgain,
          ),
          if (opState == 'rejected') ...[
            const SizedBox(height: 8),
            const Text(
              'This report was rejected by the server. Correct the fields and save a new copy; the rejected operation is retained for review.',
            ),
          ],
          if (opState == 'conflict') ...[
            const SizedBox(height: 8),
            const Text(
              'This report conflicts with server state. Tap Sync now to refresh synced reports above, compare the current version, then reconcile this copy and save it as a new operation. The original conflict stays unchanged.',
            ),
          ],
          const SizedBox(height: 16),
          Form(
            key: _formKey,
            child: Column(
              children: [
                _section('Where & when', [
                  DropdownButtonFormField<String>(
                    initialValue: _projectId,
                    decoration: const InputDecoration(labelText: 'Project'),
                    items: [
                      ...widget.projects.map(
                        (project) => DropdownMenuItem(
                          value: project.id,
                          child: Text(
                            project.label,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      if (_projectId != null &&
                          !widget.projects.any(
                            (project) => project.id == _projectId,
                          ))
                        DropdownMenuItem(
                          value: _projectId,
                          child: Text('Unavailable project · $_projectId'),
                        ),
                    ],
                    onChanged: _canEditCurrentReport && reportPhotos.isEmpty
                        ? (value) => setState(() => _projectId = value)
                        : null,
                    validator: (value) => value == null || value.isEmpty
                        ? 'Choose a project'
                        : null,
                  ),
                  TextFormField(
                    controller: _date,
                    enabled: _canEditCurrentReport,
                    decoration: const InputDecoration(
                      labelText: 'Report date',
                      hintText: 'YYYY-MM-DD',
                    ),
                    validator: (value) =>
                        RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value ?? '')
                        ? null
                        : 'Use YYYY-MM-DD',
                  ),
                ]),
                if (widget.photos != null)
                  _section('Photos', [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed:
                              _photoBusy || _projectId == null || !_canAddPhotos
                              ? null
                              : () => _capturePhoto(PhotoCaptureSource.camera),
                          icon: const Icon(Icons.photo_camera_outlined),
                          label: const Text('Take photo'),
                        ),
                        OutlinedButton.icon(
                          onPressed:
                              _photoBusy || _projectId == null || !_canAddPhotos
                              ? null
                              : () => _capturePhoto(PhotoCaptureSource.gallery),
                          icon: const Icon(Icons.photo_library_outlined),
                          label: const Text('Choose photo'),
                        ),
                      ],
                    ),
                    if (_registeredPhotoReferences.isEmpty)
                      const ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.photo_outlined),
                        title: Text('No photos attached'),
                      ),
                    for (final photo in reportPhotos) _photoTile(photo),
                    for (final reference in _registeredPhotoReferences.where(
                      (reference) => !reportPhotos.any(
                        (photo) => photo.receipt == reference.receipt,
                      ),
                    ))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.cloud_done_outlined),
                        title: Text('Registered photo ${reference.receipt}'),
                        subtitle: Text(
                          'Available on the server · ${reference.bytes} bytes',
                        ),
                      ),
                  ]),
                _section('Weather', [
                  _field(_morning, 'Morning weather'),
                  _field(_midday, 'Midday weather'),
                  _field(_evening, 'Evening weather'),
                  _numberField(_minTemp, 'Min °C'),
                  _numberField(_maxTemp, 'Max °C'),
                  _numberField(_rain, 'Rainfall mm'),
                ]),
                _workforceSection(),
                _progressSection(),
                _equipmentSection(),
                _receivedSection(),
                _consumedSection(),
                _section('Problems, safety & remarks', [
                  _field(_problems, 'Problems', lines: 3),
                  _field(_safety, 'Safety notes', lines: 3),
                  _field(_remarks, 'Daily remarks', lines: 4),
                ]),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _photoTile(AttachmentTransferRecord photo) {
    final bytes = photo.complete
        ? widget.photos?.registeredBytes(photo.id)
        : null;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: bytes == null
          ? const Icon(Icons.image_outlined)
          : ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Image.memory(
                bytes,
                width: 52,
                height: 52,
                fit: BoxFit.cover,
              ),
            ),
      title: Text(
        'Photo ${photo.id.substring(0, photo.id.length.clamp(0, 8))}',
      ),
      subtitle: Text(
        photo.complete
            ? 'Registered · ${photo.registeredBytes ?? photo.bytes ?? 0} bytes'
            : photo.failureDetail ?? 'Transfer ${photo.state.name}',
      ),
      trailing: photo.state == AttachmentTransferState.failed
          ? TextButton(
              onPressed: _photoBusy ? null : () => _retryPhoto(photo.id),
              child: const Text('Retry'),
            )
          : null,
    );
  }

  Widget _section(String title, List<Widget> children) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    ),
  );

  Widget _workforceSection() => _reportRowsSection(
    'Workforce',
    _workforceRows,
    createRow: () => _ReportRow(
      {
        'company': '',
        'trade': '',
        'headcount': '',
        'regHours': '',
        'otHours': '',
      },
      selections: {'skill': 'unskilled'},
    ),
    addLabel: 'Add workforce row',
    fields: [
      _rowText('company', 'Company'),
      _rowText('trade', 'Trade'),
      _rowSelect('skill', 'Skill', const {
        'unskilled': 'Unskilled',
        'semi': 'Semi-skilled',
        'skilled': 'Skilled',
      }),
      _rowNumber('headcount', 'Headcount'),
      _rowNumber('regHours', 'Regular hours'),
      _rowNumber('otHours', 'Overtime hours'),
    ],
  );

  Widget _progressSection() => _reportRowsSection(
    'Work progress',
    _progressRows,
    createRow: () => _ReportRow({
      'taskDescription': '',
      'unit': '',
      'actualQty': '',
      'location': '',
    }),
    addLabel: 'Add progress row',
    fields: [
      _rowText('taskDescription', 'Task description'),
      _rowText('unit', 'Unit'),
      _rowNumber('actualQty', 'Actual quantity'),
      _rowText('location', 'Location'),
    ],
  );

  Widget _equipmentSection() => _reportRowsSection(
    'Equipment used',
    _equipmentRows,
    createRow: () => _ReportRow(
      {'name': '', 'workingHours': '', 'fuel': ''},
      selections: {'ownership': 'owned'},
    ),
    addLabel: 'Add equipment row',
    fields: [
      _rowText('name', 'Equipment name'),
      _rowSelect('ownership', 'Ownership', const {
        'owned': 'Owned',
        'hired': 'Hired',
      }),
      _rowNumber('workingHours', 'Working hours'),
      _rowNumber('fuel', 'Fuel'),
    ],
  );

  Widget _receivedSection() => _reportRowsSection(
    'Materials received',
    _receivedRows,
    createRow: () => _ReportRow({
      'name': '',
      'qty': '',
      'unit': '',
      'supplier': '',
      'vehicle': '',
    }),
    addLabel: 'Add received material',
    fields: [
      _rowText('name', 'Material name'),
      _rowNumber('qty', 'Quantity'),
      _rowText('unit', 'Unit'),
      _rowText('supplier', 'Supplier'),
      _rowText('vehicle', 'Vehicle'),
    ],
  );

  Widget _consumedSection() => _reportRowsSection(
    'Materials consumed',
    _consumedRows,
    createRow: () => _ReportRow({'name': '', 'quantity': '', 'unit': ''}),
    addLabel: 'Add consumed material',
    fields: [
      _rowText('name', 'Material name'),
      _rowNumber('quantity', 'Quantity'),
      _rowText('unit', 'Unit'),
    ],
  );

  Widget _reportRowsSection(
    String title,
    List<_ReportRow> rows, {
    required _ReportRow Function() createRow,
    required String addLabel,
    required List<_ReportRowField> fields,
  }) => _section(title, [
    for (var index = 0; index < rows.length; index++) ...[
      if (index > 0) const Divider(height: 20),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final field in fields)
            SizedBox(width: 220, child: field.build(rows[index], setState)),
          if (rows.length > 1)
            IconButton(
              tooltip: 'Remove row',
              onPressed: _canEditCurrentReport
                  ? () => setState(() => rows.removeAt(index).dispose())
                  : null,
              icon: const Icon(Icons.remove_circle_outline),
            ),
        ],
      ),
    ],
    Align(
      alignment: Alignment.centerLeft,
      child: TextButton.icon(
        onPressed: _canEditCurrentReport
            ? () => setState(() => rows.add(createRow()))
            : null,
        icon: const Icon(Icons.add),
        label: Text(addLabel),
      ),
    ),
  ]);

  _ReportRowField _rowText(String key, String label) => _ReportRowField(
    key: key,
    build: (row, refresh) => TextFormField(
      controller: row.controllers[key],
      enabled: _canEditCurrentReport,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );

  _ReportRowField _rowNumber(String key, String label) => _ReportRowField(
    key: key,
    build: (row, refresh) => TextFormField(
      controller: row.controllers[key],
      enabled: _canEditCurrentReport,
      keyboardType: const TextInputType.numberWithOptions(
        decimal: true,
        signed: true,
      ),
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      validator: (value) {
        if (value == null || value.trim().isEmpty) return null;
        final parsed = double.tryParse(value);
        return parsed != null && parsed.isFinite ? null : 'Enter a number';
      },
    ),
  );

  _ReportRowField _rowSelect(
    String key,
    String label,
    Map<String, String> options,
  ) => _ReportRowField(
    key: key,
    build: (row, refresh) => DropdownButtonFormField<String>(
      initialValue: row.selections[key] ?? options.keys.first,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: options.entries
          .map(
            (entry) =>
                DropdownMenuItem(value: entry.key, child: Text(entry.value)),
          )
          .toList(growable: false),
      onChanged: _canEditCurrentReport
          ? (value) {
              if (value == null) return;
              row.selections[key] = value;
              refresh(() {});
            }
          : null,
    ),
  );

  Widget _field(
    TextEditingController controller,
    String label, {
    int lines = 1,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: TextFormField(
      controller: controller,
      enabled: _canEditCurrentReport,
      minLines: lines,
      maxLines: lines == 1 ? 1 : 6,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );

  Widget _numberField(TextEditingController controller, String label) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: TextFormField(
          controller: controller,
          enabled: _canEditCurrentReport,
          keyboardType: const TextInputType.numberWithOptions(
            decimal: true,
            signed: true,
          ),
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
          ),
          validator: (value) =>
              value == null || value.isEmpty || double.tryParse(value) != null
              ? null
              : 'Enter a number',
        ),
      );

  String _safeError(Object error) => switch (error) {
    RepositoryError(:final kind) =>
      'Save failed ($kind). Your entry is still open on this device.',
    FormatException() => 'Check the numeric values and try saving again.',
    _ => 'Save failed. Your entry is still open on this device.',
  };
}

class _SyncAccessNotice extends StatelessWidget {
  const _SyncAccessNotice({required this.issue, this.onSignInAgain});

  final DailyReportSyncAccessIssue issue;
  final VoidCallback? onSignInAgain;

  @override
  Widget build(BuildContext context) {
    final authenticationRequired =
        issue == DailyReportSyncAccessIssue.authenticationRequired;
    final colors = Theme.of(context).colorScheme;
    return Container(
      key: const ValueKey('daily-report-sync-access-issue'),
      decoration: BoxDecoration(
        color: colors.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.sync_problem_outlined,
                  color: colors.onErrorContainer,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        authenticationRequired
                            ? 'Sign-in required to sync'
                            : 'Project access changed',
                        style: Theme.of(context).textTheme.titleSmall
                            ?.copyWith(color: colors.onErrorContainer),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        authenticationRequired
                            ? 'Your report is saved locally. Sign in again to resume syncing.'
                            : 'Your report is saved locally. Ask a project admin to restore access, then sync again.',
                        style: TextStyle(color: colors.onErrorContainer),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (authenticationRequired && onSignInAgain != null) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonal(
                  onPressed: onSignInAgain,
                  child: const Text('Sign in again'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AcceptedDailyReports extends StatelessWidget {
  const _AcceptedDailyReports({
    required this.reports,
    required this.projects,
    required this.photos,
  });

  final List<Map<String, Object?>> reports;
  final List<DailyReportProjectOption> projects;
  final DailyReportPhotoPort? photos;

  @override
  Widget build(BuildContext context) {
    if (reports.isEmpty) return const SizedBox.shrink();
    final ordered = [...reports]
      ..sort((a, b) => '${b['reportDate']}'.compareTo('${a['reportDate']}'));
    return Card(
      child: ExpansionTile(
        title: Text('Synced daily reports (${ordered.length})'),
        children: [
          for (final report in ordered)
            ListTile(
              leading: const Icon(Icons.receipt_long_outlined),
              title: Text('${report['number'] ?? 'Daily report'}'),
              subtitle: Text(
                '${_reportDateLabel(report['reportDate'])} · '
                '${_projectLabel(projects, report['projectId'])} · '
                '${report['status'] ?? 'synced'}',
              ),
              onTap: () => _showReport(context, report, photos),
            ),
        ],
      ),
    );
  }
}

class _SavedDailyReports extends StatelessWidget {
  const _SavedDailyReports({
    required this.reports,
    required this.projects,
    required this.selectedId,
    required this.onOpen,
  });

  final List<SavedDailyReport> reports;
  final List<DailyReportProjectOption> projects;
  final String? selectedId;
  final ValueChanged<SavedDailyReport> onOpen;

  @override
  Widget build(BuildContext context) {
    if (reports.isEmpty) return const SizedBox.shrink();
    return Card(
      child: ExpansionTile(
        title: Text('Saved on this device (${reports.length})'),
        children: [
          for (final report in reports)
            ListTile(
              selected: report.draft.clientUuid == selectedId,
              leading: Icon(
                const {'rejected', 'conflict'}.contains(report.operationState)
                    ? Icons.sync_problem_outlined
                    : Icons.description_outlined,
              ),
              title: Text(_reportDateLabel(report.draft.reportDate)),
              subtitle: Text(
                '${_projectLabel(projects, report.draft.projectId)} · '
                '${_localReportState(report.operationState)}',
              ),
              onTap: () => onOpen(report),
            ),
        ],
      ),
    );
  }
}

String _localReportState(String? state) => switch (state) {
  'rejected' => 'Rejected · correction available',
  'pending' => 'Saved · waiting to sync',
  'in_flight' => 'Syncing',
  'accepted' => 'Synced',
  'conflict' => 'Conflict · review and copy',
  'blocked' => 'Blocked · prerequisite required',
  _ => 'Saved on this device',
};

String _projectLabel(List<DailyReportProjectOption> projects, Object? id) =>
    projects.where((project) => project.id == id).firstOrNull?.label ?? '';

String _reportDateLabel(Object? date) {
  if (date is! String) return 'Date unavailable';
  return date.length >= 10 ? date.substring(0, 10) : date;
}

Future<void> _showReport(
  BuildContext context,
  Map<String, Object?> report,
  DailyReportPhotoPort? photos,
) => showDialog<void>(
  context: context,
  builder: (context) => AlertDialog(
    title: Text('${report['number'] ?? 'Daily report'}'),
    content: SizedBox(
      width: 520,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Date: ${_reportDateLabel(report['reportDate'])}'),
            Text('Status: ${report['status'] ?? 'synced'}'),
            if (report['weatherMorning'] case final value?
                when '$value'.isNotEmpty)
              Text('Morning weather: $value'),
            if (report['weatherAfternoon'] case final value?
                when '$value'.isNotEmpty)
              Text('Afternoon weather: $value'),
            if (report['weatherEvening'] case final value?
                when '$value'.isNotEmpty)
              Text('Evening weather: $value'),
            for (final section in const [
              ('Workforce', 'workforce'),
              ('Work progress', 'workProgress'),
              ('Equipment', 'equipmentUsed'),
              ('Materials received', 'materialReceived'),
              ('Materials consumed', 'materialConsumed'),
              ('Site visits', 'siteVisits'),
              ('Meetings', 'meetings'),
            ])
              if (report[section.$2] is List &&
                  (report[section.$2] as List).isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(section.$1, style: Theme.of(context).textTheme.titleSmall),
                for (final row in report[section.$2] as List)
                  if (row is Map)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        row.entries
                            .where(
                              (entry) =>
                                  entry.value != null &&
                                  '${entry.value}'.isNotEmpty,
                            )
                            .map((entry) => '${entry.key}: ${entry.value}')
                            .join(' · '),
                      ),
                    ),
              ],
            if ('${report['problems'] ?? ''}'.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('Problems: ${report['problems']}'),
            ],
            if ('${report['safetyNotes'] ?? ''}'.isNotEmpty)
              Text('Safety: ${report['safetyNotes']}'),
            if ('${report['remarks'] ?? ''}'.isNotEmpty)
              Text('Remarks: ${report['remarks']}'),
            if (report['attachments'] is List)
              for (final attachment in report['attachments'] as List)
                if (attachment is Map) ...[
                  const SizedBox(height: 12),
                  Text('${attachment['fileName'] ?? 'Registered photo'}'),
                  if (attachment['registeredPhotoId'] is String &&
                      photos != null)
                    Builder(
                      builder: (context) {
                        final bytes = photos.registeredBytes(
                          attachment['registeredPhotoId'] as String,
                        );
                        return bytes == null
                            ? const Text(
                                'Photo is not available on this device yet.',
                              )
                            : ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.memory(
                                  bytes,
                                  height: 160,
                                  fit: BoxFit.cover,
                                ),
                              );
                      },
                    ),
                ],
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Close'),
      ),
    ],
  ),
);

class _SyncHealthCard extends StatelessWidget {
  const _SyncHealthCard({
    required this.health,
    required this.feedCursors,
    this.accessIssue,
    this.onSignInAgain,
  });

  final DeviceSyncHealth health;
  final List<DailyReportFeedCursor> feedCursors;
  final DailyReportSyncAccessIssue? accessIssue;
  final VoidCallback? onSignInAgain;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(top: 12),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Device sync health',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Text(health.synced ? 'No pending work' : 'Needs attention'),
          if (accessIssue != null) ...[
            const SizedBox(height: 8),
            _SyncAccessNotice(
              issue: accessIssue!,
              onSignInAgain: onSignInAgain,
            ),
          ],
          Text('${health.pendingOperationCount} pending operation(s)'),
          if (health.oldestPendingAgeMs != null)
            Text('Oldest pending: ${_ageLabel(health.oldestPendingAgeMs!)}'),
          if (health.conflicts > 0)
            Text('${health.conflicts} conflict(s) need review'),
          if (health.blocked > 0)
            Text('${health.blocked} operation(s) blocked by a prerequisite'),
          for (final reason in health.reasons) Text(reason),
          const SizedBox(height: 6),
          Text(
            'Accepted feed cursors',
            style: Theme.of(context).textTheme.labelMedium,
          ),
          if (feedCursors.isEmpty)
            const Text('No accepted feed cursor recorded on this device yet.')
          else
            for (final cursor in feedCursors)
              Text('project:${cursor.projectId}: ${cursor.cursor}'),
          const SizedBox(height: 4),
          Text(
            'Accepted operation sequences',
            style: Theme.of(context).textTheme.labelMedium,
          ),
          if (health.lastAcceptedCursors.isEmpty)
            const Text('No accepted operation recorded on this device yet.')
          else
            for (final cursor in health.lastAcceptedCursors)
              Text('${cursor.scope}: ${cursor.lastAcceptedSeq}'),
          for (final rejection in health.rejections.take(3))
            Text('${rejection.kind}: ${rejection.reason}'),
        ],
      ),
    ),
  );
}

class _ReportRow {
  final Map<String, TextEditingController> controllers;
  final Map<String, String> selections;

  _ReportRow(
    Map<String, String> textValues, {
    Map<String, String> selections = const {},
  }) : controllers = {
         for (final entry in textValues.entries)
           entry.key: TextEditingController(text: entry.value),
       },
       selections = Map.of(selections);

  String value(String key) => controllers[key]!.text.trim();

  String? nullableValue(String key) {
    final value = this.value(key);
    return value.isEmpty ? null : value;
  }

  double number(String key) {
    final value = this.value(key);
    if (value.isEmpty) return 0;
    final parsed = double.tryParse(value);
    if (parsed == null || !parsed.isFinite) {
      throw FormatException('$key must be a finite number.');
    }
    return parsed;
  }

  bool hasText(List<String> keys) => keys.any((key) => value(key).isNotEmpty);

  void dispose() {
    for (final controller in controllers.values) {
      controller.dispose();
    }
  }
}

class _ReportRowField {
  final String key;
  final Widget Function(_ReportRow, StateSetter) build;

  const _ReportRowField({required this.key, required this.build});
}

String _ageLabel(int milliseconds) {
  if (milliseconds < 60 * 1000) {
    return 'under a minute';
  }
  if (milliseconds < 60 * 60 * 1000) {
    return '${milliseconds ~/ (60 * 1000)} min';
  }
  return '${milliseconds ~/ (60 * 60 * 1000)} hr';
}

String _today() {
  final now = DateTime.now();
  return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
}

String _uuid() {
  final random = Random.secure();
  return List.generate(
    16,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}
