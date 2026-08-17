// PhoneWatchBridgeCallbackTests.swift
// Verifies that the phone-side record dispatcher fires the React Native JS
// callbacks (`onContractionUpdate`, `onKickSessionEnd`) once PER RECORD when
// multiple offline records are drained through it — not just for the first.
//
// WatchOfflineDeliveryTests already proves both payloads reach the phone-side
// handler.  This suite closes the remaining gap: even when the Swift side
// receives every payload, the JS layer would silently miss records if the
// registered closure were nil or guarded incorrectly (e.g. a one-shot
// callback, or a guard that clears the closure after the first fire).
//
// These tests exercise the REAL production dispatch code:
// `PhoneWatchMessageDispatcher` (PhoneWatchMessageDispatcher.swift) is the
// exact object `PhoneWatchBridge` owns — the bridge's `handleMessage` is a
// main-queue hop into `dispatcher.dispatch(_:)`, and the bridge's
// `onContractionUpdate` / `onKickSessionEnd` properties forward directly to
// the dispatcher's closures registered here.  (`PhoneWatchBridge` itself
// cannot be compiled into the watchOS test bundle: it implements iOS-only
// WCSessionDelegate requirements and touches WCSession.default at init, which
// is why the dispatch logic was extracted.)  The native receipt store is
// injected via the dispatcher's `persistContractionReceipt` hook, exactly as
// the bridge injects its own UserDefaults-backed implementation.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyAIAssistant (PregnancyWatchAppTests bundle)

import XCTest
import Foundation

// MARK: - Payload helpers (mirror the Watch-side offline encoders)

private let callbackTestEncoder: JSONEncoder = {
    let e = JSONEncoder()
    e.dateEncodingStrategy = .iso8601
    return e
}()

private func contractionPayload(_ record: ContractionRecord) throws -> [String: Any] {
    [WatchMessage.contractionUpdate: try callbackTestEncoder.encode(record)]
}

private func kickSessionEndPayload(_ summary: KickSessionSummary) throws -> [String: Any] {
    [WatchMessage.kickSessionEnd: try callbackTestEncoder.encode(summary)]
}

private func makeContraction(start: Date, duration: TimeInterval, interval: TimeInterval? = nil) -> ContractionRecord {
    ContractionRecord(startedAt: start, endedAt: start.addingTimeInterval(duration), interval: interval)
}

private func makeKickSession(start: Date, count: Int) -> KickSessionSummary {
    KickSessionSummary(kickCount: count, startedAt: start, endedAt: start.addingTimeInterval(600))
}

// MARK: - Tests

final class PhoneWatchBridgeCallbackTests: XCTestCase {

    private let base = Date(timeIntervalSinceReferenceDate: 800_000_000)

    /// Records the IDs handed to the injected persistence hook, in order —
    /// stands in for the bridge's UserDefaults-backed receipt store.
    private final class ReceiptStoreSpy {
        private(set) var persistedIds: [String] = []
        var persistReturns = true
        func persist(id: String) -> Bool {
            persistedIds.append(id)
            return persistReturns
        }
    }

    /// Builds the REAL production dispatcher with a recording persistence hook,
    /// mirroring how `PhoneWatchBridge.init` wires `persistContractionReceipt`.
    private func makeDispatcher(store: ReceiptStoreSpy = ReceiptStoreSpy()) -> PhoneWatchMessageDispatcher {
        let dispatcher = PhoneWatchMessageDispatcher()
        dispatcher.persistContractionReceipt = { id, _ in store.persist(id: id) }
        return dispatcher
    }

    /// Drains payloads through the dispatcher the way `PhoneWatchBridge.handleMessage`
    /// does — one async main-queue dispatch per delivered payload — and waits for
    /// all of them to complete, so the real asynchronous delivery path is covered.
    private func drainViaMainQueue(_ dispatcher: PhoneWatchMessageDispatcher, payloads: [[String: Any]]) {
        let done = expectation(description: "all payloads dispatched")
        done.expectedFulfillmentCount = payloads.count
        for payload in payloads {
            DispatchQueue.main.async {
                dispatcher.dispatch(payload)
                done.fulfill()
            }
        }
        wait(for: [done], timeout: 5)
    }

