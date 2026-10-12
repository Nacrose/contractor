import 'dart:math';

import 'package:flutter/material.dart';

import '../mount/ports.dart';
import 'field_expansion_substrate.dart';

class AttendanceProjectOption {
  const AttendanceProjectOption({required this.id, required this.label});

  final String id;
  final String label;
}

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({
    required this.store,
    required this.accountId,
    required this.tenantId,
    required this.role,
    required this.projects,
    this.onSignInAgain,
    this.onSyncStarted,
    super.key,
  });

  final FieldExpansionWorkflowStore store;
  final String accountId;
  final String tenantId;
  final String role;
  final List<AttendanceProjectOption> projects;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onSyncStarted;

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _WorkerEntryState {
  String staffId;
  String staffName;
  String trade;
  String status; // 'present', 'absent', 'half_day', 'leave'
  double regularHours;
  double overtimeHours;
  String notes;

  _WorkerEntryState({
    required this.staffId,
    required this.staffName,
    required this.trade,
    this.status = 'present',
    this.regularHours = 8.0,
    this.overtimeHours = 0.0,
    this.notes = '',
  });

  AttendanceRecordItem toRecord() => AttendanceRecordItem(
    staffId: staffId,
    staffName: staffName,
    trade: trade,
    status: status,
    regularHours: regularHours,
    overtimeHours: overtimeHours,
    notes: notes,
  );
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  late String _clientUuid;
  String? _selectedProjectId;
  late TextEditingController _dateController;
  late TextEditingController _shiftController;
  late TextEditingController _remarksController;

  late List<_WorkerEntryState> _workers;
  String? _savedClientUuid;
  String? _statusMessage;
  bool _isSaving = false;
  bool _isSyncing = false;

  @override
  void initState() {
    super.initState();
    _clientUuid = _generateUuid();
    final today = DateTime.now();
    _dateController = TextEditingController(
      text:
          '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}',
    );
    _shiftController = TextEditingController(text: 'General Day Shift');
    _remarksController = TextEditingController();

    if (widget.projects.isNotEmpty) {
      _selectedProjectId = widget.projects.first.id;
    }

    _workers = [
      _WorkerEntryState(
        staffId: 'staff-101',
        staffName: 'Ramesh Sharma',
        trade: 'Mason Lead',
      ),
      _WorkerEntryState(
        staffId: 'staff-102',
        staffName: 'Sita Gurung',
        trade: 'Carpenter',
      ),
      _WorkerEntryState(
        staffId: 'staff-103',
        staffName: 'Bikash Thapa',
        trade: 'Electrician',
      ),
      _WorkerEntryState(
        staffId: 'staff-104',
        staffName: 'Hari Krishna Chaudhary',
        trade: 'Rebar Fabricator',
      ),
      _WorkerEntryState(
        staffId: 'staff-105',
        staffName: 'Sunil Magar',
        trade: 'General Helper',
      ),
    ];
  }

  @override
  void dispose() {
    _dateController.dispose();
    _shiftController.dispose();
    _remarksController.dispose();
    super.dispose();
  }

  String _generateUuid() {
    final rand = Random.secure();
    final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  void _resetForNewAttendance() {
    setState(() {
      _clientUuid = _generateUuid();
      _savedClientUuid = null;
      _remarksController.clear();
      _statusMessage = 'Started new attendance submission.';
      for (final worker in _workers) {
        worker.status = 'present';
        worker.regularHours = 8.0;
        worker.overtimeHours = 0.0;
        worker.notes = '';
      }
    });
  }

  AttendanceSubmissionDraft _buildDraft({String? uuidOverride}) =>
      AttendanceSubmissionDraft(
        clientUuid: uuidOverride ?? _clientUuid,
        projectId: _selectedProjectId ?? '',
        attendanceDate: _dateController.text.trim(),
        shiftName: _shiftController.text.trim(),
        records: _workers.map((w) => w.toRecord()).toList(growable: false),
        supervisorRemarks: _remarksController.text.trim(),
      );

  Future<void> _saveLocally() async {
    if (_selectedProjectId == null || _selectedProjectId!.isEmpty) {
      setState(() => _statusMessage = 'Please select a project first.');
      return;
    }
    setState(() => _isSaving = true);
    try {
      final draft = _buildDraft();
      if (_savedClientUuid != null &&
          widget.store.canEditUnsent(widget.accountId, _savedClientUuid!)) {
        widget.store.editUnsentAttendance(
          accountId: widget.accountId,
          draft: draft.withClientUuid(_savedClientUuid!),
        );
        setState(() {
          _statusMessage = 'Updated local attendance submission.';
        });
      } else {
        widget.store.saveAttendance(
          accountId: widget.accountId,
          tenantId: widget.tenantId,
          role: widget.role,
          draft: draft,
        );
        setState(() {
          _savedClientUuid = draft.clientUuid;
          _statusMessage = 'Saved attendance locally in durable outbox.';
        });
      }
    } on RepositoryError catch (e) {
      setState(() => _statusMessage = 'Save error: ${e.message}');
    } catch (e) {
      setState(() => _statusMessage = 'Unexpected error: $e');
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _syncNow() async {
    setState(() => _isSyncing = true);
    widget.onSyncStarted?.call();
    try {
      await widget.store.syncNow();
      setState(() => _statusMessage = 'Sync trigger dispatched.');
    } catch (e) {
      setState(() => _statusMessage = 'Sync error: $e');
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  void _loadSavedDraft(SavedFieldSubmission<AttendanceSubmissionDraft> saved) {
    setState(() {
      _clientUuid = saved.draft.clientUuid;
      _savedClientUuid = saved.draft.clientUuid;
      _selectedProjectId = saved.draft.projectId;
      _dateController.text = saved.draft.attendanceDate;
      _shiftController.text = saved.draft.shiftName;
      _remarksController.text = saved.draft.supervisorRemarks;

      _workers = saved.draft.records
          .map(
            (r) => _WorkerEntryState(
              staffId: r.staffId,
              staffName: r.staffName,
              trade: r.trade,
              status: r.status,
              regularHours: r.regularHours,
              overtimeHours: r.overtimeHours,
              notes: r.notes,
            ),
          )
          .toList();
      _statusMessage = 'Loaded saved attendance submission.';
    });
  }

  void _duplicateForRecovery(String rejectedClientUuid) {
    try {
      final original = widget.store.getAttendance(widget.accountId, rejectedClientUuid);
      if (original == null) return;
      final newUuid = _generateUuid();
      final recoveryDraft = original.withClientUuid(newUuid);

      widget.store.saveRecoveryAttendance(
        accountId: widget.accountId,
        tenantId: widget.tenantId,
        role: widget.role,
        sourceClientUuid: rejectedClientUuid,
        draft: recoveryDraft,
      );

      setState(() {
        _clientUuid = newUuid;
        _savedClientUuid = newUuid;
        _statusMessage = 'Recovery copy created with new ID $newUuid.';
      });
    } on RepositoryError catch (e) {
      setState(() => _statusMessage = 'Recovery error: ${e.message}');
    }
  }

  void _addNewWorkerDialog() {
    final nameCtrl = TextEditingController();
    final tradeCtrl = TextEditingController(text: 'General Worker');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Worker to Roster'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Worker Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: tradeCtrl,
              decoration: const InputDecoration(labelText: 'Trade / Skill'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final name = nameCtrl.text.trim();
              if (name.isNotEmpty) {
                setState(() {
                  _workers.add(
                    _WorkerEntryState(
                      staffId: 'staff-${DateTime.now().millisecondsSinceEpoch % 10000}',
                      staffName: name,
                      trade: tradeCtrl.text.trim(),
                    ),
                  );
                });
              }
              Navigator.pop(ctx);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final health = widget.store.syncHealth(widget.accountId, widget.tenantId);
    final savedSubmissions = widget.store.listAttendance(widget.accountId, widget.tenantId);
    final opState = _savedClientUuid != null
        ? widget.store.operationState(widget.accountId, _savedClientUuid!)
        : null;

    final totalWorkers = _workers.length;
    final presentWorkers = _workers.where((w) => w.status == 'present' || w.status == 'half_day').length;
    final totalRegHours = _workers.fold(0.0, (acc, w) => acc + w.regularHours);
    final totalOtHours = _workers.fold(0.0, (acc, w) => acc + w.overtimeHours);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Daily Site Attendance'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New Attendance',
            onPressed: _resetForNewAttendance,
          ),
          IconButton(
            icon: _isSyncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            tooltip: 'Sync Now',
            onPressed: _isSyncing ? null : _syncNow,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Status and Central Sync Health Card
            _buildSyncHealthCard(health, opState),
            const SizedBox(height: 16),

            // Project, Date, and Shift Card
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                side: BorderSide(color: Theme.of(context).dividerColor),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Attendance Header',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _selectedProjectId,
                      decoration: const InputDecoration(
                        labelText: 'Project',
                        border: OutlineInputBorder(),
                      ),
                      items: widget.projects
                          .map(
                            (p) => DropdownMenuItem(
                              value: p.id,
                              child: Text(p.label),
                            ),
                          )
                          .toList(),
                      onChanged: (val) => setState(() => _selectedProjectId = val),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _dateController,
                            decoration: const InputDecoration(
                              labelText: 'Date (YYYY-MM-DD)',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.calendar_today),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _shiftController,
                            decoration: const InputDecoration(
                              labelText: 'Shift Name',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.access_time),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // KPI Summary Stats
            _buildKpiSummary(
              totalWorkers: totalWorkers,
              presentWorkers: presentWorkers,
              totalRegHours: totalRegHours,
              totalOtHours: totalOtHours,
            ),
            const SizedBox(height: 16),

            // Workers Roster List
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Site Crew Roster ($totalWorkers workers)',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                TextButton.icon(
                  onPressed: _addNewWorkerDialog,
                  icon: const Icon(Icons.person_add),
                  label: const Text('Add Worker'),
                ),
              ],
            ),
            const SizedBox(height: 8),

            ..._workers.map((worker) => _buildWorkerCard(worker)),

            const SizedBox(height: 16),
            TextField(
              controller: _remarksController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Supervisor Remarks / Site Notes',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),

            // Action Buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _isSyncing ? null : _syncNow,
                    icon: const Icon(Icons.cloud_upload_outlined),
                    label: const Text('Sync Outbox'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _isSaving ? null : _saveLocally,
                    icon: _isSaving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.save),
                    label: Text(_savedClientUuid != null ? 'Update Local' : 'Save Locally'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Saved Submissions Drawer / List
            if (savedSubmissions.isNotEmpty) ...[
              const Divider(),
              Text(
                'Locally Saved Submissions (${savedSubmissions.length})',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 8),
              ...savedSubmissions.map((s) => _buildSavedSubmissionTile(s)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSyncHealthCard(DeviceSyncHealth health, String? opState) {
    final statusColor = health.synced
        ? Colors.green
        : (opState == 'rejected' ? Colors.red : Colors.orange);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: statusColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                health.synced ? Icons.check_circle : Icons.sync_problem,
                color: statusColor,
                size: 20,
              ),
              const SizedBox(width: 8),
              Text(
                health.synced
                    ? 'All field submissions fully synced'
                    : '${health.pendingOperationCount} pending outbox submission(s)',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: statusColor,
                ),
              ),
              const Spacer(),
              if (opState != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    'State: $opState',
                    style: TextStyle(fontSize: 12, color: statusColor),
                  ),
                ),
            ],
          ),
          if (_statusMessage != null) ...[
            const SizedBox(height: 6),
            Text(
              _statusMessage!,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildKpiSummary({
    required int totalWorkers,
    required int presentWorkers,
    required double totalRegHours,
    required double totalOtHours,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _kpiStat('Crew', '$totalWorkers'),
          _kpiStat('Present', '$presentWorkers', color: Colors.green.shade700),
          _kpiStat('Reg Hours', '${totalRegHours.toStringAsFixed(1)}h'),
          _kpiStat('OT Hours', '${totalOtHours.toStringAsFixed(1)}h', color: Colors.blue.shade700),
        ],
      ),
    );
  }

  Widget _kpiStat(String label, String value, {Color? color}) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: Colors.grey),
        ),
      ],
    );
  }

  Widget _buildWorkerCard(_WorkerEntryState worker) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: 0.6)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: Theme.of(context).primaryColor.withValues(alpha: 0.1),
                  child: Text(
                    worker.staffName.isNotEmpty ? worker.staffName[0] : 'W',
                    style: TextStyle(
                      color: Theme.of(context).primaryColor,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        worker.staffName,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      Text(
                        worker.trade,
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                // Hours display
                Text(
                  '${worker.regularHours.toStringAsFixed(1)}h + ${worker.overtimeHours.toStringAsFixed(1)}h OT',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Status segmented selector
            Row(
              children: [
                _statusChoice(worker, 'present', 'Present', Colors.green),
                const SizedBox(width: 6),
                _statusChoice(worker, 'half_day', 'Half Day', Colors.amber.shade800),
                const SizedBox(width: 6),
                _statusChoice(worker, 'absent', 'Absent', Colors.red),
                const SizedBox(width: 6),
                _statusChoice(worker, 'leave', 'Leave', Colors.indigo),
              ],
            ),
            if (worker.status == 'present' || worker.status == 'half_day') ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('OT (hrs): ', style: TextStyle(fontSize: 12)),
                  SizedBox(
                    width: 70,
                    height: 32,
                    child: TextField(
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        border: OutlineInputBorder(),
                      ),
                      controller: TextEditingController(
                        text: worker.overtimeHours > 0 ? worker.overtimeHours.toString() : '0',
                      ),
                      onChanged: (val) {
                        final parsed = double.tryParse(val) ?? 0.0;
                        setState(() => worker.overtimeHours = parsed);
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: SizedBox(
                      height: 32,
                      child: TextField(
                        decoration: const InputDecoration(
                          hintText: 'Notes / tasks...',
                          contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          border: OutlineInputBorder(),
                        ),
                        controller: TextEditingController(text: worker.notes),
                        onChanged: (val) => worker.notes = val,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _statusChoice(
    _WorkerEntryState worker,
    String statusKey,
    String label,
    Color activeColor,
  ) {
    final isSelected = worker.status == statusKey;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() {
            worker.status = statusKey;
            if (statusKey == 'absent' || statusKey == 'leave') {
              worker.regularHours = 0.0;
              worker.overtimeHours = 0.0;
            } else if (statusKey == 'half_day') {
              worker.regularHours = 4.0;
            } else {
              worker.regularHours = 8.0;
            }
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? activeColor.withValues(alpha: 0.15) : Colors.transparent,
            border: Border.all(
              color: isSelected ? activeColor : Colors.grey.shade300,
              width: isSelected ? 1.5 : 1.0,
            ),
            borderRadius: BorderRadius.circular(6),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              color: isSelected ? activeColor : Colors.grey.shade700,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSavedSubmissionTile(
    SavedFieldSubmission<AttendanceSubmissionDraft> saved,
  ) {
    final isCurrent = saved.draft.clientUuid == _savedClientUuid;
    final isRejected = saved.operationState == 'rejected';

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 6),
      color: isCurrent
          ? Theme.of(context).primaryColor.withValues(alpha: 0.05)
          : null,
      shape: RoundedRectangleBorder(
        side: BorderSide(
          color: isCurrent
              ? Theme.of(context).primaryColor
              : Theme.of(context).dividerColor.withValues(alpha: 0.5),
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        dense: true,
        title: Text(
          'Date: ${saved.draft.attendanceDate} (${saved.draft.shiftName})',
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        ),
        subtitle: Text(
          '${saved.draft.records.length} workers · UUID: ${saved.draft.clientUuid.substring(0, 8)}...',
          style: const TextStyle(fontSize: 11),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: (saved.operationState == 'accepted'
                        ? Colors.green
                        : (isRejected ? Colors.red : Colors.orange))
                    .withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                saved.operationState ?? 'pending',
                style: TextStyle(
                  fontSize: 11,
                  color: saved.operationState == 'accepted'
                      ? Colors.green
                      : (isRejected ? Colors.red : Colors.orange),
                ),
              ),
            ),
            if (isRejected)
              IconButton(
                icon: const Icon(Icons.copy, size: 16),
                tooltip: 'Copy for recovery',
                onPressed: () => _duplicateForRecovery(saved.draft.clientUuid),
              )
            else
              IconButton(
                icon: const Icon(Icons.arrow_forward, size: 16),
                tooltip: 'Load',
                onPressed: () => _loadSavedDraft(saved),
              ),
          ],
        ),
      ),
    );
  }
}
