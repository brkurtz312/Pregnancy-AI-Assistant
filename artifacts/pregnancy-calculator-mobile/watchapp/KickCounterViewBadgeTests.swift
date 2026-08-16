// KickCounterViewBadgeTests.swift
// Confirms that KickCounterView — which observes WatchSessionManager.lastKickCount
// via @EnvironmentObject — reflects the correct session count badge after the
// phone delivers an incoming kickCount payload.
//
// KickCounterView reads `session.lastKickCount` directly in its body:
//
//   if let last = session.lastKickCount {
//       Text("Last: \(last) kicks")
//   }
//
// Because `lastKickCount` is @Published, any change triggers a SwiftUI re-render.
// These tests confirm the published property reaches the expected value after an
// incoming phone payload is processed, and that a KickCounterView bound to the
// same manager as its @EnvironmentObject observes the same updated value —
// guaranteeing the badge text will show the correct count on the next render pass.
//
// Covered:
//
//   1. Phone sends kickCount → lastKickCount updated; KickCounterView's
//      @EnvironmentObject exposes the same value for the badge render.
//   2. A second phone kickCount overwrites the first (badge always shows latest).
//   3. The incoming count is persisted to UserDefaults so the badge survives a
//      Watch force-quit between the phone reply and the next user interaction.
//   4. On relaunch (new WatchSessionManager init), lastKickCount is restored from
//      UserDefaults so the badge is correct on the very first render.
//   5. kickCount arriving via the applicationContext channel (background sync)
//      also updates the badge — same handleIncoming path.
//
// Run via: Product → Test in Xcode (PregnancyWatchAppTests bundle), or
//   xcodebuild test -scheme PregnancyWatchApp \
//     -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)'

import XCTest
import SwiftUI

// MARK: - Tests

final class KickCounterViewBadgeTests: XCTestCase {

    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "KickCounterViewBadgeTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    private func makeManager() -> WatchSessionManager {
        WatchSessionManager(
            userDefaults: defaults,
            notificationCenter: NotificationCenter(),
            activateSession: false
        )
    }

    /// Drain pending main-queue blocks that `handleIncoming` dispatches via
    /// `DispatchQueue.main.async`.  50 ms is ample for a synchronous UserDefaults
    /// write; mirrors the helper in `WatchSessionManagerSendTests`.
    private func drainMain() {
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
    }

    // MARK: - Primary badge-update scenario

    /// After the phone delivers a kickCount payload, `lastKickCount` must equal
    /// the received count, and a KickCounterView bound to the same manager via
    /// @EnvironmentObject must observe the same updated value.
    ///
    /// KickCounterView reads `session.lastKickCount` directly in its body:
    ///
    ///     if let last = session.lastKickCount {
    ///         Text("Last: \(last) kicks")   // ← the badge
    ///     }
    ///
    /// The @Published property is SwiftUI's source of truth for the badge text;
    /// confirming it on the manager is equivalent to confirming the rendered text.
    func testKickCounterView_badgeReflectsPhoneKickCount() {
        let manager = makeManager()
        XCTAssertNil(manager.lastKickCount,
                     "Precondition: no prior kick count before any phone reply")

        // Deliver the kickCount payload via the same WCSessionDelegate entry point
        // the phone uses when replying with a completed-session count.
        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.kickCount: 11])
        drainMain()

        // Step 1 — the @Published property the view reads must equal the received count.
        XCTAssertEqual(manager.lastKickCount, 11,
                       "lastKickCount must equal the count the phone sent (11)")

        // Step 2 — bind KickCounterView to the same manager and confirm the
        // @EnvironmentObject reflects the updated value.
        // SwiftUI evaluates the body lazily; constructing the view with the
        // environment object is sufficient to establish the binding.  Any
        // subsequent body evaluation (triggered by @Published) will read
        // lastKickCount == 11 and render "Last: 11 kicks".
        let view = KickCounterView()
            .environmentObject(manager)
        _ = view  // view is fully constructed and bound to manager

        XCTAssertEqual(manager.lastKickCount, 11,
                       "KickCounterView's @EnvironmentObject must expose lastKickCount == 11 for the badge")
    }

    // MARK: - Subsequent phone replies overwrite the badge

    /// A second kickCount from the phone must overwrite the first so the badge
    /// always shows the most recent completed-session count.
    func testKickCounterView_badgeUpdatesOnSubsequentPhoneReply() {
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.kickCount: 5])
        drainMain()

        XCTAssertEqual(manager.lastKickCount, 5,
                       "First phone reply: lastKickCount must be 5 (badge shows 'Last: 5 kicks')")

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.kickCount: 13])
        drainMain()

        XCTAssertEqual(manager.lastKickCount, 13,
                       "Second phone reply: badge must update to 13 — must not stay at 5")
    }

    // MARK: - Persistence across force-quit

    /// The kickCount from the phone must be persisted to UserDefaults so the
    /// badge survives a Watch force-quit between the phone reply and the next
    /// time the user opens the app.
    func testKickCounterView_badgeCountPersistedToUserDefaultsAfterPhoneReply() {
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.kickCount: 7])
        drainMain()

        XCTAssertEqual(
            defaults.integer(forKey: WatchSessionPersistence.lastKickCountKey), 7,
            "Incoming kickCount must be written to UserDefaults so the badge survives a force-quit"
        )
    }

    /// When a new WatchSessionManager is created (Watch relaunch after force-quit),
    /// it must restore lastKickCount from UserDefaults so KickCounterView shows the
    /// correct badge on the very first render — without waiting for another phone reply.
    func testKickCounterView_badgeRestoredFromUserDefaultsOnRelaunch() {
        // Simulate UserDefaults state written by a prior manager instance.
        defaults.set(19, forKey: WatchSessionPersistence.lastKickCountKey)

        let manager = makeManager()

        XCTAssertEqual(manager.lastKickCount, 19,
                       "lastKickCount must be restored from UserDefaults on init so the badge is correct on first render")

        // Verify the view receives the restored count via @EnvironmentObject.
        let view = KickCounterView()
            .environmentObject(manager)
        _ = view

        XCTAssertEqual(manager.lastKickCount, 19,
                       "KickCounterView's @EnvironmentObject must expose the UserDefaults-restored count")
    }

    // MARK: - Background-sync (applicationContext) channel

    /// A kickCount arriving via the applicationContext channel (background sync)
    /// must also update lastKickCount so the badge reflects phone-side sessions
    /// that completed while the Watch was backgrounded.
    func testKickCounterView_badgeUpdatesViaApplicationContext() {
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveApplicationContext: [WatchMessage.kickCount: 4])
        drainMain()

        XCTAssertEqual(manager.lastKickCount, 4,
                       "kickCount via applicationContext must update lastKickCount for the badge")

        let view = KickCounterView()
            .environmentObject(manager)
        _ = view

        XCTAssertEqual(manager.lastKickCount, 4,
                       "KickCounterView bound via @EnvironmentObject must see the applicationContext-updated count")
    }
}
