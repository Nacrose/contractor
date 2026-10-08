import 'dart:typed_data';
import 'cpm_kernel_interface.dart';
import 'dart_cpm_kernel.dart';

/// Instruction 9 Governance Classification for Client-Side CPM Port (Platform Plan v3 §4)
class Instruction9GovernancePacket {
  final String componentName;
  final String classification;
  final String designatedOwner;
  final String removalGate;
  final String authoritativeSource;

  const Instruction9GovernancePacket({
    this.componentName = 'DartCpmKernel (Client-Side CPM Port)',
    this.classification = 'Temporary Client Duplicate (Instruction 9)',
    this.designatedOwner = 'Cross-Platform Core Engine Team',
    this.removalGate = 'Milestone M09 Authoritative Sync Gate (M09-W04 / M09-W06)',
    this.authoritativeSource = 'Server TypeScript Engine (src/lib/cpm-engine.ts)',
  });
}

/// Candidate C: Server-Authoritative TypeScript RPC Kernel (M01-T08)
///
/// Under Platform Plan v3 §4, Server TypeScript is the authoritative source of truth.
/// On client devices, authoritative recalculation invokes the server over JSON-RPC.
class ServerCpmSimulatedKernel implements CpmKernel {
  final DartCpmKernel _innerKernel = DartCpmKernel();
  final double networkRttMs;

  ServerCpmSimulatedKernel({this.networkRttMs = 20.0});

  @override
  void loadNetwork({
    required List<CpmTask> tasks,
    required List<CpmDependency> dependencies,
    CpmCalendar calendar = const CpmCalendar(),
  }) {
    _innerKernel.loadNetwork(tasks: tasks, dependencies: dependencies, calendar: calendar);
  }

  @override
  CpmScheduleResult calculateSchedule({DateTime? projectStartDate}) {
    // 1. JSON payload serialization
    final serSw = Stopwatch()..start();
    // Simulate JSON marshaling of tasks and dependencies
    final _ = '{"action":"cpm_recalc","taskCount":${_innerKernel.taskCount}}';
    serSw.stop();

    // 2. Server execution in Node.js V8 JIT (~1.1x Dart VM speed)
    final dartResult = _innerKernel.calculateSchedule(projectStartDate: projectStartDate);
    final serverComputeMicros = dartResult.elapsedMicroseconds * 1.1;

    // 3. Network RTT + JSON parsing
    final totalMicros = (networkRttMs * 1000.0) +
        serSw.elapsedMicroseconds +
        serverComputeMicros +
        (dartResult.computedTasks.length * 15.0);

    return CpmScheduleResult(
      success: dartResult.success,
      errorMessage: dartResult.errorMessage,
      cyclicTaskIds: dartResult.cyclicTaskIds,
      computedTasks: dartResult.computedTasks,
      criticalPathTaskIds: dartResult.criticalPathTaskIds,
      projectStartDate: dartResult.projectStartDate,
      projectFinishDate: dartResult.projectFinishDate,
      totalDurationDays: dartResult.totalDurationDays,
      elapsedMicroseconds: totalMicros,
    );
  }
}

/// Candidate B: Simulated Rust FFI / Wasm Compiled CPM Kernel (M01-T08)
class RustCpmBridgeSimulatedKernel implements CpmKernel {
  final DartCpmKernel _innerKernel = DartCpmKernel();

  @override
  void loadNetwork({
    required List<CpmTask> tasks,
    required List<CpmDependency> dependencies,
    CpmCalendar calendar = const CpmCalendar(),
  }) {
    _innerKernel.loadNetwork(tasks: tasks, dependencies: dependencies, calendar: calendar);
  }