    // MARK: onContractionUpdate — fired once per record

    /// THE scenario from the task: two offline contraction records drained
    /// through the handler must fire the registered `onContractionUpdate`
    /// closure twice, with two distinct payloads — never just once.
    func testTwoOfflineContractions_callbackFiredTwiceWithDistinctPayloads() throws {
        let record1 = makeContraction(start: base,       duration: 45)
        let record2 = makeContraction(start: base + 300, duration: 50, interval: 300)

        let dispatcher = makeDispatcher()
        var callbackPayloads: [[String: Any]] = []
        dispatcher.onContractionUpdate = { callbackPayloads.append($0) }

        // Drain both offline records through the real async handleMessage path.
        drainViaMainQueue(dispatcher, payloads: [
            try contractionPayload(record1),
            try contractionPayload(record2),
        ])

        XCTAssertEqual(callbackPayloads.count, 2,
                       "onContractionUpdate must fire once PER record — the JS layer would "
                       + "silently miss the second contraction if it only fired for the first")

        let id1 = try XCTUnwrap(callbackPayloads[0]["id"] as? String)
        let id2 = try XCTUnwrap(callbackPayloads[1]["id"] as? String)
        XCTAssertEqual(id1, record1.id.uuidString, "First callback must carry the first record")
        XCTAssertEqual(id2, record2.id.uuidString, "Second callback must carry the second record")
        XCTAssertNotEqual(id1, id2, "The two callback payloads must be distinct records")

        let start1 = try XCTUnwrap(callbackPayloads[0]["startedAt"] as? String)
        let start2 = try XCTUnwrap(callbackPayloads[1]["startedAt"] as? String)
        XCTAssertNotEqual(start1, start2,
                          "Each callback invocation must carry that record's own data — no reuse of the first payload")
    }

    /// Order property: the callback observes records in delivery order, so the
    /// JS layer's per-record save/ack loop processes them in the sequence the
    /// Watch sent them.
    func testManyOfflineContractions_callbackObservesDeliveryOrder() throws {
        let dispatcher = makeDispatcher()
        var receivedIds: [String] = []
        dispatcher.onContractionUpdate = { payload in
            if let id = payload["id"] as? String { receivedIds.append(id) }
        }

        var sentIds: [String] = []
        var payloads: [[String: Any]] = []
        for i in 0..<5 {
            let record = makeContraction(start: base + Double(i) * 300, duration: 45 + Double(i))
            sentIds.append(record.id.uuidString)
            payloads.append(try contractionPayload(record))
        }
        drainViaMainQueue(dispatcher, payloads: payloads)

        XCTAssertEqual(receivedIds, sentIds,
                       "The callback must fire once per record, in delivery order — no skips, no duplicates")
    }

    /// A nil callback (JS listener not yet registered) must not crash, and the
    /// native persistence hook must still run for every record so the JS
    /// startup drain (`pendingContractionReceipts`) can recover them later.
    func testNilContractionCallback_doesNotCrash_andNativePersistStillRunsPerRecord() throws {
        let record1 = makeContraction(start: base,       duration: 45)
        let record2 = makeContraction(start: base + 300, duration: 50, interval: 300)

        let store = ReceiptStoreSpy()
        let dispatcher = makeDispatcher(store: store)
        XCTAssertNil(dispatcher.onContractionUpdate, "Precondition: no JS listener registered")

        drainViaMainQueue(dispatcher, payloads: [
            try contractionPayload(record1),
            try contractionPayload(record2),
        ])

        XCTAssertEqual(store.persistedIds,
                       [record1.id.uuidString, record2.id.uuidString],
                       "Even with a nil JS callback, every record must reach the native receipt "
                       + "store so the JS drain path can recover it after the listener registers")
    }

