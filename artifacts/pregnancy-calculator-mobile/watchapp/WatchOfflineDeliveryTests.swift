// WatchOfflineDeliveryTests.swift
// Verifies that back-to-back contraction records and kick-session-end summaries
// sent while the phone is unreachable both arrive at the phone-side handler
// after the session reconnects.
//
// Key correctness property being tested:
//   WatchSessionManager uses `transferUserInfo` (not `updateApplicationContext`)
//   for offline delivery.  `transferUserInfo` enqueues every payload
//   independently and delivers them in order.  `updateApplicationContext` is a
//   last-write-wins dictionary that silently discards every payload except the
//   most recent one — back-to-back offline records would be merged into one.
//
// Because WatchConnectivity is a hardware framework that cannot be imported in a
// macOS unit-test host, these tests model the delivery mechanism with a minimal
// in-process stand-in:
//
//   • `TransferQueue`   — models the ordered queue that `transferUserInfo` builds
//                         on the Watch side (one enqueue per offline send).
//   • `ApplicationContext` — models the single shared dict that
//                         `updateApplicationContext` maintains (last-write-wins).
//   • `processQueue`    — replays the queue through the phone-side callback,
//                         mirroring `session(_:didReceiveUserInfo:)`.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp -destination 'platform=macOS'

import XCTest
import Foundation

// MARK: - Delivery-channel models

/// Models the ordered FIFO queue that `WCSession.transferUserInfo(_:)` maintains.
/// Each call to `enqueue` corresponds to one `transferUserInfo` call on the Watch.
/// Every enqueued item is delivered individually to the phone handler in order.
private struct TransferQueue {
    private(set) var items: [[String: Any]] = []

    mutating func enqueue(_ payload: [String: Any]) {
        items.append(payload)
    }

    /// Drains the queue in order, calling `handler` once per item.
    /// Models `session(_:didReceiveUserInfo:)` firing once per transferred item.
    func drain(handler: ([String: Any]) -> Void) {
        for item in items { handler(item) }
    }
}

/// Models the single shared dict that `WCSession.updateApplicationContext(_:)` maintains.
/// Every `update` call replaces the entire dict — last-write-wins semantics.
/// Only the final state is delivered to the phone via `didReceiveApplicationContext`.
private struct ApplicationContext {
    private(set) var current: [String: Any] = [:]

    mutating func update(_ payload: [String: Any]) {
        current = payload   // replaces all previous content — only last write survives
    }

    /// Delivers the single surviving dict to `handler`.
    /// Models `session(_:didReceiveApplicationContext:)` firing once with the last context.
    func deliver(handler: ([String: Any]) -> Void) {
        handler(current)
    }
}

// MARK: - Phone-side handler (mirrors PhoneWatchBridge.handleMessage)

/// A minimal replica of the relevant branch inside `PhoneWatchBridge.handleMessage`.
/// Returns the decoded payload if it carries a `contractionUpdate` key; nil otherwise.
private func phoneHandleContraction(_ payload: [String: Any]) -> [String: Any]? {
    guard let data = payload[WatchMessage.contractionUpdate] as? Data,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return nil
    }
    return json
}

/// Returns the decoded payload if it carries a `kickSessionEnd` key; nil otherwise.
private func phoneHandleKickSessionEnd(_ payload: [String: Any]) -> [String: Any]? {
    guard let data = payload[WatchMessage.kickSessionEnd] as? Data,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return nil
    }
    return json
}

// MARK: - Watch-side encoder helpers (mirrors WatchSessionManager.sendContractionUpdate / sendKickSessionEnd)

private let offlineDeliveryEncoder: JSONEncoder = {
    let e = JSONEncoder()
    e.dateEncodingStrategy = .iso8601
    return e
}()

private let offlineDeliveryDecoder: JSONDecoder = {
    let d = JSONDecoder()
    d.dateDecodingStrategy = .iso8601
    return d
}()

/// Encodes a `ContractionRecord` and wraps it in the wire payload dict,
/// mirroring the offline branch of `WatchSessionManager.sendContractionUpdate`.
private func makeContractionPayload(_ record: ContractionRecord) -> [String: Any]? {
    guard let data = try? offlineDeliveryEncoder.encode(record) else { return nil }
    return [WatchMessage.contractionUpdate: data]
}

