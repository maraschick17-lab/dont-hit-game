# Rush to Orbit — unsigned native candidate

This is a **simulator-only offline QA milestone**, not an App Store distribution build. It bundles the exact v4.13 HTML, leaderboard JS, manifest and existing SVG. No icon replacement; Dot owns store icon handoff. No production score requests, signing, entitlements, ads or purchases.

Proposed bundle ID: `com.maraschick.rushtoorbit` (owner must confirm availability before registration). The iPhone-only target uses iOS 16+ and portrait orientation. The app includes a local WebKit runtime, native haptic bridge and offline behavior. Physical haptics and local save persistence are not yet verified.

On a compatible Mac from repository root:
1. Install free XcodeGen if missing; use Xcode 27 or later.
2. `mkdir -p ios/App/Web && cp index.html leaderboard.js manifest.webmanifest icon.svg ios/App/Web/`
3. `cd ios && xcodegen generate`
4. `xcodebuild -project RushToOrbit.xcodeproj -scheme RushToOrbit -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`

The GitHub Actions job builds and runs a native UI smoke test, saving simulator build and test artifacts. Offline scoreboard errors are deliberate: the production backend is not approved for native traffic. Next gate: isolated score service tests from actual WKWebView, exact origin/transport rules, fabricated score validation, retry/persistence, full four-stage mobile playthrough, and physical-device haptics. Then privacy/support pages, final assets, native lifecycle and accessibility polish, signing and coordinated TestFlight. Do not upload this QA build.

## Isolated score integration candidate
The debug simulator flag `-isolated-scores` enables a single exact leaderboard route through native URLSession to a loopback HTTP service. The workflow checks out the deployed score validator at its exact commit and uses an in-memory QA database adapter; no production credentials, database or score requests are involved. All other remote WebKit requests remain blocked. The test seeds a synthetic fixture only in debug simulator QA, checks retry after an intentional server failure and app restart, then verifies the real handler rejects an impossible score. This is not proof of gameplay or a production network configuration. The regular offline test remains unchanged. Physical-device tests, production HTTPS bridge, proof-of-play design, final signing and App Store review remain separate.
