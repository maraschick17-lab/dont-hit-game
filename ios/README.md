# Rush to Orbit — unsigned native candidate

This is an **unsigned native QA candidate**, not an App Store distribution build. It bundles the exact v4.13 HTML, leaderboard JS, manifest and existing SVG. No icon replacement; Dot owns store icon handoff. Debug QA permits only isolated score writes and an explicitly read-only production HTTPS check. No signing, entitlements, ads or purchases.

Proposed bundle ID: `com.maraschick.rushtoorbit` (owner must confirm availability before registration). The iPhone-only target uses iOS 16+ and portrait orientation. The app includes a local WebKit runtime, native haptic bridge and offline behavior. Physical haptics and local save persistence are not yet verified.

On a compatible Mac from repository root:
1. Install free XcodeGen if missing; use Xcode 27 or later.
2. `mkdir -p ios/App/Web && cp index.html leaderboard.js manifest.webmanifest icon.svg ios/App/Web/`
3. `cd ios && xcodegen generate`
4. `xcodebuild -project RushToOrbit.xcodeproj -scheme RushToOrbit -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`

The GitHub Actions job builds and runs native UI smoke tests, saving simulator build and test artifacts. Offline scoreboard errors remain deliberate in default Debug QA. Run 45746167798 passed isolated HTTP retry after app restart, duplicate prevention, invalid-score rejection and offline gameplay (two XCTest cases, zero failures). Next gates: unsigned device Release compile, production read-only HTTPS test from the actual native runtime, full four-stage native playthrough, physical-device haptics, privacy/support pages, final assets, signing and coordinated TestFlight. Do not upload unsigned QA builds.

## Isolated score integration candidate
The debug simulator flag `-isolated-scores` enables a single exact leaderboard route through native URLSession to a loopback HTTP service. The workflow checks out the deployed score validator at its exact commit and uses an in-memory QA database adapter; no production credentials, database or score requests are involved. All other remote WebKit requests remain blocked. The test seeds a synthetic fixture only in debug simulator QA, checks retry after an intentional server failure and app restart, then verifies the real handler rejects an impossible score. This is not proof of gameplay or a production network configuration. The regular offline test remains unchanged. Physical-device tests, proof-of-play design, final signing and App Store review remain separate. The existing validator rejects impossible score envelopes but does not prove a real playthrough.

## Production transport candidate
The bundled page is the sole permitted WebKit navigation and all remote WebKit networking remains independently blocked. The native URLSession bridge accepts only the exact score endpoint, GET without a body and bounded POST with the exact atomically persisted pending payload; cookies, caching and redirects are disabled. Debug simulator mode `-production-score-read-only` permits only production HTTPS GET and uses a separate pending file. Debug default remains offline; debug isolated mode uses loopback and a separate pending file. Production POST is enabled only in physical-device Release builds. No server CORS expansion, production test scores, or database changes. The read-only test and unsigned device compile must pass before this candidate advances. A signed device run is still required.