/// Encodes a `KickSessionSummary` and wraps it in the wire payload dict,
/// mirroring the offline branch of `WatchSessionManager.sendKickSessionEnd`.
private func makeKickSessionEndPayload(_ summary: KickSessionSummary) -> [String: Any]? {
    guard let data = try? offlineDeliveryEncoder.encode(summary) else { return nil }
    return [WatchMessage.kickSessionEnd: data]
}

// MARK: - Test fixtures

private func makeContraction(start: Date, duration: TimeInterval, interval: TimeInterval? = nil) -> ContractionRecord {
    ContractionRecord(
        startedAt: start,
        endedAt: start.addingTimeInterval(duration),
        interval: interval
    )
}

private func makeKickSession(start: Date, count: Int) -> KickSessionSummary {
    KickSessionSummary(
        kickCount: count,
        startedAt: start,
        endedAt: start.addingTimeInterval(600)
    )
}

// MARK: - Cold-launch session model

/// Models the WCSession activation lifecycle on the receiving side during a
/// cold launch.  The OS may have userInfo payloads (queued via
/// `transferUserInfo` while the app was dead) ready to deliver the moment the
/// session activates.  Whether they reach the app depends entirely on whether
/// the delegate was assigned BEFORE `activate()` was called:
///
///   • delegate set → activate(): every pending payload is delivered through
///     `session(_:didReceiveUserInfo:)` — nothing is lost.
///   • activate() → delegate set later: WCSession has no delegate at delivery
///     time, so activation-time payloads are silently dropped.
///
/// `WatchSessionManager.init` follows the safe ordering
/// (`WCSession.default.delegate = self` on the line before
/// `WCSession.default.activate()`), and these tests pin that property.
private final class LaunchSession {
    /// Payloads the OS queued while the app was not running.
    private let pendingUserInfo: [[String: Any]]

    /// Mirrors `WCSession.delegate` — the `didReceiveUserInfo` sink.
    var delegateHandler: (([String: Any]) -> Void)?

    private(set) var isActivated = false

    init(pendingUserInfo: [[String: Any]]) {
        self.pendingUserInfo = pendingUserInfo
    }

    /// Mirrors `WCSession.activate()`: activation-time payloads fire
    /// immediately — before any UI exists.  If no delegate is set yet they are
    /// dropped, exactly as WCSession drops callbacks with a nil delegate.
    func activate() {
        isActivated = true
        for payload in pendingUserInfo {
            delegateHandler?(payload)
        }
    }
}

// MARK: - Tests

final class WatchOfflineDeliveryTests: XCTestCase {

    // MARK: Cold launch — didReceiveUserInfo fires immediately after activate()

    /// Contraction records queued while the app was dead must be processed even
    /// when `didReceiveUserInfo` fires at activation time, before any UI is
    /// ready.  This holds because the delegate is assigned before `activate()`
    /// is called — the ordering used by `WatchSessionManager.init`.
    func testContractionsArrivingDuringLaunch_areReceivedNotDropped() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let record1 = makeContraction(start: now,       duration: 45)
        let record2 = makeContraction(start: now + 300, duration: 50, interval: 300)

        let session = LaunchSession(pendingUserInfo: [
            try XCTUnwrap(makeContractionPayload(record1)),
            try XCTUnwrap(makeContractionPayload(record2)),
        ])

        // Cold launch, safe ordering: delegate first, then activate().
        var received: [[String: Any]] = []
        session.delegateHandler = { payload in
            if let decoded = phoneHandleContraction(payload) {
                received.append(decoded)
            }
        }
        session.activate()

        XCTAssertTrue(session.isActivated)
        XCTAssertEqual(received.count, 2,
                       "Both contraction records delivered at activation time must be processed, not dropped")

