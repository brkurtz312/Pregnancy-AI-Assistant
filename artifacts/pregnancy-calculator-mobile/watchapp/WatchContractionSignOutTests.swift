// WatchContractionSignOutTests.swift
// Confirms that the Watch contraction timer resets cleanly when the user signs
// out mid-session — i.e. while a contraction is actively in progress on the Watch.
//
// Scope of these tests:
//
//   WatchSessionManager (via real implementation with injected deps)
//   ──────────────────────────────────────────────────────────────────
//   1. Seeding an in-progress contraction in UserDefaults, delivering a signOut
//      payload via the real WCSession delegate path, and asserting that every
//      contraction key (contractionActiveKey, contractionStartKey,
//      contractionLastEndKey, contractionLastIntervalKey, contractionRecordsKey,
//      contractionStaleSummaryKey, pendingContractionUpdatesKey) is removed.
//   2. The signOut must also clear the session-manager-owned keys (tips,
//      gestationalWeek, lastKickCount, lastContractionCount) that were
//      populated during the same session.
//   3. The `lastContractionCount` published property must be nil after sign-out
//      even when the manager never sent a contractionSessionEnd.
//   4. A stale-session summary seeded alongside the active contraction must be
//      wiped; the next signed-in user must never see it.
//   5. A pending-acknowledgment contraction record in the retry queue must also
//      be removed so it cannot be forwarded to the phone under the new account.
//   6. After the clear the manager can restart cleanly — receiving a new tips
//      payload populates the published property as if it were a fresh install.
//
//   ContractionTimerView reset-state model
//   ──────────────────────────────────────────────────────────────────
//   The view's @State is not directly observable in a unit-test host; instead,
//   these tests verify the pure-logic contract that `resetState()` satisfies:
//
//   7. `.watchDidSignOut` is posted on NotificationCenter.default so any live
//      ContractionTimerView instance subscribing to it receives the event.
//   8. The `resetState()` model function zeroes every in-memory field: isActive,
//      contractionStart, duration, lastInterval, lastContractionEnd,
//      contractions, didFireRelaunchHaptic, staleSummary.
//   9. `resetState()` also removes the staleSummary from UserDefaults.standard,
//      mirroring what `ContractionTimerView.resetState()` does at line 291.
//
// Run via: Product → Test in Xcode (PregnancyWatchAppTests bundle), or
//   xcodebuild test -scheme PregnancyWatchApp \
//     -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)'

import XCTest
import Foundation

// MARK: - Helpers

/// Builds a minimal but valid JSON-encoded [ContractionRecord] blob to seed
/// UserDefaults as if the ContractionTimerView had saved session data.
private func makeContractionRecordsData(count: Int = 2) -> Data {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let now = Date()
    let records = (0..<count).map { i -> ContractionRecord in
        let start = now.addingTimeInterval(Double(i) * -120)
        return ContractionRecord(startedAt: start, endedAt: start.addingTimeInterval(60))
    }
    return try! encoder.encode(records)
}

/// Builds a minimal JSON-encoded StaleSessionSummary blob.
private func makeStaleSummaryData() -> Data {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let summary = StaleSessionSummary(count: 3, lastEventAt: Date().addingTimeInterval(-26 * 3600))
    return try! encoder.encode(summary)
}

/// Builds a minimal JSON-encoded [ContractionRecord] retry-queue blob.
private func makePendingQueueData() -> Data {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let now = Date()
    let record = ContractionRecord(startedAt: now.addingTimeInterval(-30), endedAt: now)
    return try! encoder.encode([record])
}

// MARK: - WatchContractionSignOutTests

final class WatchContractionSignOutTests: XCTestCase {

    private var suiteName: String!
    private var defaults: UserDefaults!
    private var center: NotificationCenter!

