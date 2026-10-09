import 'dart:math' as math;
import 'worksheet_kernel_interface.dart';

/// Single cell internal storage representation
class _InternalCell {
  final String ref;
  CellValue value;
  String? formula;
  Set<String> dependencies = {}; // Cells this cell depends on

  _InternalCell({
    required this.ref,
  }) : value = const CellValue.empty();
}

/// Topologically sorted dependent order packet
class _TopoResult {
  final List<String> sortedRefs;
  final bool hasCycles;
  const _TopoResult(this.sortedRefs, this.hasCycles);
}

/// Candidate A: Pure Dart Worksheet Recalculation Kernel (M01-T07)
class DartWorksheetKernel implements WorksheetKernel {
  final Map<String, _InternalCell> _cells = {};
  final Map<String, Set<String>> _dependents = {}; // Reverse index: A -> [cells depending on A]

  @override
  void clear() {
    _cells.clear();
    _dependents.clear();
  }

  _InternalCell _getOrCreateCell(String cellRef) {
    final norm = cellRef.trim().toUpperCase();
    return _cells.putIfAbsent(norm, () => _InternalCell(ref: norm));
  }

  @override
  void setCellNumber(String cellRef, num value) {
    final cell = _getOrCreateCell(cellRef);
    _clearOldDependencies(cell);
    cell.formula = null;
    cell.value = CellValue.number(value);
  }

  @override
  void setCellText(String cellRef, String value) {
    final cell = _getOrCreateCell(cellRef);
    _clearOldDependencies(cell);
    cell.formula = null;
    cell.value = CellValue.text(value);
  }

  @override
  void setCellFormula(String cellRef, String formula) {
    final cell = _getOrCreateCell(cellRef);
    _clearOldDependencies(cell);
    cell.formula = formula.trim().startsWith('=') ? formula.trim() : '=$formula';

    // Parse and register dependencies
    final deps = _extractFormulaDependencies(cell.formula!);
    cell.dependencies = deps;

    for (final dep in deps) {
      _dependents.putIfAbsent(dep, () => {}).add(cell.ref);
    }

    // Immediate self-reference check
    if (cell.dependencies.contains(cell.ref)) {
      cell.value = CellValue.cycleError;
      return;
    }

    // Evaluate formula immediately
    cell.value = _evaluateFormula(cell.formula!, cell.ref, <String>{});
  }

  @override
  CellValue getCellValue(String cellRef) {
    final norm = cellRef.trim().toUpperCase();
    return _cells[norm]?.value ?? const CellValue.empty();
  }

  @override
  String? getCellFormula(String cellRef) {
    final norm = cellRef.trim().toUpperCase();
    return _cells[norm]?.formula;
  }

  void _clearOldDependencies(_InternalCell cell) {
    for (final dep in cell.dependencies) {
      _dependents[dep]?.remove(cell.ref);
    }
    cell.dependencies.clear();
  }

  @override
  RecalcResult recalculateDirtySubgraph(String changedCellRef) {
    final stopwatch = Stopwatch()..start();
    final norm = changedCellRef.trim().toUpperCase();

    // 1. Gather all downstream dependents and sort topologically via Kahn's algorithm
    final sortResult = _topologicalSortDependents(norm);
    final affected = <String>[];
    bool hasCycle = sortResult.hasCycles;

    // 2. Recompute in topological order
    for (final ref in sortResult.sortedRefs) {
      final cell = _cells[ref];
      if (cell != null && cell.formula != null) {
        final visiting = <String>{};
        cell.value = _evaluateFormula(cell.formula!, cell.ref, visiting);
        if (cell.value == CellValue.cycleError) {
          hasCycle = true;
        }
        affected.add(cell.ref);
      }
    }

    stopwatch.stop();
    return RecalcResult(
      recomputedCellCount: affected.length,
      elapsedMicroseconds: stopwatch.elapsedMicroseconds.toDouble(),
      affectedCells: affected,
      hasCycles: hasCycle,
    );
  }

