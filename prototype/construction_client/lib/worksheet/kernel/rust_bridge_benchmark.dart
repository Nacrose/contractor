import 'dart:typed_data';
import 'worksheet_kernel_interface.dart';
import 'dart_worksheet_kernel.dart';

/// Performance breakdown of a cross-boundary kernel recalculation (M01-T07)
class BridgeRecalcTelemetry {
  final double serializeMicros;
  final double bridgeCrossingMicros;
  final double nativeComputeMicros;
  final double deserializeMicros;
  final int bytesTransferred;
  final int affectedCellsCount;

  const BridgeRecalcTelemetry({
    required this.serializeMicros,
    required this.bridgeCrossingMicros,
    required this.nativeComputeMicros,
    required this.deserializeMicros,
    required this.bytesTransferred,
    required this.affectedCellsCount,
  });

  double get totalMicros =>
      serializeMicros + bridgeCrossingMicros + nativeComputeMicros + deserializeMicros;
  double get totalMs => totalMicros / 1000.0;
  double get bridgeOverheadMicros => serializeMicros + bridgeCrossingMicros + deserializeMicros;
  double get bridgeOverheadRatio =>
      totalMicros > 0 ? bridgeOverheadMicros / totalMicros : 0.0;
}

/// Candidate B: Simulated Rust FFI / Wasm Compiled Kernel (M01-T07)
///
/// Models the architectural reality of a compiled native/Wasm Rust kernel:
/// 1. Serialization of cell mutations into flat binary buffer (Uint8List).
/// 2. FFI / Wasm boundary call & pointer copy overhead.
/// 3. Compiled execution in native memory space (~1.4x faster CPU math than Dart VM).
/// 4. Deserialization of result buffer back into Dart heap objects.
class RustBridgeSimulatedKernel implements WorksheetKernel {
  final DartWorksheetKernel _innerDartKernel = DartWorksheetKernel();
  BridgeRecalcTelemetry? lastTelemetry;

  @override
  void clear() {
    _innerDartKernel.clear();
    lastTelemetry = null;
  }

  @override
  void setCellNumber(String cellRef, num value) {
    _innerDartKernel.setCellNumber(cellRef, value);
  }

  @override
  void setCellText(String cellRef, String value) {
    _innerDartKernel.setCellText(cellRef, value);
  }

  @override
  void setCellFormula(String cellRef, String formula) {
    _innerDartKernel.setCellFormula(cellRef, formula);
  }

  @override
  CellValue getCellValue(String cellRef) => _innerDartKernel.getCellValue(cellRef);

  @override
  String? getCellFormula(String cellRef) => _innerDartKernel.getCellFormula(cellRef);

  @override
  RecalcResult recalculateDirtySubgraph(String changedCellRef) {
    // 1. Serialization phase: pack dirty cell into binary protocol
    final serSw = Stopwatch()..start();
    final inputBuffer = _serializeCellChange(changedCellRef);
    serSw.stop();
    final serMicros = serSw.elapsedMicroseconds.toDouble();

    // 2. FFI / Wasm Boundary crossing overhead
    // Fixed boundary transition penalty: ~35-80ns for C-FFI, up to 150-300ns on Wasm JS glue
    // Plus memory copy across Wasm linear memory boundary (1 memcpy per buffer)
    final crossSw = Stopwatch()..start();
    final nativeBuffer = _simulateBoundaryMemCopy(inputBuffer);
    crossSw.stop();
    final crossMicros = crossSw.elapsedMicroseconds.toDouble() + 50.0; // 50us base FFI call latency

    // 3. Native Rust computation phase
    // Pure compiled Rust DAG recalculation is ~1.4x faster than Dart VM for raw loops
    final dartResult = _innerDartKernel.recalculateDirtySubgraph(changedCellRef);
    final nativeComputeMicros = dartResult.elapsedMicroseconds / 1.4;

    // 4. Deserialization phase: Rust packs result buffer, Dart unpacks into heap objects
    final deserSw = Stopwatch()..start();
    final outputBytes = _simulateResultPayload(dartResult.affectedCells);
    final unpackedCount = _deserializeResultPayload(outputBytes);
    deserSw.stop();
    final deserMicros = deserSw.elapsedMicroseconds.toDouble();

    final totalBytes = nativeBuffer.lengthInBytes + outputBytes.lengthInBytes;

    lastTelemetry = BridgeRecalcTelemetry(
      serializeMicros: serMicros,
      bridgeCrossingMicros: crossMicros,
      nativeComputeMicros: nativeComputeMicros,
      deserializeMicros: deserMicros,
      bytesTransferred: totalBytes,
      affectedCellsCount: unpackedCount,
    );

    return RecalcResult(
      recomputedCellCount: dartResult.recomputedCellCount,
      elapsedMicroseconds: lastTelemetry!.totalMicros,
      affectedCells: dartResult.affectedCells,
      hasCycles: dartResult.hasCycles,
    );
  }

