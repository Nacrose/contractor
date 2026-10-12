import 'dart:math';

import 'package:flutter/material.dart';

import '../mount/ports.dart';
import 'field_expansion_substrate.dart';

class SiteExpenseProjectOption {
  const SiteExpenseProjectOption({required this.id, required this.label});

  final String id;
  final String label;
}

class SiteExpenseScreen extends StatefulWidget {
  const SiteExpenseScreen({
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
  final List<SiteExpenseProjectOption> projects;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onSyncStarted;

  @override
  State<SiteExpenseScreen> createState() => _SiteExpenseScreenState();
}

class _SiteExpenseScreenState extends State<SiteExpenseScreen> {
  late String _clientUuid;
  String? _selectedProjectId;
  String _selectedCategory = 'fuel';
  late TextEditingController _dateController;
  late TextEditingController _amountController;
  late TextEditingController _payeeController;
  late TextEditingController _memoController;
  List<String> _receiptPhotoIds = [];

  String? _savedClientUuid;
  String? _statusMessage;
  bool _isSaving = false;
  bool _isSyncing = false;

  static const List<Map<String, String>> _categories = [
    {'id': 'fuel', 'label': 'Fuel & Diesel'},
    {'id': 'materials', 'label': 'Local Cash Materials'},
    {'id': 'food', 'label': 'Site Food & Refreshments'},
    {'id': 'travel', 'label': 'Local Site Travel'},
    {'id': 'equipment_hire', 'label': 'Spot Equipment Hire'},
    {'id': 'tools', 'label': 'Small Tools & Consumables'},
    {'id': 'misc', 'label': 'Miscellaneous Petty Cash'},
  ];

  @override
  void initState() {
    super.initState();
    _clientUuid = _generateUuid();
    final today = DateTime.now();
    _dateController = TextEditingController(
      text:
          '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}',
    );
    _amountController = TextEditingController();
    _payeeController = TextEditingController();
    _memoController = TextEditingController();

    if (widget.projects.isNotEmpty) {
      _selectedProjectId = widget.projects.first.id;
    }
  }

  @override
  void dispose() {
    _dateController.dispose();
    _amountController.dispose();
    _payeeController.dispose();
    _memoController.dispose();
    super.dispose();
  }

  String _generateUuid() {
    final rand = Random.secure();
    final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  void _resetForNewExpense() {
    setState(() {
      _clientUuid = _generateUuid();
      _savedClientUuid = null;
      _amountController.clear();
      _payeeController.clear();
      _memoController.clear();
      _receiptPhotoIds = [];
      _statusMessage = 'Started new site expense draft.';
    });
  }

  SiteExpenseSubmissionDraft _buildDraft({String? uuidOverride}) =>
      SiteExpenseSubmissionDraft(
        clientUuid: uuidOverride ?? _clientUuid,
        projectId: _selectedProjectId ?? '',
        expenseDate: _dateController.text.trim(),
        category: _selectedCategory,
        amount: _amountController.text.trim(),
        currency: 'NPR',
        payee: _payeeController.text.trim(),
        memo: _memoController.text.trim(),
        receiptPhotoIds: _receiptPhotoIds,
      );

  Future<void> _saveLocally() async {
    if (_selectedProjectId == null || _selectedProjectId!.isEmpty) {
      setState(() => _statusMessage = 'Please select a project.');
      return;
    }
    final amt = double.tryParse(_amountController.text.trim());
    if (amt == null || amt <= 0) {
      setState(() => _statusMessage = 'Please enter a valid expense amount.');
      return;
    }
    if (_payeeController.text.trim().isEmpty) {
      setState(() => _statusMessage = 'Payee / merchant name is required.');
      return;
    }

    setState(() => _isSaving = true);
    try {
      final draft = _buildDraft();
      if (_savedClientUuid != null &&
          widget.store.canEditUnsent(widget.accountId, _savedClientUuid!)) {
        widget.store.editUnsentSiteExpense(
          accountId: widget.accountId,
          draft: draft.withClientUuid(_savedClientUuid!),
        );
        setState(() => _statusMessage = 'Updated local site expense draft.');
      } else {
        widget.store.saveSiteExpense(
          accountId: widget.accountId,
          tenantId: widget.tenantId,
          role: widget.role,
          draft: draft,
        );
        setState(() {
          _savedClientUuid = draft.clientUuid;
          _statusMessage = 'Saved site expense locally in durable outbox.';
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

  void _loadSavedDraft(SavedFieldSubmission<SiteExpenseSubmissionDraft> saved) {
    setState(() {
      _clientUuid = saved.draft.clientUuid;
      _savedClientUuid = saved.draft.clientUuid;
      _selectedProjectId = saved.draft.projectId;
      _selectedCategory = saved.draft.category;
      _dateController.text = saved.draft.expenseDate;
      _amountController.text = saved.draft.amount;
      _payeeController.text = saved.draft.payee;
      _memoController.text = saved.draft.memo;
      _receiptPhotoIds = List.from(saved.draft.receiptPhotoIds);
      _statusMessage = 'Loaded saved site expense draft.';
    });
  }

  void _duplicateForRecovery(String rejectedClientUuid) {
    try {
      final original = widget.store.getSiteExpense(widget.accountId, rejectedClientUuid);
      if (original == null) return;
      final newUuid = _generateUuid();
      final recoveryDraft = original.withClientUuid(newUuid);

      widget.store.saveRecoverySiteExpense(
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

  @override
  Widget build(BuildContext context) {
    final health = widget.store.syncHealth(widget.accountId, widget.tenantId);
    final savedSubmissions = widget.store.listSiteExpenses(widget.accountId, widget.tenantId);
    final opState = _savedClientUuid != null
        ? widget.store.operationState(widget.accountId, _savedClientUuid!)
        : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Site Expense & Petty Cash'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New Expense',
            onPressed: _resetForNewExpense,
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
            // Sync Health Banner
            _buildSyncHealthBanner(health, opState),
            const SizedBox(height: 12),

            // Financial Guard Notice
            _buildFinancialNotice(),
            const SizedBox(height: 16),

            // Expense Entry Form Card
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
                      'Expense Information',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 16),
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
                          child: DropdownButtonFormField<String>(
                            initialValue: _selectedCategory,
                            decoration: const InputDecoration(
                              labelText: 'Category',
                              border: OutlineInputBorder(),
                            ),
                            items: _categories
                                .map(
                                  (c) => DropdownMenuItem(
                                    value: c['id'],
                                    child: Text(c['label']!),
                                  ),
                                )
                                .toList(),
                            onChanged: (val) {
                              if (val != null) setState(() => _selectedCategory = val);
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextField(
                            controller: _amountController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(
                              labelText: 'Amount (NPR)',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.payments_outlined),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 3,
                          child: TextField(
                            controller: _payeeController,
                            decoration: const InputDecoration(
                              labelText: 'Payee / Merchant',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.storefront_outlined),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _memoController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Memo / Description / Reason for Purchase',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

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
                    label: Text(_savedClientUuid != null ? 'Update Draft' : 'Save Locally'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Saved Expenses List
            if (savedSubmissions.isNotEmpty) ...[
              const Divider(),
              Text(
                'Locally Saved Site Expenses (${savedSubmissions.length})',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 8),
              ...savedSubmissions.map((s) => _buildSavedExpenseTile(s)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSyncHealthBanner(DeviceSyncHealth health, String? opState) {
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
                    ? 'All site expenses fully synced'
                    : '${health.pendingOperationCount} pending outbox expense(s)',
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

  Widget _buildFinancialNotice() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.blue.withValues(alpha: 0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, color: Colors.blue, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Site expenses land in submission state and require office manager authorization before posting to the financial ledger. Submitter identity and initial amount are durably audited.',
              style: TextStyle(fontSize: 12, color: Colors.blue.shade900),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSavedExpenseTile(
    SavedFieldSubmission<SiteExpenseSubmissionDraft> saved,
  ) {
    final isCurrent = saved.draft.clientUuid == _savedClientUuid;
    final isRejected = saved.operationState == 'rejected';

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 6),
      color: isCurrent ? Theme.of(context).primaryColor.withValues(alpha: 0.05) : null,
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
          'Rs. ${saved.draft.amount} · ${saved.draft.payee}',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        ),
        subtitle: Text(
          'Category: ${saved.draft.category} · Date: ${saved.draft.expenseDate}',
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