  @override
  RecalcResult recalculateAll() {
    final stopwatch = Stopwatch()..start();
    final allFormulaRefs = _cells.values.where((c) => c.formula != null).map((c) => c.ref).toList();

    // Topological sort of all formula cells
    final inDegree = <String, int>{};
    for (final ref in allFormulaRefs) {
      inDegree[ref] = 0;
    }

    for (final ref in allFormulaRefs) {
      final cell = _cells[ref]!;
      for (final dep in cell.dependencies) {
        if (inDegree.containsKey(dep)) {
          inDegree[ref] = (inDegree[ref] ?? 0) + 1;
        }
      }
    }

    final queue = <String>[];
    inDegree.forEach((ref, deg) {
      if (deg == 0) queue.add(ref);
    });

    final sorted = <String>[];
    while (queue.isNotEmpty) {
      final u = queue.removeAt(0);
      sorted.add(u);

      final deps = _dependents[u] ?? {};
      for (final v in deps) {
        if (inDegree.containsKey(v)) {
          inDegree[v] = inDegree[v]! - 1;
          if (inDegree[v] == 0) queue.add(v);
        }
      }
    }

    // Evaluate
    bool hasCycles = sorted.length < allFormulaRefs.length;
    for (final ref in sorted) {
      final cell = _cells[ref];
      if (cell != null && cell.formula != null) {
        cell.value = _evaluateFormula(cell.formula!, cell.ref, <String>{});
      }
    }

    // Flag remaining cyclic cells
    if (hasCycles) {
      for (final ref in allFormulaRefs) {
        if (!sorted.contains(ref)) {
          _cells[ref]?.value = CellValue.cycleError;
        }
      }
    }

    stopwatch.stop();
    return RecalcResult(
      recomputedCellCount: sorted.length,
      elapsedMicroseconds: stopwatch.elapsedMicroseconds.toDouble(),
      affectedCells: sorted,
      hasCycles: hasCycles,
    );
  }

  _TopoResult _topologicalSortDependents(String sourceRef) {
    final reachable = <String>{};
    final queue = <String>[sourceRef];
    while (queue.isNotEmpty) {
      final curr = queue.removeAt(0);
      final deps = _dependents[curr] ?? {};
      for (final dep in deps) {
        if (!reachable.contains(dep)) {
          reachable.add(dep);
          queue.add(dep);
        }
      }
    }

    if (reachable.isEmpty) return _TopoResult([], false);

    final inDegree = <String, int>{};
    for (final ref in reachable) {
      inDegree[ref] = 0;
    }

    for (final ref in reachable) {
      final cell = _cells[ref];
      if (cell != null) {
        for (final dep in cell.dependencies) {
          if (reachable.contains(dep)) {
            inDegree[ref] = (inDegree[ref] ?? 0) + 1;
          }
        }
      }
    }

    final kQueue = <String>[];
    inDegree.forEach((ref, deg) {
      if (deg == 0) kQueue.add(ref);
    });

    final sorted = <String>[];
    while (kQueue.isNotEmpty) {
      final u = kQueue.removeAt(0);
      sorted.add(u);

      final nexts = _dependents[u] ?? {};
      for (final v in nexts) {
        if (inDegree.containsKey(v)) {
          inDegree[v] = inDegree[v]! - 1;
          if (inDegree[v] == 0) {
            kQueue.add(v);
          }
        }
      }
    }

    final hasCycles = sorted.length < reachable.length;
    if (hasCycles) {
      for (final ref in reachable) {
        if (!sorted.contains(ref)) {
          _cells[ref]?.value = CellValue.cycleError;
        }
      }
    }

    return _TopoResult(sorted, hasCycles);
  }

  Set<String> _extractFormulaDependencies(String formula) {
    final deps = <String>{};
    final body = formula.startsWith('=') ? formula.substring(1) : formula;

    // Match ranges like A1:B10
    final rangeRegex = RegExp(r'\b([A-Z]+[0-9]+):([A-Z]+[0-9]+)\b');
    for (final match in rangeRegex.allMatches(body)) {
      final start = CellAddress.fromA1(match.group(1)!);
      final end = CellAddress.fromA1(match.group(2)!);
      if (start != null && end != null) {
        final rMin = math.min(start.row, end.row);
        final rMax = math.max(start.row, end.row);
        final cMin = math.min(start.col, end.col);
        final cMax = math.max(start.col, end.col);

        for (int r = rMin; r <= rMax; r++) {
          for (int c = cMin; c <= cMax; c++) {
            deps.add(CellAddress(r, c).toA1());
          }
        }
      }
    }

    // Match single cell references like A1, B22
    final singleRegex = RegExp(r'\b([A-Z]+[0-9]+)\b');
    for (final match in singleRegex.allMatches(body)) {
      final a1 = match.group(1)!;
      // Exclude function names
      if (!{'SUM', 'AVERAGE', 'MIN', 'MAX', 'ROUND', 'IF', 'TODAY', 'NOW'}.contains(a1)) {
        deps.add(a1);
      }
    }

    return deps;
  }

