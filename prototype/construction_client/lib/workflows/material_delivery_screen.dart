import 'dart:math';

import 'package:flutter/material.dart';

import '../mount/ports.dart';
import 'field_expansion_substrate.dart';

class MaterialDeliveryProjectOption {
  const MaterialDeliveryProjectOption({required this.id, required this.label});

  final String id;
  final String label;
}

class MaterialItemRowState {
  MaterialItemRowState({
    required this.materialCode,
    required this.materialName,
    required this.quantityController,
    required this.unit,
    this.remarksController,
  });

  String materialCode;
  String materialName;
  TextEditingController quantityController;
  String unit;
  TextEditingController? remarksController;
}

class MaterialDeliveryScreen extends StatefulWidget {
  const MaterialDeliveryScreen({
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
  final List<MaterialDeliveryProjectOption> projects;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onSyncStarted;

  @override
  State<MaterialDeliveryScreen> createState() => _MaterialDeliveryScreenState();
}

class _MaterialDeliveryScreenState extends State<MaterialDeliveryScreen> {
  late String _clientUuid;
  String? _selectedProjectId;
  late TextEditingController _dateController;
  late TextEditingController _supplierController;
  late TextEditingController _challanController;
  late TextEditingController _vehicleController;
  late TextEditingController _remarksController;
  final List<MaterialItemRowState> _itemRows = [];
  List<String> _receiptPhotoIds = [];

  String? _savedClientUuid;
  String? _statusMessage;
  bool _isSaving = false;
  bool _isSyncing = false;

  static const List<Map<String, String>> _catalogMaterials = [
    {'code': 'MAT-CEM-OPC', 'name': 'OPC Cement 50kg Bags', 'unit': 'bags'},
    {'code': 'MAT-CEM-PPC', 'name': 'PPC Cement 50kg Bags', 'unit': 'bags'},
    {'code': 'MAT-STEEL-12MM', 'name': 'TMT Rebar 12mm (Fe 500D)', 'unit': 'tons'},
    {'code': 'MAT-STEEL-16MM', 'name': 'TMT Rebar 16mm (Fe 500D)', 'unit': 'tons'},
    {'code': 'MAT-STEEL-20MM', 'name': 'TMT Rebar 20mm (Fe 500D)', 'unit': 'tons'},
    {'code': 'MAT-SAND-RIVER', 'name': 'Screened River Sand', 'unit': 'cum'},
    {'code': 'MAT-AGG-20MM', 'name': 'Crushed Aggregate 20mm', 'unit': 'cum'},
    {'code': 'MAT-BRICK-CLAY', 'name': 'First-Class Clay Bricks', 'unit': 'pcs'},
    {'code': 'MAT-DIESEL', 'name': 'Generator & Plant Diesel', 'unit': 'liters'},
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
    _supplierController = TextEditingController();
    _challanController = TextEditingController();
    _vehicleController = TextEditingController();
    _remarksController = TextEditingController();

    if (widget.projects.isNotEmpty) {
      _selectedProjectId = widget.projects.first.id;
    }

    // Initialize with one default item row
    _addItemRow(
      materialCode: _catalogMaterials.first['code']!,
      materialName: _catalogMaterials.first['name']!,
      quantity: '100',
      unit: _catalogMaterials.first['unit']!,
    );
  }

  @override
  void dispose() {
    _dateController.dispose();
    _supplierController.dispose();
    _challanController.dispose();
    _vehicleController.dispose();
    _remarksController.dispose();
    for (final row in _itemRows) {
      row.quantityController.dispose();
      row.remarksController?.dispose();
    }
    super.dispose();
  }

  String _generateUuid() {
    final rand = Random.secure();
    final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  void _addItemRow({
    String? materialCode,
    String? materialName,
    String quantity = '1',
    String? unit,
  }) {
    final def = _catalogMaterials.first;
    setState(() {
      _itemRows.add(
        MaterialItemRowState(
          materialCode: materialCode ?? def['code']!,
          materialName: materialName ?? def['name']!,
          quantityController: TextEditingController(text: quantity),
          unit: unit ?? def['unit']!,
          remarksController: TextEditingController(),
        ),
      );
    });
  }

  void _removeItemRow(int index) {
    if (_itemRows.length <= 1) return;
    setState(() {
      final removed = _itemRows.removeAt(index);
      removed.quantityController.dispose();
      removed.remarksController?.dispose();
    });
  }

  void _resetForNewDelivery() {
    setState(() {
      _clientUuid = _generateUuid();
      _savedClientUuid = null;
      _supplierController.clear();
      _challanController.clear();
      _vehicleController.clear();
      _remarksController.clear();
      _receiptPhotoIds = [];
      for (final row in _itemRows) {
        row.quantityController.dispose();
        row.remarksController?.dispose();
      }
      _itemRows.clear();
      _addItemRow(
        materialCode: _catalogMaterials.first['code']!,
        materialName: _catalogMaterials.first['name']!,
        quantity: '100',
        unit: _catalogMaterials.first['unit']!,
      );
      _statusMessage = 'Started new material delivery draft.';
    });
  }

  MaterialDeliverySubmissionDraft _buildDraft({String? uuidOverride}) {
    final items = _itemRows.map((row) {
      final qty = double.tryParse(row.quantityController.text.trim()) ?? 0.0;
      return MaterialDeliveryItem(
        materialCode: row.materialCode,
        materialName: row.materialName,
        quantity: qty,
        unit: row.unit,
        remarks: row.remarksController?.text.trim(),
      );
    }).toList();

    return MaterialDeliverySubmissionDraft(
      clientUuid: uuidOverride ?? _clientUuid,
      projectId: _selectedProjectId ?? '',
      deliveryDate: _dateController.text.trim(),
      supplierName: _supplierController.text.trim(),
      challanNumber: _challanController.text.trim(),
      vehicleNumber: _vehicleController.text.trim(),
      items: items,
      receiptPhotoIds: _receiptPhotoIds,
      remarks: _remarksController.text.trim(),
    );
  }

  Future<void> _saveLocally() async {
    if (_selectedProjectId == null || _selectedProjectId!.isEmpty) {
      setState(() => _statusMessage = 'Please select a project.');
      return;
    }
    if (_supplierController.text.trim().isEmpty) {
      setState(() => _statusMessage = 'Supplier / vendor name is required.');
      return;
    }
    if (_challanController.text.trim().isEmpty) {
      setState(() => _statusMessage = 'Challan / waybill number is required.');
      return;
    }
    if (_itemRows.isEmpty) {
      setState(() => _statusMessage = 'At least one material item is required.');
      return;
    }
    for (final row in _itemRows) {
      final qty = double.tryParse(row.quantityController.text.trim());
      if (qty == null || qty <= 0) {
        setState(() => _statusMessage = 'Please enter a valid positive quantity for ${row.materialName}.');
        return;
      }
    }

    setState(() => _isSaving = true);
    try {
      final draft = _buildDraft();
      if (_savedClientUuid != null &&
          widget.store.canEditUnsent(widget.accountId, _savedClientUuid!)) {
        widget.store.editUnsentMaterialDelivery(
          accountId: widget.accountId,
          draft: draft.withClientUuid(_savedClientUuid!),
        );
        setState(() => _statusMessage = 'Updated local material delivery draft.');
      } else {
        widget.store.saveMaterialDelivery(
          accountId: widget.accountId,
          tenantId: widget.tenantId,
          role: widget.role,
          draft: draft,
        );
        setState(() {
          _savedClientUuid = draft.clientUuid;
          _statusMessage = 'Saved MRR delivery locally in durable outbox.';
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

  void _loadSavedDraft(SavedFieldSubmission<MaterialDeliverySubmissionDraft> saved) {
    setState(() {
      _clientUuid = saved.draft.clientUuid;
      _savedClientUuid = saved.draft.clientUuid;
      _selectedProjectId = saved.draft.projectId;
      _dateController.text = saved.draft.deliveryDate;
      _supplierController.text = saved.draft.supplierName;
      _challanController.text = saved.draft.challanNumber;
      _vehicleController.text = saved.draft.vehicleNumber;
      _remarksController.text = saved.draft.remarks;
      _receiptPhotoIds = List.from(saved.draft.receiptPhotoIds);

      for (final row in _itemRows) {
        row.quantityController.dispose();
        row.remarksController?.dispose();
      }
      _itemRows.clear();
      for (final it in saved.draft.items) {
        _itemRows.add(
          MaterialItemRowState(
            materialCode: it.materialCode,
            materialName: it.materialName,
            quantityController: TextEditingController(text: it.quantity.toString()),
            unit: it.unit,
            remarksController: TextEditingController(text: it.remarks ?? ''),
          ),
        );
      }
      _statusMessage = 'Loaded saved material delivery draft.';
    });
  }

  void _duplicateForRecovery(String rejectedClientUuid) {
    try {
      final original = widget.store.getMaterialDelivery(widget.accountId, rejectedClientUuid);
      if (original == null) return;
      final newUuid = _generateUuid();
      final recoveryDraft = original.withClientUuid(newUuid);

      widget.store.saveRecoveryMaterialDelivery(
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
    final savedSubmissions = widget.store.listMaterialDeliveries(widget.accountId, widget.tenantId);
    final opState = _savedClientUuid != null
        ? widget.store.operationState(widget.accountId, _savedClientUuid!)
        : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Material Delivery & MRR'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New Delivery',
            onPressed: _resetForNewDelivery,
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

            // Office Review Notice
            _buildOfficeReviewNotice(),
            const SizedBox(height: 16),

            // Header Form Card (Project, Date, Supplier, Challan, Vehicle)
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
                      'Delivery Information',
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
                          child: TextField(
                            controller: _vehicleController,
                            decoration: const InputDecoration(
                              labelText: 'Vehicle / Truck No.',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.local_shipping_outlined),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _supplierController,
                            decoration: const InputDecoration(
                              labelText: 'Supplier / Vendor',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.storefront_outlined),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _challanController,
                            decoration: const InputDecoration(
                              labelText: 'Challan / Waybill No.',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.receipt_long_outlined),
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

            // Delivered Materials Section
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
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Delivered Materials (${_itemRows.length})',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        TextButton.icon(
                          onPressed: () => _addItemRow(),
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('Add Material'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ..._itemRows.asMap().entries.map((entry) => _buildItemRow(entry.key, entry.value)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Remarks field
            TextField(
              controller: _remarksController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Unloading Remarks / Condition Notes',
                border: OutlineInputBorder(),
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

            // Saved Deliveries List
            if (savedSubmissions.isNotEmpty) ...[
              const Divider(),
              Text(
                'Locally Saved Deliveries (${savedSubmissions.length})',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 8),
              ...savedSubmissions.map((s) => _buildSavedDeliveryTile(s)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildItemRow(int index, MaterialItemRowState row) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                flex: 3,
                child: DropdownButtonFormField<String>(
                  initialValue: row.materialCode,
                  decoration: const InputDecoration(
                    labelText: 'Material',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  items: _catalogMaterials
                      .map(
                        (m) => DropdownMenuItem(
                          value: m['code'],
                          child: Text(m['name']!, overflow: TextOverflow.ellipsis),
                        ),
                      )
                      .toList(),
                  onChanged: (val) {
                    if (val != null) {
                      final found = _catalogMaterials.firstWhere((m) => m['code'] == val);
                      setState(() {
                        row.materialCode = found['code']!;
                        row.materialName = found['name']!;
                        row.unit = found['unit']!;
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextField(
                  controller: row.quantityController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Qty (${row.unit})',
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
              if (_itemRows.length > 1)
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline, color: Colors.redAccent),
                  tooltip: 'Remove',
                  onPressed: () => _removeItemRow(index),
                ),
            ],
          ),
        ],
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
                    ? 'All deliveries fully synced'
                    : '${health.pendingOperationCount} pending outbox delivery(ies)',
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

  Widget _buildOfficeReviewNotice() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.verified_outlined, color: Colors.amber, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Material delivery submissions land in pending review status. Inventory stock and daily report reconciliation updates are computed server-side upon office authorization.',
              style: TextStyle(fontSize: 12, color: Colors.brown.shade900),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSavedDeliveryTile(
    SavedFieldSubmission<MaterialDeliverySubmissionDraft> saved,
  ) {
    final isCurrent = saved.draft.clientUuid == _savedClientUuid;
    final isRejected = saved.operationState == 'rejected';

    final totalItemsCount = saved.draft.items.length;
    final itemSummary = saved.draft.items
        .map((it) => '${it.quantity} ${it.unit} ${it.materialName}')
        .take(2)
        .join(', ');

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
          '${saved.draft.supplierName} (Challan: ${saved.draft.challanNumber})',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        ),
        subtitle: Text(
          '$totalItemsCount item(s): $itemSummary · ${saved.draft.deliveryDate}',
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
