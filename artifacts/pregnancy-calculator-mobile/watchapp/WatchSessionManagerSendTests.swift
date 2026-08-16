// WatchSessionManagerSendTests.swift
// Confirms that the three outbound send methods on WatchSessionManager
// (`sendKickUpdate`, `sendKickSessionEnd`, `sendContractionUpdate`) and the
// incoming phone→Watch payload handler (via the WCSession delegate shim) behave
// correctly for the REACHABLE success path, using the REAL WatchSessionManager
// implementation with an injected fake transport.
//
// These tests complement `WatchPhoneForceQuitDeliveryTests` (which covers the
// offline / reachable-then-failed error paths) and the pure-logic-mirror tests
// in `WatchSessionManagerKickCountTests` and `WatchContractionRetryQueueTests`
// (which verify persistence helpers directly).
//
// Specifically covered here:
//
//   sendKickUpdate
//   ─────────────────────────────────────────────────────────────────────────
//   1. Reachable  → routes through sendMessage with the `kickUpdate` key and
//      the exact count value.
//   2. Two sequential calls forward distinct counts faithfully.
//   3. Unreachable → silent drop; no sendMessage or transferUserInfo call is
//      made (live-count updates are best-effort; no offline queue).
//   4. sendKickUpdate must not modify `lastKickCount` — that property is
//      reserved for completed-session counts from sendKickSessionEnd.
//
//   sendKickSessionEnd — reachable path
//   ─────────────────────────────────────────────────────────────────────────
//   5. Reachable success → routes through sendMessage with `kickSessionEnd`.
//   6. Updates the published `lastKickCount` for the Watch idle screen.
//   7. Persists `lastKickCount` to UserDefaults via the didSet observer.
//   8. The encoded payload round-trips through Codable with timestamps intact.
//
//   sendContractionUpdate — reachable ack paths
//   ─────────────────────────────────────────────────────────────────────────
//   9.  Reachable + matching ack UUID → record removed from the retry queue.
//   10. Reachable + mismatched ack UUID → record stays in the retry queue.
//   11. Reachable + blank reply → record stays in the retry queue.
//   12. Record is enqueued BEFORE the sendMessage attempt (force-quit safety).
//   13. Successful reachable ack produces no transferUserInfo call.
//   14. Encoded payload round-trips through Codable.
//
//   handleIncoming (phone→Watch payload via WCSession delegate entry points)
//   ─────────────────────────────────────────────────────────────────────────
//   NOTE: `handleIncoming` dispatches to DispatchQueue.main.async; tests call
//   `drainMain()` (RunLoop spin) before asserting state changes.
//
//   15. Tips payload → decoded and published; raw data persisted to UserDefaults.
//   16. gestationalWeek payload → published and persisted.
//   17. Combined tips+week (production `sendWeekAndTips` path) → both fields
//       updated from a single message.
//   18. Same via applicationContext (background sync channel).
//   19. signOut via transferUserInfo → all persisted state cleared, published
//       state reset.
//   20. kickCount from phone → updates `lastKickCount` on Watch idle screen.
//
// Run via: Product → Test in Xcode (PregnancyWatchAppTests bundle), or
//   xcodebuild test -scheme PregnancyWatchApp \
//     -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)'

import XCTest
import Foundation

// MARK: - Recording fake transport

/// Records every call made by WatchSessionManager and lets a test inject replies
/// or failures.  Mirrors the `ForceQuitFakeTransport` pattern in
/// `WatchPhoneForceQuitDeliveryTests`.
private final class RecordingTransport: WatchConnectivityTransport {

    var isReachable: Bool = false

    /// Payloads passed to `sendMessage`, in call order.
    private(set) var sentMessages: [[String: Any]] = []
    /// Payloads passed to `transferUserInfo`, in call order.
    private(set) var userInfoTransfers: [[String: Any]] = []

    /// When set, the next `sendMessage` fires `errorHandler` instead of
    /// `replyHandler` — simulates a send failure (e.g. phone force-quit).
    var failNextSend = false

    /// When set (and not failing), `sendMessage` fires `replyHandler` with this
    /// value — lets a test inject the phone's ack reply.
    var nextReply: [String: Any]? = nil

    struct FakeError: Error {}

    func sendMessage(
        _ message: [String: Any],
        replyHandler: (([String: Any]) -> Void)?,
        errorHandler: ((Error) -> Void)?
    ) {
        sentMessages.append(message)
        if failNextSend {
            errorHandler?(FakeError())
        } else if let reply = nextReply {
            replyHandler?(reply)
        }
        // Neither flag set: replyHandler not called (phone receives but sends no reply).
    }

