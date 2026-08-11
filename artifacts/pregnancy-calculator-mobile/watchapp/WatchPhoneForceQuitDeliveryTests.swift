// WatchPhoneForceQuitDeliveryTests.swift
// Verifies the "phone force-quit while a session is running" scenario by
// driving the REAL WatchSessionManager send paths (`sendKickSessionEnd`,
// `sendContractionUpdate`, `sendContractionSessionEnd`,
// `flushPendingContractionUpdates`) through an injected fake
// WatchConnectivity transport:
//
//   1. Offline (phone force-quit ⇒ unreachable): every send path must route
//      through `transferUserInfo` — the durable OS FIFO queue — never
//      `updateApplicationContext` and never a dropped `sendMessage`.
//   2. Reachable-then-failed race (phone force-quit right after the
//      reachability check): the sendMessage errorHandler must fall back to
//      `transferUserInfo` so the payload is not lost.
//   3. The Watch's own display state (lastKickCount / lastContractionCount /
//      pending contraction queue) survives a Watch relaunch while the phone
//      is dead, and the retry queue drains only on a matching ack UUID.
//
// The real transferUserInfo OS queue itself cannot run in a unit-test host
// (it lives in the WatchConnectivity daemon); its FIFO-vs-last-write-wins
// semantics are covered by WatchOfflineDeliveryTests, and the on-device
// end-to-end flow by docs/manual-test-phone-force-quit-watch-data.md.
//
// Run via: Product → Test in Xcode (PregnancyWatchAppTests bundle).

import XCTest
import Foundation

// MARK: - Fake transport

/// Records every send/transfer made by WatchSessionManager and lets a test
/// control reachability, replies, and send failures.
private final class ForceQuitFakeTransport: WatchConnectivityTransport {
    var isReachable: Bool = false

    /// Payloads passed to sendMessage, in order.
    private(set) var sentMessages: [[String: Any]] = []
    /// Payloads passed to transferUserInfo, in order.
    private(set) var userInfoTransfers: [[String: Any]] = []

    /// When set, sendMessage invokes errorHandler instead of replyHandler —
    /// models the phone being force-quit mid-send.
    var failNextSends = false
    /// When set (and not failing), sendMessage invokes replyHandler with this.
    var nextReply: [String: Any]? = nil

    struct SendError: Error {}

    func sendMessage(
        _ message: [String: Any],
        replyHandler: (([String: Any]) -> Void)?,
        errorHandler: ((Error) -> Void)?
    ) {
        sentMessages.append(message)
        if failNextSends {
            errorHandler?(SendError())
        } else if let reply = nextReply {
            replyHandler?(reply)
        }
    }

    func transferUserInfo(_ userInfo: [String: Any]) {
        userInfoTransfers.append(userInfo)
    }
}

// MARK: - Tests

final class WatchPhoneForceQuitDeliveryTests: XCTestCase {

    private var suiteName: String!
    private var defaults: UserDefaults!
    private var transport: ForceQuitFakeTransport!

    override func setUp() {
        super.setUp()
        suiteName = "WatchPhoneForceQuitDeliveryTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        transport = ForceQuitFakeTransport()
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        transport = nil
        super.tearDown()
    }

    /// Builds a real WatchSessionManager on the isolated suite + fake transport.
    /// Each call models a fresh Watch app launch reading the same persisted state.
    private func makeManager() -> WatchSessionManager {
        WatchSessionManager(
            userDefaults: defaults,
            notificationCenter: NotificationCenter(),
            activateSession: false,
            transport: transport
        )
    }

    private func makeSummary(count: Int) -> KickSessionSummary {
        let start = Date(timeIntervalSinceReferenceDate: 800_000_000)
        return KickSessionSummary(kickCount: count, startedAt: start, endedAt: start.addingTimeInterval(600))
    }

    private func makeRecord(offset: TimeInterval = 0, interval: TimeInterval? = nil) -> ContractionRecord {
        let start = Date(timeIntervalSinceReferenceDate: 800_000_000).addingTimeInterval(offset)
        return ContractionRecord(startedAt: start, endedAt: start.addingTimeInterval(45), interval: interval)
    }

    // MARK: - Kick session end: channel selection + fallback

    /// Phone force-quit ⇒ unreachable: the REAL sendKickSessionEnd must queue
    /// the summary via transferUserInfo (durable OS queue), not sendMessage.
    func testKickSessionEnd_phoneDead_routedThroughTransferUserInfo() {
        transport.isReachable = false
        let manager = makeManager()

        manager.sendKickSessionEnd(summary: makeSummary(count: 12))

        XCTAssertTrue(transport.sentMessages.isEmpty,
                      "Unreachable phone: no sendMessage attempt should be made")
        XCTAssertEqual(transport.userInfoTransfers.count, 1,
                       "Summary must be queued via transferUserInfo for delivery on phone relaunch")
        XCTAssertNotNil(transport.userInfoTransfers.first?[WatchMessage.kickSessionEnd] as? Data,
                        "Queued payload must carry the encoded kickSessionEnd summary")
    }

