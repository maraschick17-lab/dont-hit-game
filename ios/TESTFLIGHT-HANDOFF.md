# Private TestFlight handoff (not public release)

Native v4.14 is the previously validated candidate; v4.15 lane economy and v4.16 web connectivity are not included. No public submission, no new cert/profile, no paid runners. Do not use the fixture artwork in a distributed build.

1. Dot/owner hands off the actual approved 1024x1024 RGB PNG as tracked `ios/approved-app-icon.png` in the candidate branch. No certificate or key files may enter Git.
2. Owner limits the existing `testflight` environment to the reviewed candidate branch, retains required reviewer and no admin bypass. Check the exact SHA and workflow before approving. Enter the seven environment secrets directly in GitHub's authenticated settings UI (never in a chat, Git commit, or public artifact).
3. `BUILD_CERTIFICATE_BASE64` = base64 of the existing password-protected distribution P12 including its matching private key; `P12_PASSWORD` = existing export password; `BUILD_PROVISION_PROFILE_BASE64` = base64 of existing App Store mobileprovision; `KEYCHAIN_PASSWORD` = new random temporary keychain password; `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` = authorized App Store Connect team API key ID, issuer ID, and complete .p8 contents respectively (Developer role suffices for uploads). Do not create duplicate signing assets. Check secret size limits before entering.
4. GitHub requires the workflow_dispatch file on the default branch before it can be invoked against the candidate branch. Coordinate adding only the reviewed workflow file to main separately; no gameplay merge or web deployment in this PR. Run the manual workflow on engineering/internal-testflight-handoff with an unused positive build number. The environment reviewer must approve; no scheduled or PR-triggered signing. Verify the public-repo standard runner remains free.
5. The job validates local assets and bundle metadata, imports the matching existing distribution identity/profile into a temporary keychain, archives, verifies signature, and uploads with testFlightInternalTestingOnly=true. No public artifact, no alternate upload path, no public store submission. It deletes temporary signing files on exit; do not enable debug tracing.
6. After Apple processes the upload, verify the Internal indicator in App Store Connect app 6839836090 and add build to an owner-only internal group. The owner uses TestFlight on iPhone. Upload command success is not installation evidence. Do not submit to external testers or public review.

Official references:
- https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers
