import Cocoa
import FlutterMacOS
import Security

@main
class AppDelegate: FlutterAppDelegate {
  private static let secureStoreService = "com.nacrose.contractor.construction_client.credentials"

  static func handleSecureStore(call: FlutterMethodCall, result: @escaping FlutterResult) {
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
      let query = baseQuery(account: ref)
      SecItemDelete(query as CFDictionary)
      var item = query
      item[kSecValueData as String] = Data(value.utf8)
      let status = SecItemAdd(item as CFDictionary, nil)
      result(status == errSecSuccess ? nil : storeError(status))

    case "load":
      guard let ref = args["ref"] as? String else {
        result(FlutterError(code: "bad_request", message: "ref is required", details: nil))
        return
      }
      var query = baseQuery(account: ref)
      query[kSecReturnData as String] = true
      query[kSecMatchLimit as String] = kSecMatchLimitOne
      var item: CFTypeRef?
      let status = SecItemCopyMatching(query as CFDictionary, &item)
      if status == errSecItemNotFound {
        result(nil)
      } else if status != errSecSuccess {
        result(storeError(status))
      } else if let data = item as? Data, let value = String(data: data, encoding: .utf8) {
        result(value)
      } else {
        result(FlutterError(code: "store_unavailable", message: "credential data is invalid", details: nil))
      }

    case "delete":
      guard let ref = args["ref"] as? String else {
        result(FlutterError(code: "bad_request", message: "ref is required", details: nil))
        return
      }
      let status = SecItemDelete(baseQuery(account: ref) as CFDictionary)
      result(status == errSecSuccess || status == errSecItemNotFound ? nil : storeError(status))

    case "wipeAll":
      let status = SecItemDelete([
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: secureStoreService,
      ] as CFDictionary)
      result(status == errSecSuccess || status == errSecItemNotFound ? nil : storeError(status))

    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private static func baseQuery(account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: secureStoreService,
      kSecAttrAccount as String: account,
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
  }

  private static func storeError(_ status: OSStatus) -> FlutterError {
    FlutterError(code: "store_unavailable", message: "keychain status \(status)", details: nil)
  }

  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return true
  }

  override func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    return true
  }
}
