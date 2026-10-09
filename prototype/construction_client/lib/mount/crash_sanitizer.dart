/// Crash-report sanitization for the Dart mount (M04-T02).
///
/// Dart mirror of packages/native_observability/src/redaction.ts — the
/// fail-safe gate every Dart panic/error path reports through (M03-T08).
/// Rules carried over and pinned by tests on BOTH sides:
///   - drop-first, never pass-through: only allow-listed attribute keys
///     (kCrashSafeAttributeKeys) survive; every surviving value is scrubbed
///     of secret-like substrings and length-capped (64).
///   - stack FRAMES never export — only the frame count.
///   - the message is reduced to its safe prefix (160) with secret-like
///     substrings redacted; payload-like content cannot ride through.
///   - a malformed context is STILL reduced to the safe shape (fail-safe);
///     only a non-map context raises, and the caller then reports the
///     minimal fallbackCrashReport instead.
library;

import 'ports.dart';

/// Secret-like substrings redacted from any surviving text. Same vocabulary
/// discipline as the M03-T02 identity package's redactSecret.
final RegExp _ghp = RegExp(r'ghp_[A-Za-z0-9]{20,}');
final RegExp _gho = RegExp(r'gho_[A-Za-z0-9]{20,}');
final RegExp _bearer = RegExp(r'Bearer\s+[A-Za-z0-9._\-]{10,}', caseSensitive: false);
final RegExp _jwt = RegExp(r'eyJ[A-Za-z0-9._\-]{20,}');
final RegExp _longHex = RegExp(r'[A-Fa-f0-9]{32,}');
final RegExp _password = RegExp(r'password[=:]\S+', caseSensitive: false);
final RegExp _refreshToken = RegExp(r'refresh[_-]?token[=:]\S+', caseSensitive: false);
final RegExp _accessToken = RegExp(r'access[_-]?token[=:]\S+', caseSensitive: false);

/// Payload-like content: JSON bodies and long opaque runs.
final RegExp _jsonBody = RegExp(r'\{[\s\S]{20,}\}');
final RegExp _jsonField = RegExp(r'"[a-zA-Z_]+"\s*:\s*"[^"]{24,}"');

String redactSecret(String text) {
  var out = text;
  for (final p in [_ghp, _gho, _bearer, _jwt, _longHex, _password, _refreshToken, _accessToken]) {
    out = out.replaceAll(p, '[REDACTED]');
  }
  for (final p in [_jsonBody, _jsonField]) {
    out = out.replaceAll(p, '[PAYLOAD]');
  }
  return out;
}

String? _safeAttribute(Object? value) {
  if (value == null) return null;
  final t = value is String ? value : value.toString();
  return redactSecret(t).substringSafe(0, kCrashAttributeMaxLen);
}

/// Redact payload bodies and secrets, THEN cap — order matters (tested).
String _safeMessage(String message) => redactSecret(message).substringSafe(0, 160);

/// The sanitized crash report shape (observability contract.ts
/// SanitizedCrashReport).
class SanitizedCrashReport {
  final String component; // dart | native | rust
  final String errorKind;
  final String message;
  final int frameCount;
  final Map<String, String> attributes;
  final String appVersion;
  final String schemaVersion;
  final int occurredAtMs;

  const SanitizedCrashReport({
    required this.component,
    required this.errorKind,
    required this.message,
    required this.frameCount,
    required this.attributes,
    required this.appVersion,
    required this.schemaVersion,
    required this.occurredAtMs,
  });
}

/// Reduce ANY captured crash context to the sanitized report shape.
/// Throws a typed misconfigured error only when the context is not even a
/// map — the caller then reports the minimal fallback instead.
SanitizedCrashReport sanitizeCrashReport(Object? raw) {
  if (raw is! Map) {
    throw RepositoryError('misconfigured', 'crash context must be a map');
  }
  final componentRaw = '${raw['component'] ?? ''}';
  final component = const ['dart', 'native', 'rust'].contains(componentRaw) ? componentRaw : 'native';

  final attributes = <String, String>{};
  final attrs = raw['attributes'];
  if (attrs is Map) {
    attrs.forEach((key, value) {
      final k = '$key';
      if (!kCrashSafeAttributeKeys.contains(k)) return; // drop-first
      final safe = _safeAttribute(value);
      if (safe != null) attributes[k] = safe;
    });
  }

  return SanitizedCrashReport(
    component: component,
    errorKind: redactSecret('${raw['errorKind'] ?? 'unknown'}').substringSafe(0, 64),
    message: _safeMessage('${raw['message'] ?? ''}'),
    frameCount: raw['frames'] is List ? (raw['frames'] as List).length : 0,
    attributes: attributes,
    appVersion: redactSecret('${raw['appVersion'] ?? ''}').substringSafe(0, 32),
    schemaVersion: redactSecret('${raw['schemaVersion'] ?? ''}').substringSafe(0, 32),
    occurredAtMs: raw['occurredAtMs'] is int ? raw['occurredAtMs'] as int : 0,
  );
}

/// Minimal fallback when even the context cannot be scrubbed
/// (redaction.ts fallbackCrashReport).
SanitizedCrashReport fallbackCrashReport(String component, int occurredAtMs) {
  return SanitizedCrashReport(
    component: const ['dart', 'native', 'rust'].contains(component) ? component : 'native',
    errorKind: 'unreportable',
    message: '[REDACTED]',
    frameCount: 0,
    attributes: const {},
    appVersion: '',
    schemaVersion: '',
    occurredAtMs: occurredAtMs,
  );
}

extension _SubstringSafe on String {
  String substringSafe(int start, int end) {
    if (length <= end) return this;
    return substring(start, end);
  }
}
