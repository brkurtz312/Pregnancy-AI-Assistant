// WatchKickCounterSignOutTests.swift
// Confirms that the Watch kick counter resets cleanly when the user signs out
// mid-kick-session — i.e. while a kick-counting session is actively in progress.
//
// Scope of these tests:
//
//   WatchSessionManager (via real implementation with injected deps)
//   ──────────────────────────────────────────────────────────────────
//   1. Seeding an in-progress kick session in UserDefaults, delivering a signOut
//      payload via the real WCSession delegate path, and asserting that every
//      kick-counter key (kickCountKey, kickSessionActiveKey, kickSessionStartKey)
//      is removed.
//   2. The signOut must also clear the session-manager-owned keys (tips,
//      gestationalWeek, lastKickCount, lastContractionCount) that were
//      populated during the same session.
//   3. The `lastKickCount` published property must be nil after sign-out even
//      when the manager never sent a kickSessionEnd.
//   4. After the clear the manager can restart cleanly — receiving a new tips
//      payload populates the published property as if it were a fresh install.
//   5. A signOut that arrives when no kick session was ever started must still
//      complete cleanly (no crash, notification still fires, state still resets).
//
//   KickCounterView reset-state model
//   ──────────────────────────────────────────────────────────────────
//   The view's @State is not directly observable in a unit-test host; instead,
//   these tests verify the pure-logic contract that `resetSession()` satisfies:
//
//   6. `.watchDidSignOut` is posted on the notification center so any live
//      KickCounterView instance subscribing to it receives the event.
//   7. The `resetSession()` model function zeroes every in-memory field:
//      kickCount, sessionActive, sessionStart, elapsed.
//
// Run via: Product → Test in Xcode (PregnancyWatchAppTests bundle), or
//   xcodebuild test -scheme PregnancyWatchApp \
//     -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)'

import XCTest
import Foundation
import WatchConnectivity

// MARK: - WatchKickCounterSignOutTests

final class WatchKickCounterSignOutTests: XCTestCase {

    private var suiteName: String!
    private var defaults: UserDefaults!
    private var center: NotificationCenter!

    override func setUp() {
        super.setUp()
        suiteName = "WatchKickCounterSignOutTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        center = NotificationCenter()
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        center = nil
        suiteName = nil
        super.tearDown()
    }

    /// Builds a WatchSessionManager wired to the isolated suite.
    private func makeManager() -> WatchSessionManager {
        WatchSessionManager(
            userDefaults: defaults,
            notificationCenter: center,
            activateSession: false
        )
    }

    /// Seeds UserDefaults to simulate a user who is mid-kick-session at sign-out time:
    ///   • kickSessionActive = true
    ///   • kickCount = 7
    ///   • kickSessionStart = timestamp 4 minutes ago
    ///   • lastKickCount = 12 (from a prior completed session)
    ///   • session-manager keys (tips, week, lastContractionCount)
    private func seedActiveKickSession() {
        let now = Date()

        // KickCounterView keys
        defaults.set(7, forKey: WatchSessionPersistence.kickCountKey)
        defaults.set(true, forKey: WatchSessionPersistence.kickSessionActiveKey)
        defaults.set(now.addingTimeInterval(-240).timeIntervalSince1970,
                     forKey: WatchSessionPersistence.kickSessionStartKey)

        // WatchSessionManager session keys
        defaults.set(12, forKey: WatchSessionPersistence.lastKickCountKey)
        defaults.set(3, forKey: WatchSessionPersistence.lastContractionCountKey)

        let tip = WatchTip(week: 28, emoji: "🥭", text: "Baby is the size of a mango")
        let tipsData = try! JSONEncoder().encode([tip])
        defaults.set(tipsData, forKey: WatchSessionPersistence.tipsKey)
        defaults.set(28, forKey: WatchSessionPersistence.gestationalWeekKey)
    }

    /// Drains pending main-queue blocks dispatched by `handleIncoming` via
    /// `DispatchQueue.main.async`.
    private func drainMain() {
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
    }

    // MARK: - 1. All kick-counter UserDefaults keys cleared on signOut mid-session

