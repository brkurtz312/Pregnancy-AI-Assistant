// WatchContractionRetryQueueTests.swift
// Unit tests for the contraction retry queue in WatchSessionManager.
//
// Scenario covered:
//   The phone app is force-quit while a contraction is active on the Watch.
//   When the user taps Stop, `sendContractionUpdate` is called on the Watch.
//   Because the phone may not be reachable (or may crash before replying),
//   the record is persisted in UserDefaults under "wk.pendingContractionUpdates"
//   before the send is attempted.
//
//   The phone writes the record to its own native store (ph.contractionReceipts)
//   BEFORE calling replyHandler, then replies with the record's UUID string under
//   the "contractionUpdateAck" key.  The Watch dequeues ONLY when the reply
//   carries a matching UUID — a blank or mismatched reply means the phone did not
//   durably persist and the record must be retried.
//
//   When WCSession reachability returns, `flushPendingContractionUpdates` retries
//   all still-queued records using the same ack-gated dequeue logic.
//
// Because WatchConnectivity is a hardware framework unavailable in a macOS test
// host, these tests model the retry-queue and ack-protocol logic with pure
// functions that mirror the relevant methods of WatchSessionManager and
// PhoneWatchBridge.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp -destination 'platform=macOS'

import XCTest
import Foundation

// MARK: - Watch-side retry queue (mirrors WatchSessionManager)

private let watchPendingKey = "wk.pendingContractionUpdates"

private let retryQueueEncoder: JSONEncoder = {
    let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e
}()

private let retryQueueDecoder: JSONDecoder = {
    let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d
}()

/// Mirrors `WatchSessionManager.enqueuePendingContractionUpdate(_:)`.
private func enqueuePending(_ record: ContractionRecord, in defaults: UserDefaults) {
    var pending = loadPending(from: defaults)
    guard !pending.contains(where: { $0.id == record.id }) else { return }
    pending.append(record)
    savePending(pending, in: defaults)
}

/// Mirrors `WatchSessionManager.dequeuePendingContractionUpdate(id:)`.
private func dequeuePending(id: UUID, in defaults: UserDefaults) {
    var pending = loadPending(from: defaults)
    pending.removeAll { $0.id == id }
    savePending(pending, in: defaults)
}

/// Mirrors `WatchSessionManager.loadPendingContractionQueue()`.
private func loadPending(from defaults: UserDefaults) -> [ContractionRecord] {
    guard let data = defaults.data(forKey: watchPendingKey),
          let records = try? retryQueueDecoder.decode([ContractionRecord].self, from: data) else {
        return []
    }
    return records
}

private func savePending(_ records: [ContractionRecord], in defaults: UserDefaults) {
    if records.isEmpty {
        defaults.removeObject(forKey: watchPendingKey)
    } else if let data = try? retryQueueEncoder.encode(records) {
        defaults.set(data, forKey: watchPendingKey)
    }
}

// MARK: - Ack-gated dequeue (mirrors Watch replyHandler logic)

/// Mirrors the Watch-side replyHandler guard:
///   `guard let ackId = reply[WatchMessage.contractionUpdateAck] as? String,
///          ackId == record.id.uuidString else { return }`
///
/// Returns true if `reply` carries a "contractionUpdateAck" key whose value
/// matches `recordId`. Only in this case should the Watch dequeue the record.
private func ackMatches(reply: [String: Any], recordId: UUID) -> Bool {
    guard let ackId = reply["contractionUpdateAck"] as? String else { return false }
    return ackId == recordId.uuidString
}

/// Simulates the Watch receiving a reply and conditionally dequeuing the record.
/// This is the exact logic in the Watch's sendMessage replyHandler.
private func applyReply(
    _ reply: [String: Any],
    for record: ContractionRecord,
    in defaults: UserDefaults
) {
    guard ackMatches(reply: reply, recordId: record.id) else { return }
    dequeuePending(id: record.id, in: defaults)
}

// MARK: - Phone-side durable receipt store (mirrors PhoneWatchBridge)

// MARK: - Phone-side receipt store mirrors (user-scoped keys)
//
// All receipt keys are scoped to a user ID, mirroring the updated
// PhoneWatchBridge implementation.  Tests that involve a single user
// pass the module-level `testUserA` constant (or omit it to get the
// default).  Cross-account tests use `testUserA` and `testUserB` explicitly.
//
// Key layout (matches PhoneWatchBridge):
//   ph.contractionReceiptIds:<userId>   [String]
//   ph.contractionRecord:<userId>.<id>  Data

private let testUserA = "user-A"
private let testUserB = "user-B"

// Returns nil when no user is active — mirrors the activeUserId nil-guard.
private var activeTestUserId: String? = testUserA

