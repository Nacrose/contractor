/// Dart binding of the M03 native identity lifecycle to the product PKCE API.
/// Tokens and in-flight verifiers live exclusively in the OS credential store.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import 'ports.dart';

class NativeIdentityFailure implements Exception {
  final String kind;
  final String message;
  const NativeIdentityFailure(this.kind, this.message);
  @override
  String toString() => message;
}

class NativeSessionIdentity {
  final String userId;
  final String organizationId;
  final String deviceId;
  const NativeSessionIdentity(this.userId, this.organizationId, this.deviceId);
  String get accountId => '$organizationId:$userId';
}

class NativeIdentityClient {
  final Uri server;
  final Uri redirect;
  final SecureCredentialStore credentials;
  final SystemBrowserPort browser;
  final http.Client client;
  final String platform;
  final String deviceLabel;
  final int Function() nowMs;
  final bool Function(String accountId) hasPendingWork;
  Future<Map<String, dynamic>>? _rotation;
  bool _signingIn = false;

  NativeIdentityClient({
    required this.server,
    required this.redirect,
    required this.credentials,
    required this.browser,
    required this.client,
    required this.platform,
    required this.deviceLabel,
    int Function()? nowMs,
    bool Function(String accountId)? hasPendingWork,
  }) : nowMs = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
       hasPendingWork = hasPendingWork ?? ((_) => false) {
    if (!['http', 'https'].contains(server.scheme) ||
        server.host.isEmpty ||
        server.userInfo.isNotEmpty ||
        server.hasQuery ||
        server.hasFragment ||
        (server.path.isNotEmpty && server.path != '/')) {
      throw const NativeIdentityFailure(
        'configuration',
        'Use a server origin without a path or credentials.',
      );
    }
  }

  Future<NativeSessionIdentity?> restoreSession() async {
    final stored = await _load();
    return stored == null ? null : _identity(stored);
  }

  Future<NativeSessionIdentity> signIn() async {
    if (_signingIn) {
      throw const NativeIdentityFailure(
        'busy',
        'Sign-in is already in progress.',
      );
    }
    _signingIn = true;
    try {
      final random = Random.secure();
      String randomUrl(int count) => base64Url
          .encode(List.generate(count, (_) => random.nextInt(256)))
          .replaceAll('=', '');
      final verifier = randomUrl(32);
      final state = randomUrl(24);
      final challenge = base64Url
          .encode(sha256.convert(ascii.encode(verifier)).bytes)
          .replaceAll('=', '');
      await credentials.save(
        CredentialRef.pkceInflight,
        jsonEncode({
          'server': server.origin,
          'redirect': redirect.toString(),
          'verifier': verifier,
          'state': state,
          'createdAt': nowMs(),
        }),
      );
      await browser.open(
        server
            .resolve('/api/native/auth/authorize')
            .replace(
              queryParameters: {
                'response_type': 'code',
                'client_id': 'contractor-os-native-v1',
                'redirect_uri': redirect.toString(),
                'code_challenge': challenge,
                'code_challenge_method': 'S256',
                'state': state,
              },
            )
            .toString(),
      );
      return await completeSignIn(
        await browser.awaitCallback().timeout(const Duration(minutes: 5)),
      );
    } on NativeIdentityFailure {
      rethrow;
    } catch (_) {
      throw const NativeIdentityFailure(
        'retryable',
        'Sign-in could not finish. Try again.',
      );
    } finally {
      _signingIn = false;
    }
  }

