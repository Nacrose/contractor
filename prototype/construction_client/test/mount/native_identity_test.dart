import 'dart:async';
import 'dart:convert';

import 'package:construction_client/mount/native_identity.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _Credentials implements SecureCredentialStore {
  final values = <CredentialRef, String>{};
  @override
  SecureStorageBinding get binding => SecureStorageBinding.iosKeychain;
  @override
  Future<void> save(CredentialRef ref, String value) async {
    values[ref] = value;
  }

  @override
  Future<String?> load(CredentialRef ref) async => values[ref];
  @override
  Future<void> delete(CredentialRef ref) async {
    values.remove(ref);
  }

  @override
  Future<void> wipeAll() async {
    values.clear();
  }
}

class _Browser implements SystemBrowserPort {
  Uri? opened;
  bool wrongState = false;
  @override
  Future<void> open(String authorizeUrl) async {
    opened = Uri.parse(authorizeUrl);
  }

  @override
  Future<String> awaitCallback() async =>
      Uri.parse(opened!.queryParameters['redirect_uri']!)
          .replace(
            queryParameters: {
              'state': wrongState
                  ? 'untrusted'
                  : opened!.queryParameters['state']!,
              'code': List.filled(32, 'c').join(),
            },
          )
          .toString();
}

Map<String, dynamic> _session({
  String kind = 'signed_in',
  int expiresAt = 100000,
  String access = 'access',
}) => {
  'kind': kind,
  'session': {
    'userId': 'user',
    'organizationId': 'org',
    'deviceId': 'device',
    'sessionId': 'sid',
    'sessionFamilyId': 'family',
  },
  'tokens': {
    'accessToken': access,
    'rotationToken': 'rotation',
    'accessExpiresAt': expiresAt,
  },
};