    /// Reachable-then-failed race: phone is force-quit right after the
    /// reachability check. The errorHandler must fall back to transferUserInfo
    /// so the session summary still reaches the phone on relaunch.
    func testKickSessionEnd_sendFailsMidFlight_fallsBackToTransferUserInfo() {
        transport.isReachable = true
        transport.failNextSends = true
        let manager = makeManager()

        manager.sendKickSessionEnd(summary: makeSummary(count: 9))

        XCTAssertEqual(transport.sentMessages.count, 1, "Real-time send is attempted first")
        XCTAssertEqual(transport.userInfoTransfers.count, 1,
                       "Failed sendMessage must fall back to the durable transferUserInfo queue")
        XCTAssertNotNil(transport.userInfoTransfers.first?[WatchMessage.kickSessionEnd] as? Data)
    }

    /// The Watch idle screen keeps showing the count with the phone dead,
    /// and the count survives a Watch relaunch.
    func testKickSessionEnd_phoneDead_countShownAndSurvivesWatchRelaunch() {
        transport.isReachable = false
        let manager = makeManager()
        manager.sendKickSessionEnd(summary: makeSummary(count: 12))

        XCTAssertEqual(manager.lastKickCount, 12,
                       "Watch must show the completed kick count even with the phone force-quit")
        XCTAssertEqual(defaults.integer(forKey: WatchSessionPersistence.lastKickCountKey), 12,
                       "Count must be written to UserDefaults before any delivery attempt")

        let relaunched = makeManager()
        XCTAssertEqual(relaunched.lastKickCount, 12,
                       "Kick count must be restored on the next Watch launch — no dependence on the phone")
    }

    // MARK: - Contraction session end: channel selection + fallback

    func testContractionSessionEnd_phoneDead_routedThroughTransferUserInfo() {
        transport.isReachable = false
        let manager = makeManager()

        manager.sendContractionSessionEnd(count: 7)

        XCTAssertTrue(transport.sentMessages.isEmpty)
        XCTAssertEqual(transport.userInfoTransfers.count, 1)
        XCTAssertEqual(transport.userInfoTransfers.first?[WatchMessage.contractionSessionEnd] as? Int, 7)

        let relaunched = makeManager()
        XCTAssertEqual(relaunched.lastContractionCount, 7,
                       "Contraction session count must be restored after a Watch relaunch with the phone dead")
    }

    func testContractionSessionEnd_sendFailsMidFlight_fallsBackToTransferUserInfo() {
        transport.isReachable = true
        transport.failNextSends = true
        let manager = makeManager()

        manager.sendContractionSessionEnd(count: 4)

        XCTAssertEqual(transport.sentMessages.count, 1)
        XCTAssertEqual(transport.userInfoTransfers.count, 1,
                       "Failed sendMessage must fall back to transferUserInfo")
        XCTAssertEqual(transport.userInfoTransfers.first?[WatchMessage.contractionSessionEnd] as? Int, 4)
    }

    // MARK: - Contraction records: durable enqueue + channel selection

    /// Offline: the REAL sendContractionUpdate must (1) enqueue the record in
    /// the retry queue BEFORE any delivery attempt and (2) queue the payload
    /// via transferUserInfo.
    func testContractionUpdate_phoneDead_enqueuedAndRoutedThroughTransferUserInfo() {
        transport.isReachable = false
        let manager = makeManager()
        let record = makeRecord()

        manager.sendContractionUpdate(record: record)

        XCTAssertEqual(manager.loadPendingContractionQueue().map(\.id), [record.id],
                       "Record must be in the retry queue (no ack from the dead phone)")
        XCTAssertTrue(transport.sentMessages.isEmpty)
        XCTAssertEqual(transport.userInfoTransfers.count, 1)
        XCTAssertNotNil(transport.userInfoTransfers.first?[WatchMessage.contractionUpdate] as? Data)
    }

    /// Reachable-then-failed race: the record must stay in the retry queue AND
    /// fall back to transferUserInfo.
    func testContractionUpdate_sendFailsMidFlight_staysQueuedAndFallsBack() {
        transport.isReachable = true
        transport.failNextSends = true
        let manager = makeManager()
        let record = makeRecord()

        manager.sendContractionUpdate(record: record)

        XCTAssertEqual(manager.loadPendingContractionQueue().map(\.id), [record.id],
                       "Failed send must leave the record queued for the next reachability window")
        XCTAssertEqual(transport.userInfoTransfers.count, 1,
                       "Failed sendMessage must also fall back to transferUserInfo")
    }

