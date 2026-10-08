/// Cell value wrapper supporting numbers, strings, booleans, and Excel-compatible error tokens
class CellValue {
  final dynamic raw;
  final bool isError;
  final String? errorMessage;

  const CellValue.number(num val)
      : raw = val,
        isError = false,
        errorMessage = null;

  const CellValue.text(String val)
      : raw = val,
        isError = false,
        errorMessage = null;

  const CellValue.boolean(bool val)
      : raw = val,
        isError = false,
        errorMessage = null;

  const CellValue.empty()
      : raw = null,
        isError = false,
        errorMessage = null;

  const CellValue.error(String code)
      : raw = code,
        isError = true,
        errorMessage = code;

  static const CellValue divByZero = CellValue.error('#DIV/0!');
  static const CellValue valueError = CellValue.error('#VALUE!');
  static const CellValue nameError = CellValue.error('#NAME?');
  static const CellValue cycleError = CellValue.error('#CYCLE!');
  static const CellValue refError = CellValue.error('#REF!');
  static const CellValue numError = CellValue.error('#NUM!');

  num? get asNumber => raw is num ? (raw as num) : (num.tryParse(raw.toString()));
  String get asString => raw?.toString() ?? '';

  @override
  String toString() => isError ? (errorMessage ?? '#ERROR!') : (raw?.toString() ?? '');

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CellValue && runtimeType == other.runtimeType && raw == other.raw && isError == other.isError;

  @override
  int get hashCode => raw.hashCode ^ isError.hashCode;
}

/// Address helper converting between Excel A1 notation and zero-indexed (row, col)
class CellAddress {
  final int row;
  final int col;

  const CellAddress(this.row, this.col);

  String toA1() {
    int c = col;
    String colStr = '';
    while (c >= 0) {
      colStr = String.fromCharCode(65 + (c % 26)) + colStr;
      c = (c ~/ 26) - 1;
    }
    return '$colStr${row + 1}';
  }

  static CellAddress? fromA1(String a1) {
    final clean = a1.trim().toUpperCase();
    final match = RegExp(r'^([A-Z]+)([0-9]+)$').firstMatch(clean);
    if (match == null) return null;

    final letters = match.group(1)!;
    final rowNum = int.tryParse(match.group(2)!) ?? 1;

    int colIndex = 0;
    for (int i = 0; i < letters.length; i++) {
      colIndex = colIndex * 26 + (letters.codeUnitAt(i) - 64);
    }
    return CellAddress(rowNum - 1, colIndex - 1);
  }

  @override
  String toString() => toA1();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is CellAddress && row == other.row && col == other.col;

  @override
  int get hashCode => row.hashCode ^ col.hashCode;
}

/// Result packet from an engine recalculation pass
class RecalcResult {
  final int recomputedCellCount;
  final double elapsedMicroseconds;
  final List<String> affectedCells;
  final bool hasCycles;

  const RecalcResult({
    required this.recomputedCellCount,
    required this.elapsedMicroseconds,
    required this.affectedCells,
    this.hasCycles = false,
  });

  double get elapsedMs => elapsedMicroseconds / 1000.0;
}

/// Abstract contract for worksheet calculation engines (M01-T07)
abstract class WorksheetKernel {
  void setCellNumber(String cellRef, num value);
  void setCellText(String cellRef, String value);
  void setCellFormula(String cellRef, String formula);

  CellValue getCellValue(String cellRef);
  String? getCellFormula(String cellRef);

  /// Incrementally recomputes only the dirty subgraph affected by [changedCellRef]
  RecalcResult recalculateDirtySubgraph(String changedCellRef);

  /// Performs full topological recalculation of all cells
  RecalcResult recalculateAll();

  void clear();
}