    /// Even when the receipt store rejects the write (no active user —
    /// `persistContractionReceipt` returns false), the dispatch must still fire
    /// the callback for every record: the JS layer owns the save/ack lifecycle.
    func testPersistRejects_callbackStillFiredPerRecord() throws {
        let record1 = makeContraction(start: base,       duration: 45)
        let record2 = makeContraction(start: base + 300, duration: 50, interval: 300)

        let store = ReceiptStoreSpy()
        store.persistReturns = false
        let dispatcher = makeDispatcher(store: store)
        var callbackCount = 0
        dispatcher.onContractionUpdate = { _ in callbackCount += 1 }

        drainViaMainQueue(dispatcher, payloads: [
            try contractionPayload(record1),
            try contractionPayload(record2),
        ])

        XCTAssertEqual(callbackCount, 2,
                       "A rejected native persist must not swallow the JS dispatch for any record")
    }

    /// Documents the registration-timing property: a callback registered after
    /// the first record only observes subsequent records.  This is why
    /// WatchConnectivityModule registers the closures in OnStartObserving
    /// BEFORE JS triggers any drain of pending records.
    func testCallbackRegisteredBetweenRecords_observesOnlyLaterRecords() throws {
        let record1 = makeContraction(start: base,       duration: 45)
        let record2 = makeContraction(start: base + 300, duration: 50, interval: 300)

        let store = ReceiptStoreSpy()
        let dispatcher = makeDispatcher(store: store)
        var callbackPayloads: [[String: Any]] = []

        drainViaMainQueue(dispatcher, payloads: [try contractionPayload(record1)]) // no listener yet
        dispatcher.onContractionUpdate = { callbackPayloads.append($0) }
        drainViaMainQueue(dispatcher, payloads: [try contractionPayload(record2)])

        XCTAssertEqual(callbackPayloads.count, 1,
                       "Only the record delivered after registration reaches the late-registered closure")
        XCTAssertEqual(callbackPayloads[0]["id"] as? String, record2.id.uuidString)
        XCTAssertEqual(store.persistedIds.count, 2,
                       "The missed first record is still natively persisted for the JS startup drain")
    }

    // MARK: onKickSessionEnd — same coverage

    /// THE scenario from task 777: the phone receives a kick-session-end summary
    /// via `didReceiveUserInfo` (a `transferUserInfo` delivery that the OS
    /// considers complete once the delegate method returns).  If the app is
    /// killed the instant the delegate returns, the OS will NOT replay the
    /// delivery — it already marked it complete.
    ///
    /// Safety therefore requires `onKickSessionEnd` to fire SYNCHRONOUSLY
    /// inside `dispatch(_:)` — before `didReceiveUserInfo` returns — so the
    /// event has already reached the JS layer before the process can exit.
    ///
    /// This test calls `dispatch` directly (no async hop, mirroring the fact
    /// that `PhoneWatchBridge.handleMessage` dispatches to the main queue and
    /// then calls `dispatcher.dispatch` synchronously) and asserts the closure
    /// has fired by the time `dispatch` returns.
    func testKickSessionEnd_callbackFiresSynchronouslyWithinDispatch() throws {
        let summary = makeKickSession(start: base, count: 7)
        let payload = try kickSessionEndPayload(summary)

        let dispatcher = makeDispatcher()
        var firedSynchronously = false
        dispatcher.onKickSessionEnd = { _ in firedSynchronously = true }

        dispatcher.dispatch(payload)   // direct call — no async hop

        XCTAssertTrue(firedSynchronously,
                      "onKickSessionEnd must fire synchronously within dispatch(_:). "
                      + "PhoneWatchBridge calls dispatch() inside didReceiveUserInfo; "
                      + "if the callback were deferred to another async hop, a phone "
                      + "killed immediately after didReceiveUserInfo returns would lose "
                      + "the kick-session summary because the OS considers delivery "
                      + "complete the moment the delegate method returns.")
    }

    /// Companion check: the synchronous callback also delivers the correct
    /// payload fields (kickCount, startedAt, endedAt) — not just that it fires.
    func testKickSessionEnd_synchronousCallbackCarriesCorrectPayload() throws {
        let summary = makeKickSession(start: base, count: 5)
        let payload = try kickSessionEndPayload(summary)

        let dispatcher = makeDispatcher()
        var received: [String: Any]?
        dispatcher.onKickSessionEnd = { received = $0 }

        dispatcher.dispatch(payload)   // direct call

        let r = try XCTUnwrap(received,
                               "onKickSessionEnd must fire synchronously and supply a non-nil payload")
        XCTAssertEqual(r["kickCount"] as? Int, 5,
                       "kickCount must match the summary that was dispatched")
        XCTAssertNotNil(r["startedAt"],
                        "startedAt must be present in the synchronously-fired payload")
        XCTAssertNotNil(r["endedAt"],
                        "endedAt must be present in the synchronously-fired payload")
    }

