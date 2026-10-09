/// Sync transport binding + envelope builder (M04-T02).
///
/// Binds the M03-T07 SyncTransportPort (orchestrator contract.ts lines
/// 200-202) to the server sync routes over package:http:
///   - one envelope in, one outcome out;
///   - a TYPED server response (one of the eight v3 §5.3 kinds) is returned
///     as the outcome, whatever the HTTP status — the M03 server answers
///     typed rejections with 4xx bodies too;
///   - anything unparseable (connection refused, timeout, HTML error page)
///     THROWS — the orchestrator maps the throw to bounded retryable
///     backoff; unknown outcome-kind strings fail safe to a throw, never to
///     a fabricated kind.
///
/// buildSyncEnvelope ports envelope.ts buildEnvelope (lines 25-54):
/// structural validation + the sha-256 payload digest via the injected
/// fail-closed DigestPort; scope CLAIMS are carried, never validated here —
/// their truth is the ServerAuthorityPort's job.
///
/// Dart-shape note: the TS port's `send` is synchronous because the M03
/// fixtures were; Dart IO is async, so the binding's port signature is
/// `Future<SyncOutcome> send(...)`. Disciplines unchanged (ports.dart).
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'ports.dart';

class EnvelopeValidationError implements Exception {
  final String message;

  EnvelopeValidationError(this.message);

  @override
  String toString() => 'invalid_envelope: $message';
}

/// Client envelope constructor (envelope.ts buildEnvelope) over a stored
/// outbox record. [attempt] comes from the record's attempts counter after
/// markInFlight (1-based at first dispatch); scopeClaims default to the
/// orchestrator's fallback chain (tenantId ?? accountId, role ?? 'member').
SyncEnvelope buildSyncEnvelope({
  required PendingOpRecord op,
  required String deviceId,
  ScopeClaims? scopeClaims,
  required int attempt,
  required int nowMs,
  required DigestPort digest,
}) {
  for (final entry in {'opId': op.opId, 'deviceId': deviceId, 'accountId': op.accountId, 'kind': op.kind}.entries) {
    if (entry.value.isEmpty) {
      throw EnvelopeValidationError('Envelope ${entry.key} must be a non-empty string.');
    }
  }
  if (attempt < 1) {
    throw EnvelopeValidationError('Envelope attempt must be a positive integer.');
  }
  final claims = scopeClaims ??
      ScopeClaims(
        tenantId: op.tenantId ?? op.accountId,
        projectId: op.projectId,
        role: op.role ?? 'member',
      );
  return SyncEnvelope(
    syncProtocolVersion: kSyncProtocolVersion,
    opId: op.opId,
    deviceId: deviceId,
    accountId: op.accountId,
    kind: op.kind,
    scopeClaims: ScopeClaims(
      tenantId: claims.tenantId,
      projectId: op.projectId ?? claims.projectId,
      role: claims.role,
    ),
    payloadDigest: digest.digest(utf8.encode(op.payload)),
    payload: op.payload,
    dependsOnOpIds: List<String>.of(op.dependsOnOpIds),
    attempt: attempt,
    sentAtMs: nowMs,
  );
}

/// Outcome JSON parse (the eight typed kinds). Returns null when the body
/// is not a typed outcome so the transport can throw instead of inventing
/// one.
SyncOutcome? parseSyncOutcome(Object? decoded, {String? fallbackOpId}) {
  if (decoded is! Map) return null;
  final kindRaw = decoded['kind'];
  if (kindRaw is! String) return null;
  final SyncOutcomeKind kind;
  try {
    kind = SyncOutcomeKind.fromWire(kindRaw);
  } on ArgumentError {
    return null;
  }
  final opId = decoded['opId'];
  return SyncOutcome(
    kind: kind,
    opId: opId is String && opId.isNotEmpty ? opId : (fallbackOpId ?? ''),
    receipt: decoded['receipt'] is String ? decoded['receipt'] as String : null,
    serverSeq: decoded['serverSeq'] is int ? decoded['serverSeq'] as int : null,
    detail: decoded['detail'] is String ? decoded['detail'] as String : null,
    retryAfterMs: decoded['retryAfterMs'] is int ? decoded['retryAfterMs'] as int : null,
  );
}

class HttpSyncTransport implements SyncTransportPort {
  final Uri endpoint;
  final http.Client client;
  final Duration timeout;

  HttpSyncTransport({required this.endpoint, http.Client? client, this.timeout = const Duration(seconds: 30)})
      : client = client ?? http.Client();

  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async {
    late final http.Response response;
    try {
      response = await client
          .post(
            endpoint,
            headers: const {'content-type': 'application/json'},
            body: jsonEncode(envelope.toJson()),
          )
          .timeout(timeout);
    } on TimeoutException {
      throw StateError('Sync endpoint timed out after ${timeout.inSeconds}s.');
    } catch (e) {
      // Network failure: THROW (orchestrator maps to retryable backoff).
      throw StateError('Sync transport network failure: $e');
    }
    Object? decoded;
    try {
      decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    } catch (_) {
      decoded = null;
    }
    final outcome = parseSyncOutcome(decoded, fallbackOpId: envelope.opId);
    if (outcome != null) return outcome;
    // Unparseable server response: typed-outcome discipline fails closed to
    // a throw (retryable at the orchestrator), never to a fabricated kind.
    throw StateError('Sync endpoint returned an untyped response (status ${response.statusCode}).');
  }
}