    func testSignOut_midActiveKickSession_clearsAllKickCounterKeys() {
        seedActiveKickSession()
        let manager = makeManager()

        // Precondition: all kick-counter keys are present.
        let kickKeys: [String] = [
            WatchSessionPersistence.kickCountKey,
            WatchSessionPersistence.kickSessionActiveKey,
            WatchSessionPersistence.kickSessionStartKey,
        ]
        for key in kickKeys {
            XCTAssertNotNil(defaults.object(forKey: key),
                            "Precondition: \(key) must be seeded before sign-out")
        }

        // Deliver the signOut via the transferUserInfo delegate path —
        // the same channel the phone uses for guaranteed delivery.
        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        for key in kickKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be removed after sign-out mid-kick-session")
        }
    }

    // MARK: - 2. All session keys cleared on signOut mid-session

    func testSignOut_midActiveKickSession_clearsAllSessionKeys() {
        seedActiveKickSession()
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be removed — the next user must see a clean slate")
        }
    }

    // MARK: - 3. Published state reset even without a prior kickSessionEnd

    func testSignOut_midActiveKickSession_resetsPublishedState() {
        seedActiveKickSession()
        let manager = makeManager()

        // Sanity: the manager restored the seeded state.
        XCTAssertFalse(manager.tips.isEmpty, "Precondition: tips must be restored from seeded defaults")
        XCTAssertEqual(manager.gestationalWeek, 28)
        XCTAssertEqual(manager.lastKickCount, 12,
                       "Precondition: lastKickCount must be restored from seeded defaults")
        XCTAssertEqual(manager.lastContractionCount, 3)

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        XCTAssertTrue(manager.tips.isEmpty,
                      "tips must be empty after sign-out")
        XCTAssertEqual(manager.gestationalWeek, 0,
                       "gestationalWeek must reset to 0")
        XCTAssertNil(manager.lastKickCount,
                     "lastKickCount must be nil — no completed kick session for the new user")
        XCTAssertNil(manager.lastContractionCount,
                     "lastContractionCount must also be nil after sign-out")
    }

    // MARK: - 4. Manager recovers cleanly after sign-out

    func testSignOut_midActiveKickSession_managerAcceptsNewTipsAfterward() throws {
        seedActiveKickSession()
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        // Simulate the new user's phone pushing a fresh tips payload.
        let newTip = WatchTip(week: 10, emoji: "🫐", text: "Blueberry size")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let newTipsData = try encoder.encode([newTip])

        manager.session(WCSession.default,
                        didReceiveMessage: [
                            WatchMessage.tips: newTipsData,
                            WatchMessage.gestationalWeek: 10,
                        ])
        drainMain()

        XCTAssertEqual(manager.tips.count, 1,
                       "Manager must accept new tips from the next signed-in user")
        XCTAssertEqual(manager.tips[0].emoji, "🫐")
        XCTAssertEqual(manager.gestationalWeek, 10)
    }

    // MARK: - 5. signOut on a fresh install (no prior kick data) completes cleanly

    func testSignOut_noKickSessionData_completesCleanly() {
        // No kick keys seeded — the manager must not crash and must reset
        // published state (tips etc.) just the same.
        let tip = WatchTip(week: 20, emoji: "🍌", text: "Banana size")
        let tipsData = try! JSONEncoder().encode([tip])
        defaults.set(tipsData, forKey: WatchSessionPersistence.tipsKey)
        defaults.set(20, forKey: WatchSessionPersistence.gestationalWeekKey)

        let manager = makeManager()
        XCTAssertFalse(manager.tips.isEmpty, "Precondition: tips present")

        let notified = expectation(
            forNotification: .watchDidSignOut,
            object: nil,
            notificationCenter: center
        )

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be cleared even when no kick session was active")
        }
        XCTAssertTrue(manager.tips.isEmpty)
        XCTAssertNil(manager.lastKickCount)

        wait(for: [notified], timeout: 1.0)
    }

    // MARK: - 6. .watchDidSignOut posted on NotificationCenter so KickCounterView can reset

    func testSignOut_midActiveKickSession_postsWatchDidSignOutNotification() {
        seedActiveKickSession()
        let manager = makeManager()

        let notified = expectation(
            forNotification: .watchDidSignOut,
            object: nil,
            notificationCenter: center
        )

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])

        wait(for: [notified], timeout: 1.0)
    }

    // MARK: - 7. KickCounterSessionState.reset() zeroes all session fields

    /// Calls the real `KickCounterSessionState.reset()` that `KickCounterView.resetSession()`
    /// delegates to, verifying every field returns to its idle default.
    ///
    /// `KickCounterView.resetSession()` creates a populated state, calls `state.reset()`,
    /// then writes the reset values back to `@State`.  This test exercises that same
    /// path through the extracted struct so a future regression in `reset()` — e.g.
    /// forgetting to nil-out `sessionStart` — is caught here rather than at runtime.
    func testKickCounterSessionState_reset_zerosAllSessionFields() {
        // Populate a state that mirrors a mid-session KickCounterView.
        var state = KickCounterSessionState(
            kickCount: 7,
            sessionActive: true,
            sessionStart: Date().addingTimeInterval(-240),
            elapsed: 238
        )

        // Precondition: all fields reflect an active session.
        XCTAssertEqual(state.kickCount, 7)
        XCTAssertTrue(state.sessionActive)
        XCTAssertNotNil(state.sessionStart)
        XCTAssertGreaterThan(state.elapsed, 0)

        // Exercise the production reset path that KickCounterView.resetSession() calls.
        state.reset()

        // Assert every field is the expected idle default.
        XCTAssertEqual(state.kickCount, 0,
                       "kickCount must reset to 0 — the new user starts from zero")
        XCTAssertFalse(state.sessionActive,
                       "sessionActive must be false — the kick session must stop immediately on sign-out")
        XCTAssertNil(state.sessionStart,
                     "sessionStart must be nil — no active session for the new user")
        XCTAssertEqual(state.elapsed, 0,
                       "elapsed must reset to 0")
    }

    // MARK: - signOut via sendMessage delegate path (belt-and-suspenders)

    /// Confirms that signOut clears kick state regardless of the WCSession
    /// delivery channel — the phone may use either `sendMessage` (reachable) or
    /// `transferUserInfo` (background) depending on connectivity at the time.
    func testSignOut_viaDirectMessage_clearsKickCounterKeys() {
        seedActiveKickSession()
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.signOut: true])
        drainMain()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be cleared when signOut arrives via sendMessage")
        }
    }

    // MARK: - lastKickCount key cleared even when set by lastKickCount didSet

    /// Regression: `lastKickCount` writes its own UserDefaults key via `didSet`.
    /// After a sign-out this live-session write must also be gone.
    func testSignOut_afterLiveLastKickCountWrite_removesDidSetWrite() {
        let manager = makeManager()

        // Simulate a completed kick session having been persisted via the didSet observer.
        manager.lastKickCount = 15
        XCTAssertEqual(defaults.integer(forKey: WatchSessionPersistence.lastKickCountKey), 15,
                       "Precondition: didSet must have written the key")

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        XCTAssertNil(defaults.object(forKey: WatchSessionPersistence.lastKickCountKey),
                     "lastKickCount key must be removed by sign-out even when set via didSet during the session")
        XCTAssertNil(manager.lastKickCount,
                     "lastKickCount published property must be nil after sign-out")
    }
}
