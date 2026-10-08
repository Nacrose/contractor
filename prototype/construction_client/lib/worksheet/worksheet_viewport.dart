import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Representation of a single Bill of Quantities (BoQ) worksheet row
class BoqRowItem {
  final int index;
  String itemNo;
  String description;
  String unit;
  double quantity;
  double rate;

  BoqRowItem({
    required this.index,
    required this.itemNo,
    required this.description,
    required this.unit,
    required this.quantity,
    required this.rate,
  });

  double get amount => quantity * rate;
}

/// 50,000-Row Virtualized Worksheet Grid Prototype (M01-T04)
class WorksheetViewport extends StatefulWidget {
  final int totalRows;

  const WorksheetViewport({
    super.key,
    this.totalRows = 50000,
  });

  @override
  State<WorksheetViewport> createState() => _WorksheetViewportState();
}

class _WorksheetViewportState extends State<WorksheetViewport> {
  static const double rowHeight = 36.0;
  static const int columnCount = 6; // ItemNo, Desc, Unit, Qty, Rate, Amount

  late List<BoqRowItem> _rows;
  final ScrollController _scrollController = ScrollController();
  final FocusNode _gridFocusNode = FocusNode();
  final TextEditingController _editController = TextEditingController();

  int _selectedRow = 0;
  int _selectedCol = 0; // Default to Item No (col 0)
  bool _isEditing = false;
  String _statusMessage = 'Ready (50,000 Rows Virtualized)';

  @override
  void initState() {
    super.initState();
    _initialize50kDataset();
  }

