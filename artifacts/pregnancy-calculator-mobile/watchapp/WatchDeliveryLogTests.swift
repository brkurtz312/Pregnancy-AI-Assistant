// WatchDeliveryLogTests.swift
// Unit tests for WatchDeliveryLog — the counters that make the Watch -> phone
// delivery defect legible without a Mac.
//
// Each test uses an isolated UserDefaults suite, so nothing here touches the
// real Watch's diagnostics.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp \
//     -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)'

import XCTest
import Foundation

final class WatchDeliveryLogTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "com.test.WatchDeliveryLog.\(name)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    private func makeLog() -> WatchDeliveryLog {
        WatchDeliveryLog(userDefaults: defaults)
    }

    // MARK: - Counting

    func testStartsEmpty() {
        let stats = makeLog().snapshot()
        XCTAssertEqual(stats.sent, 0)
        XCTAssertEqual(stats.acknowledged, 0)
        XCTAssertNil(stats.lastFailure)
        XCTAssertFalse(stats.isDeliveringIntoTheVoid, "Nothing sent is not the same as nothing acknowledged")
    }

    func testEachOutcomeIncrementsItsOwnCounter() {
        let log = makeLog()
        log.record(.sent)
        log.record(.sentAwaitingAck)
        log.record(.acknowledged)
        log.record(.unacknowledged)
        log.record(.queued)
        log.record(.unreachable)

        let stats = log.snapshot()
        XCTAssertEqual(stats.sent, 1)
        XCTAssertEqual(stats.sentAwaitingAck, 1)
        XCTAssertEqual(stats.acknowledged, 1)
        XCTAssertEqual(stats.unacknowledged, 1)
        XCTAssertEqual(stats.queued, 1)
        XCTAssertEqual(stats.unreachable, 1)
        XCTAssertEqual(stats.failed, 0)
    }

    func testSnapshotIsSynchronous() {
        // The view and the tests both read straight after a record() call made
        // from a WatchConnectivity callback queue; a value that lagged by a
        // run-loop turn would show stale counters on a screen refreshed once a
        // second.
        let log = makeLog()
        log.record(.sent)
        XCTAssertEqual(log.snapshot().sent, 1)
    }

    // MARK: - The failure detail

    func testFailureKeepsTheErrorDomainAndCode() {
        let log = makeLog()
        let error = NSError(domain: "WCErrorDomain", code: 7007,
                            userInfo: [NSLocalizedDescriptionKey: "Message reply took too long."])
        log.record(failure: error)

        let stats = log.snapshot()
        XCTAssertEqual(stats.failed, 1)
        // localizedDescription alone is frequently "The operation couldn't be
        // completed", which identifies nothing. The domain and code do.
        XCTAssertEqual(stats.lastFailure, "WCErrorDomain 7007: Message reply took too long.")
        XCTAssertNotNil(stats.lastFailureAt)
    }

    func testLastFailureKeepsTheMostRecent() {
        let log = makeLog()
        log.record(failure: NSError(domain: "A", code: 1, userInfo: [NSLocalizedDescriptionKey: "first"]))
        log.record(failure: NSError(domain: "B", code: 2, userInfo: [NSLocalizedDescriptionKey: "second"]))

        XCTAssertEqual(log.snapshot().failed, 2)
        XCTAssertEqual(log.snapshot().lastFailure, "B 2: second")
    }

    // MARK: - The verdict

    func testSendingWithoutAcknowledgementIsTheDefectShape() {
        let log = makeLog()
        log.record(.sentAwaitingAck)
        log.record(.queued)
        XCTAssertTrue(log.snapshot().isDeliveringIntoTheVoid)
    }

    func testOneAcknowledgementClearsTheVerdict() {
        let log = makeLog()
        log.record(.sentAwaitingAck)
        log.record(.acknowledged)
        XCTAssertFalse(log.snapshot().isDeliveringIntoTheVoid)
    }

    func testRepliedWithoutAckStillCountsAsTheVoid() {
        // The subtle case: the phone answered, so sendMessage reported no
        // error, but the ack UUID did not match and the record stayed queued.
        let log = makeLog()
        log.record(.sentAwaitingAck)
        log.record(.unacknowledged)
        XCTAssertTrue(log.snapshot().isDeliveringIntoTheVoid)
    }

    func testFireAndForgetMessagesNeverTriggerTheVerdict() {
        // Kick counts and session ends pass replyHandler: nil, so they can
        // never be acknowledged. Counting them would make a healthy Watch
        // report the defect — which is what a first draft of this did.
        let log = makeLog()
        for _ in 0..<50 { log.record(.sent) }
        XCTAssertFalse(log.snapshot().isDeliveringIntoTheVoid)
        XCTAssertTrue(log.snapshot().hasAttemptedDelivery)
    }

    // MARK: - Activation

    func testActivationIsRecordedWithATimestamp() {
        let log = makeLog()
        log.recordActivation("activated")
        let stats = log.snapshot()
        XCTAssertEqual(stats.activation, "activated")
        XCTAssertNotNil(stats.activationAt)
    }

    // MARK: - Persistence

    func testCountersSurviveRelaunch() {
        let first = makeLog()
        first.record(.sent)
        first.record(.unacknowledged)
        first.record(failure: NSError(domain: "WCErrorDomain", code: 7007, userInfo: [:]))

        // A second instance over the same defaults stands in for a relaunch.
        let second = WatchDeliveryLog(userDefaults: defaults)
        let stats = second.snapshot()
        XCTAssertEqual(stats.sent, 1)
        XCTAssertEqual(stats.unacknowledged, 1)
        XCTAssertEqual(stats.failed, 1)
        XCTAssertNotNil(stats.lastFailure)
    }

    func testResetClearsInMemoryAndPersistedState() {
        let log = makeLog()
        log.record(.sent)
        log.record(failure: NSError(domain: "A", code: 1, userInfo: [:]))
        log.reset()

        XCTAssertEqual(log.snapshot(), WatchDeliveryStats())
        XCTAssertEqual(WatchDeliveryLog(userDefaults: defaults).snapshot(), WatchDeliveryStats())
    }

    func testResetIsWhatSignOutNeeds() {
        // clearPersistedSession removes wk.deliveryLog through
        // WatchSessionPersistence.removeAll, then calls reset(). Without the
        // reset, the next record() would write the old counters straight back.
        let log = makeLog()
        log.record(.sent)
        WatchSessionPersistence.removeAll(from: defaults)
        log.reset()
        log.record(.queued)

        let stats = log.snapshot()
        XCTAssertEqual(stats.sent, 0, "Pre-sign-out counters must not return")
        XCTAssertEqual(stats.queued, 1)
    }

    func testDeliveryLogKeyIsInTheSignOutRegistry() {
        XCTAssertTrue(WatchSessionPersistence.allKeys.contains(WatchSessionPersistence.deliveryLogKey))
    }
}