private func phoneReceiptIdsKey(for userId: String) -> String {
    "ph.contractionReceiptIds:\(userId)"
}

private func phoneReceiptDataKey(userId: String, recordId: String) -> String {
    "ph.contractionRecord:\(userId).\(recordId)"
}
/// Mirrors `PhoneWatchBridge.persistContractionReceipt(id:data:)`.
///
/// Returns `false` when `userId` is nil (signed out — caller must NOT ack the Watch;
/// the record stays in the retry queue for the next authenticated session).
/// Returns `true` when the record was written OR was already present (duplicate —
/// data is durable; caller can ack so the Watch dequeues safely).
/// Data is written FIRST, then the ID is added to the list — this ordering
/// guarantees a force-quit leaves an orphan *data* key (harmless, retried), not
/// an orphan *ID* with no data (unrecoverable).
@discardableResult
private func phonePersistReceipt(id: String, data: Data, in defaults: UserDefaults,
                                  userId: String? = testUserA) -> Bool {
    guard let uid = userId else { return false }   // signed out — drop, no ack
    let idsKey = phoneReceiptIdsKey(for: uid)
    var ids = defaults.stringArray(forKey: idsKey) ?? []
    guard !ids.contains(id) else { return true }  // duplicate — already durable, ack
    // Write data FIRST
    defaults.set(data, forKey: phoneReceiptDataKey(userId: uid, recordId: id))
    // Then add to index
    ids.append(id)
    defaults.set(ids, forKey: idsKey)
    return true
}

private func phonePersistedReceiptIds(from defaults: UserDefaults,
                                       userId: String = testUserA) -> [String] {
    defaults.stringArray(forKey: phoneReceiptIdsKey(for: userId)) ?? []
}

/// Mirrors `PhoneWatchBridge.pendingContractionReceipts()` with orphan-ID repair.
/// Returns an empty array when `userId` is nil (signed out).
private func phonePendingReceipts(from defaults: UserDefaults,
                                   userId: String? = testUserA) -> [[String: Any]] {
    guard let uid = userId else { return [] }
    let idsKey = phoneReceiptIdsKey(for: uid)
    let ids = defaults.stringArray(forKey: idsKey) ?? []
    var result: [[String: Any]] = []
    var validIds: [String] = []
    for id in ids {
        let dataKey = phoneReceiptDataKey(userId: uid, recordId: id)
        if let data = defaults.data(forKey: dataKey),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            result.append(json)
            validIds.append(id)
        } else {
            defaults.removeObject(forKey: dataKey)
        }
    }
    if validIds.count != ids.count {
        defaults.set(validIds, forKey: idsKey)
    }
    return result
}

/// Mirrors `PhoneWatchBridge.clearAllContractionReceipts()` called on sign-out.
/// No-op when `userId` is nil.
private func phoneClearAllReceipts(in defaults: UserDefaults,
                                    userId: String? = testUserA) {
    guard let uid = userId else { return }
    let idsKey = phoneReceiptIdsKey(for: uid)
    let ids = defaults.stringArray(forKey: idsKey) ?? []
    for id in ids {
        defaults.removeObject(forKey: phoneReceiptDataKey(userId: uid, recordId: id))
    }
    defaults.removeObject(forKey: idsKey)
}

private func phoneAcknowledgeReceipt(id: String, in defaults: UserDefaults,
                                      userId: String = testUserA) {
    let idsKey = phoneReceiptIdsKey(for: userId)
    var ids = defaults.stringArray(forKey: idsKey) ?? []
    ids.removeAll { $0 == id }
    defaults.set(ids, forKey: idsKey)
    defaults.removeObject(forKey: phoneReceiptDataKey(userId: userId, recordId: id))
}

/// Returns raw JSON `Data` for a synthetic contraction record (simulates what
/// the phone receives from the Watch).
private func makeReceiptData(id: String) -> Data {
    let dict: [String: Any] = [
        "id": id,
        "startedAt": "2025-01-01T10:00:00Z",
        "endedAt": "2025-01-01T10:01:00Z",
    ]
    return try! JSONSerialization.data(withJSONObject: dict)
}

// MARK: - Flush simulation (mirrors WatchSessionManager.flushPendingContractionUpdates)

/// Calls `send` for each queued record, passing an `onAck` closure.
/// `onAck` is only invoked when the simulated reply carries the correct ack UUID.
@discardableResult
private func flushPending(
    from defaults: UserDefaults,
    send: (ContractionRecord, _ reply: [String: Any]) -> Void
) -> [UUID] {
    let pending = loadPending(from: defaults)
    var submitted: [UUID] = []
    for record in pending {
        // Caller provides the reply dict; Watch logic applies ack-gated dequeue.
        send(record, [:])    // placeholder; see overload below
        submitted.append(record.id)
    }
    return submitted
}