  void _initialize50kDataset() {
    // Generate 50,000 deterministic BoQ items in memory
    _rows = List.generate(widget.totalRows, (i) {
      final codeMajor = (i ~/ 100) + 1;
      final codeMinor = (i % 100) + 1;
      final itemNo = '$codeMajor.${codeMinor < 10 ? "0$codeMinor" : codeMinor}';

      String desc;
      String unit;
      double qty;
      double rate;

      switch (i % 5) {
        case 0:
          desc = 'Earthwork excavation in foundation trenches';
          unit = 'm³';
          qty = 250.0 + (i % 50);
          rate = 450.0;
          break;
        case 1:
          desc = 'PCC 1:2:4 stone aggregate in foundation';
          unit = 'm³';
          qty = 85.0 + (i % 20);
          rate = 8500.0;
          break;
        case 2:
          desc = 'Tor steel reinforcement bars Fe500';
          unit = 'kg';
          qty = 4500.0 + (i % 200);
          rate = 115.0;
          break;
        case 3:
          desc = 'First class brick work in 1:4 cement sand mortar';
          unit = 'm³';
          qty = 120.0 + (i % 30);
          rate = 14200.0;
          break;
        default:
          desc = '12mm cement plaster 1:4 with neat cement wash';
          unit = 'm²';
          qty = 600.0 + (i % 80);
          rate = 265.0;
      }

      return BoqRowItem(
        index: i,
        itemNo: itemNo,
        description: desc,
        unit: unit,
        quantity: qty,
        rate: rate,
      );
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _gridFocusNode.dispose();
    _editController.dispose();
    super.dispose();
  }

  void _jumpToRow(int targetRow) {
    if (targetRow < 0 || targetRow >= _rows.length) return;
    setState(() {
      _selectedRow = targetRow;
      _isEditing = false;
    });

    if (_scrollController.hasClients) {
      final targetOffset = (targetRow * rowHeight).clamp(
        0.0,
        _scrollController.position.maxScrollExtent,
      );
      _scrollController.jumpTo(targetOffset);
    }
    _gridFocusNode.requestFocus();
  }

  void _startEditing() {
    if (_selectedCol == 0 || _selectedCol == 5) return; // ItemNo and Amount are read-only

    final item = _rows[_selectedRow];
    String currentVal = '';
    switch (_selectedCol) {
      case 1:
        currentVal = item.description;
        break;
      case 2:
        currentVal = item.unit;
        break;
      case 3:
        currentVal = item.quantity.toString();
        break;
      case 4:
        currentVal = item.rate.toString();
        break;
    }

    _editController.text = currentVal;
    _editController.selection = TextSelection(baseOffset: 0, extentOffset: currentVal.length);
    setState(() => _isEditing = true);
  }

  void _commitEdit() {
    if (!_isEditing) return;
    final item = _rows[_selectedRow];
    final text = _editController.text.trim();

    setState(() {
      switch (_selectedCol) {
        case 1:
          if (text.isNotEmpty) item.description = text;
          break;
        case 2:
          if (text.isNotEmpty) item.unit = text;
          break;
        case 3:
          final q = double.tryParse(text);
          if (q != null && q >= 0) item.quantity = q;
          break;
        case 4:
          final r = double.tryParse(text);
          if (r != null && r >= 0) item.rate = r;
          break;
      }
      _isEditing = false;
      _statusMessage = 'Row ${_selectedRow + 1} updated (${item.itemNo})';
    });
    _gridFocusNode.requestFocus();
  }

  void _cancelEdit() {
    setState(() => _isEditing = false);
    _gridFocusNode.requestFocus();
  }

  Future<void> _copySelectedCell() async {
    final item = _rows[_selectedRow];
    String textToCopy = '';
    switch (_selectedCol) {
      case 0:
        textToCopy = item.itemNo;
        break;
      case 1:
        textToCopy = item.description;
        break;
      case 2:
        textToCopy = item.unit;
        break;
      case 3:
        textToCopy = item.quantity.toString();
        break;
      case 4:
        textToCopy = item.rate.toString();
        break;
      case 5:
        textToCopy = item.amount.toStringAsFixed(2);
        break;
    }

    await Clipboard.setData(ClipboardData(text: textToCopy));
    setState(() => _statusMessage = 'Copied "$textToCopy" to clipboard');
  }

  Future<void> _pasteToSelectedCell() async {
    if (_selectedCol == 0 || _selectedCol == 5) return;
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text == null) return;

    _editController.text = data!.text!;
    _startEditing();
    _commitEdit();
    setState(() => _statusMessage = 'Pasted "${data.text}" into Row ${_selectedRow + 1}');
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;

    if (_isEditing) {
      if (event.logicalKey == LogicalKeyboardKey.enter || event.logicalKey == LogicalKeyboardKey.numpadEnter) {
        _commitEdit();
        return KeyEventResult.handled;
      } else if (event.logicalKey == LogicalKeyboardKey.escape) {
        _cancelEdit();
        return KeyEventResult.handled;
      }
      return KeyEventResult.ignored;
    }

    final isModifierPressed = HardwareKeyboard.instance.isMetaPressed ||
        HardwareKeyboard.instance.isControlPressed ||
        HardwareKeyboard.instance.logicalKeysPressed.contains(LogicalKeyboardKey.control) ||
        HardwareKeyboard.instance.logicalKeysPressed.contains(LogicalKeyboardKey.controlLeft) ||
        HardwareKeyboard.instance.logicalKeysPressed.contains(LogicalKeyboardKey.controlRight);

    // Handle Ctrl+C / Cmd+C
    if (isModifierPressed && event.logicalKey == LogicalKeyboardKey.keyC) {
      _copySelectedCell();
      return KeyEventResult.handled;
    }

    // Handle Ctrl+V / Cmd+V
    if (isModifierPressed && event.logicalKey == LogicalKeyboardKey.keyV) {
      _pasteToSelectedCell();
      return KeyEventResult.handled;
    }

    // Navigation Keys
    if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
      if (_selectedRow < _rows.length - 1) {
        setState(() => _selectedRow++);
        _ensureVisible(_selectedRow);
      }
      return KeyEventResult.handled;
    } else if (event.logicalKey == LogicalKeyboardKey.arrowUp) {
      if (_selectedRow > 0) {
        setState(() => _selectedRow--);
        _ensureVisible(_selectedRow);
      }
      return KeyEventResult.handled;
    } else if (event.logicalKey == LogicalKeyboardKey.arrowRight) {
      if (_selectedCol < columnCount - 1) {
        setState(() => _selectedCol++);
      }
      return KeyEventResult.handled;
    } else if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
      if (_selectedCol > 0) {
        setState(() => _selectedCol--);
      }
      return KeyEventResult.handled;
    } else if (event.logicalKey == LogicalKeyboardKey.tab) {
      if (HardwareKeyboard.instance.isShiftPressed) {
        if (_selectedCol > 0) {
          setState(() => _selectedCol--);
        } else if (_selectedRow > 0) {
          setState(() {
            _selectedRow--;
            _selectedCol = columnCount - 1;
          });
          _ensureVisible(_selectedRow);
        }
      } else {
        if (_selectedCol < columnCount - 1) {
          setState(() => _selectedCol++);
        } else if (_selectedRow < _rows.length - 1) {
          setState(() {
            _selectedRow++;
            _selectedCol = 0;
          });
          _ensureVisible(_selectedRow);
        }
      }
      return KeyEventResult.handled;
    } else if (event.logicalKey == LogicalKeyboardKey.enter || event.logicalKey == LogicalKeyboardKey.numpadEnter) {
      _startEditing();
      return KeyEventResult.handled;
    }

