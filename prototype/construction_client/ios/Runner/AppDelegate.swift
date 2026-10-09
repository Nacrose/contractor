import Flutter
import UIKit

/// M04-T02 secure-credential binding (mount/lib/mount/secure_store.dart).
///
/// Binds the mount's `construction_client/secure_store` method channel to
/// the iOS Keychain (kSecClassGenericPassword, ThisDeviceOnly) — the ONLY
/// sanctioned credential surface on iOS per the M03 identity package's
/// credentials.ts. The Dart side fail-closes on any channel error; it never
/// falls back to non-secure storage.
@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private static let channelName = "construction_client/secure_store"
  private static let service = "com.nacrose.contractor.construction_client.credentials"

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "SecureStoreChannel")
    let channel = FlutterMethodChannel(
      name: AppDelegate.channelName, binaryMessenger: registrar.messenger())
    channel.setMethodCallHandler { call, result in
      AppDelegate.handle(call: call, result: result)
    }
  }

  private static func handle(call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard let args = call.arguments as? [String: Any] else {
      result(FlutterError(code: "bad_request", message: "arguments are required", details: nil))
      return
    }
    switch call.method {
    case "save":
      guard let ref = args["ref"] as? String, let value = args["value"] as? String else {
        result(FlutterError(code: "bad_request", message: "ref and value are required", details: nil))
        return
      }
      let status = upsert(account: ref, value: dataValue(value))
      result(status == errSecSuccess
        ? nil
        : FlutterError(code: "store_unavailable", message: "keychain status \(status)", details: nil))
    case "load":
      guard let ref = args["ref"] as? String else {
        result(FlutterError(code: "bad_request", message: "ref is required", details: nil))
        return
      }
      switch read(account: ref) {
      case .success(let data):
        result(data.flatMap { String(data: $0, encoding: .utf8) })
      case .failure(let status):
        result(FlutterError(code: "store_unavailable", message: "keychain status \(status)", details: nil))
      }
    case "delete":
      guard let ref = args["ref"] as? String else {
        result(FlutterError(code: "bad_request", message: "ref is required", details: nil))
        return
      }
      var query = baseQuery(account: ref)
      query[kSecReturnAttributes as String] = false
      SecItemDelete(query as CFDictionary)
      result(nil)
    case "wipeAll":
      SecItemDelete([
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: AppDelegate.service,
      ] as CFDictionary)
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private static func baseQuery(account: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: AppDelegate.service,
      kSecAttrAccount as String: account,
      // ThisDeviceOnly: credentials never ride device backups.
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
  }

  private static func dataValue(_ string: String) -> Data {
    return Data(string.utf8)
  }

  private static func upsert(account: String, value: Data) -> OSStatus {
    var query = baseQuery(account: account)
    SecItemDelete(query as CFDictionary)
    query[kSecValueData as String] = value
    return SecItemAdd(query as CFDictionary, nil)
  }

  private static func read(account: String) -> Result<Data?, OSStatus> {
    var query = baseQuery(account: account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return .success(nil) }
    if status != errSecSuccess { return .failure(status) }
    return .success(item as? Data)
  }
}
