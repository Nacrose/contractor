import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)
    let secureStoreChannel = FlutterMethodChannel(
      name: "construction_client/secure_store",
      binaryMessenger: flutterViewController.engine.binaryMessenger)
    secureStoreChannel.setMethodCallHandler { call, result in
      AppDelegate.handleSecureStore(call: call, result: result)
    }

    super.awakeFromNib()
  }
}