  /// Also accepts a cold-start callback against the durable in-flight verifier.
  Future<NativeSessionIdentity> completeSignIn(String callbackUrl) async {
    final raw = await credentials.load(CredentialRef.pkceInflight);
    if (raw == null) {
      throw const NativeIdentityFailure(
        'invalid_callback',
        'Start sign-in from Contractor OS.',
      );
    }
    late final Map<String, dynamic> pending;
    late final Uri callback;
    try {
      pending = jsonDecode(raw) as Map<String, dynamic>;
      callback = Uri.parse(callbackUrl);
      final parameters = callback.queryParametersAll;
      final age = nowMs() - (pending['createdAt'] as int);
      if (pending['server'] != server.origin ||
          pending['redirect'] != redirect.toString() ||
          callback.scheme != redirect.scheme ||
          callback.host != redirect.host ||
          callback.path != redirect.path ||
          callback.port != redirect.port ||
          callback.userInfo.isNotEmpty ||
          callback.hasFragment ||
          age < 0 ||
          age > 5 * 60 * 1000 ||
          parameters['state']?.length != 1 ||
          parameters['code']?.length != 1 ||
          parameters['state']!.single != pending['state'] ||
          parameters['code']!.single.length < 32 ||
          callback.queryParameters.containsKey('error')) {
        throw const FormatException();
      }
    } catch (_) {
      await credentials.delete(CredentialRef.pkceInflight);
      throw const NativeIdentityFailure(
        'invalid_callback',
        'Sign-in callback was invalid or expired. Start again.',
      );
    }
    final response = await _token({
      'grant_type': 'authorization_code',
      'client_id': 'contractor-os-native-v1',
      'code': callback.queryParameters['code']!,
      'redirect_uri': redirect.toString(),
      'code_verifier': pending['verifier'],
      'device': {
        'deviceLabel': deviceLabel,
        'platform': platform,
        'appVersion': '1.0.0',
      },
    });
    final previous = await _load();
    if (previous != null &&
        _identity(previous).accountId != _identity(response).accountId &&
        hasPendingWork(_identity(previous).accountId)) {
      await credentials.delete(CredentialRef.pkceInflight);
      throw const NativeIdentityFailure(
        'pending_work',
        'Finish pending work in your current account before switching accounts.',
      );
    }
    await _persist(response);
    await credentials.delete(CredentialRef.pkceInflight);
    return _identity(response);
  }

  Future<Map<String, String>> authorizationHeaders({String? accountId}) async {
    var stored = await _load();
    if (stored == null) {
      throw const NativeIdentityFailure(
        'authentication_required',
        'Sign in to sync.',
      );
    }
    if (accountId != null && _identity(stored).accountId != accountId) {
      throw const NativeIdentityFailure(
        'revoked',
        'The active account does not own this local work.',
      );
    }
    if ((stored['tokens']['accessExpiresAt'] as num) <= nowMs() + 30_000) {
      final existing = _rotation;
      if (existing != null) {
        stored = await existing;
      } else {
        final task = _rotate(stored);
        _rotation = task;
        try {
          stored = await task;
        } finally {
          _rotation = null;
        }
      }
    }
    return {'authorization': 'Bearer ${stored['tokens']['accessToken']}'};
  }

  Future<Map<String, dynamic>> _rotate(Map<String, dynamic> previous) async {
    try {
      final response = await _token({
        'grant_type': 'refresh_token',
        'rotation_token': previous['tokens']['rotationToken'],
      });
      if (_identity(response).accountId != _identity(previous).accountId) {
        throw const NativeIdentityFailure(
          'revoked',
          'Session account changed. Sign in again.',
        );
      }
      await _persist(response);
      return response;
    } on NativeIdentityFailure catch (error) {
      if ([
        'revoked',
        'session_revoked',
        'session_expired',
        'reuse_detected',
        'unauthorized',
      ].contains(error.kind)) {
        await credentials.wipeAll();
      }
      rethrow;
    }
  }

  Future<void> logout({required bool hasPendingWork}) async {
    if (hasPendingWork) {
      throw const NativeIdentityFailure(
        'pending_work',
        'Sync or resolve pending work before signing out.',
      );
    }
    final headers = await authorizationHeaders();
    final response = await _post(
      server.resolve('/api/native/auth/logout'),
      headers: headers,
    );
    if (response.statusCode != 200 && response.statusCode != 401) {
      throw const NativeIdentityFailure(
        'retryable',
        'Sign-out could not finish. Try again.',
      );
    }
    await credentials.wipeAll();
  }

