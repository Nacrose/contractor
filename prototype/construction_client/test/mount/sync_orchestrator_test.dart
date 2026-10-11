import 'dart:io';

import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/outbox_repository.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_orchestrator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory tmp;
  ConstructionMount? currentMount;
  ConstructionMount getMount() => currentMount!;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('daily_log_orchestrator_test');
  });

  tearDown(() async {
    currentMount?.driver.close();
    currentMount = null;
    await tmp.delete(recursive: true);
  });

  ConstructionMount openWith(SyncTransportPort transport) => openMount(
    options: MountOptions(
      dbPath: '${tmp.path}/outbox.db',
      objectRoot: Directory('${tmp.path}/objects'),
    ),
    credentials: _Credentials(),
    transport: transport,
  );

  void enqueue(String id, {List<String> dependsOn = const []}) {
    getMount().outbox.saveMutation(
      SaveMutationInput(
        accountId: 'acct-1',
        projectId: 'project-1',
        op: PendingOpInput(
          opId: id,
          kind: 'dailyReport.createFieldReport',
          payload: '{"projectId":"project-1","clientUuid":"$id"}',
          dependsOnOpIds: dependsOn,
          tenantId: 'tenant-1',
          role: 'field',
        ),
      ),
    );
  }

  DailyLogSyncOrchestrator orchestrator(
    SyncTransportPort transport, {
    AuthEventSink? authEvents,
    bool Function(String, String)? isAccepted,
  }) {
    currentMount = openWith(transport);
    return DailyLogSyncOrchestrator(
      mount: getMount(),
      deviceId: 'device-1',
      random: _FixedRandom(),
      authEvents: authEvents,
      isAccepted: isAccepted,
      nowMs: () => 1000,
      backoffBaseMs: 10,
      backoffCapMs: 100,
    );
  }

  test('accepted outcome records the server receipt and feed cursor', () async {
    final engine = orchestrator(
      _Transport(
        (envelope) async => SyncOutcome(
          kind: SyncOutcomeKind.accepted,
          opId: envelope.opId,
          receipt: 'receipt-1',
          serverSeq: 18,
        ),
      ),
    );
    enqueue('op-1');

    final result = await engine.drain('acct-1');

    expect(result.dispatched, ['op-1']);
    expect(result.accepted, ['op-1']);
    final row = getMount().pendingOps.getOp('acct-1', 'op-1')!;
    expect(row.state, 'accepted');
    expect(row.acceptedReceipt, 'receipt-1');
    expect(row.serverSeq, 18);
  });

  test(
    'network loss requeues, then previously_accepted recovers the lost ACK',
    () async {
      var calls = 0;
      final engine = orchestrator(
        _Transport((envelope) async {
          calls++;
          if (calls == 1) throw const SocketException('response lost');
          return SyncOutcome(
            kind: SyncOutcomeKind.previouslyAccepted,
            opId: envelope.opId,
            receipt: 'original-receipt',
            serverSeq: 19,
          );
        }),
      );
      enqueue('op-lost-ack');

      final first = await engine.drain('acct-1');
      expect(first.retrying, ['op-lost-ack']);
      expect(
        getMount().pendingOps.getOp('acct-1', 'op-lost-ack')!.state,
        'pending',
      );

      // Make the retry due without mutating any server outcome state.
      getMount().outbox.driver
          .prepare('UPDATE pending_op SET next_attempt_at = NULL WHERE id = ?')
          .run(['op-lost-ack']);
      final second = await engine.drain('acct-1');

      expect(second.previouslyAccepted, ['op-lost-ack']);
      expect(calls, 2);
      expect(
        getMount().pendingOps.getOp('acct-1', 'op-lost-ack')!.acceptedReceipt,
        'original-receipt',
      );
    },
  );

  test(
    'a prerequisite accepted earlier in the batch unblocks its dependent',
    () async {
      final engine = orchestrator(
        _Transport(
          (envelope) async => SyncOutcome(
            kind: SyncOutcomeKind.accepted,
            opId: envelope.opId,
            receipt: 'receipt-${envelope.opId}',
          ),
        ),
        isAccepted: (accountId, opId) =>
            getMount().pendingOps.getOp(accountId, opId)?.state == 'accepted',
      );
      enqueue('a-parent');
      enqueue('z-child', dependsOn: ['a-parent']);

      final result = await engine.drain('acct-1');

      expect(result.dispatched, ['a-parent', 'z-child']);
      expect(result.accepted, ['a-parent', 'z-child']);
    },
  );

  test(
    'authentication expiry stops the batch and preserves later work',
    () async {
      final authEvents = _AuthEvents();
      var calls = 0;
      final engine = orchestrator(
        _Transport((envelope) async {
          calls++;
          return SyncOutcome(
            kind: SyncOutcomeKind.authenticationRequired,
            opId: envelope.opId,
            detail: 'session expired',
          );
        }),
        authEvents: authEvents,
      );
      enqueue('op-first');
      enqueue('op-second');

      final result = await engine.drain('acct-1');

      expect(result.stoppedFor, 'authentication_required');
      expect(result.dispatched, ['op-first']);
      expect(calls, 1);
      expect(authEvents.events, [('authentication_required', 'op-first')]);
      expect(
        getMount().pendingOps.getOp('acct-1', 'op-first')!.state,
        'pending',
      );
      expect(
        getMount().pendingOps.getOp('acct-1', 'op-second')!.state,
        'pending',
      );
    },
  );

  test('conflict remains visible and is never silently deleted', () async {
    final engine = orchestrator(
      _Transport(
        (envelope) async => SyncOutcome(
          kind: SyncOutcomeKind.conflict,
          opId: envelope.opId,
          detail: 'base version changed',
        ),
      ),
    );
    enqueue('op-conflict');

    final result = await engine.drain('acct-1');

    expect(result.conflicts, ['op-conflict']);
    expect(
      getMount().pendingOps.getOp('acct-1', 'op-conflict')!.state,
      'conflict',
    );
  });

  test(
    'an acceptance without the matching op id and server receipt is retried',
    () async {
      final engine = orchestrator(
        _Transport(
          (_) async => const SyncOutcome(
            kind: SyncOutcomeKind.accepted,
            opId: 'different-op',
          ),
        ),
      );
      enqueue('op-untrusted-ack');

      final result = await engine.drain('acct-1');

      expect(result.retrying, ['op-untrusted-ack']);
      expect(
        getMount().pendingOps.getOp('acct-1', 'op-untrusted-ack')!.state,
        'pending',
      );
      expect(
        getMount().pendingOps
            .getOp('acct-1', 'op-untrusted-ack')!
            .acceptedReceipt,
        isNull,
      );
    },
  );

  test(
    'mount manual trigger dispatches through the bound orchestrator',
    () async {
      var calls = 0;
      final engine = orchestrator(
        _Transport((envelope) async {
          calls++;
          return SyncOutcome(
            kind: SyncOutcomeKind.accepted,
            opId: envelope.opId,
            receipt: 'receipt-trigger',
          );
        }),
      );
      engine.bindDrainTriggers(() => 'acct-1');
      enqueue('op-trigger');

      await getMount().drainTriggers.manual();

      expect(calls, 1);
      expect(
        getMount().pendingOps.getOp('acct-1', 'op-trigger')!.state,
        'accepted',
      );
    },
  );
}

class _Transport implements SyncTransportPort {
  final Future<SyncOutcome> Function(SyncEnvelope) respond;

  _Transport(this.respond);

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) => respond(envelope);
}

class _FixedRandom implements OrchestratorRandomPort {
  @override
  double next() => 0.5;
}

class _AuthEvents implements AuthEventSink {
  final events = <(String, String?)>[];

  @override
  void onAuthEvent(String kind, String? opId) => events.add((kind, opId));
}

class _Credentials implements SecureCredentialStore {
  @override
  SecureStorageBinding get binding => SecureStorageBinding.linuxSecretService;

  @override
  Future<void> delete(CredentialRef ref) async {}

  @override
  Future<String?> load(CredentialRef ref) async => null;

  @override
  Future<void> save(CredentialRef ref, String value) async {}

  @override
  Future<void> wipeAll() async {}
}