    func transferUserInfo(_ userInfo: [String: Any]) {
        userInfoTransfers.append(userInfo)
    }
}

// MARK: - Helpers

private func makeSummary(count: Int) -> KickSessionSummary {
    let start = Date(timeIntervalSinceReferenceDate: 800_000_000)
    return KickSessionSummary(kickCount: count, startedAt: start,
                              endedAt: start.addingTimeInterval(900))
}

private func makeRecord(offset: TimeInterval = 0) -> ContractionRecord {
    let start = Date(timeIntervalSinceReferenceDate: 800_000_000).addingTimeInterval(offset)
    return ContractionRecord(startedAt: start, endedAt: start.addingTimeInterval(60))
}

// MARK: - Tests

final class WatchSessionManagerSendTests: XCTestCase {

    private var suiteName: String!
    private var defaults: UserDefaults!
    private var transport: RecordingTransport!

    override func setUp() {
        super.setUp()
        suiteName = "WatchSessionManagerSendTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        transport = RecordingTransport()
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        transport = nil
        super.tearDown()
    }

    private func makeManager() -> WatchSessionManager {
        WatchSessionManager(
            userDefaults: defaults,
            notificationCenter: NotificationCenter(),
            activateSession: false,
            transport: transport
        )
    }

    /// Drain pending main-queue blocks that `handleIncoming` dispatches via
    /// `DispatchQueue.main.async`.  50 ms is ample for a synchronous UserDefaults
    /// write; tests that do NOT call delegate methods skip this.
    private func drainMain() {
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
    }

    // MARK: - sendKickUpdate — live count (best-effort, no offline queue)

    /// Reachable: sendKickUpdate routes through sendMessage with the `kickUpdate`
    /// key and the exact count that was passed in.
    func testSendKickUpdate_reachable_usesSendMessage() {
        transport.isReachable = true
        let manager = makeManager()

        manager.sendKickUpdate(count: 7)

        XCTAssertEqual(transport.sentMessages.count, 1,
                       "sendKickUpdate must attempt exactly one sendMessage when reachable")
        XCTAssertTrue(transport.userInfoTransfers.isEmpty,
                      "sendKickUpdate must not use transferUserInfo — there is no offline queue")
        XCTAssertEqual(transport.sentMessages[0][WatchMessage.kickUpdate] as? Int, 7,
                       "sendMessage payload must carry the kickUpdate key with the count value")
    }

    /// Sequential calls forward distinct counts faithfully (not a constant,
    /// not off-by-one).
    func testSendKickUpdate_reachable_forwardsExactCounts() {
        transport.isReachable = true
        let manager = makeManager()

        manager.sendKickUpdate(count: 1)
        manager.sendKickUpdate(count: 15)

        XCTAssertEqual(transport.sentMessages.count, 2)
        XCTAssertEqual(transport.sentMessages[0][WatchMessage.kickUpdate] as? Int, 1)
        XCTAssertEqual(transport.sentMessages[1][WatchMessage.kickUpdate] as? Int, 15)
    }

    /// Unreachable: sendKickUpdate is a silent drop — no sendMessage, no
    /// transferUserInfo.  Live kick-count updates are best-effort only; the
    /// session-end summary (`sendKickSessionEnd`) is the durable record.
    func testSendKickUpdate_unreachable_silentDrop() {
        transport.isReachable = false
        let manager = makeManager()

        manager.sendKickUpdate(count: 4)

        XCTAssertTrue(transport.sentMessages.isEmpty,
                      "sendKickUpdate unreachable: no sendMessage attempt should be made")
        XCTAssertTrue(transport.userInfoTransfers.isEmpty,
                      "sendKickUpdate has no offline queue — must not fall back to transferUserInfo")
    }

    /// sendKickUpdate must not modify `lastKickCount` — that property is reserved
    /// for the completed-session count set by sendKickSessionEnd.  A live tap from
    /// the Watch mid-session must not clobber the previous session's display value.
    func testSendKickUpdate_doesNotModifyLastKickCount() {
        transport.isReachable = true
        // Seed a prior session count.
        defaults.set(10, forKey: WatchSessionPersistence.lastKickCountKey)
        let manager = makeManager() // fresh instance reads the seeded value

        manager.sendKickUpdate(count: 5)

        XCTAssertEqual(
            defaults.integer(forKey: WatchSessionPersistence.lastKickCountKey), 10,
            "sendKickUpdate must not overwrite the completed-session lastKickCount in UserDefaults"
        )
        // Verify the manager's published value is 10 (restored from seeded defaults),
        // not 5 (the mid-session tap count).
        XCTAssertEqual(manager.lastKickCount, 10,
                       "sendKickUpdate must not mutate the published lastKickCount")
    }

