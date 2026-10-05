// probe2.swift <url> <setupJS-file> <asyncJS-file> [pngOut]
import Cocoa
import WebKit
let a = CommandLine.arguments
let setup = try! String(contentsOfFile: a[2]); let body = try! String(contentsOfFile: a[3])
final class P: NSObject, WKNavigationDelegate {
  let web: WKWebView
  override init() { let c = WKWebViewConfiguration(); c.websiteDataStore = .nonPersistent()
    let css = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}"
    c.userContentController.addUserScript(WKUserScript(source: "var st=document.createElement('style');st.textContent='\(css)';document.documentElement.appendChild(st);", injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: c); super.init() }
  var win: NSWindow!
  func start() { win = NSWindow(contentRect: NSRect(x: -3000, y: 0, width: 1440, height: 900), styleMask: [.borderless], backing: .buffered, defer: false)
    win.contentView = web; win.orderBack(nil)
    web.navigationDelegate = self; web.load(URLRequest(url: URL(string: a[1])!)) }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      w.evaluateJavaScript(setup) { _, e in if let e = e { print("setup error", e) } }
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
        w.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { r in
          switch r { case .success(let v): print(v ?? "nil"); case .failure(let e): print("error", e) }
          if a.count > 4 { let cfg = WKSnapshotConfiguration(); w.takeSnapshot(with: cfg) { img, _ in
              if let img = img, let t = img.tiffRepresentation, let b = NSBitmapImageRep(data: t), let png = b.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: a[4])) }
              exit(0) } } else { exit(0) }
        }
      }
    }
  }
}
let app = NSApplication.shared; app.setActivationPolicy(.prohibited)
let p = P(); p.start(); app.run()
