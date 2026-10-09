import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/cpm/cpm_kernel_interface.dart';
import 'package:construction_client/cpm/dart_cpm_kernel.dart';
import 'package:construction_client/cpm/server_cpm_benchmark.dart';

void main() {
  group('CPM construction calendar (M01-T08)', () {
    test('counts workdays and excludes holidays in a date range', () {
      final from = DateTime(2026, 6, 5); // Friday
      final to = DateTime(2026, 6, 8); // Monday
      const standardCalendar = CpmCalendar();
      const holidayCalendar = CpmCalendar(publicHolidays: {'2026-06-07'});

      expect(standardCalendar.workingDaysBetween(from, to), equals(2));
      expect(standardCalendar.workingDaysBetween(to, from), equals(-2));
      expect(holidayCalendar.workingDaysBetween(from, to), equals(1));
    });

    test('jumps full working weeks in both directions', () {
      const calendar = CpmCalendar();
      expect(
        calendar.addWorkingDays(DateTime(2026, 6, 1), 6),
        equals(DateTime(2026, 6, 8)),
      );
      expect(
        calendar.addWorkingDays(DateTime(2026, 6, 8), -6),
        equals(DateTime(2026, 6, 1)),
      );
    });
  });
  group('CPM Scheduling Kernel (Candidate A: Dart) Unit Tests (M01-T08)', () {
    late DartCpmKernel kernel;

    setUp(() {
      kernel = DartCpmKernel();
    });

    test('Forward and backward pass on basic 3-task linear chain', () {
      final t1 = CpmTask(id: 't1', name: 'Site Prep', durationDays: 3, originalStartDate: DateTime(2026, 6, 1));
      final t2 = CpmTask(id: 't2', name: 'Foundation', durationDays: 4);
      final t3 = CpmTask(id: 't3', name: 'Structure', durationDays: 5);

      final d1 = CpmDependency(predecessorId: 't1', successorId: 't2', type: DependencyType.fs);
      final d2 = CpmDependency(predecessorId: 't2', successorId: 't3', type: DependencyType.fs);

      kernel.loadNetwork(tasks: [t1, t2, t3], dependencies: [d1, d2]);
      final result = kernel.calculateSchedule();

      expect(result.success, isTrue);
      expect(result.computedTasks.length, equals(3));
      expect(result.criticalPathTaskIds, equals(['t1', 't2', 't3']));
      expect(result.totalDurationDays, equals(12));
    });

    test('Parallel paths and float calculation', () {
      // Path 1 (Critical): A (4d) -> B (6d) => 10d
      // Path 2 (Non-critical): A (4d) -> C (2d) -> D (1d) => 7d (Total Float = 3d)
      final tA = CpmTask(id: 'A', name: 'Activity A', durationDays: 4, originalStartDate: DateTime(2026, 6, 1));
      final tB = CpmTask(id: 'B', name: 'Activity B', durationDays: 6);
      final tC = CpmTask(id: 'C', name: 'Activity C', durationDays: 2);
      final tD = CpmTask(id: 'D', name: 'Activity D', durationDays: 1);

      final deps = [
        CpmDependency(predecessorId: 'A', successorId: 'B'),
        CpmDependency(predecessorId: 'A', successorId: 'C'),
        CpmDependency(predecessorId: 'C', successorId: 'D'),
      ];

      kernel.loadNetwork(tasks: [tA, tB, tC, tD], dependencies: deps);
      final result = kernel.calculateSchedule();

      expect(result.success, isTrue);
      expect(result.criticalPathTaskIds, containsAll(['A', 'B']));
      expect(result.computedTasks['C']!.isCritical, isFalse);
      expect(result.computedTasks['C']!.totalFloatDays, equals(3));
      expect(result.computedTasks['D']!.totalFloatDays, equals(3));
    });
  });

  group('M00 CPM Degenerate Cases Parity Verification (M01-T08)', () {
    late DartCpmKernel kernel;

    setUp(() {
      kernel = DartCpmKernel();
    });

    test('Executes cpm_degenerate_cases.json scenarios', () {
      final fixturePath = '../../fixtures/platform-parity/cpm/cpm_degenerate_cases.json';
      final file = File(fixturePath);
      expect(file.existsSync(), isTrue, reason: 'CPM degenerate fixture must exist');

      final content = file.readAsStringSync();
      final fixture = jsonDecode(content) as Map<String, dynamic>;
      final scenarios = fixture['scenarios'] as List;

      // Scenario 1: scenario-cyclic-loop
      final cycleScenario = scenarios.firstWhere((s) => s['id'] == 'scenario-cyclic-loop');
      final cTasks = (cycleScenario['tasks'] as List).map((t) {
        return CpmTask(
          id: t['id'],
          name: t['name'],
          durationDays: t['duration'],
          originalStartDate: DateTime.parse(t['startDate']),
        );
      }).toList();
      final cDeps = (cycleScenario['dependencies'] as List).map((d) {
        return CpmDependency(
          predecessorId: d['predecessorId'],
          successorId: d['successorId'],
          type: DependencyType.fs,
        );
      }).toList();

      kernel.loadNetwork(tasks: cTasks, dependencies: cDeps);
      final cycleRes = kernel.calculateSchedule();
      expect(cycleRes.success, isFalse, reason: 'Cycle loop must fail schedule');
      expect(cycleRes.cyclicTaskIds, containsAll(['t1', 't2', 't3']));

      // Scenario 2: scenario-negative-float-constraint
      final negFloatScenario = scenarios.firstWhere((s) => s['id'] == 'scenario-negative-float-constraint');
      final nfRawTask = (negFloatScenario['tasks'] as List).first;
      final nfTask = CpmTask(
        id: nfRawTask['id'],
        name: nfRawTask['name'],
        durationDays: nfRawTask['duration'],
        originalStartDate: DateTime.parse(nfRawTask['startDate']),
        constraintType: ConstraintType.fnlt,
        constraintDate: DateTime.parse(nfRawTask['constraintDate']),
      );

      kernel.loadNetwork(tasks: [nfTask], dependencies: []);
      final nfRes = kernel.calculateSchedule();
      expect(nfRes.success, isTrue);
      final computedNfTask = nfRes.computedTasks['p1']!;
      expect(computedNfTask.totalFloatDays, lessThan(0), reason: 'Impossible deadline must produce negative float');
      expect(computedNfTask.totalFloatDays, equals(-5), reason: 'Expected -5 days negative float per fixture');

      // Scenario 3: scenario-negative-lag-lead
      final leadScenario = scenarios.firstWhere((s) => s['id'] == 'scenario-negative-lag-lead');
      final leadTasks = (leadScenario['tasks'] as List).map((t) {
        return CpmTask(
          id: t['id'],
          name: t['name'],
          durationDays: t['duration'],
          originalStartDate: DateTime.parse(t['startDate']),
        );
      }).toList();
      final leadDeps = (leadScenario['dependencies'] as List).map((d) {
        return CpmDependency(
          predecessorId: d['predecessorId'],
          successorId: d['successorId'],
          type: DependencyType.ss,
          lagHours: d['lagHours'],
        );
      }).toList();

      kernel.loadNetwork(tasks: leadTasks, dependencies: leadDeps);
      final leadRes = kernel.calculateSchedule();
      expect(leadRes.success, isTrue);
      final formworkTask = leadRes.computedTasks['t-formwork']!;
      final rebarTask = leadRes.computedTasks['t-rebar']!;
      expect(formworkTask.earlyStart!.isBefore(rebarTask.earlyStart!), isTrue);

      // Scenario 4: scenario-disconnected-islands
      final islandScenario = scenarios.firstWhere((s) => s['id'] == 'scenario-disconnected-islands');
      final islandTasks = (islandScenario['tasks'] as List).map((t) {
        return CpmTask(
          id: t['id'],
          name: t['name'],
          durationDays: t['duration'],
          originalStartDate: DateTime.parse(t['startDate']),
        );
      }).toList();
      final islandDeps = (islandScenario['dependencies'] as List).map((d) {
        return CpmDependency(
          predecessorId: d['predecessorId'],
          successorId: d['successorId'],
          type: DependencyType.fs,
        );
      }).toList();

      kernel.loadNetwork(tasks: islandTasks, dependencies: islandDeps);
      final islandRes = kernel.calculateSchedule();
      expect(islandRes.success, isTrue);
      expect(islandRes.computedTasks.length, equals(4));
    });
  });

  group('M00 Scale Network Benchmark (1,000 Tasks / 5,000 Dependencies) (M01-T08)', () {
    test('Calculates 1k tasks / 5k dependencies from sample_cpm_1k.json', () {
      final fixturePath = '../../fixtures/platform-parity/cpm/sample_cpm_1k.json';
      final file = File(fixturePath);
      expect(file.existsSync(), isTrue, reason: '1k CPM fixture must exist');

      final content = file.readAsStringSync();
      final fixture = jsonDecode(content) as Map<String, dynamic>;
      final rawTasks = fixture['tasks'] as List;
      final rawDeps = fixture['dependencies'] as List;

      final tasks = rawTasks.map((t) {
        return CpmTask(
          id: t['id'],
          name: t['name'],
          durationDays: t['duration'],
          isMilestone: t['isMilestone'] ?? false,
          originalStartDate: DateTime.parse(t['startDate']),
        );
      }).toList();

      final dependencies = rawDeps.map((d) {
        final typeStr = (d['type'] as String?)?.toUpperCase() ?? 'FS';
        DependencyType type = DependencyType.fs;
        if (typeStr == 'SS') type = DependencyType.ss;
        if (typeStr == 'FF') type = DependencyType.ff;
        if (typeStr == 'SF') type = DependencyType.sf;

        return CpmDependency(
          predecessorId: d['predecessorId'],
          successorId: d['successorId'],
          type: type,
          lagHours: d['lagHours'] ?? 0,
        );
      }).toList();

      final benchmark = CpmKernelBenchmarkRunner.runComparison(
        tasks: tasks,
        dependencies: dependencies,
        scenario: '1,000 Tasks / 5,000 Dependencies Scale Network',
      );

      expect(benchmark.taskCount, equals(1000));
      expect(benchmark.dependencyCount, equals(5000));
      expect(benchmark.criticalPathTaskCount, greaterThan(0));
      expect(benchmark.totalDurationDays, greaterThan(0));

      // Candidate A: In-process Dart should complete in well under 250ms in debug test harness
      expect(benchmark.candidateAMs, lessThan(250.0));

      // Candidate C: Server TS RPC suffers network RTT overhead (>20ms)
      expect(benchmark.candidateCMs, greaterThan(20.0));
    });

    test('Validates Instruction 9 Governance Compliance', () {
      final gov = CpmKernelBenchmarkRunner.governance;
      expect(gov.componentName, equals('DartCpmKernel (Client-Side CPM Port)'));
      expect(gov.classification, equals('Temporary Client Duplicate (Instruction 9)'));
      expect(gov.designatedOwner, isNotEmpty);
      expect(gov.removalGate, contains('M09'));
      expect(gov.authoritativeSource, contains('cpm-engine.ts'));
    });
  });
}