    // MARK: - sendKickSessionEnd — reachable path + persistence

    /// Reachable: sendKickSessionEnd routes through sendMessage with the
    /// `kickSessionEnd` key carrying the encoded KickSessionSummary.
    func testSendKickSessionEnd_reachable_usesSendMessage() {
        transport.isReachable = true
        let manager = makeManager()

        manager.sendKickSessionEnd(summary: makeSummary(count: 12))

        XCTAssertEqual(transport.sentMessages.count, 1,
                       "sendKickSessionEnd must attempt exactly one sendMessage when reachable")
        XCTAssertNotNil(transport.sentMessages[0][WatchMessage.kickSessionEnd] as? Data,
                        "sendMessage payload must carry the encoded summary under kickSessionEnd")
        XCTAssertTrue(transport.userInfoTransfers.isEmpty,
                      "No transferUserInfo fallback should occur when the reachable send succeeds")
    }

    /// sendKickSessionEnd updates `lastKickCount` regardless of reachability so
    /// the Watch idle screen shows the count even when the phone is later offline.
    func testSendKickSessionEnd_reachable_updatesLastKickCount() {
        transport.isReachable = true
        let manager = makeManager()
        XCTAssertNil(manager.lastKickCount, "Precondition: no prior session count")

        manager.sendKickSessionEnd(summary: makeSummary(count: 8))

        XCTAssertEqual(manager.lastKickCount, 8,
                       "sendKickSessionEnd must update lastKickCount with the session count")
    }

    /// The `lastKickCount` didSet writes to UserDefaults so a Watch force-quit
    /// after a successful send still shows the correct count on relaunch.
    func testSendKickSessionEnd_reachable_persistsCountToUserDefaults() {
        transport.isReachable = true
        let manager = makeManager()

        manager.sendKickSessionEnd(summary: makeSummary(count: 17))

        XCTAssertEqual(
            defaults.integer(forKey: WatchSessionPersistence.lastKickCountKey), 17,
            "lastKickCount must be written to UserDefaults by the didSet observer"
        )
    }

