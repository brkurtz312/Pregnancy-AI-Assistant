// WatchFreshInstallSyncTests.swift
// Confirms the fresh-install sync path: a Watch that activates with no cached
// tips must request a sync from the phone, and the incoming reply/userInfo
// payload must populate tips + gestational week and clear the syncing flag.
//
// Covered concerns:
//
//   1. requestSyncIfNeeded decision logic (mirrored as shouldRequestSync)
//      a. Fresh install: tips empty, week 0            → MUST request sync
//      b. Tips cached, week unknown (0)                → no sync (can't judge staleness)
//      c. Tips cached and match current week           → no sync
//      d. Tips cached but built for a different week   → MUST request sync (stale)
//
//   2. Delivery-channel selection (mirrored as syncDeliveryChannel)
//      Reachable phone → sendMessage (inline replyHandler path).
//      Unreachable phone → transferUserInfo (guaranteed background delivery —
//      this is the "phone app never opened" TestFlight fresh-install case).
//
//   3. Inline-reply fallback: an empty reply (phone JS layer not yet loaded,
//      so PhoneWatchBridge's native cache had no tips) must queue a durable
//      transferUserInfo follow-up rather than ending the sync attempt.
//
//   4. WatchSessionManager.handleIncoming end-to-end on a real instance with
//      an isolated UserDefaults suite: a payload carrying tips + week (as the
//      phone's sendWeekAndTips produces) populates published state, persists
//      to UserDefaults, and clears isSyncing.
//
// Because WatchConnectivity is a hardware framework unavailable in a macOS
// test host, WCSession interactions are modeled as pure-logic mirrors of the
// production code (same convention as TipsViewEmptyStateTests).
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp -destination 'platform=macOS'

import XCTest
import Foundation
import WatchConnectivity

// MARK: - Codec helpers

private let encoder: JSONEncoder = {
    let e = JSONEncoder()
    e.dateEncodingStrategy = .iso8601
    return e
}()

// MARK: - Pure-logic mirrors of WatchSessionManager.requestSyncIfNeeded

/// Mirrors the guard in requestSyncIfNeeded():
///
///     let tipsStale = !tips.isEmpty
///         && gestationalWeek > 0
///         && tips.first?.week != gestationalWeek
///     guard tips.isEmpty || tipsStale else { return }
private func shouldRequestSync(tips: [WatchTip], gestationalWeek: Int) -> Bool {
    let tipsStale = !tips.isEmpty
        && gestationalWeek > 0
        && tips.first?.week != gestationalWeek
    return tips.isEmpty || tipsStale
}

private enum SyncChannel { case sendMessage, transferUserInfo }

/// Mirrors the reachability branch in requestSyncIfNeeded().
private func syncDeliveryChannel(isReachable: Bool) -> SyncChannel {
    isReachable ? .sendMessage : .transferUserInfo
}

/// Mirrors the inline replyHandler: an empty reply (no tips key) must trigger
/// a durable transferUserInfo follow-up so the phone's JS layer pushes a fresh
/// snapshot once it has loaded the profile.
private func emptyReplyNeedsDurableFollowUp(reply: [String: Any]) -> Bool {
    reply[WatchMessage.tips] == nil
}

// MARK: - Tests

final class WatchFreshInstallSyncTests: XCTestCase {

    private func makeTips(week: Int) -> [WatchTip] {
        [
            WatchTip(week: week, emoji: "👶", text: "Baby growth."),
            WatchTip(week: week, emoji: "🤰", text: "How you may feel."),
        ]
    }

    // MARK: 1. Decision logic

    func testFreshInstallWithNoTipsRequestsSync() {
        XCTAssertTrue(shouldRequestSync(tips: [], gestationalWeek: 0),
                      "A fresh install (empty tips, week 0) must send requestSync")
    }

    func testCachedTipsWithUnknownWeekDoesNotRequestSync() {
        XCTAssertFalse(shouldRequestSync(tips: makeTips(week: 20), gestationalWeek: 0),
                       "Week 0 means staleness cannot be judged — no spurious sync")
    }

    func testCachedTipsMatchingCurrentWeekDoesNotRequestSync() {
        XCTAssertFalse(shouldRequestSync(tips: makeTips(week: 20), gestationalWeek: 20))
    }

    func testStaleTipsForOlderWeekRequestsSync() {
        XCTAssertTrue(shouldRequestSync(tips: makeTips(week: 19), gestationalWeek: 20),
                      "Week rollover must trigger a fresh snapshot request")
    }

    // MARK: 2. Delivery channel

    func testUnreachablePhoneUsesTransferUserInfo() {
        // TestFlight fresh install: phone app never opened → not reachable.
        XCTAssertEqual(syncDeliveryChannel(isReachable: false), .transferUserInfo)
    }

    func testReachablePhoneUsesSendMessage() {
        XCTAssertEqual(syncDeliveryChannel(isReachable: true), .sendMessage)
    }

    // MARK: 3. Empty inline reply falls back to durable delivery

    func testEmptyReplyQueuesDurableFollowUp() {
        XCTAssertTrue(emptyReplyNeedsDurableFollowUp(reply: [:]),
                      "Empty native-cache reply must not end the sync attempt")
    }

    func testReplyWithTipsNeedsNoFollowUp() throws {
        let data = try encoder.encode(makeTips(week: 20))
        let reply: [String: Any] = [
            WatchMessage.tips: data,
            WatchMessage.gestationalWeek: 20,
        ]
        XCTAssertFalse(emptyReplyNeedsDurableFollowUp(reply: reply))
    }

    // MARK: 4. Incoming payload populates state on a real WatchSessionManager

    func testHandleIncomingPayloadPopulatesTipsAndClearsSyncing() throws {
        let suiteName = "WatchFreshInstallSyncTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let manager = WatchSessionManager(
            userDefaults: defaults,
            notificationCenter: NotificationCenter(),
            activateSession: false
        )
        XCTAssertTrue(manager.tips.isEmpty, "Fresh install starts with no tips")

        manager.isSyncing = true

        // Simulate the payload the phone's sendWeekAndTips produces.
        let data = try encoder.encode(makeTips(week: 22))
        let payload: [String: Any] = [
            WatchMessage.tips: data,
            WatchMessage.gestationalWeek: 22,
        ]
        manager.session(WCSession.default, didReceiveUserInfo: payload)

        // handleIncoming hops to the main queue; pump the run loop.
        let deadline = Date().addingTimeInterval(2)
        while manager.tips.isEmpty && Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }

        XCTAssertEqual(manager.tips.count, 2)
        XCTAssertEqual(manager.tips.first?.week, 22)
        XCTAssertEqual(manager.gestationalWeek, 22)
        XCTAssertFalse(manager.isSyncing, "Arriving tips must clear the syncing flag")
        XCTAssertNotNil(defaults.data(forKey: WatchSessionPersistence.tipsKey),
                        "Tips must be persisted for the next cold launch")
        XCTAssertEqual(defaults.integer(forKey: WatchSessionPersistence.gestationalWeekKey), 22)
    }
}