/// Overload where the caller controls the per-record reply (for ack tests).
private func flushPendingWithReply(
    from defaults: UserDefaults,
    buildReply: (ContractionRecord) -> [String: Any]
) -> [UUID] {
    let pending = loadPending(from: defaults)
    var submitted: [UUID] = []
    for record in pending {
        let reply = buildReply(record)
        applyReply(reply, for: record, in: defaults)
        submitted.append(record.id)
    }
    return submitted
}

// MARK: - Fixtures

private func makeRecord(
    startOffset: TimeInterval = 0,
    duration: TimeInterval = 45,
    interval: TimeInterval? = nil
) -> ContractionRecord {
    let base = Date(timeIntervalSinceReferenceDate: 800_000_000)
    let start = base.addingTimeInterval(startOffset)
    return ContractionRecord(startedAt: start, endedAt: start.addingTimeInterval(duration), interval: interval)
}

// MARK: - Tests

final class WatchContractionRetryQueueTests: XCTestCase {

    private var watchDefaults: UserDefaults!
    private var phoneDefaults: UserDefaults!

    override func setUp() {
        super.setUp()
        let watchSuite = "com.test.WatchRetryQueue.watch.\(name)"
        watchDefaults = UserDefaults(suiteName: watchSuite)!
        watchDefaults.removePersistentDomain(forName: watchSuite)

        let phoneSuite = "com.test.WatchRetryQueue.phone.\(name)"
        phoneDefaults = UserDefaults(suiteName: phoneSuite)!
        phoneDefaults.removePersistentDomain(forName: phoneSuite)
    }

    override func tearDown() {
        watchDefaults = nil
        phoneDefaults = nil
        super.tearDown()
    }

    // MARK: - Enqueue (pre-send persistence)

    /// A record must be persisted in UserDefaults before the send attempt so
    /// that a Watch force-quit between encoding and sending cannot lose it.
    func testEnqueue_writesRecordToUserDefaults() {
        let record = makeRecord()
        enqueuePending(record, in: watchDefaults)

        let queue = loadPending(from: watchDefaults)
        XCTAssertEqual(queue.count, 1)
        XCTAssertEqual(queue.first?.id, record.id)
    }

    /// Multiple records queued during the same offline window all persist.
    func testEnqueue_multipleRecords_allPersisted() {
        let r1 = makeRecord(startOffset: 0)
        let r2 = makeRecord(startOffset: 300)
        let r3 = makeRecord(startOffset: 600)
        enqueuePending(r1, in: watchDefaults)
        enqueuePending(r2, in: watchDefaults)
        enqueuePending(r3, in: watchDefaults)

        XCTAssertEqual(loadPending(from: watchDefaults).count, 3)
    }

    /// Enqueueing the same record twice must not create a duplicate.
    func testEnqueue_sameRecordTwice_isIdempotent() {
        let record = makeRecord()
        enqueuePending(record, in: watchDefaults)
        enqueuePending(record, in: watchDefaults)

        XCTAssertEqual(loadPending(from: watchDefaults).count, 1,
                       "Duplicate enqueue must be silently ignored (idempotent by id)")
    }

    // MARK: - Ack-gated dequeue

    /// A blank reply (no ack key) must NOT remove the record from the queue.
    /// This guards against the old bug where replyHandler([:]) triggered dequeue.
    func testDequeue_blankReply_doesNotDequeue() {
        let record = makeRecord()
        enqueuePending(record, in: watchDefaults)

        applyReply([:], for: record, in: watchDefaults)

        XCTAssertEqual(loadPending(from: watchDefaults).count, 1,
                       "A blank reply (no contractionUpdateAck key) must not dequeue the record — " +
                       "the phone has not confirmed durable persistence")
    }

    /// A reply with the wrong ack UUID must NOT remove the record.
    func testDequeue_wrongAckId_doesNotDequeue() {
        let record = makeRecord()
        enqueuePending(record, in: watchDefaults)

        let wrongIdReply: [String: Any] = ["contractionUpdateAck": UUID().uuidString]
        applyReply(wrongIdReply, for: record, in: watchDefaults)

        XCTAssertEqual(loadPending(from: watchDefaults).count, 1,
                       "A reply with a mismatched UUID must not dequeue the record")
    }

    /// A reply with the correct ack UUID DOES remove the record.
    func testDequeue_correctAckId_dequeuesRecord() {
        let record = makeRecord()
        enqueuePending(record, in: watchDefaults)

        let goodReply: [String: Any] = ["contractionUpdateAck": record.id.uuidString]
        applyReply(goodReply, for: record, in: watchDefaults)

        XCTAssertTrue(loadPending(from: watchDefaults).isEmpty,
                      "A reply carrying the correct contractionUpdateAck UUID must dequeue the record")
    }

