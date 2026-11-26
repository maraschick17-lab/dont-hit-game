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
        let app = XCUIApplication()
        app.launch()
        let play = app.buttons["LET'S GO"]
        XCTAssertTrue(play.waitForExistence(timeout: 25), "Bundled game did not launch")
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Native launch (QA)"
        capture.lifetime = .keepAlways
        add(capture)

        let scores = app.buttons["GLOBAL LEADERBOARD"]
        XCTAssertTrue(scores.waitForExistence(timeout: 5))
        scores.tap()
        let unavailable = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Scores unavailable")).firstMatch
        XCTAssertTrue(unavailable.waitForExistence(timeout: 10), "Offline board must fail honestly")
        app.buttons["BACK"].tap()
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        play.tap()
        let hud = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "ROAD")).firstMatch
        XCTAssertTrue(hud.waitForExistence(timeout: 5), "Highway must start from local assets")
        let gameplay = XCTAttachment(screenshot: app.screenshot())
        gameplay.name = "Native highway (QA)"
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
                XCTAssertTrue(endless.waitForExistence(timeout: 25), "Earned unlock persists after relaunch")
                endless.tap()
                XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "ORBIT")).firstMatch.waitForExistence(timeout: 5))
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