void main() {
  late _Credentials credentials;
  late _Browser browser;
  NativeIdentityClient identity(http.Client client, {int now = 1000}) =>
      NativeIdentityClient(
        server: Uri.parse('http://localhost:3107'),
        redirect: Uri.parse(
          'com.nacrose.contractor.constructionclient://auth/callback',
        ),
        credentials: credentials,
        browser: browser,
        client: client,
        platform: 'ios',
        deviceLabel: 'test',
        nowMs: () => now,
      );
  setUp(() {
    credentials = _Credentials();
    browser = _Browser();
  });

  test('PKCE challenge matches verifier and credentials restore only from secure storage', () async {
    late Map<String, dynamic> exchange;
    final client = identity(
      MockClient((request) async {
        exchange = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode(_session()), 200);
      }),
    );
    final signedIn = await client.signIn();
    final challenge = base64Url
        .encode(
          sha256
              .convert(ascii.encode(exchange['code_verifier'] as String))
              .bytes,
        )
        .replaceAll('=', '');
    expect(browser.opened!.queryParameters['code_challenge'], challenge);
    expect(browser.opened!.queryParameters['code_challenge_method'], 'S256');
    expect(exchange['grant_type'], 'authorization_code');
    expect(signedIn.accountId, 'org:user');
    expect(credentials.values.containsKey(CredentialRef.pkceInflight), isFalse);
    expect((await client.restoreSession())!.deviceId, 'device');
    expect(await client.authorizationHeaders(accountId: 'org:user'), {
      'authorization': 'Bearer access',
    });
  });

  test(
    'account switch retains original credentials while work is pending',
    () async {
      final original = jsonEncode({
        ..._session(),
        'server': 'http://localhost:3107',
      });
      await credentials.save(CredentialRef.sessionTokens, original);
      final client = NativeIdentityClient(
        server: Uri.parse('http://localhost:3107'),
        redirect: Uri.parse(
          'com.nacrose.contractor.constructionclient://auth/callback',
        ),
        credentials: credentials,
        browser: browser,
        client: MockClient((request) async {
          expect(request.followRedirects, isFalse);
          final next = _session();
          (next['session'] as Map<String, dynamic>)['userId'] =
              'different-user';
          return http.Response(jsonEncode(next), 200);
        }),
        platform: 'ios',
        deviceLabel: 'test',
        nowMs: () => 1000,
        hasPendingWork: (account) => account == 'org:user',
      );
      await expectLater(
        client.signIn(),
        throwsA(
          isA<NativeIdentityFailure>().having(
            (error) => error.kind,
            'kind',
            'pending_work',
          ),
        ),
      );
      expect(credentials.values[CredentialRef.sessionTokens], original);
      expect(
        credentials.values.containsKey(CredentialRef.pkceInflight),
        isFalse,
      );
    },
  );

  test('rejects callback state mismatch before token exchange', () async {
    browser.wrongState = true;
    var calls = 0;
    final client = identity(
      MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
    await expectLater(
      client.signIn(),
      throwsA(
        isA<NativeIdentityFailure>().having(
          (error) => error.kind,
          'kind',
          'invalid_callback',
        ),
      ),
    );
    expect(calls, 0);
    expect(credentials.values, isEmpty);
  });

  test('cold-start callback can complete against persisted PKCE verifier', () async {
    await credentials.save(
      CredentialRef.pkceInflight,
      jsonEncode({
        'server': 'http://localhost:3107',
        'redirect': 'com.nacrose.contractor.constructionclient://auth/callback',
        'state': 'state',
        'verifier': List.filled(43, 'v').join(),
        'createdAt': 1000,
      }),
    );
    final client = identity(
      MockClient((_) async => http.Response(jsonEncode(_session()), 200)),
    );
    final session = await client.completeSignIn(
      'com.nacrose.contractor.constructionclient://auth/callback?state=state&code=${List.filled(32, 'c').join()}',
    );
    expect(session.accountId, 'org:user');
  });

  test('parallel expired-token requests perform one rotation', () async {
    await credentials.save(
      CredentialRef.sessionTokens,
      jsonEncode({
        ..._session(expiresAt: 1000),
        'server': 'http://localhost:3107',
      }),
    );
    var rotations = 0;
    final gate = Completer<void>();
    final client = identity(
      MockClient((request) async {
        rotations++;
        await gate.future;
        return http.Response(
          jsonEncode(_session(kind: 'rotated', access: 'fresh')),
          200,
        );
      }),
    );
    final first = client.authorizationHeaders();
    final second = client.authorizationHeaders();
    await Future<void>.delayed(Duration.zero);
    gate.complete();
    expect(await first, {'authorization': 'Bearer fresh'});
    expect(await second, {'authorization': 'Bearer fresh'});
    expect(rotations, 1);
  });

  test(
    'revocation clears credentials; temporary failures retain them',
    () async {
      for (final status in [401, 503]) {
        await credentials.save(
          CredentialRef.sessionTokens,
          jsonEncode({
            ..._session(expiresAt: 1000),
            'server': 'http://localhost:3107',
          }),
        );
        final client = identity(
          MockClient(
            (_) async => http.Response(
              jsonEncode({
                'kind': status == 401 ? 'session_revoked' : 'retryable',
              }),
              status,
            ),
          ),
        );
        await expectLater(
          client.authorizationHeaders(),
          throwsA(isA<NativeIdentityFailure>()),
        );
        expect(
          credentials.values.containsKey(CredentialRef.sessionTokens),
          status == 503,
        );
      }
    },
  );

  test('pins credentials to account and origin and blocks logout with pending work', () async {
    await credentials.save(
      CredentialRef.sessionTokens,
      jsonEncode({..._session(), 'server': 'http://localhost:3107'}),
    );
    var requests = 0;
    final raw = MockClient((request) async {
      requests++;
      expect(request.followRedirects, isFalse);
      expect(request.headers['authorization'], 'Bearer access');
      return http.Response('{}', 200);
    });
    final client = identity(raw);
    await expectLater(
      client.authorizationHeaders(accountId: 'other'),
      throwsA(isA<NativeIdentityFailure>()),
    );
    await expectLater(
      client.logout(hasPendingWork: true),
      throwsA(
        isA<NativeIdentityFailure>().having(
          (error) => error.kind,
          'kind',
          'pending_work',
        ),
      ),
    );
    final authorized = NativeAuthorizedClient(raw, client, 'org:user');
    await expectLater(
      authorized.get(Uri.parse('https://other.example/api')),
      throwsA(isA<NativeIdentityFailure>()),
    );
    expect(requests, 0);
    await authorized.get(Uri.parse('http://localhost:3107/api/native/sync'));
    expect(requests, 1);
    await credentials.save(
      CredentialRef.sessionTokens,
      jsonEncode({..._session(), 'server': 'https://other.example'}),
    );
    expect(await client.restoreSession(), isNull);
  });
}