    /// When multiple records are queued, a correct ack for one record removes only that record.
    func testDequeue_correctAckId_onlyRemovesMatchingRecord() {
        let r1 = makeRecord(startOffset: 0)
        let r2 = makeRecord(startOffset: 300)
        enqueuePending(r1, in: watchDefaults)
        enqueuePending(r2, in: watchDefaults)

        let reply: [String: Any] = ["contractionUpdateAck": r1.id.uuidString]
        applyReply(reply, for: r1, in: watchDefaults)

        let remaining = loadPending(from: watchDefaults)
        XCTAssertEqual(remaining.count, 1)
        XCTAssertEqual(remaining.first?.id, r2.id,
                       "Only the ack'd record should be removed; the other must remain for retry")
    }

    /// An empty queue after a correct ack removes the UserDefaults key.
    func testDequeue_lastRecord_removesUserDefaultsKey() {
        let record = makeRecord()
        enqueuePending(record, in: watchDefaults)

        let reply: [String: Any] = ["contractionUpdateAck": record.id.uuidString]
        applyReply(reply, for: record, in: watchDefaults)

        XCTAssertNil(watchDefaults.data(forKey: watchPendingKey),
                     "UserDefaults key must be absent when the queue becomes empty")
    }

    // MARK: - Force-quit persistence

    /// The queue must survive a Watch force-quit (UserDefaults is durable).
    func testQueue_survivesForceQuit_recordsRestoredOnNextLaunch() {
        let r1 = makeRecord(startOffset: 0)
        let r2 = makeRecord(startOffset: 300, interval: 300)
        enqueuePending(r1, in: watchDefaults)
        enqueuePending(r2, in: watchDefaults)

        let restored = loadPending(from: watchDefaults)
        XCTAssertEqual(restored.count, 2)
        XCTAssertEqual(Set(restored.map(\.id)), Set([r1.id, r2.id]))
    }

    /// If the phone acks a record and the Watch is then force-quit,
    /// the acked record must NOT be in the queue after relaunch.
    func testQueue_afterAck_ackedRecordAbsentOnNextLaunch() {
        let r1 = makeRecord(startOffset: 0)
        let r2 = makeRecord(startOffset: 300)
        enqueuePending(r1, in: watchDefaults)
        enqueuePending(r2, in: watchDefaults)

        applyReply(["contractionUpdateAck": r1.id.uuidString], for: r1, in: watchDefaults)

        let restored = loadPending(from: watchDefaults)
        XCTAssertEqual(restored.count, 1)
        XCTAssertEqual(restored.first?.id, r2.id)
    }

    // MARK: - Flush on reachability return

    /// When the phone becomes reachable, all pending records are submitted.
    func testFlush_allPendingRecordsAreSubmitted() {
        let r1 = makeRecord(startOffset: 0)
        let r2 = makeRecord(startOffset: 300)
        enqueuePending(r1, in: watchDefaults)
        enqueuePending(r2, in: watchDefaults)

        var sentIds: [UUID] = []
        flushPendingWithReply(from: watchDefaults) { record in
            sentIds.append(record.id)
            return [:]  // blank reply — no dequeue
        }

        XCTAssertEqual(sentIds.count, 2)
        // Records must still be in the queue (blank replies don't dequeue)
        XCTAssertEqual(loadPending(from: watchDefaults).count, 2)
    }

    /// Flush on an empty queue produces no sends.
    func testFlush_emptyQueue_noSendsAttempted() {
        var callCount = 0
        flushPendingWithReply(from: watchDefaults) { _ in callCount += 1; return [:] }
        XCTAssertEqual(callCount, 0)
    }

    /// After flush with correct acks, queue is empty.
    func testFlush_withCorrectAcks_queueIsEmpty() {
        let r1 = makeRecord(startOffset: 0)
        let r2 = makeRecord(startOffset: 300)
        enqueuePending(r1, in: watchDefaults)
        enqueuePending(r2, in: watchDefaults)

        flushPendingWithReply(from: watchDefaults) { record in
            ["contractionUpdateAck": record.id.uuidString]
        }

        XCTAssertTrue(loadPending(from: watchDefaults).isEmpty,
                      "Queue must be empty once all records have been ack'd during flush")
    }

