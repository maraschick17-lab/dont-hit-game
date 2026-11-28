import XCTest

// Verify real touch opened the modal before diagnosing network failures.
private func openScoreboard(_ app: XCUIApplication, timeout: TimeInterval = 25) {
    let button = app.buttons["GLOBAL LEADERBOARD"]
    XCTAssertTrue(button.waitForExistence(timeout: timeout), "Leaderboard menu missing")
    let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: button)
    XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed, "Leaderboard button not hittable")
    button.tap()
    let opened = app.buttons["BACK"].waitForExistence(timeout: 8)
    if !opened { print("Leaderboard modal failed to open after real touch: \(app.debugDescription)") }
    XCTAssertTrue(opened, "Leaderboard modal did not open after real touch")
}

final class OfflineSmoke: XCTestCase {
    func testBundledGameAndOfflineScoreboard() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let play = app.buttons["LET'S GO"]
        XCTAssertTrue(play.waitForExistence(timeout: 25), "Bundled game did not launch")
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Native launch (QA)"
        capture.lifetime = .keepAlways
        add(capture)

        openScoreboard(app)
        let unavailable = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Scores unavailable")).firstMatch
        XCTAssertTrue(unavailable.waitForExistence(timeout: 10), "Offline board must fail honestly")
        // A prior real campaign can leave a pending finish, making the modal
        // taller than the viewport. Exercise real scrolling, not JS dismissal.
        let back = app.buttons["BACK"]
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        // WebKit may focus the visible initials input when the dialog opens.
        // The native keyboard then covers Back even when XCTest reports it
        // hittable. Dismiss the real keyboard via its accessory Done button.
        func dismissInitialsKeyboard() {
            let done = app.toolbars.buttons["Done"].firstMatch
            if done.exists {
                XCTAssertTrue(done.isHittable, "Initials keyboard Done must be reachable")
                done.tap()
                let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: done)
                XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 8), .completed, "Initials keyboard must dismiss")
            }
        }
        dismissInitialsKeyboard()
        if !back.isHittable { app.swipeUp(); dismissInitialsKeyboard() }
        if !back.isHittable { app.swipeUp(); dismissInitialsKeyboard() }
        XCTAssertTrue(back.isHittable, "Leaderboard Back must be reachable with a pending finish")
        back.tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: back)
        let didClose = XCTWaiter.wait(for: [closed], timeout: 10) == .completed
        if !didClose { print("Leaderboard Back did not dismiss after touch: \(app.debugDescription)") }
        XCTAssertTrue(didClose, "Leaderboard must dismiss before gameplay")
        XCTAssertTrue(play.waitForExistence(timeout: 10))
        play.tap()
        let hud = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "ROAD")).firstMatch
        let retry = app.buttons["RETRY CONNECTION"]
        XCTAssertTrue(retry.waitForExistence(timeout: 10), "Offline gameplay must be blocked")
        XCTAssertFalse(hud.exists, "Offline start must not enter highway")
        retry.tap()
        XCTAssertTrue(retry.waitForExistence(timeout: 10))
        XCTAssertFalse(hud.exists)
        app.buttons["BACK TO MENU"].tap()
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        let gameplay = XCTAttachment(screenshot: app.screenshot())
        gameplay.name = "Native offline interlock (QA)"
        gameplay.lifetime = .keepAlways
        add(gameplay)
    }
}

final class IsolatedScoreSmoke: XCTestCase {
    func testRealHTTPRetryAndValidationWithoutProduction() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        func openBoard(_ seed: String? = nil) {
            app.launchArguments = ["-isolated-scores"] + (seed.map { [$0] } ?? [])
            app.launch()
            openScoreboard(app)
        }
        func status(_ message: String, timeout: TimeInterval = 15) -> XCUIElement {
            let value = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", message)).firstMatch
            let found = value.waitForExistence(timeout: timeout)
            if !found { print("Score status missing; UI tree: \(app.debugDescription)") }
            XCTAssertTrue(found, "Missing status: " + message)
            return value
        }
        func post() {
            let button = app.buttons["POST MY FINISH"]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            button.tap()
        }

        openBoard("-seed-isolated-valid")
        _ = status("First place is open.")
        post()
        _ = status("Your run is saved for another try.")
        app.terminate()
        // No fixture seed on relaunch: the original pending payload must survive.
        openBoard()
        _ = status("Top campaign finishes")
        post()
        _ = status("Your global rank: #1")
        XCTAssertFalse(app.buttons["POST MY FINISH"].exists)
        app.terminate()