  @override
  RecalcResult recalculateAll() {
    final serSw = Stopwatch()..start();
    final inputBuffer = Uint8List(128); // Full recalc command header
    serSw.stop();

    final dartResult = _innerDartKernel.recalculateAll();
    final nativeComputeMicros = dartResult.elapsedMicroseconds / 1.4;

    final deserSw = Stopwatch()..start();
    final outputBytes = _simulateResultPayload(dartResult.affectedCells);
    final unpackedCount = _deserializeResultPayload(outputBytes);
    deserSw.stop();

    final crossMicros = 75.0 + (outputBytes.lengthInBytes / 1024.0 * 2.0); // memcpy rate
    final totalBytes = inputBuffer.lengthInBytes + outputBytes.lengthInBytes;

    lastTelemetry = BridgeRecalcTelemetry(
      serializeMicros: serSw.elapsedMicroseconds.toDouble(),
      bridgeCrossingMicros: crossMicros,
      nativeComputeMicros: nativeComputeMicros,
      deserializeMicros: deserSw.elapsedMicroseconds.toDouble(),
      bytesTransferred: totalBytes,
      affectedCellsCount: unpackedCount,
    );

    return RecalcResult(
      recomputedCellCount: dartResult.recomputedCellCount,
      elapsedMicroseconds: lastTelemetry!.totalMicros,
      affectedCells: dartResult.affectedCells,
      hasCycles: dartResult.hasCycles,
    );
  }

  Uint8List _serializeCellChange(String cellRef) {
    // 16 bytes per cell edit: [4 bytes row, 4 bytes col, 8 bytes float or string ptr]
    final buffer = Uint8List(32);
    final byteData = ByteData.sublistView(buffer);
    byteData.setInt32(0, 1); // cell count
    byteData.setInt32(4, cellRef.hashCode);
    return buffer;
  }

  Uint8List _simulateBoundaryMemCopy(Uint8List src) {
    final dest = Uint8List(src.lengthInBytes);
    dest.setAll(0, src);
    return dest;
  }

  Uint8List _simulateResultPayload(List<String> affectedCells) {
    // Binary packed record: 16 bytes per recomputed cell [row: i32, col: i32, value: f64]
    final length = (affectedCells.length * 16) + 8;
    final buffer = Uint8List(length);
    final byteData = ByteData.sublistView(buffer);
    byteData.setInt32(0, affectedCells.length);
    for (int i = 0; i < affectedCells.length; i++) {
      byteData.setInt32(8 + (i * 16), i);
      byteData.setFloat64(16 + (i * 16), i * 1.5);
    }
    return buffer;
  }

  int _deserializeResultPayload(Uint8List bytes) {
    if (bytes.lengthInBytes < 8) return 0;
    final byteData = ByteData.sublistView(bytes);
    final count = byteData.getInt32(0);
    // Unpack float values and instantiate Dart objects
    for (int i = 0; i < count; i++) {
      final _ = byteData.getFloat64(16 + (i * 16));
    }
    return count;
  }
}

/// Candidate C: Server-Authoritative TypeScript RPC Kernel (M01-T07)
///
/// Models sending dirty spreadsheet events over network/IPC (JSON-RPC) to server.
class ServerRpcSimulatedKernel implements WorksheetKernel {
  final DartWorksheetKernel _innerDartKernel = DartWorksheetKernel();
  final double networkRttMs;

  ServerRpcSimulatedKernel({this.networkRttMs = 25.0});

  @override
  void clear() => _innerDartKernel.clear();

  @override
  void setCellNumber(String cellRef, num value) => _innerDartKernel.setCellNumber(cellRef, value);

  @override
  void setCellText(String cellRef, String value) => _innerDartKernel.setCellText(cellRef, value);

  @override
  void setCellFormula(String cellRef, String formula) =>
      _innerDartKernel.setCellFormula(cellRef, formula);

  @override
  CellValue getCellValue(String cellRef) => _innerDartKernel.getCellValue(cellRef);

  @override
  String? getCellFormula(String cellRef) => _innerDartKernel.getCellFormula(cellRef);

  @override
  RecalcResult recalculateDirtySubgraph(String changedCellRef) {
    final serSw = Stopwatch()..start();
    // JSON payload serialization
    final _ = '{"action":"recalc","cell":"$changedCellRef"}';
    serSw.stop();

    // Node.js server calculation (V8 JIT ~ 1.1x Dart VM)
    final dartResult = _innerDartKernel.recalculateDirtySubgraph(changedCellRef);
    final serverComputeMicros = dartResult.elapsedMicroseconds * 1.1;

    // Network RTT + JSON parsing
    final totalMicros = (networkRttMs * 1000.0) +
        serSw.elapsedMicroseconds +
        serverComputeMicros +
        (dartResult.recomputedCellCount * 12.0); // JSON deserialization

    return RecalcResult(
      recomputedCellCount: dartResult.recomputedCellCount,
      elapsedMicroseconds: totalMicros,
      affectedCells: dartResult.affectedCells,
      hasCycles: dartResult.hasCycles,
    );
  }

  @override
  RecalcResult recalculateAll() {
    final dartResult = _innerDartKernel.recalculateAll();
    final totalMicros = (networkRttMs * 1000.0) +
        (dartResult.elapsedMicroseconds * 1.1) +
        (dartResult.recomputedCellCount * 15.0);

    return RecalcResult(
      recomputedCellCount: dartResult.recomputedCellCount,
      elapsedMicroseconds: totalMicros,
      affectedCells: dartResult.affectedCells,
      hasCycles: dartResult.hasCycles,
    );
  }
}

/// Comparative Benchmark Runner for Worksheet Kernel Candidates (M01-T07)
class WorksheetKernelBenchmarkResult {
  final String scenario;
  final int cellCount;
  final double candidateAMicros; // Dart Native
  final double candidateBMicros; // Rust FFI/Wasm Bridge
  final double candidateCMicros; // Server TS RPC
  final BridgeRecalcTelemetry? candidateBTelemetry;

  const WorksheetKernelBenchmarkResult({
    required this.scenario,
    required this.cellCount,
    required this.candidateAMicros,
    required this.candidateBMicros,
    required this.candidateCMicros,
    this.candidateBTelemetry,
  });

  double get candidateAMs => candidateAMicros / 1000.0;
  double get candidateBMs => candidateBMicros / 1000.0;
  double get candidateCMs => candidateCMicros / 1000.0;

  double get bridgeOverheadRatio =>
      candidateBTelemetry != null ? candidateBTelemetry!.bridgeOverheadRatio : 0.0;
}