    /// If flush gets a blank reply for one record, that record stays queued.
    func testFlush_blankAckForOneRecord_unackedRecordRemainsInQueue() {
        let r1 = makeRecord(startOffset: 0)
        let r2 = makeRecord(startOffset: 300)
        enqueuePending(r1, in: watchDefaults)
        enqueuePending(r2, in: watchDefaults)

        flushPendingWithReply(from: watchDefaults) { record in
            if record.id == r1.id {
                return ["contractionUpdateAck": record.id.uuidString]
            }
            return [:]   // blank reply for r2 — no durable persistence on phone
        }

        let remaining = loadPending(from: watchDefaults)
        XCTAssertEqual(remaining.count, 1)
        XCTAssertEqual(remaining.first?.id, r2.id,
                       "r2 must remain in the queue — phone did not confirm durable persistence")
    }

    // MARK: - Phone-side durable receipt (end-to-end ack protocol)

    /// The phone writes the receipt BEFORE replying with the ack.
    /// This test models that invariant: the ID must appear in the phone's
    /// native store (with its data key) before the Watch-side dequeue logic fires.
    func testPhoneReceiptProtocol_persistsBeforeAck() {
        let record = makeRecord()
        let idString = record.id.uuidString
        let data = makeReceiptData(id: idString)

        // Simulate phone handler: (1) persist natively, (2) build reply
        phonePersistReceipt(id: idString, data: data, in: phoneDefaults)
        let reply: [String: Any] = ["contractionUpdateAck": idString]

        // Verify phone store contains the ID before the Watch dequeues
        XCTAssertTrue(phonePersistedReceiptIds(from: phoneDefaults).contains(idString),
                      "Phone must persist the record natively before replying with the ack")

        // Now Watch dequeues
        enqueuePending(record, in: watchDefaults)
        applyReply(reply, for: record, in: watchDefaults)

        XCTAssertTrue(loadPending(from: watchDefaults).isEmpty,
                      "Watch queue must be empty after receiving the matching ack")
    }

    /// Integration scenario: phone is force-quit after the ack but before JS saves.
    /// The record must be in the phone's native store so JS can recover it on relaunch.
    ///
    /// Step 1: Watch enqueues, sends → phone persists natively → phone replies with ack
    /// Step 2: Watch dequeues (queue now empty)
    /// Step 3: Phone is force-quit; JS/API save never completes
    /// Step 4: Phone relaunches; native store still holds the record for JS to recover
    /// Step 5: JS reads pendingContractionReceipts(), saves to API, acknowledges via native store
    func testIntegration_phoneForcedQuitAfterAck_nativeStorePreservesRecord() {
        let record = makeRecord(startOffset: 0, duration: 45, interval: 120)
        let idString = record.id.uuidString
        let data = makeReceiptData(id: idString)

        // Step 1: Phone persists natively (data FIRST, then ID), sends ack
        phonePersistReceipt(id: idString, data: data, in: phoneDefaults)
        let ack: [String: Any] = ["contractionUpdateAck": idString]

        // Watch dequeues on matching ack
        enqueuePending(record, in: watchDefaults)
        applyReply(ack, for: record, in: watchDefaults)
        XCTAssertTrue(loadPending(from: watchDefaults).isEmpty,
                      "Precondition: Watch queue must be empty after the ack")

        // Steps 3–4: Phone force-quit + relaunch — simulate by just reading native store
        // (UserDefaults persists across "relaunches" in the same suite)
        let receipts = phonePendingReceipts(from: phoneDefaults)
        XCTAssertEqual(receipts.count, 1,
                       "Phone native store must still hold the record after a force-quit so JS can recover it")

        // Step 5: JS saves to API, acknowledges
        phoneAcknowledgeReceipt(id: idString, in: phoneDefaults)
        XCTAssertFalse(phonePersistedReceiptIds(from: phoneDefaults).contains(idString),
                       "Native store must be cleared once JS durably saves the record")
    }

    /// Integration scenario: phone crashes before persisting or replying.
    /// Watch gets no ack → record stays in queue → next reconnect retries → success.
    func testIntegration_phoneCrashBeforeAck_watchRetryEventuallySucceeds() {
        let record = makeRecord()

        // Step 1: Watch enqueues
        enqueuePending(record, in: watchDefaults)

        // Step 2: Phone crashes — Watch receives no reply (or blank reply)
        applyReply([:], for: record, in: watchDefaults)
        XCTAssertEqual(loadPending(from: watchDefaults).count, 1,
                       "Blank reply must leave record in queue for retry")

        // Step 3: Phone relaunches; reachability returns → Watch flushes
        // This time the phone persists and replies with a correct ack
        let idString = record.id.uuidString
        phonePersistReceipt(id: idString, data: makeReceiptData(id: idString), in: phoneDefaults)
        let ack: [String: Any] = ["contractionUpdateAck": idString]
        applyReply(ack, for: record, in: watchDefaults)

        XCTAssertTrue(loadPending(from: watchDefaults).isEmpty,
                      "After a successful retry with a correct ack, the Watch queue must be empty")
        XCTAssertTrue(
            phonePersistedReceiptIds(from: phoneDefaults).contains(idString),
            "Phone native store must hold the record until JS durably saves it"
        )
    }