  CellValue _evaluateFormula(String formula, String selfRef, Set<String> visiting) {
    if (visiting.contains(selfRef)) {
      return CellValue.cycleError;
    }
    visiting.add(selfRef);

    try {
      final expr = formula.startsWith('=') ? formula.substring(1).trim() : formula.trim();

      // Check volatile functions
      if (expr.toUpperCase() == 'TODAY()') {
        final now = DateTime.now().toUtc();
        return CellValue.text(
            '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}');
      }
      if (expr.toUpperCase() == 'NOW()') {
        return CellValue.text(DateTime.now().toUtc().toIso8601String());
      }

      // Check function calls: SUM, AVERAGE, MIN, MAX, ROUND, IF
      if (expr.toUpperCase().startsWith('SUM(') && expr.endsWith(')')) {
        return _evalSum(expr.substring(4, expr.length - 1));
      }
      if (expr.toUpperCase().startsWith('AVERAGE(') && expr.endsWith(')')) {
        return _evalAverage(expr.substring(8, expr.length - 1));
      }
      if (expr.toUpperCase().startsWith('MIN(') && expr.endsWith(')')) {
        return _evalMinMax(expr.substring(4, expr.length - 1), isMin: true);
      }
      if (expr.toUpperCase().startsWith('MAX(') && expr.endsWith(')')) {
        return _evalMinMax(expr.substring(4, expr.length - 1), isMin: false);
      }
      if (expr.toUpperCase().startsWith('ROUND(') && expr.endsWith(')')) {
        return _evalRound(expr.substring(6, expr.length - 1));
      }

      // Check for division
      if (expr.contains('/')) {
        final parts = expr.split('/');
        if (parts.length == 2) {
          final leftVal = _resolveOperand(parts[0].trim());
          final rightVal = _resolveOperand(parts[1].trim());

          if (leftVal.isError) return leftVal;
          if (rightVal.isError) return rightVal;

          final rightNum = rightVal.asNumber;
          if (rightNum == null) return CellValue.valueError;
          if (rightNum == 0) return CellValue.divByZero;

          final leftNum = leftVal.asNumber;
          if (leftNum == null) return CellValue.valueError;

          final res = leftNum / rightNum;
          if (res.isInfinite) return CellValue.numError;
          return CellValue.number(res);
        }
      }

      // Check for multiplication
      if (expr.contains('*')) {
        final parts = expr.split('*');
        if (parts.length == 2) {
          final leftVal = _resolveOperand(parts[0].trim());
          final rightVal = _resolveOperand(parts[1].trim());

          if (leftVal.isError) return leftVal;
          if (rightVal.isError) return rightVal;

          final leftNum = leftVal.asNumber;
          final rightNum = rightVal.asNumber;
          if (leftNum == null || rightNum == null) return CellValue.valueError;

          final res = leftNum * rightNum;
          if (res.isInfinite) return CellValue.numError;
          return CellValue.number(res);
        }
      }

      // Check for addition
      if (expr.contains('+')) {
        final parts = expr.split('+');
        if (parts.length == 2) {
          final leftVal = _resolveOperand(parts[0].trim());
          final rightVal = _resolveOperand(parts[1].trim());

          if (leftVal.isError) return leftVal;
          if (rightVal.isError) return rightVal;

          final leftNum = leftVal.asNumber;
          final rightNum = rightVal.asNumber;
          if (leftNum == null || rightNum == null) return CellValue.valueError;

          final res = leftNum + rightNum;
          if (res.isInfinite) return CellValue.numError;
          return CellValue.number(res);
        }
      }

      // Check for subtraction
      if (expr.contains('-') && !expr.startsWith('-')) {
        final parts = expr.split('-');
        if (parts.length == 2) {
          final leftVal = _resolveOperand(parts[0].trim());
          final rightVal = _resolveOperand(parts[1].trim());

          if (leftVal.isError) return leftVal;
          if (rightVal.isError) return rightVal;

          final leftNum = leftVal.asNumber;
          final rightNum = rightVal.asNumber;
          if (leftNum == null || rightNum == null) return CellValue.valueError;

          final res = leftNum - rightNum;
          if (res.isInfinite) return CellValue.numError;
          return CellValue.number(res);
        }
      }

      // Single operand / cell reference
      return _resolveOperand(expr);
    } catch (_) {
      return CellValue.nameError;
    } finally {
      visiting.remove(selfRef);
    }
  }