    /// The encoded summary must round-trip through Codable: the Data in the
    /// sendMessage payload must decode back to the original summary values.
    func testSendKickSessionEnd_reachable_payloadDecodesCorrectly() throws {
        transport.isReachable = true
        let manager = makeManager()
        let summary = makeSummary(count: 5)

        manager.sendKickSessionEnd(summary: summary)

        let data = try XCTUnwrap(
            transport.sentMessages[0][WatchMessage.kickSessionEnd] as? Data,
            "kickSessionEnd payload must be Data"
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(KickSessionSummary.self, from: data)

        XCTAssertEqual(decoded.kickCount, summary.kickCount)
        XCTAssertEqual(decoded.startedAt.timeIntervalSince1970,
                       summary.startedAt.timeIntervalSince1970, accuracy: 0.001)
        XCTAssertEqual(decoded.endedAt.timeIntervalSince1970,
                       summary.endedAt.timeIntervalSince1970, accuracy: 0.001)
    }

    // MARK: - sendContractionUpdate — reachable ack paths

    /// Reachable + matching ack UUID: the record must be removed from the retry
    /// queue so it is not resent on the next reachability window.
    func testSendContractionUpdate_reachable_matchingAck_dequeues() {
        transport.isReachable = true
        let manager = makeManager()
        let record = makeRecord()

        transport.nextReply = [WatchMessage.contractionUpdateAck: record.id.uuidString]
        manager.sendContractionUpdate(record: record)

        XCTAssertTrue(
            manager.loadPendingContractionQueue().isEmpty,
            "A matching ack must remove the record from the retry queue"
        )
    }

    /// Reachable + mismatched ack UUID: the phone did not durably persist the
    /// record — the record must stay queued for a future retry.
    func testSendContractionUpdate_reachable_mismatchedAck_staysQueued() {
        transport.isReachable = true
        let manager = makeManager()
        let record = makeRecord()

        transport.nextReply = [WatchMessage.contractionUpdateAck: UUID().uuidString]
        manager.sendContractionUpdate(record: record)

        XCTAssertEqual(
            manager.loadPendingContractionQueue().map(\.id), [record.id],
            "A mismatched ack must leave the record in the retry queue"
        )
    }

    /// Reachable + blank reply: phone received the message but did not persist
    /// (e.g. user is signed out) — record must stay queued.
    func testSendContractionUpdate_reachable_blankReply_staysQueued() {
        transport.isReachable = true
        transport.nextReply = [:]
        let manager = makeManager()
        let record = makeRecord()

        manager.sendContractionUpdate(record: record)

        XCTAssertFalse(
            manager.loadPendingContractionQueue().isEmpty,
            "A blank reply (no contractionUpdateAck key) must not dequeue the record"
        )
    }

    /// The record is enqueued in UserDefaults BEFORE the sendMessage call so a
    /// Watch force-quit between encode and network delivery cannot lose the record.
    func testSendContractionUpdate_enqueuedBeforeSend_survivesImmediateFailure() {
        transport.isReachable = true
        transport.failNextSend = true
        let manager = makeManager()
        let record = makeRecord()

        manager.sendContractionUpdate(record: record)

        XCTAssertEqual(
            manager.loadPendingContractionQueue().map(\.id), [record.id],
            "Record must be in the retry queue even when sendMessage fails immediately"
        )
    }

    /// A successful reachable ack must not trigger any transferUserInfo calls.
    func testSendContractionUpdate_reachable_matchingAck_noTransferUserInfo() {
        transport.isReachable = true
        let manager = makeManager()
        let record = makeRecord()

        transport.nextReply = [WatchMessage.contractionUpdateAck: record.id.uuidString]
        manager.sendContractionUpdate(record: record)

        XCTAssertEqual(transport.sentMessages.count, 1,
                       "Reachable path must use sendMessage")
        XCTAssertTrue(transport.userInfoTransfers.isEmpty,
                      "A successful reachable ack must not trigger transferUserInfo")
    }

    /// The encoded record in the sendMessage payload must round-trip through
    /// Codable with the original timestamps preserved.
    func testSendContractionUpdate_reachable_payloadDecodesCorrectly() throws {
        transport.isReachable = true
        let manager = makeManager()
        let record = makeRecord()

        // No ack — record stays queued; we only care about the payload shape.
        manager.sendContractionUpdate(record: record)

        let data = try XCTUnwrap(
            transport.sentMessages[0][WatchMessage.contractionUpdate] as? Data,
            "contractionUpdate payload must be Data"
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(ContractionRecord.self, from: data)

        XCTAssertEqual(decoded.id, record.id)
        XCTAssertEqual(decoded.startedAt.timeIntervalSince1970,
                       record.startedAt.timeIntervalSince1970, accuracy: 0.001)
        XCTAssertEqual(decoded.endedAt.timeIntervalSince1970,
                       record.endedAt.timeIntervalSince1970, accuracy: 0.001)
    }

    // MARK: - handleIncoming (phone→Watch payload via WCSession delegate entry points)
    //
    // `handleIncoming` is private and dispatches to `DispatchQueue.main.async`
    // before mutating published state.  We drive it through the public
    // `WCSessionDelegate` methods and call `drainMain()` before each assertion
    // so the async block has executed by the time we check state.

    /// A tips payload delivered via `session(_:didReceiveMessage:)` must decode
    /// the array and update the published `tips` property.
    func testHandleIncoming_tipsData_decodesAndPublishesTips() throws {
        let manager = makeManager()
        let tip = WatchTip(week: 28, emoji: "🌟", text: "Baby is the size of an eggplant")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let tipsData = try encoder.encode([tip])

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.tips: tipsData])
        drainMain()

        XCTAssertEqual(manager.tips.count, 1,
                       "handleIncoming must publish the decoded tips array")
        XCTAssertEqual(manager.tips[0].week, tip.week)
        XCTAssertEqual(manager.tips[0].emoji, tip.emoji)
        XCTAssertEqual(manager.tips[0].text, tip.text)
    }

