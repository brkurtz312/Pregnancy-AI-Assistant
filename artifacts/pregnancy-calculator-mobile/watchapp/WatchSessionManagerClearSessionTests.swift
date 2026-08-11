// WatchSessionManagerClearSessionTests.swift
// Unit tests for the PRODUCTION WatchSessionManager.clearPersistedSession().
//
// These tests instantiate the real WatchSessionManager with injected
// dependencies (isolated UserDefaults suite, private NotificationCenter,
// activateSession: false so no WCSession activation is attempted) and call the
// actual production method. The key list asserted against is the production
// registry `WatchSessionPersistence.allKeys` — no copied literals.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp \
//     -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)'

import XCTest
import Foundation

final class WatchSessionManagerClearSessionTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!
    private var center: NotificationCenter!

    override func setUp() {
        super.setUp()
        suiteName = "com.test.WatchSessionManagerClearSession.\(name)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        center = NotificationCenter()
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        center = nil
        super.tearDown()
    }

    /// Builds a manager wired to the isolated defaults/notification center.
    private func makeManager() -> WatchSessionManager {
        WatchSessionManager(
            userDefaults: defaults,
            notificationCenter: center,
            activateSession: false
        )
    }

    /// Seeds a realistic "previous user" value under every production key.
    private func seedAllKeys() {
        let tip = WatchTip(week: 24, emoji: "🍼", text: "Stay hydrated")
        let tipsData = try! JSONEncoder().encode([tip])

        defaults.set(tipsData, forKey: WatchSessionPersistence.tipsKey)
        defaults.set(24, forKey: WatchSessionPersistence.gestationalWeekKey)
        defaults.set(12, forKey: WatchSessionPersistence.lastKickCountKey)
        defaults.set(7, forKey: WatchSessionPersistence.lastContractionCountKey)

        defaults.set(5, forKey: WatchSessionPersistence.kickCountKey)
        defaults.set(true, forKey: WatchSessionPersistence.kickSessionActiveKey)
        defaults.set(Date().timeIntervalSince1970, forKey: WatchSessionPersistence.kickSessionStartKey)

        defaults.set(true, forKey: WatchSessionPersistence.contractionActiveKey)
        defaults.set(Date().timeIntervalSince1970, forKey: WatchSessionPersistence.contractionStartKey)
        defaults.set(Date().timeIntervalSince1970, forKey: WatchSessionPersistence.contractionLastEndKey)
        defaults.set(240.0, forKey: WatchSessionPersistence.contractionLastIntervalKey)
        defaults.set(Data([0x01, 0x02]), forKey: WatchSessionPersistence.contractionRecordsKey)

        defaults.set(Data([0x03, 0x04]), forKey: WatchSessionPersistence.pendingContractionUpdatesKey)
    }

    // MARK: - Key registry sanity

    func testKeyRegistry_coversAllThreeSubsystemsPlusRetryQueue() {
        // 10 wk.* subsystem keys + wk.pendingContractionUpdates + watchTips +
        // watchGestationalWeek = 13 keys total. Guard against accidental removal.
        XCTAssertEqual(WatchSessionPersistence.allKeys.count, 13)
        XCTAssertEqual(Set(WatchSessionPersistence.allKeys).count, 13, "No duplicate keys")
        XCTAssertEqual(WatchSessionPersistence.allKeys.filter { $0.hasPrefix("wk.") }.count, 11)
        XCTAssertTrue(WatchSessionPersistence.allKeys.contains("watchTips"))
        XCTAssertTrue(WatchSessionPersistence.allKeys.contains("watchGestationalWeek"))
    }

    func testNotificationName_matchesWhatViewsSubscribeTo() {
        XCTAssertEqual(Notification.Name.watchDidSignOut.rawValue,
                       "WatchSessionManagerDidSignOut")
    }

    // MARK: - All keys removed

    func testClearPersistedSession_removesEveryPersistedKey() {
        seedAllKeys()
        let manager = makeManager()

        // Sanity: every key is actually present before the clear.
        for key in WatchSessionPersistence.allKeys {
            XCTAssertNotNil(defaults.object(forKey: key),
                            "Precondition failed: \(key) was not seeded")
        }

        manager.clearPersistedSession()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "\(key) must be removed after clearPersistedSession()")
        }
    }

    // MARK: - Published properties reset

    func testClearPersistedSession_resetsPublishedProperties() {
        seedAllKeys()
        let manager = makeManager()

        // Sanity: init restored the previous user's state from the seeded defaults.
        XCTAssertEqual(manager.tips.count, 1, "Seeded tips must be restored by init")
        XCTAssertEqual(manager.gestationalWeek, 24)
        XCTAssertEqual(manager.lastKickCount, 12)
        XCTAssertEqual(manager.lastContractionCount, 7)

        manager.clearPersistedSession()

        XCTAssertTrue(manager.tips.isEmpty, "tips must reset to [] (empty)")
        XCTAssertEqual(manager.gestationalWeek, 0, "gestationalWeek must reset to 0")
        XCTAssertNil(manager.lastKickCount, "lastKickCount must reset to nil")
        XCTAssertNil(manager.lastContractionCount, "lastContractionCount must reset to nil")
    }

    // MARK: - Notification posted

    func testClearPersistedSession_postsWatchDidSignOut() {
        seedAllKeys()
        let manager = makeManager()

        let notified = expectation(
            forNotification: .watchDidSignOut,
            object: nil,
            notificationCenter: center
        )

        manager.clearPersistedSession()

        wait(for: [notified], timeout: 1.0)
    }

    // MARK: - Idempotency / edge cases

    func testClearPersistedSession_isIdempotent() {
        seedAllKeys()
        let manager = makeManager()

        manager.clearPersistedSession()
        // A second clear on an already-empty store must not crash or resurrect keys.
        manager.clearPersistedSession()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key))
        }
        XCTAssertTrue(manager.tips.isEmpty)
        XCTAssertEqual(manager.gestationalWeek, 0)
        XCTAssertNil(manager.lastKickCount)
        XCTAssertNil(manager.lastContractionCount)
    }

    func testClearPersistedSession_onFreshInstall_completesCleanly() {
        // No keys seeded — clearing must still reset state and post the notification.
        let manager = makeManager()

        let notified = expectation(
            forNotification: .watchDidSignOut,
            object: nil,
            notificationCenter: center
        )

        manager.clearPersistedSession()

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key))
        }
        XCTAssertTrue(manager.tips.isEmpty)
        XCTAssertEqual(manager.gestationalWeek, 0)
        XCTAssertNil(manager.lastKickCount)
        wait(for: [notified], timeout: 1.0)
    }

    // MARK: - Persistence via didSet is fully undone

    func testClearPersistedSession_afterLiveSession_removesDidSetWrites() {
        // Simulate a live session: the didSet observers write their own keys.
        let manager = makeManager()
        manager.lastKickCount = 9
        manager.lastContractionCount = 4
        XCTAssertEqual(defaults.integer(forKey: WatchSessionPersistence.lastKickCountKey), 9)
        XCTAssertEqual(defaults.integer(forKey: WatchSessionPersistence.lastContractionCountKey), 4)

        manager.clearPersistedSession()

        XCTAssertNil(defaults.object(forKey: WatchSessionPersistence.lastKickCountKey))
        XCTAssertNil(defaults.object(forKey: WatchSessionPersistence.lastContractionCountKey))
    }
}
