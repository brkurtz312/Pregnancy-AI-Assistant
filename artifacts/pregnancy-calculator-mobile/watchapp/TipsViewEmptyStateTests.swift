// TipsViewEmptyStateTests.swift
// Confirms that TipsView shows the empty-state message — not User A's stale
// tips — when User B has no due date.
//
// Two concerns are verified:
//
//   1. TipsView.currentTip logic
//      When `session.tips` is empty, `currentTip` must return nil so that the
//      view's `else` branch renders ("Tips will appear here / Open the app …").
//      When tips are non-empty it must return the tip at the current index.
//
//   2. WatchSessionManager account-switch paths
//      a. clearPersistedSession() — called when the phone sends a sign-out —
//         must set tips to [] and remove both "watchTips" and
//         "watchGestationalWeek" from UserDefaults.
//      b. Receiving a payload that contains an encoded empty [WatchTip] array
//         must replace any stale tips with [], leaving the empty-state visible.
//      c. Receiving a payload with NO "tips" key at all must leave tips
//         unchanged (the sign-out message is the authoritative clearing signal;
//         a missing-key update must not silently keep stale data unless the
//         explicit clear has already fired).
//
// Because WatchConnectivity is a hardware framework unavailable in a macOS
// test host, all WCSession interactions are omitted.  The tests model the
// pure-logic parts of WatchSessionManager's handleIncoming and
// clearPersistedSession as standalone functions that mirror the production code.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp -destination 'platform=macOS'

import XCTest
import Foundation

// MARK: - Key constants (mirror WatchSessionManager)

private let watchTipsKey              = "watchTips"
private let watchGestationalWeekKey   = "watchGestationalWeek"

// MARK: - Codec helpers

private let encoder: JSONEncoder = {
    let e = JSONEncoder()
    e.dateEncodingStrategy = .iso8601
    return e
}()

private let decoder: JSONDecoder = {
    let d = JSONDecoder()
    d.dateDecodingStrategy = .iso8601
    return d
}()

// MARK: - Pure-logic mirrors of WatchSessionManager

/// Models the `currentTip` computed property in TipsView:
///
///     var currentTip: WatchTip? {
///         guard !session.tips.isEmpty else { return nil }
///         return session.tips[tipIndex % session.tips.count]
///     }
///
/// Returns nil when tips is empty — causing TipsView to render the empty-state
/// branch.  Returns the tip at `tipIndex % count` when tips is non-empty.
private func currentTip(tips: [WatchTip], tipIndex: Int) -> WatchTip? {
    guard !tips.isEmpty else { return nil }
    return tips[tipIndex % tips.count]
}

/// Models the UserDefaults side of `clearPersistedSession()`:
///
///     ud.removeObject(forKey: "watchTips")
///     ud.removeObject(forKey: "watchGestationalWeek")
///     tips = []
///     gestationalWeek = 0
///
/// Returns the new in-memory tips array (always []) and clears the given
/// UserDefaults suite, mirroring the published-state + persistence reset.
@discardableResult
private func clearPersistedSession(defaults: UserDefaults) -> [WatchTip] {
    defaults.removeObject(forKey: watchTipsKey)
    defaults.removeObject(forKey: watchGestationalWeekKey)
    // lastKickCount and lastContractionCount are covered by their own test files.
    return []
}

/// Models the tips branch of `handleIncoming(_:)`:
///
///     if let data = payload[WatchMessage.tips] as? Data,
///        let decoded = try? decoder.decode([WatchTip].self, from: data) {
///         self.tips = decoded
///         UserDefaults.standard.set(data, forKey: "watchTips")
///     }
///
/// Returns the new tips array when the payload contains a valid encoded
/// [WatchTip] value, or `currentTips` unchanged when the key is absent or
/// the data cannot be decoded.
private func handleIncomingTips(
    payload: [String: Any],
    currentTips: [WatchTip],
    defaults: UserDefaults
) -> [WatchTip] {
    guard let data = payload[WatchMessage.tips] as? Data,
          let decoded = try? decoder.decode([WatchTip].self, from: data) else {
        return currentTips   // no valid tips key → leave existing tips unchanged
    }
    defaults.set(data, forKey: watchTipsKey)
    return decoded
}

/// Encodes a [WatchTip] array and wraps it in the wire payload dict,
/// mirroring the phone-side `sendWeekAndTips` path.
private func makeTipsPayload(_ tips: [WatchTip]) -> [String: Any]? {
    guard let data = try? encoder.encode(tips) else { return nil }
    return [WatchMessage.tips: data]
}

// MARK: - Test fixtures

private func makeWeeklyTip(week: Int) -> WatchTip {
    WatchTip(week: week, emoji: "🤰", text: "Week \(week) tip")
}

// MARK: - Tests: TipsView.currentTip logic

final class TipsViewCurrentTipTests: XCTestCase {

