import XCTest

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
        let app = XCUIApplication()
        func openBoard(_ seed: String? = nil) {
            app.launchArguments = ["-isolated-scores"] + (seed.map { [$0] } ?? [])
            app.launch()
            let button = app.buttons["GLOBAL LEADERBOARD"]
            XCTAssertTrue(button.waitForExistence(timeout: 25))
            button.tap()
        }
        func status(_ message: String, timeout: TimeInterval = 15) -> XCUIElement {
            let value = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", message)).firstMatch
            XCTAssertTrue(value.waitForExistence(timeout: timeout), "Missing status: " + message)
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
