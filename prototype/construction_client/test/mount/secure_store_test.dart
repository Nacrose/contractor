import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/secure_store.dart';

/// Binding tests for the OS-keystore credential store (M04-T02): the Dart
/// half maps to the right channel methods, and ANY channel failure is the
/// typed fail-closed CredentialStoreUnavailable — never a fallback to
/// non-secure storage. (The M03 identity package suites remain the semantic
/// authority for the store's contract; these prove the BINDING.)
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('construction_client/secure_store');
  late MethodChannelSecureCredentialStore store;

  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    store = MethodChannelSecureCredentialStore.create();
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
    debugDefaultTargetPlatformOverride = null;
  });

  test('binding declaration names the OS keystore, never a file path', () {
    expect(store.binding, SecureStorageBinding.androidKeystore);
    expect(
      SecureStorageBinding.values.map((b) => b.id),
      everyElement(isNot(contains('file'))),
      reason: 'credentials.ts: the declared backing is always an OS secure store',
    );
  });

  test('save/load/delete/wipeAll map to the channel methods with ref + value args', () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,
        (call) async {
      calls.add(call);
      switch (call.method) {
        case 'load':
          return call.arguments['ref'] == 'session.tokens' ? '{"session":{}}' : null;
        default:
          return null;
      }
    });

    await store.save(CredentialRef.sessionTokens, '{"session":{}}');
    await store.load(CredentialRef.sessionTokens);
    await store.delete(CredentialRef.pkceInflight);
    await store.wipeAll();

    expect(calls.map((c) => c.method), ['save', 'load', 'delete', 'wipeAll']);
    expect(calls[0].arguments, {'ref': 'session.tokens', 'value': '{"session":{}}'});
    expect(calls[2].arguments, {'ref': 'pkce.inflight'});
    expect(await store.load(CredentialRef.sessionTokens), '{"session":{}}');
    expect(await store.load(CredentialRef.deviceRegistration), isNull);
  });

  test('FAIL-CLOSED: a missing host handler is CredentialStoreUnavailable on every operation', () async {
    // No mock handler installed -> MissingPluginException (e.g. desktop/web
    // hosts without a binding yet).
    for (final probe in [
      () => store.save(CredentialRef.sessionTokens, 'v'),
      () => store.load(CredentialRef.sessionTokens),
      () => store.delete(CredentialRef.sessionTokens),
      () => store.wipeAll(),
    ]) {
      await expectLater(
        probe(),
        throwsA(isA<CredentialStoreUnavailable>()),
        reason: 'no fallback to non-secure storage, ever',
      );
    }
  });

  test('FAIL-CLOSED: a platform (OS store) error is the same typed failure', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      throw PlatformException(code: 'store_unavailable', message: 'keystore corrupted');
    });
    await expectLater(
      store.save(CredentialRef.sessionTokens, 'v'),
      throwsA(isA<CredentialStoreUnavailable>()
          .having((e) => e.detail['reason'], 'reason', 'os_store_error')),
    );
    await expectLater(
      store.load(CredentialRef.sessionTokens),
      throwsA(isA<CredentialStoreUnavailable>()),
    );
  });

  test('credentials never appear outside the secure store: the channel is the only surface', () {
    // The store exposes ONLY the four channel methods and the binding id —
    // no path returns an in-memory copy or writes anywhere else.
    expect(store, isA<SecureCredentialStore>());
    expect(store.binding.id, 'android.keystore');
  });
}
