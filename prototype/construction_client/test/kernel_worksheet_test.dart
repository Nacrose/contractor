import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/worksheet/kernel/worksheet_kernel_interface.dart';
import 'package:construction_client/worksheet/kernel/dart_worksheet_kernel.dart';
import 'package:construction_client/worksheet/kernel/rust_bridge_benchmark.dart';

void main() {
  group('Worksheet Kernel (Candidate A: Dart) Unit Tests (M01-T07)', () {
    late DartWorksheetKernel kernel;

    setUp(() {
      kernel = DartWorksheetKernel();
    });

    test('Basic arithmetic evaluation and cell references', () {
      kernel.setCellNumber('A1', 10);
      kernel.setCellNumber('A2', 20);
      kernel.setCellFormula('A3', '=A1 + A2');
      kernel.setCellFormula('A4', '=A3 * 2');
      kernel.setCellFormula('A5', '=A4 - 15');
      kernel.setCellFormula('A6', '=A5 / 3');

      expect(kernel.getCellValue('A3').asNumber, equals(30.0));
      expect(kernel.getCellValue('A4').asNumber, equals(60.0));
      expect(kernel.getCellValue('A5').asNumber, equals(45.0));
      expect(kernel.getCellValue('A6').asNumber, equals(15.0));
    });

    test('Range aggregate formulas: SUM, AVERAGE, MIN, MAX, ROUND', () {
      kernel.setCellNumber('B1', 10.5);
      kernel.setCellNumber('B2', 20.25);
      kernel.setCellNumber('B3', 30.75);
      kernel.setCellNumber('B4', 40.0);

      kernel.setCellFormula('C1', '=SUM(B1:B4)');
      kernel.setCellFormula('C2', '=AVERAGE(B1:B4)');
      kernel.setCellFormula('C3', '=MIN(B1:B4)');
      kernel.setCellFormula('C4', '=MAX(B1:B4)');
      kernel.setCellFormula('C5', '=ROUND(C2, 1)');

      expect(kernel.getCellValue('C1').asNumber, equals(101.5));
      expect(kernel.getCellValue('C2').asNumber, closeTo(25.375, 0.001));
      expect(kernel.getCellValue('C3').asNumber, equals(10.5));
      expect(kernel.getCellValue('C4').asNumber, equals(40.0));
      expect(kernel.getCellValue('C5').asNumber, equals(25.4));
    });

    test('Incremental dirty subgraph evaluation on single-cell edit', () {
      kernel.setCellNumber('A1', 100);
      kernel.setCellFormula('B1', '=A1 * 2');
      kernel.setCellFormula('C1', '=B1 + 50');
      kernel.setCellFormula('D1', '=C1 / 5');

      expect(kernel.getCellValue('D1').asNumber, equals(50.0));

      // Mutate root cell A1
      kernel.setCellNumber('A1', 200);
      final recalc = kernel.recalculateDirtySubgraph('A1');

      expect(recalc.recomputedCellCount, equals(3));
      expect(recalc.affectedCells, containsAll(['B1', 'C1', 'D1']));
      expect(kernel.getCellValue('B1').asNumber, equals(400.0));
      expect(kernel.getCellValue('C1').asNumber, equals(450.0));
      expect(kernel.getCellValue('D1').asNumber, equals(90.0));
    });

    test('Cycle detection: immediate self-reference', () {
      kernel.setCellFormula('B9', '=B9 * 2');
      expect(kernel.getCellValue('B9').isError, isTrue);
      expect(kernel.getCellValue('B9'), equals(CellValue.cycleError));
    });

    test('Cycle detection: mutual circular dependency (B6 <-> B7)', () {
      kernel.setCellFormula('B6', '=B7 + 1');
      kernel.setCellFormula('B7', '=B6 + 1');

      final recalc = kernel.recalculateDirtySubgraph('B6');
      expect(recalc.hasCycles, isTrue);
      expect(kernel.getCellValue('B6'), equals(CellValue.cycleError));
      expect(kernel.getCellValue('B7'), equals(CellValue.cycleError));
    });

    test('Error propagation through arithmetic expressions', () {
      kernel.setCellFormula('A1', '=100 / 0'); // #DIV/0!
      kernel.setCellFormula('A2', '=A1 * 5'); // Should propagate #DIV/0!

      expect(kernel.getCellValue('A1'), equals(CellValue.divByZero));
      expect(kernel.getCellValue('A2'), equals(CellValue.divByZero));
    });
  });

  group('M00 Degenerate Stress Fixture Parity Verification (M01-T07)', () {
    late DartWorksheetKernel kernel;

    setUp(() {
      kernel = DartWorksheetKernel();
    });

    test('Executes degenerate_calc_stress.json fixture cases', () {
      final fixturePath = '../../fixtures/platform-parity/worksheet/templates/degenerate_calc_stress.json';
      final file = File(fixturePath);
      expect(file.existsSync(), isTrue, reason: 'Stress fixture must exist at $fixturePath');

      final content = file.readAsStringSync();
      final fixture = jsonDecode(content) as Map<String, dynamic>;
      final sheet = (fixture['sheets'] as List).first as Map<String, dynamic>;
      final cells = sheet['cells'] as Map<String, dynamic>;

      // Load all fixture cells into kernel
      cells.forEach((coord, cellData) {
        final parts = coord.split(':');
        final r = int.parse(parts[0]);
        final c = int.parse(parts[1]);
        final a1 = CellAddress(r, c).toA1();

        final map = cellData as Map<String, dynamic>;
        if (map.containsKey('formula')) {
          kernel.setCellFormula(a1, map['formula'] as String);
        } else if (map.containsKey('value')) {
          final val = map['value'];
          if (val is num) {
            kernel.setCellNumber(a1, val);
          } else {
            final n = num.tryParse(val.toString());
            if (n != null) {
              kernel.setCellNumber(a1, n);
            } else {
              kernel.setCellText(a1, val.toString());
            }
          }
        }
      });

      // Recalculate full sheet
      final recalc = kernel.recalculateAll();
      expect(recalc.recomputedCellCount, greaterThan(0));

      // Case 1: Division by zero (Cell B3 / 2:1)
      final divZero = kernel.getCellValue('B3');
      expect(divZero, equals(CellValue.divByZero), reason: 'B3 (=100 / 0) must emit #DIV/0!');

      // Case 2: String arithmetic (Cell B4 / 3:1)
      final strArith = kernel.getCellValue('B4');
      expect(strArith, equals(CellValue.valueError), reason: 'B4 (="concrete" * 10) must emit #VALUE!');

      // Case 3: Unknown Macro (Cell B5 / 4:1)
      final unkMacro = kernel.getCellValue('B5');
      expect(unkMacro, equals(CellValue.nameError), reason: 'B5 (=UNKNOWN_MACRO(42)) must emit #NAME?');

      // Case 4: Circular Reference (Cells B6 and B7)
      final circA = kernel.getCellValue('B6');
      final circB = kernel.getCellValue('B7');
      expect(circA, equals(CellValue.cycleError), reason: 'B6 in cycle must emit #CYCLE!');
      expect(circB, equals(CellValue.cycleError), reason: 'B7 in cycle must emit #CYCLE!');

      // Case 5: Self Reference (Cell B9 / 8:1)
      final selfRef = kernel.getCellValue('B9');
      expect(selfRef, equals(CellValue.cycleError), reason: 'B9 (=B9 * 2) must emit #CYCLE!');

      // Case 6: Deep Linear Chain (B11..B21)
      // B11 = 1, B12 = B11 + 1, ..., B21 = B20 + 1 => B21 = 11
      final chainEnd = kernel.getCellValue('B21');
      expect(chainEnd.asNumber, equals(11.0), reason: 'B21 chain end must evaluate to 11.0');

      // Case 7: Extreme Overflow (Cell B23 / 22:1)
      final overflow = kernel.getCellValue('B23');
      expect(overflow, equals(CellValue.numError), reason: 'B23 (=1e308 * 10) must emit #NUM!');

      // Case 8: Underflow Subnormal (Cell B24 / 23:1)
      final underflow = kernel.getCellValue('B24');
      expect(underflow.asNumber, equals(0.0), reason: 'B24 (=1e-300 / 1e50) must evaluate to 0.0');

      // Case 9: Volatile functions (Cells B26: TODAY(), B27: NOW())
      final today = kernel.getCellValue('B26');
      final now = kernel.getCellValue('B27');
      expect(today.asString, isNotEmpty);
      expect(now.asString, isNotEmpty);
    });
  });

  group('Kernel Comparative Prototype Evaluation (Candidates A, B, C) (M01-T07)', () {
    test('Fanout benchmark: measures Candidate A vs B vs C and records bridge telemetry', () {
      final result = WorksheetKernelBenchmarkRunner.runFanoutBenchmark(dependentCount: 50);

      expect(result.cellCount, equals(50));
      expect(result.candidateAMs, lessThan(16.6), reason: 'Candidate A must comfortably beat 16.6ms 60fps frame budget');
      expect(result.candidateBMicros, greaterThan(0));
      expect(result.candidateCMs, greaterThan(15.0), reason: 'Candidate C suffers network RTT floor');

      final tele = result.candidateBTelemetry;
      expect(tele, isNotNull);
      expect(tele!.bytesTransferred, greaterThan(0));
      // Verify Bridge Overhead Invariant: for small dirty fanouts, boundary + serialization dominates
      expect(tele.bridgeOverheadMicros, greaterThan(0));
    });

    test('Bulk BoQ tree benchmark (200 lines)', () {
      final result = WorksheetKernelBenchmarkRunner.runBulkBoqBenchmark(boqLineCount: 200);

      expect(result.cellCount, equals(202));
      expect(result.candidateAMs, lessThan(33.3), reason: 'Candidate A bulk recalc within interactive threshold');
      expect(result.candidateCMs, greaterThan(result.candidateAMs));

      final tele = result.candidateBTelemetry;
      expect(tele, isNotNull);
      expect(tele!.affectedCellsCount, equals(202));
    });
  });
}