        openBoard("-seed-isolated-invalid")
        _ = status("Top campaign finishes")
        post()
        _ = status("This finish was rejected.")
        let discard = app.buttons["DISCARD SAVED FINISH"]
        XCTAssertTrue(discard.waitForExistence(timeout: 10))
        if !discard.isHittable { app.swipeUp() }
        XCTAssertTrue(discard.isHittable)
        discard.tap()
        XCTAssertTrue(app.buttons["KEEP SAVED FINISH"].waitForExistence(timeout: 5))
        app.buttons["KEEP SAVED FINISH"].tap()
        XCTAssertTrue(app.buttons["POST MY FINISH"].exists, "Cancel must preserve the pending finish")
        discard.tap()
        app.buttons["CONFIRM DISCARD SAVED FINISH"].tap()
        _ = status("Saved retry discarded on this device.")
        XCTAssertFalse(app.buttons["POST MY FINISH"].exists)
        Thread.sleep(forTimeInterval: 1)
        app.terminate()
        openBoard()
        _ = status("Top campaign finishes")
        XCTAssertFalse(app.buttons["POST MY FINISH"].exists, "Native discard must persist after relaunch")
        app.terminate()
    }
}

final class ProductionScoreReadOnlySmoke: XCTestCase {
    func testActualNativeHTTPSLeaderboardReadWithoutPosting() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-production-score-read-only"]
        app.launch()
        openScoreboard(app)
        let available = app.staticTexts.containing(NSPredicate(
            format: "label == %@ OR label == %@", "Top campaign finishes", "First place is open."
        )).firstMatch
        let found = available.waitForExistence(timeout: 70)
        if !found { print("Production board status missing; UI tree: \(app.debugDescription)") }
        XCTAssertTrue(found, "Native production HTTPS GET failed")
        XCTAssertFalse(app.buttons["POST MY FINISH"].exists)
        app.terminate()
    }
}

final class RetentionSmoke: XCTestCase {
    func testLocalUnlockAndSettingsPersistAcrossRelaunch() throws {
        let app = XCUIApplication()
        func open(_ args: [String]) {
            app.launchArguments = ["-retention-qa"] + args
            app.launch()
            XCTAssertTrue(app.buttons["LET'S GO"].waitForExistence(timeout: 25))
        }
        let endless = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "ENDLESS ORBIT")).firstMatch
        open(["-reset-retention-qa"])
        XCTAssertFalse(endless.exists, "New local save must not skip the campaign")
        app.terminate()
        open(["-seed-retention-unlock"])
        XCTAssertTrue(endless.waitForExistence(timeout: 5), "Fixture represents a previously earned unlock")
        app.buttons["GARAGE"].tap()
        let sound = app.buttons["SOUND: ON"]
        XCTAssertTrue(sound.waitForExistence(timeout: 5))
        sound.tap()
        XCTAssertTrue(app.buttons["SOUND: OFF"].waitForExistence(timeout: 5))
        // Allow the async WebKit bridge to deliver the atomic disk write.
        Thread.sleep(forTimeInterval: 1)
        app.terminate()
        open([])
        XCTAssertTrue(endless.waitForExistence(timeout: 5), "Unlock must survive app relaunch")
        app.buttons["GARAGE"].tap()
        XCTAssertTrue(app.buttons["SOUND: OFF"].waitForExistence(timeout: 5), "Real UI setting must survive relaunch")
        app.buttons["BACK TO GAME"].tap()
        XCTAssertTrue(endless.waitForExistence(timeout: 5))
        endless.tap()
        let hud = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "ORBIT")).firstMatch
        XCTAssertTrue(hud.waitForExistence(timeout: 5), "Actual native Endless mode did not start")
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Native Endless Orbit (QA fixture unlock)"
        capture.lifetime = .keepAlways
        add(capture)
        app.terminate()
    }
}