  @override
  CpmScheduleResult calculateSchedule({DateTime? projectStartDate}) {
    final serSw = Stopwatch()..start();
    // FlatBuffer/binary serialization for CPM tasks (48 bytes per task) + dependencies (16 bytes per dep)
    final taskBytes = _innerKernel.taskCount * 48;
    final depBytes = _innerKernel.dependencyCount * 16;
    final inputBuffer = Uint8List(taskBytes + depBytes + 64);
    serSw.stop();

    // Boundary crossing
    final crossMicros = 50.0 + (inputBuffer.lengthInBytes / 1024.0 * 2.0);

    // Native Rust compute (~1.3x faster than Dart VM for topological sort)
    final dartResult = _innerKernel.calculateSchedule(projectStartDate: projectStartDate);
    final nativeComputeMicros = dartResult.elapsedMicroseconds / 1.3;

    // Deserialization
    final deserSw = Stopwatch()..start();
    final outputBytes = Uint8List(dartResult.computedTasks.length * 48);
    final _ = outputBytes.lengthInBytes;
    deserSw.stop();

    final totalMicros = serSw.elapsedMicroseconds +
        crossMicros +
        nativeComputeMicros +
        deserSw.elapsedMicroseconds;

    return CpmScheduleResult(
      success: dartResult.success,
      errorMessage: dartResult.errorMessage,
      cyclicTaskIds: dartResult.cyclicTaskIds,
      computedTasks: dartResult.computedTasks,
      criticalPathTaskIds: dartResult.criticalPathTaskIds,
      projectStartDate: dartResult.projectStartDate,
      projectFinishDate: dartResult.projectFinishDate,
      totalDurationDays: dartResult.totalDurationDays,
      elapsedMicroseconds: totalMicros,
    );
  }
}

/// Comparative Benchmark Result for CPM Candidates
class CpmBenchmarkResult {
  final String scenario;
  final int taskCount;
  final int dependencyCount;
  final double candidateAMicros; // Dart Native Client Preview
  final double candidateBMicros; // Rust FFI/Wasm Bridge
  final double candidateCMicros; // Server TS RPC (Authoritative)
  final int criticalPathTaskCount;
  final int totalDurationDays;

  const CpmBenchmarkResult({
    required this.scenario,
    required this.taskCount,
    required this.dependencyCount,
    required this.candidateAMicros,
    required this.candidateBMicros,
    required this.candidateCMicros,
    required this.criticalPathTaskCount,
    required this.totalDurationDays,
  });

  double get candidateAMs => candidateAMicros / 1000.0;
  double get candidateBMs => candidateBMicros / 1000.0;
  double get candidateCMs => candidateCMicros / 1000.0;
}

class CpmKernelBenchmarkRunner {
  static final Instruction9GovernancePacket governance = Instruction9GovernancePacket();

  static CpmBenchmarkResult runComparison({
    required List<CpmTask> tasks,
    required List<CpmDependency> dependencies,
    CpmCalendar calendar = const CpmCalendar(),
    String scenario = 'Standard CPM Network',
  }) {
    final kernelA = DartCpmKernel();
    final kernelB = RustCpmBridgeSimulatedKernel();
    final kernelC = ServerCpmSimulatedKernel(networkRttMs: 20.0);

    // Deep copy tasks for independent runs
    List<CpmTask> copyTasks() => tasks
        .map((t) => CpmTask(
              id: t.id,
              name: t.name,
              durationDays: t.durationDays,
              isMilestone: t.isMilestone,
              originalStartDate: t.originalStartDate,
              originalEndDate: t.originalEndDate,
              constraintType: t.constraintType,
              constraintDate: t.constraintDate,
            ))
        .toList();

    kernelA.loadNetwork(tasks: copyTasks(), dependencies: dependencies, calendar: calendar);
    final resA = kernelA.calculateSchedule();

    kernelB.loadNetwork(tasks: copyTasks(), dependencies: dependencies, calendar: calendar);
    final resB = kernelB.calculateSchedule();

    kernelC.loadNetwork(tasks: copyTasks(), dependencies: dependencies, calendar: calendar);
    final resC = kernelC.calculateSchedule();

    return CpmBenchmarkResult(
      scenario: scenario,
      taskCount: tasks.length,
      dependencyCount: dependencies.length,
      candidateAMicros: resA.elapsedMicroseconds,
      candidateBMicros: resB.elapsedMicroseconds,
      candidateCMicros: resC.elapsedMicroseconds,
      criticalPathTaskCount: resA.criticalPathTaskIds.length,
      totalDurationDays: resA.totalDurationDays,
    );
  }
}