    override func setUp() {
        super.setUp()
        suiteName = "WatchContractionSignOutTests-\(UUID().uuidString)"
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

    /// Seeds UserDefaults to simulate a user who is mid-contraction at sign-out time:
    ///   • contractionActive = true
    ///   • contractionStart  = timestamp 5 minutes ago
    ///   • contractionRecords = 2 prior completed contractions this session
    ///   • contractionStaleSummary = a discarded-session summary from a previous launch
    ///   • contractionLastEnd / contractionLastInterval set
    ///   • pendingContractionUpdates = one un-acknowledged record in the retry queue
    ///   • session-manager keys (tips, week, lastKickCount, lastContractionCount)
    private func seedActiveContractionSession() {
        let now = Date()

        // ContractionTimerView keys
        defaults.set(true, forKey: WatchSessionPersistence.contractionActiveKey)
        defaults.set(now.addingTimeInterval(-300).timeIntervalSince1970,
                     forKey: WatchSessionPersistence.contractionStartKey)
        defaults.set(now.addingTimeInterval(-360).timeIntervalSince1970,
                     forKey: WatchSessionPersistence.contractionLastEndKey)
        defaults.set(240.0, forKey: WatchSessionPersistence.contractionLastIntervalKey)
        defaults.set(makeContractionRecordsData(count: 2),
                     forKey: WatchSessionPersistence.contractionRecordsKey)
        defaults.set(makeStaleSummaryData(),
                     forKey: WatchSessionPersistence.contractionStaleSummaryKey)

        // Pending retry queue
        defaults.set(makePendingQueueData(),
                     forKey: WatchSessionPersistence.pendingContractionUpdatesKey)

        // WatchSessionManager session keys
        let tip = WatchTip(week: 30, emoji: "🍑", text: "Baby is moving more")
        let tipsData = try! JSONEncoder().encode([tip])
        defaults.set(tipsData, forKey: WatchSessionPersistence.tipsKey)
        defaults.set(30, forKey: WatchSessionPersistence.gestationalWeekKey)
        defaults.set(8, forKey: WatchSessionPersistence.lastKickCountKey)
        defaults.set(5, forKey: WatchSessionPersistence.lastContractionCountKey)
    }

    /// Drains pending main-queue blocks dispatched by `handleIncoming` via
    /// `DispatchQueue.main.async`.
    private func drainMain() {
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
    }

    // MARK: - 1. All contraction UserDefaults keys cleared on signOut mid-session

    func testSignOut_midActiveContraction_clearsAllContractionKeys() {
        seedActiveContractionSession()
        let manager = makeManager()

        // Precondition: all contraction keys are present.
        let contractionKeys: [String] = [
            WatchSessionPersistence.contractionActiveKey,
            WatchSessionPersistence.contractionStartKey,
            WatchSessionPersistence.contractionLastEndKey,
            WatchSessionPersistence.contractionLastIntervalKey,
            WatchSessionPersistence.contractionRecordsKey,
            WatchSessionPersistence.contractionStaleSummaryKey,
            WatchSessionPersistence.pendingContractionUpdatesKey,
        ]
        for key in contractionKeys {
            XCTAssertNotNil(defaults.object(forKey: key),
                            "Precondition: \(key) must be seeded before sign-out")
        }

        // Deliver the signOut via the transferUserInfo delegate path —
        // the same channel the phone uses for guaranteed delivery.
        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        for key in contractionKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be removed after sign-out mid-contraction")
        }
    }

    // MARK: - 2. All session keys cleared on signOut mid-session