  Future<Map<String, dynamic>?> _load() async {
    final raw = await credentials.load(CredentialRef.sessionTokens);
    if (raw == null) return null;
    try {
      final stored = jsonDecode(raw) as Map<String, dynamic>;
      if (stored['server'] != server.origin) return null;
      _validate(stored);
      return stored;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> _token(Map<String, dynamic> body) async {
    try {
      final response = await _post(
        server.resolve('/api/native/auth/token'),
        headers: const {'content-type': 'application/json'},
        body: jsonEncode(body),
      );
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 200) {
        final kind = decoded['kind'] ?? decoded['error'];
        const known = {
          'session_revoked',
          'session_expired',
          'reuse_detected',
          'unauthorized',
          'invalid_grant',
        };
        throw NativeIdentityFailure(
          known.contains(kind) ? kind as String : 'retryable',
          'Sign-in needs attention. Reconnect or sign in again.',
        );
      }
      if (!['signed_in', 'rotated'].contains(decoded['kind'])) {
        throw const FormatException();
      }
      _validate(decoded);
      return decoded;
    } on NativeIdentityFailure {
      rethrow;
    } catch (_) {
      throw const NativeIdentityFailure(
        'retryable',
        'Sign-in service is unavailable. Local work is retained.',
      );
    }
  }

  void _validate(Map<String, dynamic> value) {
    final session = value['session'];
    final tokens = value['tokens'];
    if (session is! Map ||
        tokens is! Map ||
        ![
          'userId',
          'organizationId',
          'deviceId',
          'sessionId',
          'sessionFamilyId',
        ].every(
          (key) =>
              session[key] is String && (session[key] as String).isNotEmpty,
        ) ||
        !['accessToken', 'rotationToken'].every(
          (key) => tokens[key] is String && (tokens[key] as String).isNotEmpty,
        ) ||
        tokens['accessExpiresAt'] is! num) {
      throw const FormatException();
    }
  }

  Future<http.Response> _post(
    Uri uri, {
    required Map<String, String> headers,
    String? body,
  }) async {
    final request = http.Request('POST', uri)..followRedirects = false;
    request.headers.addAll(headers);
    if (body != null) request.body = body;
    final response = await client
        .send(request)
        .timeout(const Duration(seconds: 30));
    return http.Response.fromStream(response)
        .timeout(const Duration(seconds: 30));
  }

  NativeSessionIdentity _identity(Map<String, dynamic> value) =>
      NativeSessionIdentity(
        value['session']['userId'] as String,
        value['session']['organizationId'] as String,
        value['session']['deviceId'] as String,
      );

  Future<void> _persist(Map<String, dynamic> value) async {
    await credentials.save(
      CredentialRef.sessionTokens,
      jsonEncode({...value, 'server': server.origin}),
    );
    final identity = _identity(value);
    await credentials.save(
      CredentialRef.sessionAccountHint,
      jsonEncode({
        'userId': identity.userId,
        'organizationId': identity.organizationId,
      }),
    );
  }
}

/// Authenticated clients are pinned to one origin and account. Redirects cannot
/// carry authorization to a different host because following is disabled.
class NativeAuthorizedClient extends http.BaseClient {
  final http.Client inner;
  final NativeIdentityClient identity;
  final String accountId;
  NativeAuthorizedClient(this.inner, this.identity, this.accountId);
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (request.url.origin != identity.server.origin) {
      throw const NativeIdentityFailure(
        'configuration',
        'Authenticated requests must use the configured server.',
      );
    }
    request.followRedirects = false;
    request.headers.addAll(
      await identity.authorizationHeaders(accountId: accountId),
    );
    return inner.send(request);
  }

  @override
  void close() => inner.close();
}
