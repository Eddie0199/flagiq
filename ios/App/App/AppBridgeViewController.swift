import Capacitor
import WebKit

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        let shortVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        let buildVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
        let nativeMarker = "NATIVE_MARKER_2026-02-14-A"
        let escapedVersion = shortVersion.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        let escapedBuild = buildVersion.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        let escapedMarker = nativeMarker.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        let injection = "window.__NATIVE_BUILD_INFO__ = { version: \"\(escapedVersion)\", build: \"\(escapedBuild)\", nativeMarker: \"\(escapedMarker)\" }; window.NATIVE_BUILD_INFO = window.__NATIVE_BUILD_INFO__;"

        let userScript = WKUserScript(source: injection, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        bridge?.webView?.configuration.userContentController.addUserScript(userScript)
        bridge?.webView?.evaluateJavaScript(injection, completionHandler: nil)
        CAPLog.print("[Startup] Injected native build info marker: \(nativeMarker)")
    }
}
