/// OS keystore binding of the SecureCredentialStore port (M04-T02).
///
/// Binds the M03-T02 SecureCredentialStore (credentials.ts lines 54-62) to
/// the platform secure store through a method channel:
///   android -> Keystore-backed EncryptedSharedPreferences (MainActivity)
///   ios     -> Keychain, ThisDeviceOnly (AppDelegate)
///   macos   -> Keychain (MainFlutterWindow channel handler)
/// Web, Windows, and Linux have NO handler yet: MissingPluginException maps
/// to the typed fail-closed CredentialStoreUnavailable — the mount NEVER
/// falls back to disk, SharedPreferences, SQLite, or any other non-secure
/// surface (credentials.ts protocol-violation note). Windows/Linux remain a
/// recorded follow-up constraint in the M04-T02 report.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'ports.dart';

const MethodChannel _kSecureStoreChannel = MethodChannel('construction_client/secure_store');

/// The sanctioned OS backing per platform (credentials.ts
/// SecureStorageBinding). Recorded so tests can assert it is not a file
/// path; desktop/web throw before ever reaching a binding choice.
SecureStorageBinding detectSecureStorageBinding() {
  if (kIsWeb) {
    throw CredentialStoreUnavailable({'platform': 'web', 'reason': 'no OS keystore binding yet'});
  }
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      return SecureStorageBinding.androidKeystore;
    case TargetPlatform.iOS:
      return SecureStorageBinding.iosKeychain;
    case TargetPlatform.macOS:
      return SecureStorageBinding.macosKeychain;
    case TargetPlatform.windows:
      return SecureStorageBinding.windowsCredentialManager;
    case TargetPlatform.linux:
      return SecureStorageBinding.linuxSecretService;
    case TargetPlatform.fuchsia:
      throw CredentialStoreUnavailable({'platform': 'fuchsia', 'reason': 'unsupported'});
  }
}

class MethodChannelSecureCredentialStore implements SecureCredentialStore {
  @override
  final SecureStorageBinding binding;

  final MethodChannel channel;

  MethodChannelSecureCredentialStore._(this.binding, this.channel);

  factory MethodChannelSecureCredentialStore.create() {
    return MethodChannelSecureCredentialStore._(detectSecureStorageBinding(), _kSecureStoreChannel);
  }

  /// Fail-closed mapping: ANY channel failure (missing handler, platform
  /// error, codec error) becomes CredentialStoreUnavailable — the caller
  /// gets a typed error, never a fallback to non-secure storage.
  Future<T> _guard<T>(Future<T> Function() body) async {
    try {
      return await body();
    } on CredentialStoreUnavailable {
      rethrow;
    } catch (e) {
      throw CredentialStoreUnavailable({
        'binding': binding.id,
        'reason': e is MissingPluginException ? 'no host handler' : 'os_store_error',
      });
    }
  }

  @override
  Future<void> save(CredentialRef ref, String value) {
    return _guard(() => channel.invokeMethod<void>('save', {'ref': ref.ref, 'value': value}));
  }

  @override
  Future<String?> load(CredentialRef ref) {
    return _guard(() => channel.invokeMethod<String>('load', {'ref': ref.ref}));
  }

  @override
  Future<void> delete(CredentialRef ref) {
    return _guard(() => channel.invokeMethod<void>('delete', {'ref': ref.ref}));
  }

  @override
  Future<void> wipeAll() {
    return _guard(() => channel.invokeMethod<void>('wipeAll'));
  }
}
