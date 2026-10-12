/// Dart mount of the M03-T07 client drain policy (M04-T03).
///
/// This is a port of `packages/native_orchestrator/src/orchestrator.ts` over
/// the M04-T02 ports. Storage, digest, transport, and server authority remain
/// behind those ports. The policy never deletes work and records acceptance
/// only from a typed server response.
library;

import 'dart:async';
import 'dart:math' as math;

import 'drain_triggers.dart';
import 'mount.dart';
import 'ports.dart';

abstract interface class OrchestratorRandomPort {
  /// Uniform value in [0, 1), used for full-jitter retry delays.
  double next();
}

class SecureOrchestratorRandom implements OrchestratorRandomPort {
  final math.Random _random;

  SecureOrchestratorRandom() : _random = math.Random.secure();

  @override
  double next() => _random.nextDouble();
}

abstract interface class AuthEventSink {
  void onAuthEvent(String kind, String? opId);
}

class DrainResult {
  final List<String> dispatched;
  final List<String> accepted;
  final List<String> previouslyAccepted;
  final List<String> conflicts;
  final List<String> rejected;
  final List<String> blocked;
  final List<String> retrying;
  final List<String> skippedForDependencies;
  final String? stoppedFor;

  const DrainResult({
    this.dispatched = const [],
    this.accepted = const [],
    this.previouslyAccepted = const [],
    this.conflicts = const [],
    this.rejected = const [],
    this.blocked = const [],
    this.retrying = const [],
    this.skippedForDependencies = const [],
    this.stoppedFor,
  });
}

class _DrainAccumulator {
  final dispatched = <String>[];
  final accepted = <String>[];
  final previouslyAccepted = <String>[];
  final conflicts = <String>[];
  final rejected = <String>[];
  final blocked = <String>[];
  final retrying = <String>[];
  final skippedForDependencies = <String>[];
  String? stoppedFor;

  DrainResult freeze() => DrainResult(
    dispatched: List.unmodifiable(dispatched),
    accepted: List.unmodifiable(accepted),
    previouslyAccepted: List.unmodifiable(previouslyAccepted),
    conflicts: List.unmodifiable(conflicts),
    rejected: List.unmodifiable(rejected),
    blocked: List.unmodifiable(blocked),
    retrying: List.unmodifiable(retrying),
    skippedForDependencies: List.unmodifiable(skippedForDependencies),
    stoppedFor: stoppedFor,
  );
}

class DailyLogSyncOrchestrator {
  static const int defaultMaxAttempts = 8;
  static const int defaultBackoffBaseMs = 1000;
  static const int defaultBackoffCapMs = 5 * 60 * 1000;
  static const int defaultBatchLimit = 32;

  final ConstructionMount mount;
  final String deviceId;
  final OrchestratorRandomPort random;
  final AuthEventSink? authEvents;
  final bool Function(String accountId, String opId) isAccepted;
  final int Function() nowMs;
  final int maxAttempts;
  final int backoffBaseMs;
  final int backoffCapMs;
  final int batchLimit;

  bool _draining = false;

