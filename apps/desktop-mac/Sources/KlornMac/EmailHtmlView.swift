import SwiftUI
import WebKit

/// Renders server-sanitized mail HTML the way the sender designed it —
/// tables, inline styles, images — instead of the plain-text projection that
/// mangled designed mail (founder, 2026-08-14). The server's sanitizer
/// (allowlist, no scripts/iframes/handlers) is the first wall; this view is
/// the second: content JavaScript disabled, cookies non-persistent, and
/// every link click leaves for the default browser — the pane itself never
/// navigates after the initial load.
struct EmailHtmlView: NSViewRepresentable {
    let html: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        // Let the pane's surface show through instead of a hard white sheet.
        view.setValue(false, forKey: "drawsBackground")
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        guard context.coordinator.loadedHtml != html else { return }
        context.coordinator.loadedHtml = html
        view.loadHTMLString(Self.wrap(html), baseURL: nil)
    }

    /// Reading-surface defaults that sender inline styles override: system
    /// type, measured margins, images never wider than the pane.
    static func wrap(_ body: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8">
        <style>
          body { margin: 20px 24px; font: 13px/1.5 -apple-system, 'Apple SD Gothic Neo', sans-serif; color: #1e293b; word-wrap: break-word; }
          img { max-width: 100%; height: auto; }
          table { max-width: 100%; }
          a { color: #0284c7; }
        </style></head><body>\(body)</body></html>
        """
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedHtml: String?
        private var didLoadInitialContent = false

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.navigationType == .linkActivated {
                if let url = navigationAction.request.url,
                    let scheme = url.scheme?.lowercased(),
                    ["http", "https", "mailto"].contains(scheme) {
                    NSWorkspace.shared.open(url)
                }
                decisionHandler(.cancel)
                return
            }
            // Only the FIRST .other navigation (our loadHTMLString) may load.
            // WebKit also types meta-refresh redirects as .other — the server
            // strips <meta>, but this wall must not depend on that staying
            // true (security review 2026-08-14, finding #5).
            if navigationAction.navigationType == .other && !didLoadInitialContent {
                didLoadInitialContent = true
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
        }
    }
}