    return KeyEventResult.ignored;
  }

  void _ensureVisible(int rowIndex) {
    if (!_scrollController.hasClients) return;
    final itemTop = rowIndex * rowHeight;
    final itemBottom = itemTop + rowHeight;
    final viewportTop = _scrollController.offset;
    final viewportBottom = viewportTop + _scrollController.position.viewportDimension;

    if (itemTop < viewportTop) {
      _scrollController.jumpTo(itemTop);
    } else if (itemBottom > viewportBottom) {
      _scrollController.jumpTo(itemBottom - _scrollController.position.viewportDimension);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: _gridFocusNode,
      autofocus: true,
      onKeyEvent: _handleKey,
      child: Column(
        children: [
          // Toolbar: Navigation, Jump to Row, and Status
          _buildToolbar(),

          // Grid Column Header
          _buildHeaderRow(),

          // Virtualized Grid List
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              itemCount: _rows.length,
              itemExtent: rowHeight,
              itemBuilder: (context, index) {
                final item = _rows[index];
                final isRowSelected = index == _selectedRow;

                return Container(
                  height: rowHeight,
                  decoration: BoxDecoration(
                    color: isRowSelected
                        ? const Color(0xFF06B6D4).withValues(alpha: 0.12)
                        : (index % 2 == 0 ? const Color(0xFF0F172A) : const Color(0xFF1E293B)),
                    border: Border(
                      bottom: BorderSide(color: const Color(0xFF334155).withValues(alpha: 0.5), width: 0.5),
                      left: isRowSelected
                          ? const BorderSide(color: Color(0xFF06B6D4), width: 3)
                          : BorderSide.none,
                    ),
                  ),
                  child: Row(
                    children: [
                      _buildCell(index, 0, item.itemNo, width: 80, align: TextAlign.center),
                      _buildCell(index, 1, item.description, flex: 3),
                      _buildCell(index, 2, item.unit, width: 60, align: TextAlign.center),
                      _buildCell(index, 3, item.quantity.toStringAsFixed(1), width: 100, align: TextAlign.right),
                      _buildCell(index, 4, 'NPR ${item.rate.toStringAsFixed(0)}', width: 120, align: TextAlign.right),
                      _buildCell(index, 5, 'NPR ${item.amount.toStringAsFixed(0)}', width: 140, align: TextAlign.right, isBold: true),
                    ],
                  ),
                );
              },
            ),
          ),

          // Footer Status Bar
          _buildStatusBar(),
        ],
      ),
    );
  }

  Widget _buildToolbar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: const Color(0xFF1E293B),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.table_view, color: Color(0xFF06B6D4), size: 20),
              const SizedBox(width: 8),
              Text(
                'Virtualized Worksheet (${_rows.length.toString()} Rows)',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              ),
            ],
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              OutlinedButton(
                onPressed: () => _jumpToRow(0),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4)),
                child: const Text('Top (Row 1)', style: TextStyle(fontSize: 11)),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => _jumpToRow(25000),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4)),
                child: const Text('Mid (Row 25k)', style: TextStyle(fontSize: 11)),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => _jumpToRow(_rows.length - 1),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4)),
                child: const Text('End (Row 50k)', style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderRow() {
    return Container(
      height: 32,
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        border: Border(bottom: BorderSide(color: Color(0xFF475569), width: 1)),
      ),
      child: Row(
        children: const [
          SizedBox(width: 80, child: Center(child: Text('Item No', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))))),
          Expanded(flex: 3, child: Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('Description', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))))),
          SizedBox(width: 60, child: Center(child: Text('Unit', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))))),
          SizedBox(width: 100, child: Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('Quantity', textAlign: TextAlign.right, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))))),
          SizedBox(width: 120, child: Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('Rate', textAlign: TextAlign.right, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))))),
          SizedBox(width: 140, child: Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('Amount', textAlign: TextAlign.right, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))))),
        ],
      ),
    );
  }

  Widget _buildCell(
    int rowIndex,
    int colIndex,
    String text, {
    double? width,
    int? flex,
    TextAlign align = TextAlign.left,
    bool isBold = false,
  }) {
    final isRowSelected = rowIndex == _selectedRow;
    final isCellSelected = isRowSelected && _selectedCol == colIndex;

    Widget cellContent;
    if (_isEditing && isCellSelected) {
      cellContent = TextField(
        controller: _editController,
        autofocus: true,
        style: const TextStyle(fontSize: 12, color: Colors.white),
        decoration: const InputDecoration(
          isDense: true,
          contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          border: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF06B6D4))),
        ),
        onSubmitted: (_) => _commitEdit(),
      );
    } else {
      cellContent = Text(
        text,
        textAlign: align,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 12,
          fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
          color: isCellSelected ? const Color(0xFF06B6D4) : Colors.white,
        ),
      );
    }

    Widget cellWidget = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) {
        setState(() {
          _selectedRow = rowIndex;
          _selectedCol = colIndex;
          _isEditing = false;
        });
        _gridFocusNode.requestFocus();
      },
      onTap: () {
        setState(() {
          _selectedRow = rowIndex;
          _selectedCol = colIndex;
          _isEditing = false;
        });
        _gridFocusNode.requestFocus();
      },
      onDoubleTap: () {
        setState(() {
          _selectedRow = rowIndex;
          _selectedCol = colIndex;
        });
        _startEditing();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          border: isCellSelected && !_isEditing
              ? Border.all(color: const Color(0xFF06B6D4), width: 1.2)
              : null,
        ),
        alignment: align == TextAlign.center
            ? Alignment.center
            : (align == TextAlign.right ? Alignment.centerRight : Alignment.centerLeft),
        child: cellContent,
      ),
    );

    if (width != null) {
      return SizedBox(width: width, child: cellWidget);
    } else {
      return Expanded(flex: flex ?? 1, child: cellWidget);
    }
  }

  Widget _buildStatusBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      color: const Color(0xFF0B132B),
      child: Wrap(
        spacing: 16,
        runSpacing: 4,
        alignment: WrapAlignment.spaceBetween,
        children: [
          Text('Selected: Row ${_selectedRow + 1}, Col ${_selectedCol + 1}',
              style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          Text(_statusMessage, style: const TextStyle(fontSize: 11, color: Color(0xFF06B6D4))),
          const Text('Arrows/Tab: Move | Enter: Edit | Ctrl+C/V: Copy/Paste',
              style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
        ],
      ),
    );
  }
}