class WorksheetKernelBenchmarkRunner {
  /// Runs a standard comparison across candidate kernels for dirty-cell fanouts
  static WorksheetKernelBenchmarkResult runFanoutBenchmark({
    required int dependentCount,
  }) {
    final kernelA = DartWorksheetKernel();
    final kernelB = RustBridgeSimulatedKernel();
    final kernelC = ServerRpcSimulatedKernel(networkRttMs: 20.0);

    // Setup: Root cell A1 = 10. Downstream chain B1..B[N] = A1 * 2 + index
    kernelA.setCellNumber('A1', 10);
    kernelB.setCellNumber('A1', 10);
    kernelC.setCellNumber('A1', 10);

    for (int i = 1; i <= dependentCount; i++) {
      final ref = 'B$i';
      final formula = '=A1 * 2 + $i';
      kernelA.setCellFormula(ref, formula);
      kernelB.setCellFormula(ref, formula);
      kernelC.setCellFormula(ref, formula);
    }

    // Mutate A1 and trigger dirty subgraph recalculation
    kernelA.setCellNumber('A1', 25);
    final resA = kernelA.recalculateDirtySubgraph('A1');

    kernelB.setCellNumber('A1', 25);
    final resB = kernelB.recalculateDirtySubgraph('A1');

    kernelC.setCellNumber('A1', 25);
    final resC = kernelC.recalculateDirtySubgraph('A1');

    return WorksheetKernelBenchmarkResult(
      scenario: 'Incremental Dirty Recalc ($dependentCount Dependents)',
      cellCount: dependentCount,
      candidateAMicros: resA.elapsedMicroseconds,
      candidateBMicros: resB.elapsedMicroseconds,
      candidateCMicros: resC.elapsedMicroseconds,
      candidateBTelemetry: kernelB.lastTelemetry,
    );
  }

  /// Runs bulk BoQ calculation tree benchmark
  static WorksheetKernelBenchmarkResult runBulkBoqBenchmark({
    required int boqLineCount,
  }) {
    final kernelA = DartWorksheetKernel();
    final kernelB = RustBridgeSimulatedKernel();
    final kernelC = ServerRpcSimulatedKernel(networkRttMs: 20.0);

    // Setup BoQ rows: Col A = Qty, Col B = Rate, Col C = A[i] * B[i]
    for (int i = 1; i <= boqLineCount; i++) {
      kernelA.setCellNumber('A$i', i * 1.5);
      kernelA.setCellNumber('B$i', 120.0);
      kernelA.setCellFormula('C$i', '=A$i * B$i');

      kernelB.setCellNumber('A$i', i * 1.5);
      kernelB.setCellNumber('B$i', 120.0);
      kernelB.setCellFormula('C$i', '=A$i * B$i');

      kernelC.setCellNumber('A$i', i * 1.5);
      kernelC.setCellNumber('B$i', 120.0);
      kernelC.setCellFormula('C$i', '=A$i * B$i');
    }

    // Subtotal and tax formulas
    final lastRow = boqLineCount;
    final totalRow = boqLineCount + 1;
    final grandTotalRow = boqLineCount + 2;

    kernelA.setCellFormula('C$totalRow', '=SUM(C1:C$lastRow)');
    kernelA.setCellFormula('C$grandTotalRow', '=C$totalRow * 1.13');

    kernelB.setCellFormula('C$totalRow', '=SUM(C1:C$lastRow)');
    kernelB.setCellFormula('C$grandTotalRow', '=C$totalRow * 1.13');

    kernelC.setCellFormula('C$totalRow', '=SUM(C1:C$lastRow)');
    kernelC.setCellFormula('C$grandTotalRow', '=C$totalRow * 1.13');

    final resA = kernelA.recalculateAll();
    final resB = kernelB.recalculateAll();
    final resC = kernelC.recalculateAll();

    return WorksheetKernelBenchmarkResult(
      scenario: 'Bulk BoQ Tree Recalc ($boqLineCount Lines)',
      cellCount: boqLineCount + 2,
      candidateAMicros: resA.elapsedMicroseconds,
      candidateBMicros: resB.elapsedMicroseconds,
      candidateCMicros: resC.elapsedMicroseconds,
      candidateBTelemetry: kernelB.lastTelemetry,
    );
  }
}
