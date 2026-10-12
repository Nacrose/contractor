/// Orchestrator drain triggers (M04-T02).
///
/// Wires the v3 §5.3 drain triggers to a plain callback the orchestrator
/// port (M04-T03) supplies:
///   - app launch  -> onLaunch (called once by the host after engine start)
///   - foreground  -> didChangeAppLifecycleState(resumed) — foreground sync
///     works WITHOUT OS background scheduling;
///   - manual      -> manual() — user action, always eligible;
///   - background-gated -> maybeBackgroundDrain() — consults the
///     ExecutionEnvironmentPort first and skips cleanly when constraints
///     are unmet (pending work untouched); background triggers are
///     best-effort enhancements only (M05-T06 pins the never-ran case).
///
/// Triggers only START drains: a trigger while a drain is running is
/// coalesced (never stacked, never bypassed backoff). The trigger layer
/// never fabricates outcomes and never touches pending work itself.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';

import 'ports.dart';

enum DrainTrigger { launch, foreground, manual, background }

typedef DrainCallback = Future<void> Function(DrainTrigger trigger);

class SyncDrainTriggers with WidgetsBindingObserver {
  DrainCallback drain;
  final ExecutionEnvironmentPort? environment;
  bool Function() _isDraining;

  bool _attached = false;

  SyncDrainTriggers({
    required this.drain,
    this.environment,
    required this._isDraining,
  });

  /// Connects the M04-T03 orchestrator after the mount is composed. This
  /// keeps the M04-T02 ports free of a dependency on a workflow instance.
  void bind({
    required DrainCallback drain,
    required bool Function() isDraining,
  }) {
    this.drain = drain;
    _isDraining = isDraining;
  }

  /// Host calls once after engine start (app-launch trigger).
  Future<void> onLaunch() => _start(DrainTrigger.launch);

  /// User action — always eligible.
  Future<void> manual() => _start(DrainTrigger.manual);

  /// OS background opportunity (M05-T06 scheduler adapters call this).
  /// Foreground rules do NOT apply: the environment gate decides.
  Future<void> maybeBackgroundDrain() async {
    final env = environment;
    if (env != null) {
      final verdict = env.suitableForBackgroundSync();
      if (!verdict.ok) {
        return; // constraints unmet: skip cleanly, pending work untouched
      }
    }
    await _start(DrainTrigger.background);
  }

  Future<void> attach() async {
    if (_attached) return;
    _attached = true;
    WidgetsBinding.instance.addObserver(this);
  }

  Future<void> detach() async {
    if (!_attached) return;
    _attached = false;
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_start(DrainTrigger.foreground));
    }
    // paused/detached: mobile hosts stop executing Dart anyway; background
    // opportunities arrive through maybeBackgroundDrain (OS schedulers).
  }

  Future<void> _start(DrainTrigger trigger) async {
    if (_isDraining()) {
      return; // coalesce: a running drain already covers this trigger
    }
    try {
      await drain(trigger);
    } catch (_) {
      // Trigger failures are the orchestrator's typed outcomes' business;
      // the trigger layer never surfaces an untyped crash of its own.
    }
  }
}

/// Default environment gate for the prototype: background execution is
/// treated as UNSUITABLE until the M05-T06 OS scheduler adapters land —
/// foreground sync carries the product until then (v3: foreground sync
/// works without OS background scheduling).
class ForegroundOnlyEnvironment implements ExecutionEnvironmentPort {
  const ForegroundOnlyEnvironment();

  @override
  ({bool ok, String? reason}) suitableForBackgroundSync() {
    return (
      ok: false,
      reason: 'background scheduling adapters land in M05-T06; foreground drains carry sync',
    );
  }
}