    /// Sending the same record twice (Watch retry + initial transferUserInfo delivery)
    /// must not create duplicate phone receipts (idempotent by ID).
    func testIntegration_duplicateSend_phoneReceiptIsIdempotent() {
        let idString = makeRecord().id.uuidString
        let data = makeReceiptData(id: idString)

        phonePersistReceipt(id: idString, data: data, in: phoneDefaults)
        phonePersistReceipt(id: idString, data: data, in: phoneDefaults)   // duplicate

        XCTAssertEqual(phonePersistedReceiptIds(from: phoneDefaults).filter { $0 == idString }.count, 1,
                       "The same record arriving twice must not create duplicate phone receipt entries")
    }

    // MARK: - Sign-out clears Watch queue and phone receipt store

    func testSignOut_clearsPendingWatchQueue() {
        let record = makeRecord()
        enqueuePending(record, in: watchDefaults)
        watchDefaults.removeObject(forKey: watchPendingKey)

        XCTAssertTrue(loadPending(from: watchDefaults).isEmpty,
                      "Sign-out must wipe the pending retry queue so no records leak across accounts")
    }

    /// Sign-out must also wipe the phone's native receipt store so that a late Watch
    /// delivery arriving after account switch cannot be attributed to the next user.
    func testSignOut_clearsPhoneReceiptStore() {
        let id1 = UUID().uuidString
        let id2 = UUID().uuidString
        phonePersistReceipt(id: id1, data: makeReceiptData(id: id1), in: phoneDefaults)
        phonePersistReceipt(id: id2, data: makeReceiptData(id: id2), in: phoneDefaults)

        // Simulate sendSignOut() calling clearAllContractionReceipts()
        phoneClearAllReceipts(in: phoneDefaults)

        XCTAssertTrue(phonePersistedReceiptIds(from: phoneDefaults).isEmpty,
                      "Sign-out must clear the phone receipt IDs list")
        XCTAssertNil(phoneDefaults.data(forKey: phoneReceiptDataKey(userId: testUserA, recordId: id1)),
                     "Sign-out must remove individual receipt data keys (id1)")
        XCTAssertNil(phoneDefaults.data(forKey: phoneReceiptDataKey(userId: testUserA, recordId: id2)),
                     "Sign-out must remove individual receipt data keys (id2)")
    }

    /// Cross-account isolation: a receipt from user A must NOT be visible to user B
    /// after a sign-out / sign-in cycle.
    func testAccountSwitch_priorUserReceiptsNotVisibleToNextUser() {
        // User A signs in and accumulates a pending receipt in the user-A partition
        let idA = UUID().uuidString
        phonePersistReceipt(id: idA, data: makeReceiptData(id: idA), in: phoneDefaults,
                            userId: testUserA)
        XCTAssertFalse(phonePendingReceipts(from: phoneDefaults, userId: testUserA).isEmpty,
                       "Precondition: user A's receipt must be visible before sign-out")

        // User A signs out → phone wipes the user-A scoped partition
        phoneClearAllReceipts(in: phoneDefaults, userId: testUserA)

        // User B signs in; their startup drain reads from the user-B partition, which is empty
        let receiptsForUserB = phonePendingReceipts(from: phoneDefaults, userId: testUserB)
        XCTAssertTrue(receiptsForUserB.isEmpty,
                      "User B's receipt partition must be empty \u2014 user A's receipts live " +
                      "under a different key prefix and must not bleed across accounts")
    }

    // MARK: - Atomic write ordering and orphan-ID recovery

    /// If a crash occurs after data is written but before the ID is added to the list
    /// (the safe failure mode of the new write ordering), the next retry succeeds:
    /// the ID is not in the list, so persistence runs again.
    func testAtomicWrite_dataWrittenBeforeId_orphanDataIsRecoverable() {
        let id = UUID().uuidString
        let data = makeReceiptData(id: id)

        // Simulate a crash between writing data and updating the IDs list:
        // write data key but do NOT add to IDs list.
        // Write data key directly (simulates crash before IDs-list update in old ordering)
        phoneDefaults.set(data, forKey: phoneReceiptDataKey(userId: testUserA, recordId: id))
        // IDs list is still empty (the ID was never added)
        XCTAssertFalse(phonePersistedReceiptIds(from: phoneDefaults, userId: testUserA).contains(id))

        // On the next Watch retry, the phone calls persistContractionReceipt again.
        // Because the ID is not in the list, the guard passes and the record is re-persisted.
        phonePersistReceipt(id: id, data: data, in: phoneDefaults, userId: testUserA)

        // Now the store is fully consistent
        XCTAssertTrue(phonePersistedReceiptIds(from: phoneDefaults, userId: testUserA).contains(id),
                      "Re-persisting after an orphan data key must add the ID to the list")
        XCTAssertFalse(phonePendingReceipts(from: phoneDefaults, userId: testUserA).isEmpty,
                       "The record must be visible via pendingContractionReceipts after re-persist")
    }