    /// Tips must be persisted to UserDefaults so they survive a Watch force-quit.
    func testHandleIncoming_tipsData_persistsRawDataToUserDefaults() throws {
        let manager = makeManager()
        let tip = WatchTip(week: 28, emoji: "🌟", text: "Stay active")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let tipsData = try encoder.encode([tip])

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.tips: tipsData])
        drainMain()

        let stored = defaults.data(forKey: WatchSessionPersistence.tipsKey)
        XCTAssertNotNil(stored, "handleIncoming must persist tips data to UserDefaults")
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([WatchTip].self, from: stored!)
        XCTAssertEqual(decoded.first?.week, tip.week)
    }

    /// Gestational week in the incoming payload must be published and persisted.
    func testHandleIncoming_gestationalWeek_updatesAndPersists() {
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.gestationalWeek: 32])
        drainMain()

        XCTAssertEqual(manager.gestationalWeek, 32,
                       "handleIncoming must publish the gestational week")
        XCTAssertEqual(
            defaults.integer(forKey: WatchSessionPersistence.gestationalWeekKey), 32,
            "gestational week must be persisted to UserDefaults"
        )
    }

    /// A combined tips+week payload — the production `sendWeekAndTips` path —
    /// must update both fields from a single incoming message.
    func testHandleIncoming_combinedTipsAndWeek_updatesBothFields() throws {
        let manager = makeManager()
        let tip = WatchTip(week: 24, emoji: "🍼", text: "Hearing develops now")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let tipsData = try encoder.encode([tip])

        manager.session(WCSession.default,
                        didReceiveMessage: [
                            WatchMessage.tips: tipsData,
                            WatchMessage.gestationalWeek: 24,
                        ])
        drainMain()

        XCTAssertEqual(manager.gestationalWeek, 24)
        XCTAssertEqual(manager.tips.count, 1)
        XCTAssertEqual(manager.tips[0].emoji, "🍼")
    }

    /// A combined tips+week payload via `applicationContext` (background sync path)
    /// must also update both fields — same code path via `handleIncoming`.
    func testHandleIncoming_viaApplicationContext_updatesBothFields() throws {
        let manager = makeManager()
        let tip = WatchTip(week: 18, emoji: "🥭", text: "Mango-sized baby")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let tipsData = try encoder.encode([tip])

        manager.session(WCSession.default,
                        didReceiveApplicationContext: [
                            WatchMessage.tips: tipsData,
                            WatchMessage.gestationalWeek: 18,
                        ])
        drainMain()

        XCTAssertEqual(manager.gestationalWeek, 18)
        XCTAssertEqual(manager.tips.first?.text, "Mango-sized baby")
    }

    /// A signOut payload delivered via `transferUserInfo` must clear all persisted
    /// state and reset published properties so a new user sees a clean slate.
    func testHandleIncoming_signOut_clearsAllPersistedStateAndPublishedValues() throws {
        // Seed realistic prior-user state.
        let tip = WatchTip(week: 20, emoji: "🍌", text: "Banana size")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let tipsData = try encoder.encode([tip])
        defaults.set(tipsData, forKey: WatchSessionPersistence.tipsKey)
        defaults.set(20, forKey: WatchSessionPersistence.gestationalWeekKey)
        defaults.set(5, forKey: WatchSessionPersistence.lastKickCountKey)
        defaults.set(3, forKey: WatchSessionPersistence.lastContractionCountKey)

        // Build the manager after seeding so it restores the saved state.
        let manager = makeManager()
        XCTAssertFalse(manager.tips.isEmpty, "Precondition: tips restored from UserDefaults")
        XCTAssertEqual(manager.lastKickCount, 5, "Precondition: kick count restored")

        // Deliver signOut via the transferUserInfo entry point.
        manager.session(WCSession.default,
                        didReceiveUserInfo: [WatchMessage.signOut: true])
        drainMain()

        XCTAssertTrue(manager.tips.isEmpty,
                      "signOut must clear the published tips array")
        XCTAssertEqual(manager.gestationalWeek, 0,
                       "signOut must reset gestationalWeek to 0")
        XCTAssertNil(manager.lastKickCount,
                     "signOut must clear lastKickCount")
        XCTAssertNil(manager.lastContractionCount,
                     "signOut must clear lastContractionCount")

        for key in WatchSessionPersistence.allKeys {
            XCTAssertNil(defaults.object(forKey: key),
                         "signOut must remove every UserDefaults entry — \(key) still present")
        }
    }

    /// A kickCount from the phone (delivered after a session was saved on the
    /// phone side) must update `lastKickCount` on the Watch so the idle screen
    /// reflects the most recent session even when the Watch was offline at the
    /// time of the kick session.
    func testHandleIncoming_kickCountFromPhone_updatesLastKickCount() {
        let manager = makeManager()

        manager.session(WCSession.default,
                        didReceiveMessage: [WatchMessage.kickCount: 9])
        drainMain()

        XCTAssertEqual(manager.lastKickCount, 9,
                       "An incoming kickCount from the phone must update lastKickCount on Watch")
    }
}