    /// Two offline kick-session-end summaries drained through the handler must
    /// fire `onKickSessionEnd` twice, each with its own distinct summary.
    func testTwoOfflineKickSessionEnds_callbackFiredTwiceWithDistinctPayloads() throws {
        let summary1 = makeKickSession(start: base,       count: 10)
        let summary2 = makeKickSession(start: base + 700, count: 8)

        let dispatcher = makeDispatcher()
        var callbackPayloads: [[String: Any]] = []
        dispatcher.onKickSessionEnd = { callbackPayloads.append($0) }

        drainViaMainQueue(dispatcher, payloads: [
            try kickSessionEndPayload(summary1),
            try kickSessionEndPayload(summary2),
        ])

        XCTAssertEqual(callbackPayloads.count, 2,
                       "onKickSessionEnd must fire once PER summary — not just for the first")
        XCTAssertEqual(callbackPayloads[0]["kickCount"] as? Int, 10,
                       "First callback must carry the first session's own count")
        XCTAssertEqual(callbackPayloads[1]["kickCount"] as? Int, 8,
                       "Second callback must carry the second session's own count — no payload reuse")

        let start1 = try XCTUnwrap(callbackPayloads[0]["startedAt"] as? String)
        let start2 = try XCTUnwrap(callbackPayloads[1]["startedAt"] as? String)
        XCTAssertNotEqual(start1, start2, "The two callback payloads must be distinct summaries")
    }

    /// A nil kick-session-end callback must not crash the dispatcher, and a
    /// later registration observes subsequent summaries normally.
    func testNilKickSessionEndCallback_doesNotCrash_lateRegistrationObservesLaterSummaries() throws {
        let summary1 = makeKickSession(start: base,       count: 10)
        let summary2 = makeKickSession(start: base + 700, count: 8)

        let dispatcher = makeDispatcher()
        drainViaMainQueue(dispatcher, payloads: [try kickSessionEndPayload(summary1)]) // nil closure — must not crash

        var kickCounts: [Int] = []
        dispatcher.onKickSessionEnd = { payload in
            if let count = payload["kickCount"] as? Int { kickCounts.append(count) }
        }
        drainViaMainQueue(dispatcher, payloads: [try kickSessionEndPayload(summary2)])

        XCTAssertEqual(kickCounts, [8],
                       "The late-registered closure observes only summaries delivered after registration")
    }

    // MARK: Mixed burst — each callback fires per matching record

    /// A mixed drain (contraction + kick-session-end interleaved) fires each
    /// callback exactly once per matching record — one channel never swallows
    /// or shadows the other.
    func testMixedRecordBurst_eachCallbackFiresPerMatchingRecord() throws {
        let dispatcher = makeDispatcher()
        var contractionIds: [String] = []
        var kickCounts: [Int] = []
        dispatcher.onContractionUpdate = { if let id = $0["id"] as? String { contractionIds.append(id) } }
        dispatcher.onKickSessionEnd = { if let c = $0["kickCount"] as? Int { kickCounts.append(c) } }

        let record1 = makeContraction(start: base,       duration: 45)
        let record2 = makeContraction(start: base + 300, duration: 50, interval: 300)

        drainViaMainQueue(dispatcher, payloads: [
            try contractionPayload(record1),
            try kickSessionEndPayload(makeKickSession(start: base + 60, count: 12)),
            try contractionPayload(record2),
        ])

        XCTAssertEqual(contractionIds, [record1.id.uuidString, record2.id.uuidString],
                       "Both contractions fire the contraction callback, in order")
        XCTAssertEqual(kickCounts, [12],
                       "The kick-session-end callback fires exactly once for its single record")
    }
}