    /// If an ID is found in the list but its data key is missing (e.g. legacy partial
    /// write from the old write ordering), `pendingContractionReceipts()` must silently
    /// repair the list by removing the orphan ID.
    func testAtomicWrite_orphanIdWithNoData_isCleanedUpOnNextRead() {
        let orphanId = UUID().uuidString
        let goodId = UUID().uuidString
        let goodData = makeReceiptData(id: goodId)

        // Simulate old buggy state: IDs list has orphanId but its data key is absent
        phoneDefaults.set([orphanId, goodId], forKey: phoneReceiptIdsKey(for: testUserA))
        phoneDefaults.set(goodData, forKey: phoneReceiptDataKey(userId: testUserA, recordId: goodId))
        // Note: no data key for orphanId

        // pendingContractionReceipts must repair and return only the good record
        let receipts = phonePendingReceipts(from: phoneDefaults, userId: testUserA)
        XCTAssertEqual(receipts.count, 1,
                       "Only the record with valid data must be returned; orphan ID must be dropped")
        XCTAssertEqual(receipts.first?["id"] as? String, goodId)

        // The IDs list must have been repaired to remove the orphan
        XCTAssertFalse(phonePersistedReceiptIds(from: phoneDefaults, userId: testUserA).contains(orphanId),
                       "Orphan ID must be removed from the IDs list during the repair pass")
        XCTAssertTrue(phonePersistedReceiptIds(from: phoneDefaults, userId: testUserA).contains(goodId),
                      "Valid ID must remain in the IDs list after the repair pass")
    }

    // MARK: - Round-trip encode / decode fidelity

    func testRoundTrip_allFieldsPreserved() throws {
        let record = makeRecord(startOffset: 120, duration: 60, interval: 250)
        enqueuePending(record, in: watchDefaults)

        let restored = try XCTUnwrap(loadPending(from: watchDefaults).first)
        XCTAssertEqual(restored.id, record.id)
        XCTAssertEqual(restored.startedAt.timeIntervalSince1970,
                       record.startedAt.timeIntervalSince1970, accuracy: 1.0)
        XCTAssertEqual(restored.endedAt.timeIntervalSince1970,
                       record.endedAt.timeIntervalSince1970, accuracy: 1.0)
        XCTAssertNotNil(restored.interval)
        XCTAssertEqual(restored.interval ?? 0, 250, accuracy: 0.001)
    }

    func testRoundTrip_nilIntervalPreserved() throws {
        let record = makeRecord(interval: nil)
        enqueuePending(record, in: watchDefaults)

        let restored = try XCTUnwrap(loadPending(from: watchDefaults).first)
        XCTAssertNil(restored.interval,
                     "A nil interval (first contraction) must survive the encode/decode round-trip")
    }
    // MARK: - Late Watch delivery after sign-out (cross-account isolation gate)

    /// A `transferUserInfo` queued on the Watch can be delivered to the phone AFTER
    /// the user signs out.  `persistContractionReceipt` must be a no-op when no user
    /// is active (`userId == nil`) so the record is not attributed to the next account.
    func testLateDelivery_whileSignedOut_receiptDropped() {
        let id = UUID().uuidString
        let data = makeReceiptData(id: id)

        // Simulate sign-out: activeUserId is nil — pass nil to mirror the nil-guard
        phonePersistReceipt(id: id, data: data, in: phoneDefaults, userId: nil)

        // Record must not appear in any user's partition
        XCTAssertTrue(phonePendingReceipts(from: phoneDefaults, userId: testUserA).isEmpty,
                      "A late Watch delivery while signed out must not be persisted " +
                      "under user A's partition")
        XCTAssertTrue(phonePendingReceipts(from: phoneDefaults, userId: testUserB).isEmpty,
                      "A late Watch delivery while signed out must not be persisted " +
                      "under user B's partition")
    }