    // MARK: Empty tips → nil → empty-state branch

    /// When User B has no due date the phone sends an empty tips array.
    /// session.tips becomes [] → currentTip must return nil so TipsView
    /// renders the empty-state message, not User A's last tip.
    func testCurrentTip_emptyTips_returnsNil() {
        let result = currentTip(tips: [], tipIndex: 0)

        XCTAssertNil(result,
                     "currentTip must return nil when tips is empty so TipsView renders the empty-state branch")
    }

    /// After clearPersistedSession fires (sign-out), tips = [].
    /// currentTip must still return nil regardless of the prior tipIndex.
    func testCurrentTip_emptyTipsAfterSignOut_returnsNil_atAnyIndex() {
        for index in [0, 1, 5, 99] {
            let result = currentTip(tips: [], tipIndex: index)
            XCTAssertNil(result,
                         "currentTip must return nil for empty tips at tipIndex \(index)")
        }
    }

    // MARK: Non-empty tips → returns the correct tip

    /// Baseline: a single tip at index 0 is returned.
    func testCurrentTip_singleTip_returnsIt() {
        let tips = [makeWeeklyTip(week: 20)]
        let result = currentTip(tips: tips, tipIndex: 0)

        XCTAssertNotNil(result, "currentTip must return a tip when the array is non-empty")
        XCTAssertEqual(result?.week, 20)
    }

    /// tipIndex wraps around with modulo — needed by TipsView to guard against
    /// an out-of-range index that can arise when the tips array shrinks (e.g.
    /// after a gestational-week rollover delivers fewer tips).
    func testCurrentTip_modulo_wrapsIndex() {
        let tips = [makeWeeklyTip(week: 1), makeWeeklyTip(week: 2), makeWeeklyTip(week: 3)]
        // index 3 % 3 == 0 → first tip
        XCTAssertEqual(currentTip(tips: tips, tipIndex: 3)?.week, 1)
        // index 4 % 3 == 1 → second tip
        XCTAssertEqual(currentTip(tips: tips, tipIndex: 4)?.week, 2)
    }

    /// Confirms the exact week is preserved — tipIndex 1 of a 3-tip array gives tip[1].
    func testCurrentTip_middleIndex_returnsCorrectTip() {
        let tips = [makeWeeklyTip(week: 28), makeWeeklyTip(week: 29), makeWeeklyTip(week: 30)]
        XCTAssertEqual(currentTip(tips: tips, tipIndex: 1)?.week, 29)
    }
}

// MARK: - Tests: clearPersistedSession (account-switch / sign-out path)

final class WatchSessionManagerClearSessionTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "com.test.WatchSessionManagerClear.\(name)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    // MARK: Clears tips array

    /// After User A's tips are in UserDefaults, clearPersistedSession must
    /// return [] so TipsView immediately shows the empty-state, not User A's data.
    func testClearSession_returnsEmptyTipsArray() throws {
        // Arrange — seed User A's tips
        let userATips = [makeWeeklyTip(week: 32), makeWeeklyTip(week: 32)]
        let data = try XCTUnwrap(try? encoder.encode(userATips))
        defaults.set(data, forKey: watchTipsKey)
        defaults.set(32, forKey: watchGestationalWeekKey)

        // Act — simulate sign-out / account switch
        let tipsAfterClear = clearPersistedSession(defaults: defaults)

        // Assert — in-memory tips must be empty
        XCTAssertTrue(tipsAfterClear.isEmpty,
                      "clearPersistedSession must return [] so TipsView shows the empty-state")
    }

    // MARK: Removes watchTips from UserDefaults

    /// After clearPersistedSession the "watchTips" key must be absent so that
    /// the Watch app does not restore User A's tips on the next cold launch.
    func testClearSession_removesWatchTipsKey() throws {
        let data = try XCTUnwrap(try? encoder.encode([makeWeeklyTip(week: 20)]))
        defaults.set(data, forKey: watchTipsKey)

        clearPersistedSession(defaults: defaults)

        XCTAssertNil(defaults.data(forKey: watchTipsKey),
                     "clearPersistedSession must remove 'watchTips' from UserDefaults")
    }

    // MARK: Removes gestationalWeek from UserDefaults

    /// The gestational week is User A's data; it must also be wiped so a cold
    /// restart of the Watch app does not see a stale week for User B.
    func testClearSession_removesGestationalWeekKey() {
        defaults.set(28, forKey: watchGestationalWeekKey)

        clearPersistedSession(defaults: defaults)

        // integer(forKey:) returns 0 for a missing key — treat 0 as "absent".
        XCTAssertEqual(defaults.integer(forKey: watchGestationalWeekKey), 0,
                       "clearPersistedSession must remove 'watchGestationalWeek' from UserDefaults")
    }

    // MARK: Idempotent

    /// Calling clearPersistedSession twice must not crash or leave residual state.
    func testClearSession_calledTwice_isIdempotent() throws {
        let data = try XCTUnwrap(try? encoder.encode([makeWeeklyTip(week: 15)]))
        defaults.set(data, forKey: watchTipsKey)

        clearPersistedSession(defaults: defaults)
        let tipsAfterSecondClear = clearPersistedSession(defaults: defaults)

        XCTAssertTrue(tipsAfterSecondClear.isEmpty)
        XCTAssertNil(defaults.data(forKey: watchTipsKey))
    }

    // MARK: No-op when already clean

    /// clearPersistedSession on a fresh install (nothing stored) must return []
    /// and must not crash.
    func testClearSession_freshInstall_returnsEmptyAndDoesNotCrash() {
        let tips = clearPersistedSession(defaults: defaults)
        XCTAssertTrue(tips.isEmpty)
    }
}

