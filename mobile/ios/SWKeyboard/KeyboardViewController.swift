import UIKit
import WebKit

private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
  weak var target: WKScriptMessageHandler?
  init(_ target: WKScriptMessageHandler) { self.target = target }
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.userContentController(userContentController, didReceive: message)
  }
}

/// Bundled UI only. No HTTP client, telemetry, remote pages, or third-party scripts.
final class KeyboardViewController: UIInputViewController, WKScriptMessageHandler, WKNavigationDelegate {
  private var web: WKWebView!
  private var resourceDirectory: URL!
  private var visible = false
  private var autoRead = false
  private var generation = 0
  private var queuedOperations = 0
  private let cryptoQueue = DispatchQueue(label: "com.gachlagan.keyboard.crypto", qos: .userInitiated)

  override func viewDidLoad() {
    super.viewDidLoad()
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.userContentController.add(WeakMessageHandler(self), name: "gachlagan")
    web = WKWebView(frame: .zero, configuration: configuration)
    web.navigationDelegate = self; web.isOpaque = false; web.backgroundColor = UIColor(red: 23/255, green: 27/255, blue: 39/255, alpha: 1)
    web.scrollView.isScrollEnabled = false; web.translatesAutoresizingMaskIntoConstraints = false
    if #available(iOS 16.4, *) { web.isInspectable = false }
    view.backgroundColor = web.backgroundColor
    view.addSubview(web)
    NSLayoutConstraint.activate([
      web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      web.topAnchor.constraint(equalTo: view.topAnchor), web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      view.heightAnchor.constraint(equalToConstant: 490)
    ])
    guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "secure") else { return }
    resourceDirectory = url.deletingLastPathComponent(); web.loadFileURL(url, allowingReadAccessTo: resourceDirectory)
    NotificationCenter.default.addObserver(self, selector: #selector(clipboardChanged), name: UIPasteboard.changedNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(protectScreen), name: UIApplication.willResignActiveNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(restoreScreen), name: UIApplication.didBecomeActiveNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(captureChanged), name: UIScreen.capturedDidChangeNotification, object: nil)
  }
  override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); restoreScreen() }
  override func viewWillDisappear(_ animated: Bool) { protectScreen(); super.viewWillDisappear(animated) }
  @objc private func protectScreen() {
    visible = false; generation += 1; web?.isHidden = true
    web?.evaluateJavaScript("window.gachlaganLock&&window.gachlaganLock()", completionHandler: nil)
  }
  @objc private func restoreScreen() { guard view.window != nil, !UIScreen.main.isCaptured else { return }; visible = true; web.isHidden = false; clipboardChanged() }
  @objc private func captureChanged() { if UIScreen.main.isCaptured { protectScreen() } else { restoreScreen() } }
  @objc private func clipboardChanged() {
    guard visible, autoRead, hasFullAccess else { return }
    guard let value = UIPasteboard.general.string, value.utf8.count <= 40000, value.hasPrefix("GK1.") || value.hasPrefix("GE1.") else { return }
    call("window.gachlaganClipboard", argument: value)
  }
  private func call(_ function: String, argument: Any) {
    guard let data = try? JSONSerialization.data(withJSONObject: [argument]), let json = String(data: data, encoding: .utf8) else { return }
    web.evaluateJavaScript("\(function)(\(json)[0])", completionHandler: nil)
  }
  private func respond(_ id: Int, result: Any?, error: String?, session: Int) {
    guard visible, session == generation else { return }
    var body: [String: Any] = ["id": id]
    if let error = error { body["error"] = error } else { body["result"] = result ?? NSNull() }
    call("window.gachlaganResolve", argument: body)
  }
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard visible, message.frameInfo.isMainFrame, let url = message.frameInfo.request.url, url.isFileURL,
      url.deletingLastPathComponent().standardizedFileURL == resourceDirectory?.standardizedFileURL,
      let body = message.body as? [String: Any], let id = body["id"] as? Int, let op = body["op"] as? String else { return }
    var session = generation
    do {
      if ["seal", "open", "generate", "saveKey", "loadKey", "forgetKey"].contains(op) {
        guard queuedOperations < 4 else { throw MessageCrypto.Failure("Please wait for the current operation.") }
        let capturedSession = session
        let text = body["text"] as? String ?? "", wire = body["wire"] as? String ?? "", secret = body["secret"] as? String ?? ""
        guard text.utf8.count <= 16384, wire.utf8.count <= 40000, secret.utf8.count <= 1024 else { throw MessageCrypto.Failure("Input is too large.") }
        queuedOperations += 1
        cryptoQueue.async { [weak self] in
          var result: Any = true, errorText: String?
          do {
            switch op {
            case "seal": result = try MessageCrypto.seal(text, secret: secret)
            case "open": result = try MessageCrypto.open(wire, secret: secret)
            case "generate": result = try MessageCrypto.generateKey()
            case "saveKey": try KeyVault.save(secret)
            case "loadKey": result = try KeyVault.load()
            default: try KeyVault.forget()
            }
          } catch { errorText = (error as? MessageCrypto.Failure)?.message ?? "Secure operation failed. Your draft was not sent." }
          DispatchQueue.main.async {
            guard let self = self else { return }; self.queuedOperations -= 1
            self.respond(id, result: result, error: errorText, session: capturedSession)
          }
        }; return
      }
      var result: Any = true
      switch op {
      case "insert", "plain":
        guard let text = body["text"] as? String, text.utf8.count <= 40000 else { throw MessageCrypto.Failure("Invalid output.") }
        if op == "insert" && !text.hasPrefix("GK1.") && !text.hasPrefix("GE1.") { throw MessageCrypto.Failure("Invalid output.") }
        textDocumentProxy.insertText(text)
      case "backspace": textDocumentProxy.deleteBackward()
      case "clipboard":
        guard hasFullAccess else { throw MessageCrypto.Failure("Allow Full Access in keyboard settings to read copied messages. No network connection is used.") }
        let value = UIPasteboard.general.string ?? ""
        guard value.utf8.count <= 40000 else { throw MessageCrypto.Failure("Clipboard message is too large.") }; result = value
      case "autoRead":
        let method = body["method"] as? String ?? "secure"
        guard ["secure", "binary", "hex", "octal", "base64", "morse"].contains(method) else { throw MessageCrypto.Failure("Unknown mode.") }
        autoRead = body["enabled"] as? Bool ?? false
        UserDefaults.standard.set(method, forKey: "messageMode"); UserDefaults.standard.set(autoRead, forKey: "autoRead")
      case "loadSettings":
        autoRead = UserDefaults.standard.bool(forKey: "autoRead")
        result = ["method": UserDefaults.standard.string(forKey: "messageMode") ?? "secure", "autoRead": autoRead]
      case "lock": generation += 1; session = generation
      case "next": advanceToNextInputMode()
      default: throw MessageCrypto.Failure("Unknown keyboard action.")
      }
      respond(id, result: result, error: nil, session: session)
      if op == "autoRead" { clipboardChanged() }
    } catch { respond(id, result: nil, error: error.localizedDescription, session: session) }
  }
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url, url.isFileURL, url.deletingLastPathComponent().standardizedFileURL == resourceDirectory?.standardizedFileURL,
      navigationAction.navigationType == .other, navigationAction.targetFrame?.isMainFrame == true else { decisionHandler(.cancel); return }
    decisionHandler(.allow)
  }
  deinit { NotificationCenter.default.removeObserver(self) }
}