  CellValue _resolveOperand(String operand) {
    if (operand.isEmpty) return const CellValue.empty();

    // Numeric literal
    final n = num.tryParse(operand);
    if (n != null) return CellValue.number(n);

    // String literal with quotes
    if ((operand.startsWith('"') && operand.endsWith('"')) ||
        (operand.startsWith("'") && operand.endsWith("'"))) {
      return CellValue.text(operand.substring(1, operand.length - 1));
    }

    // Cell reference
    final ref = operand.toUpperCase();
    if (_cells.containsKey(ref)) {
      return _cells[ref]!.value;
    }

    // Cell address exists in notation but empty
    if (CellAddress.fromA1(ref) != null) {
      return const CellValue.number(0); // Excel treats blank referenced cells as 0 in arithmetic
    }

    return CellValue.nameError;
  }

  CellValue _evalSum(String rangeArgs) {
    final numbers = _collectRangeNumbers(rangeArgs);
    double total = 0.0;
    for (final num in numbers) {
      total += num;
    }
    return CellValue.number(total);
  }

  CellValue _evalAverage(String rangeArgs) {
    final numbers = _collectRangeNumbers(rangeArgs);
    if (numbers.isEmpty) return CellValue.divByZero;
    double total = 0.0;
    for (final num in numbers) {
      total += num;
    }
    return CellValue.number(total / numbers.length);
  }

  CellValue _evalMinMax(String rangeArgs, {required bool isMin}) {
    final numbers = _collectRangeNumbers(rangeArgs);
    if (numbers.isEmpty) return const CellValue.number(0);
    num best = numbers.first;
    for (final n in numbers) {
      if (isMin ? (n < best) : (n > best)) best = n;
    }
    return CellValue.number(best);
  }

  CellValue _evalRound(String args) {
    final parts = args.split(',');
    if (parts.isEmpty) return CellValue.valueError;
    final val = _resolveOperand(parts[0].trim()).asNumber;
    if (val == null) return CellValue.valueError;
    final digits = parts.length > 1 ? (int.tryParse(parts[1].trim()) ?? 0) : 0;
    final mod = math.pow(10, digits);
    return CellValue.number((val * mod).round() / mod);
  }

  List<num> _collectRangeNumbers(String rangeStr) {
    final numbers = <num>[];
    final ranges = rangeStr.split(',');

    for (final part in ranges) {
      final trimmed = part.trim().toUpperCase();
      if (trimmed.contains(':')) {
        final pair = trimmed.split(':');
        final start = CellAddress.fromA1(pair[0].trim());
        final end = CellAddress.fromA1(pair[1].trim());
        if (start != null && end != null) {
          final rMin = math.min(start.row, end.row);
          final rMax = math.max(start.row, end.row);
          final cMin = math.min(start.col, end.col);
          final cMax = math.max(start.col, end.col);

          for (int r = rMin; r <= rMax; r++) {
            for (int c = cMin; c <= cMax; c++) {
              final ref = CellAddress(r, c).toA1();
              final val = _cells[ref]?.value.asNumber;
              if (val != null) numbers.add(val);
            }
          }
        }
      } else {
        final v = _resolveOperand(trimmed).asNumber;
        if (v != null) numbers.add(v);
      }
    }
    return numbers;
  }
}
