# v4.14 internal TestFlight and launch handoff — 2026-11-26

## Verified checkpoint (not distribution approval)

- Production web: 2e42f9049fc15c711ddafe1004651dc913de5dbf; Render deployment dep-dc3udkq9lscs73digvp0 live. Public HTML, leaderboard JS, manifest and icon matched the exact release in CI.
- Native candidate: 2bc7f189e824aff773a03c96d0f7cd9fc75d6f0b, [run 45806386663](https://github.com/maraschick17-lab/dont-hit-game/actions/runs/45806386663). All three jobs succeeded, four native XCTest cases passed with zero failures. Native HTTPS GET returned 200; isolated HTTP POST returned 503 on deliberate first failure, 200 on retry, and 400 on an invalid finish. Offline launch, unlock/settings persistence and offline Endless Orbit access passed. No production test scores.
- Unsigned physical-device Release compiled; Xcode 27.1, iOS target 16.0. Simulator test and device artifacts expire November 29: [test evidence](https://github.com/maraschick17-lab/dont-hit-game/actions/runs/45806386663/artifacts/15109873562), [unsigned device](https://github.com/maraschick17-lab/dont-hit-game/actions/runs/45806386663/artifacts/15109088354). Neither is an installable TestFlight build.
- Score service deployment dep-dc39aq5g1s2s73eannl0 at 6436df3282bf0652957fe24de27a136ccc5841b3; isolated tests use the same validator, not production storage. Server limits are plausibility checks, not cryptographic proof of play.
- Approved rollback branch MM-approved-v4.8 still resolves to cc5c50c7bf950132ed0baca0d06355de34618ec5.
- Full native campaign, physical haptics, signed-device networking, all destination visuals and owner playtest remain open. Native retention test uses a debug-only unlock fixture; do not report it as a full native campaign win.

## Critical path: internal TestFlight, target December 1

Dot coordinates the following in an owner-controlled Apple session. No credentials, signing keys or codes in chat, repository, artifacts or logs.

1. Confirm the approved AppIcon artwork handoff, explicit bundle ID com.maraschick.rushtoorbit, app name availability, Apple team and app record (proposed SKU RTO-IOS-001, English U.S.). No registration or agreement acceptance by the engineering writer without coordination.
2. Confirm an approved free standard runner and protected signing approach; obtain an Apple Distribution identity and matching App Store Connect profile via the owner-controlled session or managed signing. Never store secrets in a public repository or pass them to pull-request jobs.
3. Generate the native project, archive Release with the approved icon, inspect the signed app for bundle ID, version/build, team, entitlement/application-identifier and matching provisioning profile. Inspect the actual bundled privacy manifest / required-reason API report; do not claim compliance from source inspection alone. Do not expose embedded signing material in public artifacts. Current OS-only HTTPS must be rechecked for export compliance in the final binary.
4. Coordinate upload for internal TestFlight only, no public App Review submission. In App Store Connect > TestFlight > Internal Testing, add the Account Holder to a group and add the processed build. Verify build status and invitation on the owner's iPhone. An internal-only export cannot be repurposed for public distribution.
5. On the actual iPhone test steering and turbo on all four stages, victory, Endless Orbit, fuel, cannon, audio and haptics, offline launch and saved settings after force quit, and production leaderboard read. Any real score must be a genuine voluntary completed campaign, never a QA fixture. Record device/OS/build and failures. Owner must approve before public review.

December 5 public availability is a target, not a promise; signing, physical playtest, assets, metadata and Apple review are still dependencies.

## Privacy inventory from the current source and deployed score handler

| Data | Where / purpose |
| --- | --- |
| Settings, unlocks, local records | Device/browser local save; native Application Support file. No intentional transmission of these records. |
| Optional standard campaign leaderboard | Player-selected 1–3 letters/digits, random per-run UUID, four stage indices/scores/times sent to the HTTPS score service on explicit submit. Server stores UUID, initials, aggregate points and elapsed milliseconds. Public top 25 shows initials, points and time, not UUID. |
| Pending submission | Locally saved for retry; identical run ID avoids duplicate insertion. |
| Hosting connection data | HTTPS provider necessarily handles connection information. Confirm Render request-log retention/access and actual data handling before final disclosure. |
| Ads, purchases, tracking, accounts | None implemented in this native candidate; no third-party ad/analytics SDK, identity login or advertising identifier in reviewed app code. Reassess before enabling any such feature. |

Current UI explicitly warns initials are public and recommends a nickname instead of a real name. Text is limited to ASCII letters/digits and inserted as text, not HTML. There is no implemented score deletion UI, retention expiry, or content moderation workflow. Do not promise automatic deletion, fixed retention, anonymity or a guaranteed removal deadline. Before launch, owner must approve a private support contact, a retention/removal policy, and a procedure for inappropriate initials or privacy requests. No database migration is authorized.

Provisional App Store privacy label: Gameplay Content and potentially Other User Content / User ID (public initials function as a handle), for App Functionality; no tracking intended. Review linkage to identity and any provider logging before selecting final answers. The per-run UUID is not an account/device ID. Do not choose Data Not Collected because optional submissions are retained. No final declarations made.

## Draft public privacy policy — NOT PUBLISHED

Rush to Orbit is a free arcade game. You can play without creating an account or submitting a score. Your settings, unlocks and personal records are saved locally. If you choose to post a completed standard campaign, we send your chosen short nickname, a random run identifier, stage scores and times to our leaderboard service. The service stores the nickname, run identifier, total score and time to rank runs and avoid duplicate submissions. The top scores display nicknames, scores and times publicly. Do not use your real name or other identifying information as a nickname. A pending score may stay on your device for retry if the service is unavailable.

Our hosting provider processes network requests and associated connection information needed to operate the service. The current game does not include advertising or third-party analytics SDKs, purchases or account sign-in. We use the score information to operate the leaderboard, not for targeted advertising. Local progress is separate from posted scores; deleting the app or clearing browser data does not remove an already-posted leaderboard entry.

[Before publication: insert verified responsible developer and private contact details, approved retention and deletion procedure, hosting-log disclosure and effective date. Do not publish this draft with placeholders.]

## Draft support page — NOT PUBLISHED

Rush to Orbit support. You can play the standard campaign without a connection in the iPhone app; an internet connection is needed to view or submit global scores. If scores are unavailable, try again when connected. If a submission fails temporarily, the game keeps its pending run for retry. The same run is not intended to count twice. For gameplay issues, include the device model, OS version, app version and a brief description. Do not send passwords, payment details or other sensitive information. For leaderboard concerns, include the short nickname, score and elapsed time, not real identity information.

[Before publication: approved private support email and any other legally required contact information; provide a way to request removal or report inappropriate initials.]

Proposed public URLs (not live or verified): https://dont-hit-game.onrender.com/privacy.html and https://dont-hit-game.onrender.com/support.html. Publish only once contact, retention and removal workflow are approved; verify HTTPS and link them from app/store metadata. Do not mark privacy/support complete now.

## Store copy draft (verified features only)

Name: Rush to Orbit
Subtitle: Dodge, drive, fly, survive
Keywords: traffic,boat,jet,rocket,space,reflex,obstacle,runner,highscore,highway,steering,speed

Description: Race through highway traffic, navigate waterways, fly through the sky and launch into space. Dodge obstacles, manage fuel and use turbo to complete four consecutive stages. Reach orbit to unlock Endless Orbit, where an automatic cannon clears asteroids as you travel deeper into space. Chase personal records and earn a gold vehicle. Posting a standard campaign finish to the global leaderboard is optional.

No claims of Elite, daily/weekly global contests, paid rewards or verified anti-cheat. Native store screenshots and a gameplay preview must come from genuine native gameplay captures rather than fixture-only screens.

## Official references checked November 26

- https://developer.apple.com/news/upcoming-requirements/ — current minimum Xcode/iOS SDK and deployment target requirements.
- https://developer.apple.com/help/app-store-connect/release-notes/ — stable SDK upload acceptance.
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/
- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype

No code, deployment, signing, score storage, spending, or Apple account change is implied by this handoff.
