import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Game", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = GameController()
        self.window = window
        window.makeKeyAndVisible()
    }
}

// Internal simulator candidate only. Never connects to production scores.
// The eventual production bridge must use a narrowly approved origin and validated requests.
final class GameController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply, URLSessionTaskDelegate {
    private var web: WKWebView!
    private var gameURL: URL?
    private let impact = UIImpactFeedbackGenerator(style: .medium)

    // The fixture is available only in debug simulator launches with an explicit flag.
    // Production hosts are never reachable from this candidate.
    private var isolatedScores: Bool {
        #if DEBUG && targetEnvironment(simulator)
        return ProcessInfo.processInfo.arguments.contains("-isolated-scores")
        #else
        return false
        #endif
    }
    private lazy var scoreSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 12
        config.httpShouldSetCookies = false
        config.urlCache = nil
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 16/255, green: 20/255, blue: 33/255, alpha: 1)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        var fixtureSeed = ""
        #if DEBUG && targetEnvironment(simulator)
        if isolatedScores && ProcessInfo.processInfo.arguments.contains("-seed-isolated-valid") {
            fixtureSeed = """
            localStorage.setItem('dh_pending_campaign', JSON.stringify({
              id:'00000000-0000-4000-8000-000000000001', initials:'QA',
              stages:[0,1,2,3].map(stage => ({stage,score:1500,ms:30000}))
            }));
            """
        } else if isolatedScores && ProcessInfo.processInfo.arguments.contains("-seed-isolated-invalid") {
            fixtureSeed = """
            localStorage.setItem('dh_pending_campaign', JSON.stringify({
              id:'00000000-0000-4000-8000-000000000002', initials:'QA',
              stages:[0,1,2,3].map(stage => ({stage,score:50000,ms:30000}))
            }));
            """
        }
        #endif
        let bridge = """
        (() => {
          // Exact endpoint only, routed through real loopback HTTP in simulator QA.
          const isolated = \(isolatedScores ? "true" : "false");
          if (isolated) { \(fixtureSeed) }
          const scoreEndpoint = 'https://dont-hit-scores.onrender.com/scores';
          const originalFetch = window.fetch.bind(window);
          window.fetch = (input, options) => {
            const value = typeof input === 'string' ? input : input.url;
            if (isolated && value === scoreEndpoint) {
              const method = options?.method || 'GET';
              if (method !== 'GET' && method !== 'POST') return Promise.reject(new TypeError('Unsupported score method'));
              if (options?.signal?.aborted) return Promise.reject(new DOMException('Aborted','AbortError'));
              return window.webkit.messageHandlers.isolatedScore.postMessage({
                method, body: options?.body || ''
              }).then(reply => {
                if (options?.signal?.aborted) throw new DOMException('Aborted','AbortError');
                return new Response(reply.body, {status:reply.status, headers:{'Content-Type':'application/json'}});
              });
            }
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
        if isolatedScores {
            config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "isolatedScore")
        }
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

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard isolatedScores, message.name == "isolatedScore", message.frameInfo.isMainFrame,
              message.frameInfo.request.url == gameURL,
              let payload = message.body as? [String: Any],
              let method = payload["method"] as? String,
              let body = payload["body"] as? String,
              (method == "GET" && body.isEmpty || method == "POST" && body.utf8.count <= 2048),
              let endpoint = URL(string: "http://127.0.0.1:18081/scores") else {
            replyHandler(nil, "Score request not permitted")
            return
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        if method == "POST" {
            request.httpBody = Data(body.utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        scoreSession.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                guard error == nil, let response = response as? HTTPURLResponse,
                      response.url == endpoint, let data = data, data.count <= 65536,
                      let body = String(data: data, encoding: .utf8),
                      [200, 400, 409, 413, 415, 503].contains(response.statusCode) else {
                    replyHandler(nil, "Isolated score service unavailable")
                    return
                }
                replyHandler(["status": response.statusCode, "body": body], nil)
            }
        }.resume()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
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