final class NativeCampaignSmoke: XCTestCase {
    // Real-duration WKWebView game loop, actual stage-button XCTest touches
    // and synthetic DOM pointer steering; not a physical-device touch test.
    // No seeded unlock or mutation of progress, fuel, score, RNG or collision.
    func testNativeFourStageCampaignEarnsUnlock() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        let play = app.buttons["LET'S GO"]
        let endless = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "ENDLESS ORBIT")).firstMatch
        func capture(_ name: String) {
            let image = XCTAttachment(screenshot: app.screenshot())
            image.name = name
            image.lifetime = .keepAlways
            add(image)
        }
        var lastFailure = "campaign did not start"
        for attempt in 1...2 {
            app.launchArguments = ["-retention-qa", "-reset-retention-qa", "-native-campaign-qa"]
            app.launch()
            XCTAssertTrue(play.waitForExistence(timeout: 25))
            XCTAssertFalse(endless.exists, "Fresh save must not skip campaign")
            play.tap()
            var completed = true
            for (stage, label) in ["ROAD", "SEA", "AIR", "SPACE"].enumerated() {
                let hud = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
                guard hud.waitForExistence(timeout: 8) else {
                    lastFailure = "missing stage \(stage) HUD"
                    completed = false
                    break
                }
                capture("Native campaign attempt \(attempt) stage \(stage)")
                let next = app.buttons[stage == 3 ? "PLAY AGAIN" : "NEXT STAGE"]
                let crash = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "TRY AGAIN")).firstMatch
                let deadline = Date().addingTimeInterval(70)
                while Date() < deadline && !next.exists && !crash.exists {
                    Thread.sleep(forTimeInterval: 0.5)
                }
                guard next.exists && !crash.exists else {
                    lastFailure = "stage \(stage) failed or timed out"
                    capture("Native campaign failure attempt \(attempt) stage \(stage)")
                    completed = false
                    break
                }
                if stage < 3 { next.tap() }
            }
            if completed {
                let win = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "YOU WIN")).firstMatch
                XCTAssertTrue(win.waitForExistence(timeout: 5))
                let record = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "campaign points")).firstMatch
                XCTAssertTrue(record.waitForExistence(timeout: 5))
                let raw = record.label.split(separator: "·").last.map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
                let duration = Double(raw.replacingOccurrences(of: "s", with: "")) ?? 0
                XCTAssertGreaterThanOrEqual(duration, 119.6, "All four stages must finish in real game time")
                XCTAssertTrue(endless.exists, "Victory must earn Endless Orbit")
                capture("Native earned victory")
                print("Native real-duration campaign passed: \(duration) seconds, attempt \(attempt)")
                Thread.sleep(forTimeInterval: 1)
                app.terminate()
                app.launchArguments = ["-retention-qa"]
                app.launch()
                XCTAssertTrue(play.waitForExistence(timeout: 25), "Relaunched game menu must be ready")
                XCTAssertTrue(endless.waitForExistence(timeout: 25), "Earned unlock persists after relaunch")
                XCTAssertTrue(endless.isHittable, "Earned Endless button must be directly accessible on the home menu")
                endless.tap()
                let orbitHUD = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "ORBIT ·")).firstMatch
                let entered = orbitHUD.waitForExistence(timeout: 10)
                if !entered {
                    capture("Native earned Endless entry failure")
                    print("Endless entry failure, UI tree: \(app.debugDescription)")
                }
                XCTAssertTrue(entered, "Earned Endless must actually start after relaunch")
                XCTAssertFalse(endless.exists, "Home menu must leave the screen when Endless starts")
                capture("Native earned Endless Orbit")
                app.terminate()
                return
            }
            print("Native real-duration campaign attempt \(attempt): \(lastFailure)")
            app.terminate()
        }
        XCTFail(lastFailure)
    }
}


final class InformationSmoke: XCTestCase {
    func testPrivacyAndSupportAccessibleOfflineAndAfterGarage() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let play = app.buttons["LET'S GO"]
        XCTAssertTrue(play.waitForExistence(timeout: 25))
        let privacy = app.buttons["PRIVACY"]
        let support = app.buttons["SUPPORT"]
        func open(_ button: XCUIElement, contains phrase: String) {
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            if !button.isHittable { app.swipeUp() }
            XCTAssertTrue(button.isHittable)
            button.tap()
            let close = app.buttons["CLOSE INFORMATION"]
            XCTAssertTrue(close.waitForExistence(timeout: 5))
            let content = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", phrase)).firstMatch
            XCTAssertTrue(content.waitForExistence(timeout: 5))
            if !close.isHittable { app.swipeUp() }
            XCTAssertTrue(close.isHittable)
            close.tap()
            XCTAssertFalse(close.exists)
        }
        open(privacy, contains: "No account is required")
        open(support, contains: "Connect to Wi-Fi or cellular internet")
        app.buttons["GARAGE"].tap()
        app.buttons["BACK TO GAME"].tap()
        open(privacy, contains: "No account is required")
        app.buttons["PLAY"].tap()
        XCTAssertTrue(app.buttons["RETRY CONNECTION"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["CLOSE INFORMATION"].exists)
        app.terminate()
    }
}
