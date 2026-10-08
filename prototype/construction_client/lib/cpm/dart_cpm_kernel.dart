import 'dart:math' as math;
import 'cpm_kernel_interface.dart';

/// Candidate A: In-Process Client Dart CPM Kernel Port (M01-T08)
///
/// Under Platform Plan v3 §4 and Instruction 9 Governance:
/// Classified as a Temporary Client Duplicate for zero-latency Gantt preview.
/// Contractual / authoritative calculations are verified against Server TypeScript.
class DartCpmKernel implements CpmKernel {
  final Map<String, CpmTask> _tasks = {};
  final List<CpmDependency> _dependencies = [];
  final Map<String, List<CpmDependency>> _outgoingEdges = {};
  final Map<String, List<CpmDependency>> _incomingEdges = {};
  CpmCalendar _calendar = const CpmCalendar();

  int get taskCount => _tasks.length;
  int get dependencyCount => _dependencies.length;

  @override
  void loadNetwork({
    required List<CpmTask> tasks,
    required List<CpmDependency> dependencies,
    CpmCalendar calendar = const CpmCalendar(),
  }) {
    _tasks.clear();
    _dependencies.clear();
    _outgoingEdges.clear();
    _incomingEdges.clear();
    _calendar = calendar;

    for (final t in tasks) {
      _tasks[t.id] = t;
      _outgoingEdges[t.id] = [];
      _incomingEdges[t.id] = [];
    }

    for (final d in dependencies) {
      if (_tasks.containsKey(d.predecessorId) && _tasks.containsKey(d.successorId)) {
        _dependencies.add(d);
        _outgoingEdges[d.predecessorId]!.add(d);
        _incomingEdges[d.successorId]!.add(d);
      }
    }
  }

  @override
  CpmScheduleResult calculateSchedule({DateTime? projectStartDate}) {
    final sw = Stopwatch()..start();

    if (_tasks.isEmpty) {
      sw.stop();
      return CpmScheduleResult(
        success: true,
        elapsedMicroseconds: sw.elapsedMicroseconds.toDouble(),
      );
    }

    final defaultStart = projectStartDate ??
        _tasks.values.first.originalStartDate ??
        DateTime(2026, 6, 1);

    // 1. Topological Sort via Kahn's Algorithm & Cycle Detection
    final inDegree = <String, int>{};
    for (final id in _tasks.keys) {
      inDegree[id] = _incomingEdges[id]?.length ?? 0;
    }

    final queue = <String>[];
    inDegree.forEach((id, deg) {
      if (deg == 0) queue.add(id);
    });

    final topologicalOrder = <String>[];
    while (queue.isNotEmpty) {
      final u = queue.removeAt(0);
      topologicalOrder.add(u);

      for (final edge in _outgoingEdges[u] ?? <CpmDependency>[]) {
        final v = edge.successorId;
        inDegree[v] = inDegree[v]! - 1;
        if (inDegree[v] == 0) {
          queue.add(v);
        }
      }
    }

    // Check for cycles
    if (topologicalOrder.length < _tasks.length) {
      final cyclicNodes = _tasks.keys.where((id) => !topologicalOrder.contains(id)).toList();
      sw.stop();
      return CpmScheduleResult(
        success: false,
        errorMessage: 'CycleDetectedException: Network graph contains circular dependency loops',
        cyclicTaskIds: cyclicNodes,
        elapsedMicroseconds: sw.elapsedMicroseconds.toDouble(),
      );
    }

    // 2. Forward Pass: Calculate Early Start (ES) and Early Finish (EF)
    for (final id in topologicalOrder) {
      final task = _tasks[id]!;
      DateTime candidateEs = task.originalStartDate ?? defaultStart;

      final incoming = _incomingEdges[id] ?? <CpmDependency>[];
      if (incoming.isNotEmpty) {
        DateTime maxPredEs = DateTime(1970);
        for (final edge in incoming) {
          final pred = _tasks[edge.predecessorId]!;
          DateTime edgeEs;

          switch (edge.type) {
            case DependencyType.fs:
              // FS: pred must finish. Next work day + lagDays
              final predEf = pred.earlyFinish ?? pred.earlyStart ?? defaultStart;
              edgeEs = _calendar.addWorkingDays(predEf, 1 + edge.lagDays);
              break;
            case DependencyType.ss:
              // SS: pred starts. pred.ES + lagDays
              final predEs = pred.earlyStart ?? defaultStart;
              edgeEs = _calendar.addWorkingDays(predEs, edge.lagDays);
              break;
            case DependencyType.ff:
              // FF: pred finishes. pred.EF + lagDays - (task.duration - 1)
              final predEf = pred.earlyFinish ?? defaultStart;
              final targetEf = _calendar.addWorkingDays(predEf, edge.lagDays);
              edgeEs = task.durationDays > 0
                  ? _calendar.addWorkingDays(targetEf, -(task.durationDays - 1))
                  : targetEf;
              break;
            case DependencyType.sf:
              // SF: pred starts. pred.ES + lagDays - (task.duration - 1)
              final predEs = pred.earlyStart ?? defaultStart;
              final targetEf = _calendar.addWorkingDays(predEs, edge.lagDays);
              edgeEs = task.durationDays > 0
                  ? _calendar.addWorkingDays(targetEf, -(task.durationDays - 1))
                  : targetEf;
              break;
          }

          if (edgeEs.isAfter(maxPredEs)) {
            maxPredEs = edgeEs;
          }
        }
        candidateEs = maxPredEs;
      }

      // Respect constraints
      if (task.constraintType == ConstraintType.snet && task.constraintDate != null) {
        if (task.constraintDate!.isAfter(candidateEs)) {
          candidateEs = task.constraintDate!;
        }
      }

      task.earlyStart = candidateEs;
      task.earlyFinish = task.durationDays > 0
          ? _calendar.addWorkingDays(candidateEs, task.durationDays - 1)
          : candidateEs;
    }

    // 3. Backward Pass: Calculate Late Finish (LF) and Late Start (LS)
    DateTime maxProjectFinish = defaultStart;
    for (final task in _tasks.values) {
      if (task.earlyFinish != null && task.earlyFinish!.isAfter(maxProjectFinish)) {
        maxProjectFinish = task.earlyFinish!;
      }
    }

    final reverseOrder = topologicalOrder.reversed.toList();
    for (final id in reverseOrder) {
      final task = _tasks[id]!;
      final outgoing = _outgoingEdges[id] ?? <CpmDependency>[];

      DateTime candidateLf;
      if (outgoing.isEmpty) {
        candidateLf = maxProjectFinish;
      } else {
        DateTime minSuccLf = DateTime(2100);
        for (final edge in outgoing) {
          final succ = _tasks[edge.successorId]!;
          DateTime edgeLf;

          switch (edge.type) {
            case DependencyType.fs:
              final succLs = succ.lateStart ?? maxProjectFinish;
              edgeLf = _calendar.addWorkingDays(succLs, -1 - edge.lagDays);
              break;
            case DependencyType.ss:
              final succLs = succ.lateStart ?? maxProjectFinish;
              final succReqLs = _calendar.addWorkingDays(succLs, -edge.lagDays);
              edgeLf = task.durationDays > 0
                  ? _calendar.addWorkingDays(succReqLs, task.durationDays - 1)
                  : succReqLs;
              break;
            case DependencyType.ff:
              final succLf = succ.lateFinish ?? maxProjectFinish;
              edgeLf = _calendar.addWorkingDays(succLf, -edge.lagDays);
              break;
            case DependencyType.sf:
              final succLf = succ.lateFinish ?? maxProjectFinish;
              final succReqLf = _calendar.addWorkingDays(succLf, -edge.lagDays);
              edgeLf = task.durationDays > 0
                  ? _calendar.addWorkingDays(succReqLf, task.durationDays - 1)
                  : succReqLf;
              break;
          }

          if (edgeLf.isBefore(minSuccLf)) {
            minSuccLf = edgeLf;
          }
        }
        candidateLf = minSuccLf;
      }

      // Check FNLT constraint (Finish No Later Than)
      if (task.constraintType == ConstraintType.fnlt && task.constraintDate != null) {
        if (task.constraintDate!.isBefore(candidateLf)) {
          candidateLf = task.constraintDate!;
        }
      }

      task.lateFinish = candidateLf;
      task.lateStart = task.durationDays > 0
          ? _calendar.addWorkingDays(candidateLf, -(task.durationDays - 1))
          : candidateLf;

      // 4. Calculate Floats
      if (task.earlyStart != null && task.lateStart != null) {
        final floatDays = _calendar.workingDaysBetween(task.earlyStart!, task.lateStart!);
        task.totalFloatDays = floatDays;
      }
    }

    int minFloat = 999999;
    for (final t in _tasks.values) {
      if (t.totalFloatDays < minFloat) {
        minFloat = t.totalFloatDays;
      }
    }

    final criticalThreshold = minFloat <= 0 ? 0 : minFloat;
    for (final t in _tasks.values) {
      t.isCritical = t.totalFloatDays <= criticalThreshold;
    }

    final criticalTasks = _tasks.values
        .where((t) => t.isCritical)
        .map((t) => t.id)
        .toList();

    DateTime minProjectStart = DateTime(2100);
    DateTime finalProjectFinish = DateTime(1970);
    for (final t in _tasks.values) {
      if (t.earlyStart != null && t.earlyStart!.isBefore(minProjectStart)) {
        minProjectStart = t.earlyStart!;
      }
      if (t.earlyFinish != null && t.earlyFinish!.isAfter(finalProjectFinish)) {
        finalProjectFinish = t.earlyFinish!;
      }
    }

    final totalDuration = _calendar.workingDaysBetween(minProjectStart, finalProjectFinish) + 1;

    sw.stop();
    return CpmScheduleResult(
      success: true,
      computedTasks: _tasks,
      criticalPathTaskIds: criticalTasks,
      projectStartDate: minProjectStart,
      projectFinishDate: finalProjectFinish,
      totalDurationDays: math.max(0, totalDuration),
      elapsedMicroseconds: sw.elapsedMicroseconds.toDouble(),
    );
  }
}