    /// Reachable with a matching ack: record is delivered and dequeued.
    func testContractionUpdate_matchingAck_dequeues() {
        transport.isReachable = true
        let manager = makeManager()
        let record = makeRecord()
        transport.nextReply = [WatchMessage.contractionUpdateAck: record.id.uuidString]

        manager.sendContractionUpdate(record: record)

        XCTAssertTrue(manager.loadPendingContractionQueue().isEmpty,
                      "A confirmed durable receipt (matching ack UUID) must dequeue the record")
    }

    /// Reachable but the phone replies blank (relaunched, not yet persisted):
    /// the record must remain queued.
    func testContractionUpdate_blankReply_staysQueued() {
        transport.isReachable = true
        let manager = makeManager()
        let record = makeRecord()
        transport.nextReply = [:]

        manager.sendContractionUpdate(record: record)

        XCTAssertEqual(manager.loadPendingContractionQueue().map(\.id), [record.id],
                       "A blank reply must not dequeue — the phone did not confirm durable persistence")
    }

    /// Mismatched ack UUID must not dequeue.
    func testContractionUpdate_wrongAck_staysQueued() {
        transport.isReachable = true
        let manager = makeManager()
        let record = makeRecord()
        transport.nextReply = [WatchMessage.contractionUpdateAck: UUID().uuidString]

        manager.sendContractionUpdate(record: record)

        XCTAssertEqual(manager.loadPendingContractionQueue().count, 1,
                       "A mismatched ack UUID must not dequeue the record")
    }

    // MARK: - Watch relaunch while phone is dead

    /// Unacknowledged records survive a Watch relaunch (new manager, same defaults).
    func testPendingQueue_survivesWatchRelaunch_whilePhoneDead() {
        transport.isReachable = false
        let manager = makeManager()
        let r1 = makeRecord()
        let r2 = makeRecord(offset: 300, interval: 300)
        manager.sendContractionUpdate(record: r1)
        manager.sendContractionUpdate(record: r2)

        let relaunched = makeManager()
        let restored = relaunched.loadPendingContractionQueue()
        XCTAssertEqual(Set(restored.map(\.id)), Set([r1.id, r2.id]),
                       "Both unacknowledged records must survive a Watch relaunch — none silently dropped")
    }

    // MARK: - Phone relaunch: flush drains the queue via the real flush path

    /// After the phone relaunches and reachability returns, the REAL
    /// flushPendingContractionUpdates resends every queued record and dequeues
    /// each only on its matching ack.
    func testPhoneRelaunch_flushResendsAndDrainsOnMatchingAcks() {
        transport.isReachable = false
        let manager = makeManager()
        let r1 = makeRecord()
        let r2 = makeRecord(offset: 300)
        manager.sendContractionUpdate(record: r1)
        manager.sendContractionUpdate(record: r2)
        XCTAssertEqual(manager.loadPendingContractionQueue().count, 2)

        // Phone relaunches: reachable again, replies with the matching ack for
        // whichever record it receives (the fake echoes per-send below).
        transport.isReachable = true
        // First flush: phone acks r1 but replies blank for r2 (e.g. still
        // signing in). Simulate by flushing twice with different replies.
        transport.nextReply = [WatchMessage.contractionUpdateAck: r1.id.uuidString]
        manager.flushPendingContractionUpdates()
        XCTAssertEqual(manager.loadPendingContractionQueue().map(\.id), [r2.id],
                       "Only the record with a matching ack may leave the queue")

        transport.nextReply = [WatchMessage.contractionUpdateAck: r2.id.uuidString]
        manager.flushPendingContractionUpdates()
        XCTAssertTrue(manager.loadPendingContractionQueue().isEmpty,
                      "Queue must fully drain once every record has a confirmed durable receipt")
    }

    /// Flush with a send failure keeps the record queued and falls back to
    /// transferUserInfo for guaranteed background delivery.
    func testPhoneRelaunch_flushSendFails_recordStaysQueuedWithFallback() {
        transport.isReachable = false
        let manager = makeManager()
        let record = makeRecord()
        manager.sendContractionUpdate(record: record)
        let transfersBefore = transport.userInfoTransfers.count

        transport.isReachable = true
        transport.failNextSends = true
        manager.flushPendingContractionUpdates()

        XCTAssertEqual(manager.loadPendingContractionQueue().map(\.id), [record.id],
                       "A failed flush send must leave the record in the queue")
        XCTAssertEqual(transport.userInfoTransfers.count, transfersBefore + 1,
                       "Failed flush send must fall back to transferUserInfo")
    }
}