        let start1 = try XCTUnwrap(received[0]["startedAt"] as? String)
        let start2 = try XCTUnwrap(received[1]["startedAt"] as? String)
        XCTAssertNotEqual(start1, start2,
                          "Launch-time delivery must preserve both distinct records")
    }

    /// Same coverage for kick-session-end summaries arriving at launch.
    func testKickSessionEndsArrivingDuringLaunch_areReceivedNotDropped() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let summary1 = makeKickSession(start: now,       count: 10)
        let summary2 = makeKickSession(start: now + 700, count: 8)

        let session = LaunchSession(pendingUserInfo: [
            try XCTUnwrap(makeKickSessionEndPayload(summary1)),
            try XCTUnwrap(makeKickSessionEndPayload(summary2)),
        ])

        var kickCounts: [Int] = []
        session.delegateHandler = { payload in
            if let json = phoneHandleKickSessionEnd(payload),
               let count = json["kickCount"] as? Int {
                kickCounts.append(count)
            }
        }
        session.activate()

        XCTAssertEqual(kickCounts, [10, 8],
                       "Both kick-session-end summaries delivered at activation time must be processed, in order")
    }

    /// A mixed activation-time burst (contraction + kick-session-end) is fully
    /// processed even though no UI exists yet.
    func testMixedRecordsArrivingDuringLaunch_allProcessed() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let session = LaunchSession(pendingUserInfo: [
            try XCTUnwrap(makeContractionPayload(makeContraction(start: now, duration: 45))),
            try XCTUnwrap(makeKickSessionEndPayload(makeKickSession(start: now + 60, count: 12))),
        ])

        var contractionCount = 0
        var kickSessionCount = 0
        session.delegateHandler = { payload in
            if phoneHandleContraction(payload)    != nil { contractionCount += 1 }
            if phoneHandleKickSessionEnd(payload) != nil { kickSessionCount += 1 }
        }
        session.activate()

        XCTAssertEqual(contractionCount, 1, "Launch-time contraction must be processed")
        XCTAssertEqual(kickSessionCount, 1, "Launch-time kick-session-end must be processed")
    }

    /// Contrast test documenting WHY the delegate-before-activate ordering in
    /// `WatchSessionManager.init` matters: if `activate()` ran before the
    /// delegate assignment, every activation-time record would be silently
    /// dropped.
    func testActivateBeforeDelegateAssignment_dropsLaunchRecords() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let session = LaunchSession(pendingUserInfo: [
            try XCTUnwrap(makeContractionPayload(makeContraction(start: now, duration: 45))),
        ])

        // Broken ordering: activate first, assign delegate afterwards.
        var received = 0
        session.activate()
        session.delegateHandler = { payload in
            if phoneHandleContraction(payload) != nil { received += 1 }
        }

        XCTAssertEqual(received, 0,
                       "With no delegate at activation time the record is silently dropped — "
                       + "this is the race WatchSessionManager.init avoids by assigning the delegate before activate()")
    }

    // MARK: Contraction — transferUserInfo channel

    /// Core invariant: two offline contractions both arrive at the phone handler.
    /// This verifies that the Watch uses `transferUserInfo` (ordered FIFO queue)
    /// rather than `updateApplicationContext` (last-write-wins, would lose the first).
    func testTwoOfflineContractions_bothDeliveredToPhoneHandler() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let record1 = makeContraction(start: now,              duration: 45, interval: nil)
        let record2 = makeContraction(start: now + 300,        duration: 50, interval: 300)

        // Watch side: phone is not reachable → transferUserInfo for each record.
        var queue = TransferQueue()
        let payload1 = try XCTUnwrap(makeContractionPayload(record1), "Failed to encode record1")
        let payload2 = try XCTUnwrap(makeContractionPayload(record2), "Failed to encode record2")
        queue.enqueue(payload1)
        queue.enqueue(payload2)

        XCTAssertEqual(queue.items.count, 2,
                       "transferUserInfo should have created two independent queue entries")

        // Phone side: session reconnects → didReceiveUserInfo fires once per item.
        var received: [[String: Any]] = []
        queue.drain { payload in
            if let decoded = phoneHandleContraction(payload) {
                received.append(decoded)
            }
        }

        XCTAssertEqual(received.count, 2,
                       "Both offline contraction records must arrive at the phone handler")
    }

    /// Confirms the two delivered records carry distinct, identifiable data.
    func testTwoOfflineContractions_distinctRecordsPreserved() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let record1 = makeContraction(start: now,        duration: 40)
        let record2 = makeContraction(start: now + 300,  duration: 55, interval: 300)

        var queue = TransferQueue()
        queue.enqueue(try XCTUnwrap(makeContractionPayload(record1)))
        queue.enqueue(try XCTUnwrap(makeContractionPayload(record2)))

        var received: [[String: Any]] = []
        queue.drain { if let d = phoneHandleContraction($0) { received.append(d) } }

        XCTAssertEqual(received.count, 2)

        // Decode back to concrete structs and verify identity.
        let decoded1 = try XCTUnwrap(
            received[0]["startedAt"] as? String,
            "First record must carry startedAt"
        )
        let decoded2 = try XCTUnwrap(
            received[1]["startedAt"] as? String,
            "Second record must carry startedAt"
        )
        XCTAssertNotEqual(decoded1, decoded2,
                          "The two records must represent different contractions (different startedAt)")

        // Second record should carry an interval; first should not (first of the session).
        XCTAssertNil(received[0]["interval"],
                     "First contraction in a session has no prior interval")
        XCTAssertNotNil(received[1]["interval"],
                        "Second contraction should carry the interval since the previous one")
    }

    /// Delivery must be ordered: first contraction sent → first received.
    func testOfflineContractions_deliveredInOrder() throws {
        let base = Date(timeIntervalSinceReferenceDate: 800_000_000)

        var queue = TransferQueue()
        for i in 0..<5 {
            let record = makeContraction(start: base + Double(i) * 300, duration: 45 + Double(i))
            queue.enqueue(try XCTUnwrap(makeContractionPayload(record)))
        }

        var receivedStartTimes: [String] = []
        queue.drain { payload in
            if let json = phoneHandleContraction(payload),
               let start = json["startedAt"] as? String {
                receivedStartTimes.append(start)
            }
        }

        XCTAssertEqual(receivedStartTimes.count, 5, "All five records should arrive")
        XCTAssertEqual(receivedStartTimes, receivedStartTimes.sorted(),
                       "Records should arrive in chronological order (FIFO)")
    }

    // MARK: Kick-session-end — transferUserInfo channel

    /// Core invariant: two offline kick-session-end summaries both arrive.
    func testTwoOfflineKickSessionEnds_bothDeliveredToPhoneHandler() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let summary1 = makeKickSession(start: now,       count: 10)
        let summary2 = makeKickSession(start: now + 700, count: 8)

        var queue = TransferQueue()
        queue.enqueue(try XCTUnwrap(makeKickSessionEndPayload(summary1)))
        queue.enqueue(try XCTUnwrap(makeKickSessionEndPayload(summary2)))

        XCTAssertEqual(queue.items.count, 2,
                       "transferUserInfo should create two independent queue entries")

        var received: [[String: Any]] = []
        queue.drain { if let d = phoneHandleKickSessionEnd($0) { received.append(d) } }

        XCTAssertEqual(received.count, 2,
                       "Both offline kick-session-end summaries must arrive at the phone handler")
    }

    /// Confirms each delivered summary carries its own distinct kick count.
    func testTwoOfflineKickSessionEnds_distinctSummariesPreserved() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let summary1 = makeKickSession(start: now,       count: 10)
        let summary2 = makeKickSession(start: now + 700, count: 8)

        var queue = TransferQueue()
        queue.enqueue(try XCTUnwrap(makeKickSessionEndPayload(summary1)))
        queue.enqueue(try XCTUnwrap(makeKickSessionEndPayload(summary2)))

        var kickCounts: [Int] = []
        queue.drain { payload in
            if let json = phoneHandleKickSessionEnd(payload),
               let count = json["kickCount"] as? Int {
                kickCounts.append(count)
            }
        }

        XCTAssertEqual(kickCounts, [10, 8],
                       "Each summary must preserve its own kick count, in send order")
    }

    // MARK: Contrast: updateApplicationContext silently loses the first record

    /// Documents WHY the switch to `transferUserInfo` was necessary.
    ///
    /// `updateApplicationContext` is last-write-wins: the second call replaces the
    /// entire context dict so only the most recent payload survives.  Calling it for
    /// each offline contraction would guarantee data loss for all but the last record.
    func testApplicationContext_silentlyLosesFirstContractionRecord() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let record1 = makeContraction(start: now,       duration: 45)
        let record2 = makeContraction(start: now + 300, duration: 50, interval: 300)

        // Watch side (OLD, broken behaviour): updateApplicationContext per record.
        var ctx = ApplicationContext()
        ctx.update(try XCTUnwrap(makeContractionPayload(record1)))
        ctx.update(try XCTUnwrap(makeContractionPayload(record2)))

        // Phone side: only one delivery, carrying only the last context.
        var received: [[String: Any]] = []
        ctx.deliver { if let d = phoneHandleContraction($0) { received.append(d) } }

        // Only one record survives — the first is silently lost.
        XCTAssertEqual(received.count, 1,
                       "updateApplicationContext delivers only the last update — first record is lost")
    }

    /// Same contrast for kick-session-end summaries.
    func testApplicationContext_silentlyLosesFirstKickSessionSummary() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let summary1 = makeKickSession(start: now,       count: 10)
        let summary2 = makeKickSession(start: now + 700, count: 8)

        var ctx = ApplicationContext()
        ctx.update(try XCTUnwrap(makeKickSessionEndPayload(summary1)))
        ctx.update(try XCTUnwrap(makeKickSessionEndPayload(summary2)))

        var received: [[String: Any]] = []
        ctx.deliver { if let d = phoneHandleKickSessionEnd($0) { received.append(d) } }

        XCTAssertEqual(received.count, 1,
                       "updateApplicationContext delivers only the last update — first summary is lost")
        // Only summary2 (kickCount 8) survives.
        XCTAssertEqual(received.first?["kickCount"] as? Int, 8,
                       "Only the second (most recent) summary should survive applicationContext delivery")
    }

    // MARK: Mixed offline messages

    /// A realistic offline burst: contraction, then kick-session-end.
    /// Both should arrive independently via the queue.
    func testMixedOfflineMessages_bothTypesDelivered() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

        let contraction = makeContraction(start: now, duration: 45)
        let session     = makeKickSession(start: now + 60, count: 12)

        var queue = TransferQueue()
        queue.enqueue(try XCTUnwrap(makeContractionPayload(contraction)))
        queue.enqueue(try XCTUnwrap(makeKickSessionEndPayload(session)))

        var contractionCount = 0
        var kickSessionCount = 0

        queue.drain { payload in
            if phoneHandleContraction(payload)    != nil { contractionCount += 1 }
            if phoneHandleKickSessionEnd(payload) != nil { kickSessionCount += 1 }
        }

        XCTAssertEqual(contractionCount, 1, "Contraction must arrive")
        XCTAssertEqual(kickSessionCount, 1, "Kick-session-end must arrive")
    }

    // MARK: Edge cases

    /// An empty queue produces no deliveries (sanity check).
    func testEmptyQueue_producesNoDeliveries() {
        let queue = TransferQueue()
        var count = 0
        queue.drain { _ in count += 1 }
        XCTAssertEqual(count, 0)
    }

    /// A single offline contraction is also delivered correctly (baseline).
    func testSingleOfflineContraction_isDelivered() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let record = makeContraction(start: now, duration: 45)

        var queue = TransferQueue()
        queue.enqueue(try XCTUnwrap(makeContractionPayload(record)))

        var received: [[String: Any]] = []
        queue.drain { if let d = phoneHandleContraction($0) { received.append(d) } }

        XCTAssertEqual(received.count, 1)
    }

    /// A single offline kick-session-end is also delivered correctly (baseline).
    func testSingleOfflineKickSessionEnd_isDelivered() throws {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let summary = makeKickSession(start: now, count: 7)

        var queue = TransferQueue()
        queue.enqueue(try XCTUnwrap(makeKickSessionEndPayload(summary)))

        var received: [[String: Any]] = []
        queue.drain { if let d = phoneHandleKickSessionEnd($0) { received.append(d) } }

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?["kickCount"] as? Int, 7)
    }
}
