import UIKit
import WebKit
import Network
#if DEBUG && targetEnvironment(simulator)
import OSLog
#endif

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

// Bundle-only WebKit navigation; fixed native score and reachability bridges are the only network routes.
final class GameController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply, URLSessionTaskDelegate {
    private var web: WKWebView!
    private var gameURL: URL?
    private let pathMonitor = NWPathMonitor()
    private let reachabilityURL = URL(string: "https://dont-hit-game.onrender.com/reachability.txt")!
    private lazy var reachabilitySession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 2.5
        config.timeoutIntervalForResource = 2.7
        config.httpShouldSetCookies = false
        config.urlCache = nil
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    private let impact = UIImpactFeedbackGenerator(style: .medium)

    private enum ScoreMode: String { case offline, isolated, liveReadOnly, live }

    // Debug fixtures and live read-only QA cannot write production scores.
    // Only a release build on a physical device enables production POST.
    private var scoreMode: ScoreMode {
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("-isolated-scores") { return .isolated }
        if ProcessInfo.processInfo.arguments.contains("-production-score-read-only") { return .liveReadOnly }
        #elseif !DEBUG && !targetEnvironment(simulator)
        return .live
        #endif
        return .offline
    }
    private var isolatedScores: Bool { scoreMode == .isolated }
    #if DEBUG && targetEnvironment(simulator)
    private static let qaLog = Logger(subsystem: "com.maraschick.rushtoorbit.qa", category: "score-transport")
    #endif
    // file:// localStorage has no guaranteed persistent origin across launches.
    // Keep only the pending campaign in a small atomic native file; all other
    // storage keys retain their existing behavior. QA data never shares this file.
    private var pendingURL: URL? {
        let name: String
        switch scoreMode {
        case .isolated: name = "pending-campaign-qa.json"
        case .liveReadOnly: name = "pending-campaign-readonly-qa.json"
        case .offline, .live: name = "pending-campaign.json"
        }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent(name)
    }

    // Only existing local game keys; never includes score submission payloads.
    private static let gameKeys: Set<String> = [
        "dh_bank", "dh_best", "dh_owned", "dh_mute",
        "rto_endless_records_v1", "rto_endless_unlocked_v1", "rto_campaign_records_v1",
        "rto_daily_records_v1", "rto_orbit_livery_v1"
    ]
    private var retentionQA: Bool {
        #if DEBUG && targetEnvironment(simulator)
        return ProcessInfo.processInfo.arguments.contains("-retention-qa")
        #else
        return false
        #endif
    }
    private var gameSaveURL: URL? {
        let name = retentionQA ? "game-save-retention-qa.json" : "game-save-v1.json"
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent(name)
    }
    private var gameValues: [String: String] = [:]

    private func writeGameValues(_ values: [String: String]) throws {
        guard let url = gameSaveURL else { throw CocoaError(.fileNoSuchFile) }
        let data = try JSONEncoder().encode(values)
        guard data.count <= 16384 else { throw CocoaError(.fileWriteOutOfSpace) }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
        gameValues = values
    }

