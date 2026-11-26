# Rush to Orbit — unsigned native candidate

This is a **simulator-only offline QA milestone**, not an App Store distribution build. It bundles the exact v4.13 HTML, leaderboard JS, manifest and existing SVG. No icon replacement; Dot owns store icon handoff. No production score requests, signing, entitlements, ads or purchases.

Proposed bundle ID: `com.maraschick.rushtoorbit` (owner must confirm availability before registration). The iPhone-only target uses iOS 16+ and portrait orientation. The app includes a local WebKit runtime, native haptic bridge and offline behavior. Physical haptics and local save persistence are not yet verified.

On a compatible Mac from repository root:
1. Install free XcodeGen if missing; use Xcode 27 or later.
2. `mkdir -p ios/App/Web && cp index.html leaderboard.js manifest.webmanifest icon.svg ios/App/Web/`
3. `cd ios && xcodegen generate`
4. `xcodebuild -project RushToOrbit.xcodeproj -scheme RushToOrbit -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`

The GitHub Actions job builds and runs a native UI smoke test, saving simulator build and test artifacts. Offline scoreboard errors are deliberate: the production backend is not approved for native traffic. Next gate: isolated score service tests from actual WKWebView, exact origin/transport rules, fabricated score validation, retry/persistence, full four-stage mobile playthrough, and physical-device haptics. Then privacy/support pages, final assets, native lifecycle and accessibility polish, signing and coordinated TestFlight. Do not upload this QA build.