  DailyLogSyncOrchestrator({
    required this.mount,
    required this.deviceId,
    OrchestratorRandomPort? random,
    this.authEvents,
    bool Function(String accountId, String opId)? isAccepted,
    int Function()? nowMs,
    this.maxAttempts = defaultMaxAttempts,
    this.backoffBaseMs = defaultBackoffBaseMs,
    this.backoffCapMs = defaultBackoffCapMs,
    this.batchLimit = defaultBatchLimit,
  }) : random = random ?? SecureOrchestratorRandom(),
       isAccepted = isAccepted ?? ((_, _) => false),
       nowMs = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch) {
    if (deviceId.isEmpty) {
      throw ArgumentError.value(
        deviceId,
        'deviceId',
        'Device identity is required.',
      );
    }
    if (maxAttempts < 1 ||
        backoffBaseMs < 0 ||
        backoffCapMs < 0 ||
        batchLimit < 1) {
      throw ArgumentError('Invalid orchestrator retry or batch policy.');
    }
  }

  bool get isDraining => _draining;

  /// Binds launch, foreground, manual, and background-gated mount triggers
  /// to the active account's drain. The account resolver is evaluated when
  /// a trigger fires, so logout/account changes take effect immediately.
  void bindDrainTriggers(String Function() accountId) {
    mount.drainTriggers.bind(
      isDraining: () => isDraining,
      drain: (trigger) async {
        final account = accountId();
        if (account.isEmpty) return;
        if (trigger == DrainTrigger.background) {
          await drainInBackground(account, _triggerEnvironment);
        } else {
          await drain(account);
        }
      },
    );
  }

  ExecutionEnvironmentPort get _triggerEnvironment =>
      mount.drainTriggers.environment ?? const ForegroundOnlyEnvironment();

  int _jitterDelayMs(int attempt) {
    final scale = math.pow(2, attempt).toDouble();
    final ceiling = math.min(backoffCapMs.toDouble(), backoffBaseMs * scale);
    return (random.next() * ceiling).floor();
  }

  /// One foreground drain pass. Concurrent trigger calls coalesce to an
  /// empty result; each operation has its own typed outcome boundary.
  Future<DrainResult> drain(String accountId) async {
    if (_draining) return const DrainResult();
    _draining = true;
    final result = _DrainAccumulator();
    try {
      // Lost-ack recovery: replay the same op id; the server ledger returns
      // the original receipt without applying the domain write twice.
      for (final op in mount.pendingOps.listInFlight(accountId)) {
        mount.pendingOps.requeue(op.opId, null);
      }

      final due = mount.pendingOps.listDue(accountId, nowMs()).take(batchLimit);
      for (final op in due) {
        if (result.stoppedFor != null) break;
        if (op.state != 'pending' || op.attempts >= maxAttempts) continue;

        var blockedByFailure = false;
        var waitingOnPending = false;
        for (final dependencyId in op.dependsOnOpIds) {
          if (isAccepted(accountId, dependencyId)) continue;
          final dependency = mount.pendingOps.getOp(accountId, dependencyId);
          if (dependency == null ||
              const {
                'rejected',
                'blocked',
                'conflict',
              }.contains(dependency.state)) {
            blockedByFailure = true;
          } else {
            waitingOnPending = true;
          }
        }
        if (blockedByFailure) {
          mount.pendingOps.markBlocked(
            op.opId,
            'prerequisite failed terminally',
          );
          result.blocked.add(op.opId);
          continue;
        }
        if (waitingOnPending) {
          result.skippedForDependencies.add(op.opId);
          continue;
        }

        final inFlight = mount.pendingOps.markInFlight(op.opId);
        final envelope = mount.envelopeFor(
          op: inFlight,
          deviceId: deviceId,
          attempt: inFlight.attempts,
          nowMs: nowMs(),
        );
        result.dispatched.add(op.opId);

        late final SyncOutcome outcome;
        try {
          outcome = await mount.transport.send(envelope);
        } catch (_) {
          final nextAt = inFlight.attempts >= maxAttempts
              ? null
              : nowMs() + _jitterDelayMs(inFlight.attempts);
          mount.pendingOps.requeue(op.opId, nextAt);
          result.retrying.add(op.opId);
          continue;
        }

        // A typed response for another op, or an acceptance without its
        // server-issued receipt, cannot advance local state. Replay safely.
        if (outcome.opId != op.opId ||
            ((outcome.kind == SyncOutcomeKind.accepted ||
                    outcome.kind == SyncOutcomeKind.previouslyAccepted) &&
                (outcome.receipt == null || outcome.receipt!.isEmpty))) {
          final nextAt = inFlight.attempts >= maxAttempts
              ? null
              : nowMs() + _jitterDelayMs(inFlight.attempts);
          mount.pendingOps.requeue(op.opId, nextAt);
          result.retrying.add(op.opId);
          continue;
        }

        switch (outcome.kind) {
          case SyncOutcomeKind.accepted:
            mount.pendingOps.recordAccepted(
              op.opId,
              outcome.receipt!,
              outcome.serverSeq,
            );
            result.accepted.add(op.opId);
            break;
          case SyncOutcomeKind.previouslyAccepted:
            mount.pendingOps.recordAccepted(
              op.opId,
              outcome.receipt!,
              outcome.serverSeq,
            );
            result.previouslyAccepted.add(op.opId);
            break;
          case SyncOutcomeKind.conflict:
            mount.pendingOps.markConflict(
              op.opId,
              outcome.detail ?? 'conflict',
            );
            result.conflicts.add(op.opId);
            break;
          case SyncOutcomeKind.rejected:
            mount.pendingOps.recordRejected(
              op.opId,
              outcome.detail ?? 'rejected',
            );
            result.rejected.add(op.opId);
            break;
          case SyncOutcomeKind.revoked:
          case SyncOutcomeKind.authenticationRequired:
            final kind = outcome.kind.wire;
            authEvents?.onAuthEvent(kind, op.opId);
            mount.pendingOps.requeue(op.opId, null);
            result.stoppedFor = kind;
            break;
          case SyncOutcomeKind.dependencyBlocked:
            mount.pendingOps.markBlocked(
              op.opId,
              outcome.detail ?? 'dependency blocked server-side',
            );
            result.blocked.add(op.opId);
            break;
          case SyncOutcomeKind.retryable:
            final delay =
                outcome.retryAfterMs ?? _jitterDelayMs(inFlight.attempts);
            mount.pendingOps.requeue(
              op.opId,
              inFlight.attempts >= maxAttempts ? null : nowMs() + delay,
            );
            result.retrying.add(op.opId);
            break;
        }
      }
      return result.freeze();
    } finally {
      _draining = false;
    }
  }

  /// Background attempts are optional. A failed environment gate leaves all
  /// pending work untouched; foreground drains never consult this gate.
  Future<DrainResult> drainInBackground(
    String accountId,
    ExecutionEnvironmentPort environment,
  ) async {
    if (!environment.suitableForBackgroundSync().ok) return const DrainResult();
    return drain(accountId);
  }
}