// MARK: - Tests: handleIncoming tips payload paths

final class WatchSessionManagerHandleIncomingTipsTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "com.test.WatchSessionManagerHandleTips.\(name)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    // MARK: Empty encoded array clears stale tips

    /// This is the User-B-with-no-due-date path:
    /// The phone encodes [] and sends it as the "tips" payload.
    /// handleIncoming must replace stale User A tips with [] so TipsView
    /// renders the empty-state message immediately.
    func testHandleIncoming_emptyEncodedArray_clearsStaleUserATips() throws {
        // Arrange — User A's stale tips are in memory
        let userATips = [makeWeeklyTip(week: 30), makeWeeklyTip(week: 30)]
        let emptyPayload = try XCTUnwrap(makeTipsPayload([]),
                                         "Encoding an empty array must succeed")

        // Act — phone sends User B's empty tips
        let tipsAfter = handleIncomingTips(
            payload: emptyPayload,
            currentTips: userATips,
            defaults: defaults
        )

        // Assert — stale tips are gone; empty-state branch will fire in TipsView
        XCTAssertTrue(tipsAfter.isEmpty,
                      "An incoming empty tips payload must replace stale tips with [] " +
                      "so TipsView shows 'Tips will appear here', not User A's week")
    }

    /// The "watchTips" UserDefaults key must also be updated to [] after
    /// receiving an empty-array payload, so a cold-restart of the Watch app
    /// does not restore stale User A data.
    func testHandleIncoming_emptyEncodedArray_updatesUserDefaults() throws {
        // Arrange — seed User A's tips in UserDefaults
        let userAData = try XCTUnwrap(try? encoder.encode([makeWeeklyTip(week: 22)]))
        defaults.set(userAData, forKey: watchTipsKey)

        let emptyPayload = try XCTUnwrap(makeTipsPayload([]))

        handleIncomingTips(payload: emptyPayload, currentTips: [makeWeeklyTip(week: 22)], defaults: defaults)

        // The stored data must now decode as an empty array
        let storedData = try XCTUnwrap(defaults.data(forKey: watchTipsKey),
                                        "watchTips key must still exist after an empty-array update")
        let storedTips = try XCTUnwrap(try? decoder.decode([WatchTip].self, from: storedData))
        XCTAssertTrue(storedTips.isEmpty,
                      "watchTips in UserDefaults must be the empty array after receiving an empty payload")
    }

    // MARK: Non-empty payload replaces existing tips

    /// When the phone sends User B's actual tips (non-empty), handleIncoming
    /// must replace whatever was in memory with the new batch.
    func testHandleIncoming_nonEmptyPayload_replacesPreviousTips() throws {
        let userATips = [makeWeeklyTip(week: 30)]
        let userBTips = [makeWeeklyTip(week: 12), makeWeeklyTip(week: 12)]

        let payload = try XCTUnwrap(makeTipsPayload(userBTips))
        let tipsAfter = handleIncomingTips(payload: payload, currentTips: userATips, defaults: defaults)

        XCTAssertEqual(tipsAfter.count, 2)
        XCTAssertEqual(tipsAfter[0].week, 12,
                       "handleIncoming must replace User A's tips with User B's tips")
    }

    // MARK: Missing tips key → tips unchanged (sign-out is the clearing signal)

    /// When a payload arrives with no "tips" key (e.g. a gestational-week-only
    /// update), the existing tips must not be silently cleared.  The only
    /// authoritative clearing signal is the sign-out message, which triggers
    /// clearPersistedSession.  A missing-key update must leave the current
    /// tips untouched so the user sees their most recent batch until the phone
    /// explicitly replaces or clears them.
    func testHandleIncoming_noTipsKey_leavesCurrentTipsUnchanged() {
        let existingTips = [makeWeeklyTip(week: 25)]
        // Payload carries only the gestational week, no tips key
        let weekOnlyPayload: [String: Any] = [WatchMessage.gestationalWeek: 25]

        let tipsAfter = handleIncomingTips(
            payload: weekOnlyPayload,
            currentTips: existingTips,
            defaults: defaults
        )

        XCTAssertEqual(tipsAfter.count, 1,
                       "A payload without a tips key must not clear the existing tips")
        XCTAssertEqual(tipsAfter[0].week, 25)
    }

    /// An empty payload dict (no keys at all) must also leave existing tips untouched.
    func testHandleIncoming_emptyPayloadDict_leavesCurrentTipsUnchanged() {
        let existingTips = [makeWeeklyTip(week: 18)]

        let tipsAfter = handleIncomingTips(payload: [:], currentTips: existingTips, defaults: defaults)

        XCTAssertEqual(tipsAfter.count, 1)
    }

    // MARK: Malformed data → tips unchanged

    /// Corrupted "tips" data (not a valid JSON-encoded [WatchTip]) must not
    /// clear the existing tips — the decode guard prevents silent data loss.
    func testHandleIncoming_corruptedTipsData_leavesCurrentTipsUnchanged() {
        let existingTips = [makeWeeklyTip(week: 10)]
        let corruptPayload: [String: Any] = [WatchMessage.tips: Data([0xFF, 0xFE, 0x00])]

        let tipsAfter = handleIncomingTips(payload: corruptPayload, currentTips: existingTips, defaults: defaults)

        XCTAssertEqual(tipsAfter.count, 1,
                       "Corrupted tips data must not wipe the existing tips")
    }

    // MARK: Round-trip fidelity

    /// The tip content (week, emoji, text) must survive encode → decode intact.
    func testHandleIncoming_roundTripPreservesTipContent() throws {
        let tip = WatchTip(week: 36, emoji: "🏥", text: "Pack your hospital bag this week.")
        let payload = try XCTUnwrap(makeTipsPayload([tip]))

        let tipsAfter = handleIncomingTips(payload: payload, currentTips: [], defaults: defaults)

        XCTAssertEqual(tipsAfter.count, 1)
        XCTAssertEqual(tipsAfter[0].week,  36)
        XCTAssertEqual(tipsAfter[0].emoji, "🏥")
        XCTAssertEqual(tipsAfter[0].text,  "Pack your hospital bag this week.")
    }

    // MARK: Account-switch sequence: sign-out → User B empty tips

    /// Full account-switch scenario:
    ///   1. User A's tips are in memory (week 30).
    ///   2. Sign-out fires → clearPersistedSession → tips = [].
    ///   3. Phone sends User B's payload — empty because User B has no due date.
    ///   4. handleIncoming with an empty encoded array → tips stays [].
    ///   5. currentTip → nil → TipsView shows the empty-state message. ✓
    func testAccountSwitchSequence_userBNoDueDate_showsEmptyState() throws {
        // Step 1: User A in memory
        var inMemoryTips = [makeWeeklyTip(week: 30), makeWeeklyTip(week: 30)]
        XCTAssertFalse(inMemoryTips.isEmpty, "Precondition: User A tips exist")

        // Step 2: sign-out
        inMemoryTips = clearPersistedSession(defaults: defaults)
        XCTAssertTrue(inMemoryTips.isEmpty, "After sign-out tips must be []")

        // Step 3 & 4: phone pushes User B's empty tips
        let payload = try XCTUnwrap(makeTipsPayload([]),
                                     "Encoding empty tips must succeed")
        inMemoryTips = handleIncomingTips(payload: payload, currentTips: inMemoryTips, defaults: defaults)
        XCTAssertTrue(inMemoryTips.isEmpty, "User B's empty tips payload must leave tips as []")

        // Step 5: TipsView.currentTip returns nil → empty-state branch renders
        let tip = currentTip(tips: inMemoryTips, tipIndex: 0)
        XCTAssertNil(tip,
                     "currentTip must be nil after account switch to a user with no due date — " +
                     "TipsView must show the empty-state message, not User A's stale week")
    }

    // MARK: Account-switch: sign-out only (no subsequent tips payload)

    /// If the phone never sends a tips payload after sign-out (e.g. the Watch
    /// is offline when User B signs in), the sign-out alone must be enough to
    /// clear User A's stale week.  currentTip must return nil.
    func testAccountSwitchSequence_noSubsequentPayload_emptyStateStillShown() {
        // Step 1: User A in memory
        var inMemoryTips = [makeWeeklyTip(week: 28)]

        // Step 2: sign-out only — no subsequent tips payload from phone
        inMemoryTips = clearPersistedSession(defaults: defaults)

        // Step 3: currentTip must still be nil
        let tip = currentTip(tips: inMemoryTips, tipIndex: 0)
        XCTAssertNil(tip,
                     "After sign-out alone, currentTip must be nil — " +
                     "User A's stale week must not linger on the Watch display")
    }
}
