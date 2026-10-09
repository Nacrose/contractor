import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/drain_triggers.dart';
import 'package:construction_client/mount/ports.dart';

/// The v3 §5.3 drain triggers at the mount boundary (M04-T02): launch,
/// foreground, manual, and the background gate. Triggers only START drains;
/// they never fabricate outcomes and never touch pending work.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<DrainTrigger> started;
  late bool draining;
  late SyncDrainTriggers triggers;

  setUp(() {
    started = [];
    draining = false;
    triggers = SyncDrainTriggers(
      drain: (trigger) async {
        started.add(trigger);
      },
      environment: const ForegroundOnlyEnvironment(),
      isDraining: () => draining,
    );
  });

  tearDown(() async {
    await triggers.detach();
  });

  test('the launch trigger starts a drain', () async {
    await triggers.onLaunch();
    expect(started, [DrainTrigger.launch]);
  });

  test('the manual trigger always starts a drain', () async {
    await triggers.manual();
    expect(started, [DrainTrigger.manual]);
  });

  test('the foreground trigger fires on lifecycle resume (foreground sync needs NO OS scheduler)', () async {
    await triggers.attach();
    // The test binding simulates the engine's lifecycle notifications.
    WidgetsBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await Future<void>.delayed(Duration.zero);
    expect(started, [DrainTrigger.foreground]);
  });

  test('the background gate REFUSES cleanly while the prototype environment is unsuitable', () async {
    await triggers.maybeBackgroundDrain();
    expect(started, isEmpty,
        reason: 'ForegroundOnlyEnvironment: background scheduling lands in M05-T06; '
            'every correctness property holds with background disabled');
  });

  test('a suitable environment lets the background trigger through', () async {
    final permissive = SyncDrainTriggers(
      drain: (trigger) async => started.add(trigger),
      environment: const _SuitableEnvironment(),
      isDraining: () => false,
    );
    await permissive.maybeBackgroundDrain();
    expect(started, [DrainTrigger.background]);
  });

  test('triggers coalesce while a drain is running (never stacked)', () async {
    draining = true;
    await triggers.onLaunch();
    await triggers.manual();
    await triggers.maybeBackgroundDrain();
    expect(started, isEmpty, reason: 'a running drain already covers every trigger');
  });

  test('a drain crash does not escape the trigger layer (the orchestrator owns typed outcomes)', () async {
    final failing = SyncDrainTriggers(
      drain: (trigger) async => throw StateError('orchestrator failed'),
      environment: const ForegroundOnlyEnvironment(),
      isDraining: () => false,
    );
    await failing.onLaunch();
    expect(started, isEmpty);
  });
}

class _SuitableEnvironment implements ExecutionEnvironmentPort {
  const _SuitableEnvironment();

  @override
  ({bool ok, String? reason}) suitableForBackgroundSync() => (ok: true, reason: null);
}