    private lazy var scoreSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = isolatedScores ? 8 : 55
        config.timeoutIntervalForResource = isolatedScores ? 12 : 60
        config.httpShouldSetCookies = false
        config.urlCache = nil
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 16/255, green: 20/255, blue: 33/255, alpha: 1)
        let config = WKWebViewConfiguration()
        // The fixture must never read or write legacy persistent WebKit saves.
        // A new ephemeral store per launch also proves native file persistence.
        config.websiteDataStore = retentionQA ? .nonPersistent() : .default()
        config.allowsInlineMediaPlayback = true
        var fixtureSeed = ""
        #if DEBUG && targetEnvironment(simulator)
        if isolatedScores && ProcessInfo.processInfo.arguments.contains("-seed-isolated-valid") {
            fixtureSeed = """
            savePending(JSON.stringify({
              id:'00000000-0000-4000-8000-000000000001',
              stages:[0,1,2,3].map(stage => ({stage,score:1500,ms:30000}))
            }));
            """
        } else if isolatedScores && ProcessInfo.processInfo.arguments.contains("-seed-isolated-invalid") {
            fixtureSeed = """
            savePending(JSON.stringify({
              id:'00000000-0000-4000-8000-000000000002', initials:'QA',
              stages:[0,1,2,3].map(stage => ({stage,score:50000,ms:30000}))
            }));
            """
        }
        #endif
        if let url = gameSaveURL, let data = try? Data(contentsOf: url), data.count <= 16384,
           let values = try? JSONDecoder().decode([String: String].self, from: data) {
            gameValues = values.filter { Self.gameKeys.contains($0.key) }
        }
        #if DEBUG && targetEnvironment(simulator)
        if retentionQA {
            if ProcessInfo.processInfo.arguments.contains("-reset-retention-qa") {
                try? writeGameValues([:])
            } else if ProcessInfo.processInfo.arguments.contains("-seed-retention-unlock") {
                // Local fixture only, no campaign submission or network access.
                try? writeGameValues(["rto_endless_unlocked_v1": "true", "dh_mute": "false"])
            }
        }
        #endif
        let savedGame = (try? JSONEncoder().encode(gameValues))?.base64EncodedString() ?? ""
        let savedPending = pendingURL.flatMap { try? Data(contentsOf: $0) }?.base64EncodedString() ?? ""
        let bridge = """
        (() => {
          // Exact endpoint only; Swift independently enforces the destination and verb.
          const mode = '\(scoreMode.rawValue)';
          const gameKeys = new Set(['dh_bank','dh_best','dh_owned','dh_mute','rto_endless_records_v1','rto_endless_unlocked_v1','rto_campaign_records_v1','rto_daily_records_v1','rto_orbit_livery_v1']);
          let gameValues = {};
          try {
            const storedGame = '\(savedGame)';
            if (storedGame) gameValues = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(storedGame), c => c.charCodeAt(0))));
          } catch (_) {}
          Object.defineProperty(window, 'rushNativeGameSave', {value: Object.freeze({
            get: key => gameKeys.has(key) && Object.prototype.hasOwnProperty.call(gameValues,key) ? gameValues[key] : null,
            set: (key,value) => {
              if (!gameKeys.has(key) || typeof value !== 'string') return;
              gameValues[key] = value;
              window.webkit.messageHandlers.gameSave.postMessage({key,value}).catch(() => {});
            }
          })});
          const pendingKey = 'dh_pending_campaign';
          const saved = '\(savedPending)';
          let pendingValue = null;
          try {
            pendingValue = saved
              ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(saved), c => c.charCodeAt(0))))
              : (mode === 'live' || mode === 'offline' ? window.localStorage.getItem(pendingKey) : null);
          } catch (_) {}
          let pendingWrites = Promise.resolve();
          function savePending(value) {
            pendingValue = value;
            pendingWrites = pendingWrites.catch(() => {}).then(() =>
              window.webkit.messageHandlers.pendingCampaign.postMessage({value}));
            // Observe the rejection here, but retain it for the POST durability gate.
            pendingWrites.catch(() => {});
          }
          // Explicit adapter: file:// storage access can throw at document start.
          // Never let that abort bridge initialization or leak QA state across modes.
          Object.defineProperty(window, 'rushNativePending', {value: Object.freeze({
            get: () => pendingValue,
            set: value => savePending(value === null ? null : String(value))
          })});
          if (!saved && pendingValue !== null) savePending(pendingValue);
          if (mode === 'isolated') { \(fixtureSeed) }
          const scoreEndpoint = 'https://dont-hit-scores.onrender.com/scores';
          const originalFetch = window.fetch.bind(window);
          window.fetch = (input, options) => {
            const value = typeof input === 'string' ? input : input.url;
            const localMarker = new URL('reachability.txt', location.href);
            const candidate = new URL(value, location.href);
            if (candidate.protocol === 'file:' && candidate.pathname === localMarker.pathname && (options?.method || 'GET') === 'GET') {
              if (options?.signal?.aborted) return Promise.reject(new DOMException('Aborted','AbortError'));
              return window.webkit.messageHandlers.nativeReachability.postMessage({}).then(ok => {
                if (options?.signal?.aborted) throw new DOMException('Aborted','AbortError');
                return new Response(ok ? 'rush-to-orbit-online-v1' : '', {status:ok ? 200 : 503});
              });
            }
            if (mode !== 'offline' && value === scoreEndpoint) {
              const method = options?.method || 'GET';
              if (method !== 'GET' && (method !== 'POST' || mode === 'liveReadOnly')) return Promise.reject(new TypeError('Unsupported score method'));
              if (options?.signal?.aborted) return Promise.reject(new DOMException('Aborted','AbortError'));
              // A failed disk write must not submit a score that cannot be retried.
              return (method === 'POST' ? pendingWrites : Promise.resolve()).then(() =>
                window.webkit.messageHandlers.nativeScore.postMessage({
                  method, body: options?.body || ''
                })).then(reply => {
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
        #if DEBUG && targetEnvironment(simulator)
        if retentionQA && ProcessInfo.processInfo.arguments.contains("-native-campaign-qa") {
            config.userContentController.addUserScript(WKUserScript(
                source: "Object.defineProperty(window, '__nativeCampaignQAEnabled', {value:true})",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        // Bundled native-only information, available without reaching a server.
        // Keep the public web assets byte-identical and the game engine untouched.
        let information = #"""
        (() => {
          const box = document.getElementById('box');
          if (!box || document.getElementById('rto-info')) return;
          const dialog = document.createElement('dialog');
          dialog.id = 'rto-info';
          dialog.setAttribute('aria-labelledby','rto-info-title');
          dialog.style.maxHeight = '80dvh';
          dialog.style.overscrollBehavior = 'contain';
          dialog.innerHTML = '<h2 id="rto-info-title"></h2><div id="rto-info-body"></div><button class="alt" type="button" id="rto-info-close">CLOSE INFORMATION</button>';
          document.body.append(dialog);
          const title = dialog.querySelector('h2'), body = dialog.querySelector('#rto-info-body');
          const sections = {
            'PRIVACY': [
              'No account is required. Internet is required to start or resume play; the game checks a first-party HTTPS endpoint.',
              'Settings, unlocks, liveries and personal records are saved on this device. A pending leaderboard submission can remain on the device for retry.',
              'Posting a standard campaign finish is optional. If you post, your racer initials, random run ID and four stage scores and times are sent to the score service. The public leaderboard shows initials, total points and elapsed time. Do not enter real names or identifying information.',
              'The score service retains submitted score information for ranking and duplicate prevention. Hosting services process connection information. Deleting the app or clearing local data does not delete a published score.',
              'This version has no advertising, purchases, third-party analytics SDK or tracking. The published privacy policy and contact for data requests must be finalized before public release.'
            ],
            'SUPPORT': [
              'Connect to Wi-Fi or cellular internet to play. If the game pauses for a connection problem, reconnect and choose Retry Connection.',
              'If a leaderboard submission fails, retry the saved finish from the leaderboard, or explicitly discard it on this device. Discarding a retry does not delete an already published score.',
              'For score concerns, record the racer initials, points and elapsed time. For technical issues, record the device model, iOS version, game version and what happened. Never send passwords or payment information.',
              'A verified public support contact and score-removal process are required before public release.'
            ]
          };
          let opener;
          function show(name, button) {
            if (dialog.open || document.querySelector('dialog[open]')) return;
            opener = button;
            title.textContent = name === 'PRIVACY' ? 'Privacy' : 'Support';
            body.replaceChildren(...sections[name].map(value => {
              const p = document.createElement('p'); p.textContent = value; return p;
            }));
            dialog.showModal();
            dialog.querySelector('#rto-info-close').focus();
          }
          dialog.querySelector('#rto-info-close').addEventListener('click', () => dialog.close());
          dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); });
          document.addEventListener('keydown', event => {
            if (dialog.open && [' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d'].includes(event.key)) event.stopImmediatePropagation();
          }, true);
          function attach() {
            // Both original home and the home restored from Garage; never gameplay or stage menus.
            if (!box.querySelector('#play, #go') || box.querySelector('#rto-info-links')) return;
            const row = document.createElement('div');
            row.id = 'rto-info-links';
            row.style.cssText = 'display:flex;gap:8px;margin-top:6px';
            for (const name of Object.keys(sections)) {
              const button = document.createElement('button');
              button.type = 'button'; button.className = 'alt';
              button.textContent = name;
              button.style.cssText = 'min-height:44px;padding:8px 4px;margin-top:0;font-size:13px';
              button.addEventListener('click', () => show(name, button));
              row.append(button);
            }
            box.append(row);
          }
          new MutationObserver(attach).observe(box,{childList:true});
          attach();
        })();
        """#
        config.userContentController.addUserScript(WKUserScript(source: information,
            injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        config.userContentController.add(self, name: "gameHaptic")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "pendingCampaign")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "gameSave")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "nativeReachability")
        if scoreMode != .offline {
            config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "nativeScore")
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
        pathMonitor.pathUpdateHandler = { [weak self] path in
            if path.status != .satisfied {
                DispatchQueue.main.async { self?.web.evaluateJavaScript("window.dispatchEvent(new Event('offline'))", completionHandler: nil) }
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "rto.network-path"))
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
        if message.name == "nativeReachability" {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url == gameURL else {
                replyHandler(false, nil); return
            }
            #if DEBUG && targetEnvironment(simulator)
            // Default debug launch exercises the offline interlock; retention QA uses real HTTPS.
            if scoreMode == .offline && !retentionQA { replyHandler(false, nil); return }
            #endif
            var request = URLRequest(url: reachabilityURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 2.5)
            request.httpMethod = "GET"
            reachabilitySession.dataTask(with: request) { data, response, error in
                let ok = error == nil && (response as? HTTPURLResponse)?.statusCode == 200 && response?.url == self.reachabilityURL && data.map { $0.count <= 128 && String(data: $0, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) == "rush-to-orbit-online-v1" } == true
                DispatchQueue.main.async { replyHandler(ok, nil) }
            }.resume()
            return
        }
        if message.name == "gameSave" {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url == gameURL,
                  let payload = message.body as? [String: Any],
                  let key = payload["key"] as? String, Self.gameKeys.contains(key),
                  let value = payload["value"] as? String, value.utf8.count <= 4096,
                  (try? JSONSerialization.jsonObject(with: Data(value.utf8), options: .fragmentsAllowed)) != nil else {
                replyHandler(nil, "Invalid local game save")
                return
            }
            var next = gameValues
            next[key] = value
            do {
                try writeGameValues(next)
                replyHandler(true, nil)
            } catch {
                replyHandler(nil, "Local game save failed")
            }
            return
        }
        if message.name == "pendingCampaign" {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url == gameURL,
                  let payload = message.body as? [String: Any],
                  let raw = payload["value"], let url = pendingURL else {
                replyHandler(nil, "Pending campaign write not permitted")
                return
            }
            let value: String?
            if raw is NSNull {
                value = nil
            } else if let string = raw as? String, string.utf8.count <= 2048,
                      let parsed = try? JSONSerialization.jsonObject(with: Data(string.utf8)),
                      parsed is [String: Any] {
                value = string
            } else {
                replyHandler(nil, "Invalid pending campaign")
                return
            }
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                        withIntermediateDirectories: true)
                // Store JSON null as a tombstone to prevent resurrecting stale web storage.
                try JSONEncoder().encode(value).write(to: url, options: .atomic)
                replyHandler(true, nil)
            } catch {
                replyHandler(nil, "Pending campaign could not be saved")
            }
            return
        }
        #if DEBUG && targetEnvironment(simulator)
        if message.name == "nativeScore" {
            Self.qaLog.notice("Score bridge received; mode=\(self.scoreMode.rawValue, privacy: .public) main=\(message.frameInfo.isMainFrame, privacy: .public) bundled=\(message.frameInfo.request.url == self.gameURL, privacy: .public)")
        }
        #endif
        guard scoreMode != .offline, message.name == "nativeScore", message.frameInfo.isMainFrame,
              message.frameInfo.request.url == gameURL,
              let payload = message.body as? [String: Any],
              let method = payload["method"] as? String,
              let body = payload["body"] as? String,
              (method == "GET" && body.isEmpty ||
               method == "POST" && scoreMode != .liveReadOnly && body.utf8.count <= 2048),
              let endpoint = URL(string: isolatedScores ? "http://127.0.0.1:18081/scores" :
                                 "https://dont-hit-scores.onrender.com/scores") else {
            replyHandler(nil, "Score request not permitted")
            return
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        if method == "POST" {
            // Enforce durability on the native side, not just in the JavaScript adapter.
            guard let url = pendingURL, let data = try? Data(contentsOf: url),
                  let saved = try? JSONDecoder().decode(String.self, from: data), saved == body else {
                replyHandler(nil, "Score not saved for retry")
                return
            }
            request.httpBody = Data(body.utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        scoreSession.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                #if DEBUG && targetEnvironment(simulator)
                if self.isolatedScores || self.scoreMode == .liveReadOnly {
                    // No payload, initials, or credentials in diagnostics.
                    let code = (error as NSError?)?.code ?? 0
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    Self.qaLog.notice("Score response mode=\(self.scoreMode.rawValue, privacy: .public) method=\(method, privacy: .public) status=\(status, privacy: .public) error=\(code, privacy: .public) expectedURL=\(response?.url == endpoint, privacy: .public)")
                }
                #endif
                guard error == nil, let response = response as? HTTPURLResponse,
                      response.url == endpoint, let data = data, data.count <= 65536,
                      let body = String(data: data, encoding: .utf8),
                      [200, 400, 409, 413, 415, 503].contains(response.statusCode) else {
                    replyHandler(nil, "Score service unavailable")
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
