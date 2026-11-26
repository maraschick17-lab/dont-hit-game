import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = GameController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

// Internal simulator candidate only. Never connects to production scores.
// The eventual production bridge must use a narrowly approved origin and validated requests.
final class GameController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private var web: WKWebView!
    private var gameURL: URL?
    private let impact = UIImpactFeedbackGenerator(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 16/255, green: 20/255, blue: 33/255, alpha: 1)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        let bridge = """
        (() => {
          // Offline QA only: no fake leaderboard results and no production traffic.
          const originalFetch = window.fetch.bind(window);
          window.fetch = (input, options) => {
            const value = typeof input === 'string' ? input : input.url;
            if (/^https?:/i.test(String(value))) {
              return Promise.reject(new TypeError('Offline native test build'));
            }
            return originalFetch(input, options);
          };
          if (typeof crypto.randomUUID !== 'function') {
            Object.defineProperty(crypto, 'randomUUID', {value: () => {
              const b = crypto.getRandomValues(new Uint8Array(16));
              b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
              const h = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
              return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
            }});
          }
          try {
            Object.defineProperty(navigator, 'vibrate', {value: pattern => {
              window.webkit.messageHandlers.gameHaptic.postMessage(Array.isArray(pattern) ? 'crash' : 'tap');
              return true;
            }});
          } catch (_) {}
        })();
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "gameHaptic")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.translatesAutoresizingMaskIntoConstraints = false
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            showError("Game assets missing")
            return
        }
        gameURL = url
        // Independent network block, in addition to the JS offline adapter.
        let rules = """
        [{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}}]
        """
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "rush-offline-qa", encodedContentRuleList: rules) { [weak self] list, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                guard let list = list, error == nil else {
                    self.showError("Offline safety configuration failed")
                    return
                }
                self.web.configuration.userContentController.add(list)
                self.web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            }
        }
    }

    private func showError(_ message: String) {
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        decisionHandler(url == gameURL ? .allow : .cancel)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "gameHaptic", message.frameInfo.isMainFrame,
              message.frameInfo.request.url == gameURL,
              let event = message.body as? String else { return }
        if event == "crash" {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        } else if event == "tap" {
            impact.impactOccurred(intensity: 0.45)
        }
    }
}