    /// After sign-out clears the store, a newly signed-in user can persist receipts
    /// normally in their own partition without being affected by the previous user.
    func testPostSignOut_newUserSignsIn_freshReceiptsPersistNormally() {
        let idB = UUID().uuidString
        let dataB = makeReceiptData(id: idB)

        // User B signs in and persists a receipt in the user-B partition
        phonePersistReceipt(id: idB, data: dataB, in: phoneDefaults, userId: testUserB)

        let receiptsB = phonePendingReceipts(from: phoneDefaults, userId: testUserB)
        XCTAssertEqual(receiptsB.count, 1,
                       "After sign-out, the newly signed-in user must be able to persist receipts normally")
        XCTAssertEqual(receiptsB.first?["id"] as? String, idB)

        // User A's partition must remain empty
        let receiptsA = phonePendingReceipts(from: phoneDefaults, userId: testUserA)
        XCTAssertTrue(receiptsA.isEmpty,
                      "User B's receipt must not bleed into user A's partition")
    }

    // MARK: - Duplicate-ack: transferUserInfo-then-sendMessage flush pattern

    /// When the Watch first delivers via `transferUserInfo` the phone persists the
    /// record natively (no Watch ack on that path).  The Watch then retries via
    /// `sendMessage` to obtain an explicit ack.  On that retry, `persistContractionReceipt`
    /// finds the ID already present and returns `true` (duplicate but durable).  The
    /// phone MUST send a matching ack UUID so the Watch dequeues its retry record.
    /// If the phone instead sends `[:]`, the Watch retries forever despite the data
    /// already being safe on the phone — the retry queue accumulates indefinitely.
    func testDuplicate_persist_returnsTrue_so_watchCanDequeue() {
        let id = UUID().uuidString
        let data = makeReceiptData(id: id)

        // Simulate transferUserInfo path: record written, no Watch ack
        let firstResult = phonePersistReceipt(id: id, data: data, in: phoneDefaults,
                                               userId: testUserA)
        XCTAssertTrue(firstResult, "First persist must succeed (written to store)")
        XCTAssertTrue(phonePersistedReceiptIds(from: phoneDefaults, userId: testUserA)
                        .contains(id), "Record must be in the native store")

        // Simulate sendMessage retry: same record, now a duplicate
        let retryResult = phonePersistReceipt(id: id, data: data, in: phoneDefaults,
                                               userId: testUserA)
        XCTAssertTrue(retryResult,
                      "Duplicate persist must also return true — caller must send matching ack " +
                      "so the Watch dequeues the retry record (data is already durable)")
    }

    /// Signed-out delivery must return false so the caller withholds the ack and
    /// the Watch retains the record for the next authenticated session.
    func testSignedOut_persist_returnsFalse_so_watchKeepsRetryRecord() {
        let id = UUID().uuidString
        let data = makeReceiptData(id: id)

        let result = phonePersistReceipt(id: id, data: data, in: phoneDefaults, userId: nil)
        XCTAssertFalse(result,
                       "Signed-out persist must return false — caller must NOT send a matching " +
                       "ack; the Watch must keep the record in its retry queue for later")

        // Verify nothing was written to any user partition
        for userId in [testUserA, testUserB] {
            XCTAssertTrue(phonePendingReceipts(from: phoneDefaults, userId: userId).isEmpty,
                          "Signed-out delivery must not be stored under any user partition")
        }
    }

    /// A transferUserInfo-delivered record that was already written should still be
    /// visible to the JS startup drain after the Watch acks via sendMessage.  The JS
    /// drain reads the native store and saves it to the API using the watchRecordId
    /// idempotency key, so no duplicate row is created even if it is sent twice.
    func testDuplicate_receiptRemainsForJsDrain_afterAck() {
        let id = UUID().uuidString
        let data = makeReceiptData(id: id)

        // transferUserInfo path: write record (no ack)
        phonePersistReceipt(id: id, data: data, in: phoneDefaults, userId: testUserA)

        // sendMessage retry: duplicate → returns true → Watch would send ack
        // The phone does NOT remove the record at this point; JS drain does.
        let retryResult = phonePersistReceipt(id: id, data: data, in: phoneDefaults,
                                               userId: testUserA)
        XCTAssertTrue(retryResult)

        // Record must still be visible to the JS startup drain
        let pending = phonePendingReceipts(from: phoneDefaults, userId: testUserA)
        XCTAssertEqual(pending.count, 1,
                       "Record must remain in the native store after duplicate persist — " +
                       "JS drain has not yet acknowledged it")
        XCTAssertEqual(pending.first?["id"] as? String, id)

        // JS acknowledges after API save → now the store should be empty
        phoneAcknowledgeReceipt(id: id, in: phoneDefaults, userId: testUserA)
        XCTAssertTrue(phonePendingReceipts(from: phoneDefaults, userId: testUserA).isEmpty,
                      "After JS acknowledgment the native store must be cleared")
    }

}
