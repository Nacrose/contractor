import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/crash_sanitizer.dart';
import 'package:construction_client/mount/ports.dart';

/// The M03-T08 sanitization vocabulary, mirrored and re-pinned at the mount
/// boundary: every Dart crash path reports through THIS gate.
void main() {
  Map<String, Object?> context({
    String component = 'dart',
    String errorKind = 'storage',
    String message = 'boom',
    List<String> frames = const ['frame1', 'frame2'],
    Map<String, Object?> attributes = const {},
    String appVersion = '1.0.0',
    String schemaVersion = '3',
    int occurredAtMs = 42,
  }) =>
      {
        'component': component,
        'errorKind': errorKind,
        'message': message,
        'frames': frames,
        'attributes': attributes,
        'appVersion': appVersion,
        'schemaVersion': schemaVersion,
        'occurredAtMs': occurredAtMs,
      };

  group('secret redaction vocabulary', () {
    test('GitHub tokens, JWTs, bearer headers and password assignments are REDACTED', () {
      expect(redactSecret('token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 end'), isNot(contains('ghp_')));
      expect(redactSecret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'), isNot(contains('eyJ')));
      expect(redactSecret('Authorization: Bearer abcdefghijklmnop'), contains('[REDACTED]'));
      expect(redactSecret('password=hunter2'), isNot(contains('hunter2')));
      expect(redactSecret('refresh_token=abc123def456'), isNot(contains('abc123def456')));
      expect(redactSecret('access_token=zzz999yyy888'), contains('[REDACTED]'));
      expect(redactSecret('0123456789abcdef0123456789abcdef'), contains('[REDACTED]'));
    });

    test('payload-like JSON bodies cannot ride through', () {
      expect(redactSecret('failed writing {"payload":"a long private draft body..."}'),
          contains('[PAYLOAD]'));
      expect(redactSecret('"field": "a-very-long-opaque-value-over-24-chars"'), contains('[PAYLOAD]'));
    });
  });

  group('sanitizeCrashReport (drop-first rules)', () {
    test('only allow-listed attribute keys survive; values are scrubbed and capped', () {
      final report = sanitizeCrashReport(context(attributes: {
        'opId': 'op-123',
        'attempt': 3,
        'secretValue': 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456', // NOT allow-listed
        'kind': 'write',
        'internalPath': '/data/user/0/secret.db', // NOT allow-listed
      }));
      expect(report.attributes.keys, containsAll(['opId', 'attempt', 'kind']));
      expect(report.attributes.keys, isNot(contains('secretValue')));
      expect(report.attributes.keys, isNot(contains('internalPath')));
    });

    test('surviving values with secret-like content are scrubbed', () {
      final report = sanitizeCrashReport(context(attributes: {
        'errorKind': 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 leaked',
      }));
      expect(report.attributes['errorKind'], contains('[REDACTED]'));
      expect(report.attributes['errorKind']!.length, lessThanOrEqualTo(kCrashAttributeMaxLen));
    });

    test('stack frames never export — only the COUNT', () {
      final report = sanitizeCrashReport(context(frames: [
        '#0 FilesystemObjectStore.putBytes (object_store.dart:42)',
        '#1 main (main.dart:9)',
      ]));
      expect(report.frameCount, 2);
      final encoded = report.attributes.toString() + report.message;
      expect(encoded.contains('object_store.dart'), isFalse);
    });

    test('message is reduced to its safe prefix; redaction runs BEFORE the cap', () {
      final secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      final long = '${'a' * 150} $secret ${'b' * 100}';
      final report = sanitizeCrashReport(context(message: long));
      expect(report.message.length, lessThanOrEqualTo(160));
      expect(report.message.contains('ghp_'), isFalse, reason: 'redact-then-cap order matters');
    });

    test('appVersion and schemaVersion are capped (32)', () {
      final report = sanitizeCrashReport(
          context(appVersion: 'v' * 100, schemaVersion: 's' * 100));
      expect(report.appVersion.length, lessThanOrEqualTo(32));
      expect(report.schemaVersion.length, lessThanOrEqualTo(32));
    });

    test('component falls back to native for unknown values; malformed context raises typed', () {
      expect(sanitizeCrashReport(context(component: 'dart')).component, 'dart');
      expect(sanitizeCrashReport(context(component: 'rust')).component, 'rust');
      expect(sanitizeCrashReport(context(component: 'wiggle')).component, 'native');

      expect(
        () => sanitizeCrashReport('not a map'),
        throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
      );
    });

    test('the fallback report is the minimal safe shape', () {
      final fallback = fallbackCrashReport('dart', 7);
      expect(fallback.errorKind, 'unreportable');
      expect(fallback.message, '[REDACTED]');
      expect(fallback.frameCount, 0);
      expect(fallback.attributes, isEmpty);
      expect(fallback.occurredAtMs, 7);
    });
  });
}
