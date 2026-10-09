import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_transport.dart';

void main() {
  // Fixture server: routes by the envelope's opId in the POST body.
  //   registered opId -> 200 + typed outcome body
  //   opId 'raw-html' -> 502 + HTML garbage (unparseable)
  //   anything else   -> 503 + typed retryable body (status is not the contract)
  late HttpServer server;
  late Uri endpoint;
  final responses = <String, Map<String, Object?>>{};
  final receivedBodies = <String, Map<String, Object?>>{};

  setUp(() async {
    responses.clear();
    receivedBodies.clear();
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final bodyText = await utf8.decoder.bind(request).join();
      Object? decoded;
      try {
        decoded = bodyText.isEmpty ? null : jsonDecode(bodyText);
      } catch (_) {
        decoded = null;
      }
      final opId = decoded is Map ? '${decoded['opId']}' : '';

      if (opId == 'raw-html') {
        request.response.statusCode = 502;
        request.response.headers.contentType = ContentType.html;
        request.response.write('<html>gateway error</html>');
        await request.response.close();
        return;
      }
      if (decoded is Map) receivedBodies[opId] = Map<String, Object?>.from(decoded);

      final typed = responses[opId] ??
          {'kind': 'retryable', 'opId': opId, 'retryAfterMs': 5000, 'detail': 'server busy'};
      request.response.statusCode = responses.containsKey(opId) ? 200 : 503;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(typed));
      await request.response.close();
    });
    endpoint = Uri.parse('http://127.0.0.1:${server.port}/sync');
  });

  tearDown(() async {
    await server.close(force: true);
  });

  SyncEnvelope envelope(String opId) => SyncEnvelope(
        syncProtocolVersion: kSyncProtocolVersion,
        opId: opId,
        deviceId: 'device-1',
        accountId: 'acc',
        kind: 'fieldSubmission.submit',
        scopeClaims: const ScopeClaims(tenantId: 'tenant-1', projectId: 'proj-1', role: 'lead'),
        payloadDigest: 'aa' * 32,
        payload: '{"n":1}',
        dependsOnOpIds: const ['dep-9'],
        attempt: 2,
        sentAtMs: 1234,
      );

  group('HttpSyncTransport', () {
    test('all eight v3 §5.3 outcome kinds arrive as typed outcomes', () async {
      final transport = HttpSyncTransport(endpoint: endpoint);
      final kinds = <String, Map<String, Object?>>{
        'accepted': {'kind': 'accepted', 'opId': 'k-accepted', 'receipt': 'rcp-1', 'serverSeq': 41},
        'previously_accepted': {
          'kind': 'previously_accepted',
          'opId': 'k-replay',
          'receipt': 'rcp-1',
          'serverSeq': 41,
        },
        'conflict': {'kind': 'conflict', 'opId': 'k-conflict', 'detail': 'base-version mismatch'},
        'rejected': {'kind': 'rejected', 'opId': 'k-rejected', 'detail': 'malformed_request'},
        'revoked': {'kind': 'revoked', 'opId': 'k-revoked'},
        'authentication_required': {'kind': 'authentication_required', 'opId': 'k-authreq'},
        'dependency_blocked': {'kind': 'dependency_blocked', 'opId': 'k-depblock', 'detail': 'prereq failed'},
        'retryable': {'kind': 'retryable', 'opId': 'k-retryable', 'retryAfterMs': 2500},
      };
      for (final body in kinds.values) {
        responses[body['opId'] as String] = body;
      }

      final accepted = await transport.send(envelope('k-accepted'));
      expect(accepted.kind, SyncOutcomeKind.accepted);
      expect(accepted.receipt, 'rcp-1');
      expect(accepted.serverSeq, 41);

      expect((await transport.send(envelope('k-replay'))).kind, SyncOutcomeKind.previouslyAccepted);
      expect((await transport.send(envelope('k-conflict'))).kind, SyncOutcomeKind.conflict);
      expect((await transport.send(envelope('k-rejected'))).kind, SyncOutcomeKind.rejected);
      expect((await transport.send(envelope('k-revoked'))).kind, SyncOutcomeKind.revoked);
      expect((await transport.send(envelope('k-authreq'))).kind, SyncOutcomeKind.authenticationRequired);
      expect((await transport.send(envelope('k-depblock'))).kind, SyncOutcomeKind.dependencyBlocked);

      final retry = await transport.send(envelope('k-retryable'));
      expect(retry.kind, SyncOutcomeKind.retryable);
      expect(retry.retryAfterMs, 2500);
    });

    test('a typed body wins over the HTTP status (503 + typed retryable parses)', () async {
      final transport = HttpSyncTransport(endpoint: endpoint);
      // 'unmapped' is not registered -> the fixture answers 503 with a typed
      // retryable body; the contract is the TYPED response, not the status.
      final outcome = await transport.send(envelope('unmapped-typed'));
      expect(outcome.kind, SyncOutcomeKind.retryable);
      expect(outcome.retryAfterMs, 5000);
    });

    test('the envelope JSON round-trips to the server (field-for-field)', () async {
      final transport = HttpSyncTransport(endpoint: endpoint);
      await transport.send(envelope('wire-check'));
      final received = receivedBodies['wire-check']!;
      expect(received['syncProtocolVersion'], kSyncProtocolVersion);
      expect(received['opId'], 'wire-check');
      expect(received['deviceId'], 'device-1');
      expect(received['accountId'], 'acc');
      expect(received['kind'], 'fieldSubmission.submit');
      expect((received['scopeClaims'] as Map)['tenantId'], 'tenant-1');
      expect(received['payloadDigest'], 'aa' * 32);
      expect(received['payload'], '{"n":1}');
      expect(received['dependsOnOpIds'], ['dep-9']);
      expect(received['attempt'], 2);
    });

    test('an unparseable body THROWS — no HTML ever becomes an outcome', () async {
      final transport = HttpSyncTransport(endpoint: endpoint);
      await expectLater(
        transport.send(envelope('raw-html')),
        throwsStateError,
      );
    });

    test('network death THROWS (the orchestrator maps it to retryable backoff)', () async {
      final dead = HttpSyncTransport(endpoint: Uri.parse('http://127.0.0.1:1/sync'));
      await expectLater(dead.send(envelope('op-dead')), throwsStateError);
    });
  });

  group('buildSyncEnvelope (envelope.ts buildEnvelope port)', () {
    test('carries protocol version, injected digest, dependencies, attempt', () {
      const digest = _FixedDigestPort();
      final op = const PendingOpRecord(
        opId: 'op-1',
        accountId: 'acc',
        projectId: 'proj-1',
        kind: 'fieldSubmission.submit',
        payload: '{"n":1}',
        digest: null,
        dependsOnOpIds: ['dep-1'],
        state: 'pending',
        attempts: 1,
        nextAttemptAtMs: null,
        lastError: null,
        acceptedReceipt: null,
        serverSeq: null,
        tenantId: 'tenant-1',
        role: 'lead',
      );
      final env = buildSyncEnvelope(op: op, deviceId: 'device-1', attempt: 1, nowMs: 999, digest: digest);
      expect(env.syncProtocolVersion, kSyncProtocolVersion);
      expect(env.opId, 'op-1');
      expect(env.deviceId, 'device-1');
      expect(env.kind, 'fieldSubmission.submit');
      expect(env.scopeClaims.tenantId, 'tenant-1');
      expect(env.scopeClaims.projectId, 'proj-1');
      expect(env.scopeClaims.role, 'lead');
      expect(env.payloadDigest, 'fixed-digest', reason: 'digest via the injected fail-closed port');
      expect(env.dependsOnOpIds, ['dep-1']);
      expect(env.attempt, 1);
      expect(env.sentAtMs, 999);
    });

    test('structural validation mirrors envelope.ts (empty ids, attempt < 1)', () {
      const digest = _FixedDigestPort();
      PendingOpRecord opWith({String opId = 'op', String kind = 'k', String accountId = 'a'}) =>
          PendingOpRecord(
            opId: opId,
            accountId: accountId,
            projectId: null,
            kind: kind,
            payload: '{}',
            digest: null,
            dependsOnOpIds: const [],
            state: 'pending',
            attempts: 1,
            nextAttemptAtMs: null,
            lastError: null,
            acceptedReceipt: null,
            serverSeq: null,
          );

      expect(
        () => buildSyncEnvelope(op: opWith(opId: ''), deviceId: 'd', attempt: 1, nowMs: 1, digest: digest),
        throwsA(isA<EnvelopeValidationError>()),
      );
      expect(
        () => buildSyncEnvelope(op: opWith(kind: ''), deviceId: 'd', attempt: 1, nowMs: 1, digest: digest),
        throwsA(isA<EnvelopeValidationError>()),
      );
      expect(
        () => buildSyncEnvelope(op: opWith(), deviceId: '', attempt: 1, nowMs: 1, digest: digest),
        throwsA(isA<EnvelopeValidationError>()),
      );
      expect(
        () => buildSyncEnvelope(op: opWith(), deviceId: 'd', attempt: 0, nowMs: 1, digest: digest),
        throwsA(isA<EnvelopeValidationError>()),
      );
    });

    test('claims default to the orchestrator fallback chain (tenantId ?? accountId, role ?? member)', () {
      const digest = _FixedDigestPort();
      final op = const PendingOpRecord(
        opId: 'op-2',
        accountId: 'acc-fallback',
        projectId: null,
        kind: 'k',
        payload: '{}',
        digest: null,
        dependsOnOpIds: [],
        state: 'pending',
        attempts: 1,
        nextAttemptAtMs: null,
        lastError: null,
        acceptedReceipt: null,
        serverSeq: null,
      );
      final env = buildSyncEnvelope(op: op, deviceId: 'd', attempt: 1, nowMs: 1, digest: digest);
      expect(env.scopeClaims.tenantId, 'acc-fallback');
      expect(env.scopeClaims.role, 'member');
      expect(env.scopeClaims.projectId, isNull);
    });
  });

  group('parseSyncOutcome (typed parse, fail-safe on junk)', () {
    test('returns null for junk instead of inventing a kind', () {
      expect(parseSyncOutcome('not a map'), isNull);
      expect(parseSyncOutcome({'kind': 'unknown_kind', 'opId': 'x'}), isNull);
      expect(parseSyncOutcome({'opId': 'x'}), isNull);
      expect(parseSyncOutcome(null), isNull);
    });

    test('keeps the fallback opId when the server omits it', () {
      final outcome = parseSyncOutcome({'kind': 'accepted', 'receipt': 'r'}, fallbackOpId: 'op-fb');
      expect(outcome!.opId, 'op-fb');
      expect(outcome.kind, SyncOutcomeKind.accepted);
    });
  });
}

class _FixedDigestPort implements DigestPort {
  const _FixedDigestPort();

  @override
  String get algorithm => 'sha-256';

  @override
  String digest(List<int> bytes) => 'fixed-digest';
}