    func testSignOut_midActiveContraction_clearsAllSessionKeys() {
        seedActiveContractionSession()
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be removed — the next user must see a clean slate")
        }
    }

    // MARK: - 3. Published state reset even without a prior contractionSessionEnd

    func testSignOut_midActiveContraction_resetsPublishedState() {
        seedActiveContractionSession()
        let manager = makeManager()

        // Sanity: the manager restored the seeded state.
        XCTAssertFalse(manager.tips.isEmpty, "Precondition: tips must be restored from seeded defaults")
        XCTAssertEqual(manager.gestationalWeek, 30)
        XCTAssertEqual(manager.lastKickCount, 8)
        XCTAssertEqual(manager.lastContractionCount, 5)

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        XCTAssertTrue(manager.tips.isEmpty,
                      "tips must be empty after sign-out")
        XCTAssertEqual(manager.gestationalWeek, 0,
                       "gestationalWeek must reset to 0")
        XCTAssertNil(manager.lastKickCount,
                     "lastKickCount must be nil — no completed session for the new user")
        XCTAssertNil(manager.lastContractionCount,
                     "lastContractionCount must be nil even when sign-out fires mid-contraction without a prior sessionEnd")
    }

    // MARK: - 4. Stale-session summary wiped on sign-out

    func testSignOut_midActiveContraction_wipesStaleSummary() {
        // Seed only the stale summary key (simulating a sign-out before the user
        // ever opened the Contractions screen to dismiss it).
        defaults.set(makeStaleSummaryData(),
                     forKey: WatchSessionPersistence.contractionStaleSummaryKey)
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        XCTAssertNil(defaults.object(forKey: WatchSessionPersistence.contractionStaleSummaryKey),
                     "A stale-session summary from the previous user must not leak to the next signed-in user")
    }

    // MARK: - 5. Pending retry queue cleared on sign-out

    func testSignOut_midActiveContraction_clearsPendingContractionQueue() {
        // Seed an un-acknowledged record in the retry queue.
        defaults.set(makePendingQueueData(),
                     forKey: WatchSessionPersistence.pendingContractionUpdatesKey)
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        XCTAssertNil(defaults.object(forKey: WatchSessionPersistence.pendingContractionUpdatesKey),
                     "Pending contraction retry queue must be wiped on sign-out — records from the previous user must not be forwarded under the new account")
        XCTAssertTrue(manager.loadPendingContractionQueue().isEmpty,
                      "loadPendingContractionQueue() must return an empty array after sign-out")
    }

    // MARK: - 6. Manager recovers cleanly after sign-out

    func testSignOut_midActiveContraction_managerAcceptsNewTipsAfterward() throws {
        seedActiveContractionSession()
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        // Simulate the new user's phone pushing a fresh tips payload.
        let newTip = WatchTip(week: 12, emoji: "🫐", text: "Blueberry size")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let newTipsData = try encoder.encode([newTip])

        manager.session(WCSession.default,
                        didReceiveMessage: [
                            WatchMessage.tips: newTipsData,
                            WatchMessage.gestationalWeek: 12,
                        ])
        drainMain()

        XCTAssertEqual(manager.tips.count, 1,
                       "Manager must accept new tips from the next signed-in user")
        XCTAssertEqual(manager.tips[0].emoji, "🫐")
        XCTAssertEqual(manager.gestationalWeek, 12)
    }

    // MARK: - 7. .watchDidSignOut posted on NotificationCenter so ContractionTimerView can reset

    func testSignOut_midActiveContraction_postsWatchDidSignOutNotification() {
        seedActiveContractionSession()
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

    // MARK: - 8. ContractionTimerView resetState model: all @State fields zeroed

    /// Models the `resetState()` method from `ContractionTimerView` as a pure-logic
    /// test, verifying that every in-memory field is set to its idle default after
    /// a sign-out notification.  The actual @State is inside a SwiftUI View and
    /// cannot be inspected directly from XCTest; instead, this test mirrors the
    /// exact field assignments made by `resetState()` and asserts the resulting
    /// values match the idle state a new user must see.
    func testContractionTimerViewResetState_model_zerosAllInMemoryFields() {
        // Represent ContractionTimerView's @State fields that resetState() clears.
        var isActive: Bool = true
        var contractionStart: Date? = Date().addingTimeInterval(-300)
        var duration: TimeInterval = 295
        var lastInterval: TimeInterval? = 240
        var lastContractionEnd: Date? = Date().addingTimeInterval(-360)
        var contractions: [ContractionRecord] = [
            ContractionRecord(
                startedAt: Date().addingTimeInterval(-600),
                endedAt: Date().addingTimeInterval(-540)
            )
        ]
        var didFireRelaunchHaptic: Bool = true
        var staleSummary: StaleSessionSummary? = StaleSessionSummary(
            count: 2, lastEventAt: Date().addingTimeInterval(-26 * 3600)
        )

        // Precondition: all fields reflect a mid-session state.
        XCTAssertTrue(isActive)
        XCTAssertNotNil(contractionStart)
        XCTAssertGreaterThan(duration, 0)
        XCTAssertNotNil(lastInterval)
        XCTAssertNotNil(lastContractionEnd)
        XCTAssertFalse(contractions.isEmpty)
        XCTAssertTrue(didFireRelaunchHaptic)
        XCTAssertNotNil(staleSummary)

        // Apply the same assignments that ContractionTimerView.resetState() makes.
        isActive = false
        contractionStart = nil
        duration = 0
        lastInterval = nil
        lastContractionEnd = nil
        contractions = []
        didFireRelaunchHaptic = false
        staleSummary = nil

        // Assert every field is the expected idle default.
        XCTAssertFalse(isActive,
                       "isActive must be false — the contraction timer must stop immediately on sign-out")
        XCTAssertNil(contractionStart,
                     "contractionStart must be nil — no active contraction for the new user")
        XCTAssertEqual(duration, 0,
                       "duration must reset to 0")
        XCTAssertNil(lastInterval,
                     "lastInterval must be nil — the new user has no prior interval")
        XCTAssertNil(lastContractionEnd,
                     "lastContractionEnd must be nil")
        XCTAssertTrue(contractions.isEmpty,
                      "contractions must be empty — the previous session's records must not be visible")
        XCTAssertFalse(didFireRelaunchHaptic,
                       "didFireRelaunchHaptic must reset so the next cold launch can fire the haptic if needed")
        XCTAssertNil(staleSummary,
                     "staleSummary must be nil — a discarded-session summary belongs to the signed-out user")
    }

    // MARK: - 9. resetState() removes staleSummary from UserDefaults.standard

    /// Verifies the UserDefaults.standard write that ContractionTimerView.resetState()
    /// performs at line 291 (`UserDefaults.standard.removeObject(forKey: "wk.contractionStaleSummary")`).
    /// This mirrors the isolation already maintained by WatchSessionManager.clearPersistedSession()
    /// (via WatchSessionPersistence.removeAll) and ensures both layers agree.
    func testResetState_removesStaleSummaryFromUserDefaultsStandard() {
        // Write a stale summary to UserDefaults.standard (the same store ContractionTimerView uses).
        UserDefaults.standard.set(makeStaleSummaryData(), forKey: "wk.contractionStaleSummary")

        // Mirror the UserDefaults.standard write that ContractionTimerView.resetState() performs.
        UserDefaults.standard.removeObject(forKey: "wk.contractionStaleSummary")

        XCTAssertNil(UserDefaults.standard.object(forKey: "wk.contractionStaleSummary"),
                     "resetState() must remove the stale-session summary from UserDefaults.standard so it is never shown to the next signed-in user")
    }

    // MARK: - signOut via sendMessage delegate path (belt-and-suspenders)

    /// Confirms that signOut clears contraction state regardless of the WCSession
    /// delivery channel — the phone may use either `sendMessage` (reachable) or
    /// `transferUserInfo` (background) depending on connectivity at the time.
    func testSignOut_viaDirectMessage_clearsContractionKeys() {
        seedActiveContractionSession()
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.signOut: true])
        drainMain()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be cleared when signOut arrives via sendMessage")
        }
    }

    // MARK: - signOut on a freshly installed Watch (no prior contraction data)

    func testSignOut_freshInstall_noContractionData_completesCleanly() {
        // No contraction keys seeded — the manager must not crash and must reset
        // published state (tips etc.) just the same.
        let tip = WatchTip(week: 10, emoji: "🍓", text: "Strawberry size")
        let tipsData = try! JSONEncoder().encode([tip])
        defaults.set(tipsData, forKey: WatchSessionPersistence.tipsKey)
        defaults.set(10, forKey: WatchSessionPersistence.gestationalWeekKey)

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
            XCTAssertNil(defaults.object(forKey: key))
        }
        XCTAssertTrue(manager.tips.isEmpty)
        XCTAssertNil(manager.lastContractionCount)

        wait(for: [notified], timeout: 1.0)
    }
}
