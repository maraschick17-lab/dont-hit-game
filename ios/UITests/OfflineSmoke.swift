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
