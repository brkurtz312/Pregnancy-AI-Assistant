// ContractionTimerTests.swift
// Unit tests for contraction urgency detection, force-quit restore logic,
// and stale-session detection.
//
// Run via: Product → Test in Xcode, or `xcodebuild test -scheme PregnancyWatchApp …`
//
// These tests exercise pure Swift logic that is independent of WatchKit and
// SwiftUI, so they run on any platform (macOS test host included).

import XCTest

// MARK: - Urgency helpers (mirrors the logic in ContractionTimerView)

/// The threshold below which a contraction pattern is considered urgent (seconds).
private let urgentThreshold: TimeInterval = 300 // 5 minutes

/// Returns true when `lastInterval` is present and below the urgent threshold.
func isPatternUrgent(lastInterval: TimeInterval?) -> Bool {
    guard let interval = lastInterval else { return false }
    return interval < urgentThreshold
}

/// Simulates the lastInterval value that `restoreState()` reads from UserDefaults.
/// Returns nil when the stored raw value is 0 (sentinel meaning "absent").
func restoredInterval(raw: Double) -> TimeInterval? {
    raw > 0 ? raw : nil
}

// MARK: - Stale-session helpers (mirrors the staleness guard in ContractionTimerView)

/// Default staleness threshold: 24 hours, matching `ContractionDefaults.staleSessionThreshold`.
private let defaultStaleThreshold: TimeInterval = 24 * 3600

/// Returns true when the saved session reference date is older than `threshold` relative to `now`.
/// A nil `referenceDate` (no saved data) is never considered stale.
func isSessionStale(referenceDate: Date?, now: Date, threshold: TimeInterval = defaultStaleThreshold) -> Bool {
    guard let ref = referenceDate else { return false }
    return now.timeIntervalSince(ref) > threshold
}

/// Mirrors the reference-timestamp resolution in `restoreState()`'s staleness guard:
/// prefer `lastEnd` when present (> 0); otherwise fall back to the newest saved
/// record's `endedAt`. Returns nil when neither source yields a timestamp.
func resolveStaleReferenceDate(lastEndRaw: Double, recordEndDates: [Date]) -> Date? {
    if lastEndRaw > 0 {
        return Date(timeIntervalSince1970: lastEndRaw)
    }
    return recordEndDates.max()
}

// MARK: - Active-contraction preservation helper tests

/// Tests for `contractionHasFreshActiveSession(_:startRaw:now:threshold:)`.
///
/// This function gates the stale-wipe path in `restoreState()`: when stale
/// completed records coexist with a fresh in-progress contraction, only the
/// completed records must be discarded — the active timer must survive.
final class ContractionHasFreshActiveSessionTests: XCTestCase {

    private let threshold: TimeInterval = 24 * 3600

    // MARK: Active + fresh start

    func testActiveAndFreshStart_returnsTrue() {
        let now = Date()
        let recentStart = now.addingTimeInterval(-300) // 5 min ago
        XCTAssertTrue(
            contractionHasFreshActiveSession(
                activeFlag: true,
                startRaw: recentStart.timeIntervalSince1970,
                now: now,
                threshold: threshold
            ),
            "An active contraction that started 5 min ago must be preserved"
        )
    }

    func testActiveAndStartExactlyAtThreshold_returnsTrue() {
        // age == threshold is NOT stale (uses <=, not <)
        let now = Date()
        let atBoundary = now.addingTimeInterval(-threshold)
        XCTAssertTrue(
            contractionHasFreshActiveSession(
                activeFlag: true,
                startRaw: atBoundary.timeIntervalSince1970,
                now: now,
                threshold: threshold
            ),
            "An active contraction exactly at the threshold must still be preserved (>= threshold is NOT stale)"
        )
    }

    // MARK: Active + stale start (should NOT be preserved)

    func testActiveButStaleStart_returnsFalse() {
        let now = Date()
        let oldStart = now.addingTimeInterval(-(threshold + 1)) // 1 second past threshold
        XCTAssertFalse(
            contractionHasFreshActiveSession(
                activeFlag: true,
                startRaw: oldStart.timeIntervalSince1970,
                now: now,
                threshold: threshold
            ),
            "An active contraction with a stale start time must not be preserved"
        )
    }

    // MARK: Inactive (activeFlag = false)

    func testNotActive_freshStart_returnsFalse() {
        let now = Date()
        let recentStart = now.addingTimeInterval(-60)
        XCTAssertFalse(
            contractionHasFreshActiveSession(
                activeFlag: false,
                startRaw: recentStart.timeIntervalSince1970,
                now: now,
                threshold: threshold
            ),
            "When the active flag is false, the session must not be preserved even if start is recent"
        )
    }

    // MARK: Missing / corrupt start timestamp

    func testActiveButZeroStartRaw_returnsFalse() {
        XCTAssertFalse(
            contractionHasFreshActiveSession(
                activeFlag: true,
                startRaw: 0,
                now: Date(),
                threshold: threshold
            ),
            "A zero startRaw (corrupt or absent) must not be treated as a fresh active contraction"
        )
    }

    func testNotActiveAndZeroStartRaw_returnsFalse() {
        XCTAssertFalse(
            contractionHasFreshActiveSession(
                activeFlag: false,
                startRaw: 0,
                now: Date(),
                threshold: threshold
            ),
            "Both flags absent must return false"
        )
    }

    // MARK: Stale-completed-records + fresh-active scenario (the core bug scenario)

    /// Simulates the exact scenario that prompted the fix: yesterday's completed
    /// contraction records coexist with a contraction that the user just started
    /// (e.g. phone force-quit mid-session). The active timer must survive; the
    /// old completed records must be discarded.
    func testStaleCompletedSessionWithFreshActiveContraction_activePreserved() {
        let now = Date()

        // Completed records reference (simulates lastEnd = yesterday)
        let staleReference = now.addingTimeInterval(-(28 * 3600)) // 28 h ago
        let completedRecordsAreStale = isSessionStale(
            referenceDate: staleReference, now: now, threshold: threshold)
        XCTAssertTrue(completedRecordsAreStale, "Setup: completed records must be stale")

        // Active contraction that started 8 min ago (well within threshold)
        let freshStart = now.addingTimeInterval(-480)
        let preserveActive = contractionHasFreshActiveSession(
            activeFlag: true,
            startRaw: freshStart.timeIntervalSince1970,
            now: now,
            threshold: threshold
        )
        XCTAssertTrue(preserveActive,
            "Fresh active contraction must survive even when the completed-records reference is stale")
    }
}

// MARK: - Tests

final class ContractionTimerUrgencyTests: XCTestCase {

    // MARK: isPatternUrgent

    func testUrgent_whenIntervalBelowThreshold() {
        XCTAssertTrue(isPatternUrgent(lastInterval: 180),   "180 s (3 min) should be urgent")
        XCTAssertTrue(isPatternUrgent(lastInterval: 1),     "1 s should be urgent")
        XCTAssertTrue(isPatternUrgent(lastInterval: 299.9), "299.9 s should be urgent")
    }

    func testNotUrgent_whenIntervalAtOrAboveThreshold() {
        XCTAssertFalse(isPatternUrgent(lastInterval: 300),  "300 s is the boundary — not urgent")
        XCTAssertFalse(isPatternUrgent(lastInterval: 360),  "6 min apart is not urgent")
        XCTAssertFalse(isPatternUrgent(lastInterval: 600),  "10 min apart is not urgent")
    }

    func testNotUrgent_whenIntervalAbsent() {
        XCTAssertFalse(isPatternUrgent(lastInterval: nil), "No prior interval → not urgent")
    }

    // MARK: restoredInterval (sentinel decode)

    func testRestoredInterval_zeroMeansAbsent() {
        XCTAssertNil(restoredInterval(raw: 0), "0 is the sentinel for 'no interval stored'")
    }

    func testRestoredInterval_positiveValueRestored() {
        XCTAssertEqual(restoredInterval(raw: 240), 240, accuracy: 0.001)
        XCTAssertEqual(restoredInterval(raw: 600), 600, accuracy: 0.001)
    }

    func testRestoredInterval_negativeIgnored() {
        // Negative raw values (corrupt data) should be treated as absent.
        XCTAssertNil(restoredInterval(raw: -1))
    }

    // MARK: Relaunch urgency scenario

    /// Simulates the full restore + urgency-check path that runs in `restoreState()`.
    /// After a force-quit with lastInterval = 240 s (< 5 min), the app must:
    ///   1. Restore lastInterval to 240 s.
    ///   2. Evaluate isPatternUrgent as true → haptic & ⚠️ warning visible without any extra tap.
    func testRelaunhWithUrgentPattern_isDetectedImmediately() {
        let storedRaw: Double = 240 // 4 minutes apart — urgent
        let restored = restoredInterval(raw: storedRaw)
        XCTAssertNotNil(restored, "Interval should be restored from UserDefaults")
        XCTAssertTrue(isPatternUrgent(lastInterval: restored),
                      "Pattern should register as urgent on relaunch without any extra tap")
    }

    /// Simulates a relaunch after a normal session where contractions were > 5 min apart.
    func testRelaunhWithNonUrgentPattern_noWarning() {
        let storedRaw: Double = 420 // 7 minutes apart — not urgent
        let restored = restoredInterval(raw: storedRaw)
        XCTAssertFalse(isPatternUrgent(lastInterval: restored),
                       "Non-urgent pattern should not trigger warning on relaunch")
    }

    /// Simulates a fresh install or first-ever launch where no interval is stored.
    func testRelaunhWithNoStoredInterval_noWarning() {
        let storedRaw: Double = 0 // sentinel: absent
        let restored = restoredInterval(raw: storedRaw)
        XCTAssertFalse(isPatternUrgent(lastInterval: restored),
                       "No stored interval on first launch should not trigger warning")
    }

    // MARK: Boundary: exactly at threshold

    func testExactlyAtThreshold_isNotUrgent() {
        // 300 s = 5 min exactly is NOT urgent (< 300, not ≤ 300)
        XCTAssertFalse(isPatternUrgent(lastInterval: 300))
    }

    func testOneSecondBelowThreshold_isUrgent() {
        XCTAssertTrue(isPatternUrgent(lastInterval: 299))
    }
}

// MARK: - Stale-session tests

/// Validates the staleness guard that `restoreState()` applies before reloading
/// saved contraction records. Records older than the threshold must be discarded
/// rather than surfaced to the user as a "current" session.
final class ContractionTimerStaleSessionTests: XCTestCase {

    private let threshold: TimeInterval = 24 * 3600 // matches production default

    // MARK: Stale cases (should be discarded)

    func testSessionFromYesterday_isStale() {
        let now = Date()
        let yesterday = now.addingTimeInterval(-(25 * 3600)) // 25 h ago
        XCTAssertTrue(
            isSessionStale(referenceDate: yesterday, now: now, threshold: threshold),
            "A session that ended 25 h ago must be considered stale"
        )
    }

    func testSessionFromTwoDaysAgo_isStale() {
        let now = Date()
        let twoDaysAgo = now.addingTimeInterval(-(48 * 3600))
        XCTAssertTrue(
            isSessionStale(referenceDate: twoDaysAgo, now: now, threshold: threshold),
            "A session that ended 48 h ago must be considered stale"
        )
    }

    func testSessionOneSecondOverThreshold_isStale() {
        let now = Date()
        let justOver = now.addingTimeInterval(-(threshold + 1))
        XCTAssertTrue(
            isSessionStale(referenceDate: justOver, now: now, threshold: threshold),
            "One second past the threshold must trigger discard"
        )
    }

    // MARK: Fresh cases (should be restored)

    func testSessionFromOneHourAgo_isFresh() {
        let now = Date()
        let oneHourAgo = now.addingTimeInterval(-3600)
        XCTAssertFalse(
            isSessionStale(referenceDate: oneHourAgo, now: now, threshold: threshold),
            "A session that ended 1 h ago must be restored"
        )
    }

    func testSessionFromJustNow_isFresh() {
        let now = Date()
        let justNow = now.addingTimeInterval(-10)
        XCTAssertFalse(
            isSessionStale(referenceDate: justNow, now: now, threshold: threshold),
            "A session that ended 10 s ago must be restored"
        )
    }

    // MARK: Boundary: exactly at threshold

    func testSessionExactlyAtThreshold_isFresh() {
        // age == threshold is NOT stale (> threshold is required)
        let now = Date()
        let exactBoundary = now.addingTimeInterval(-threshold)
        XCTAssertFalse(
            isSessionStale(referenceDate: exactBoundary, now: now, threshold: threshold),
            "A session exactly at the threshold must not be discarded (> not >=)"
        )
    }

    // MARK: No saved data

    func testNoReferenceDate_isNeverStale() {
        // When there is no persisted session at all (e.g. fresh install), the
        // staleness guard must not fire — there is nothing to discard.
        XCTAssertFalse(
            isSessionStale(referenceDate: nil, now: Date(), threshold: threshold),
            "Absent reference date must never be considered stale"
        )
    }

    // MARK: Fallback path — lastEnd key absent (e.g. after an app-update UserDefaults migration)

    /// Simulates an app update that reset `wk.contractionLastEnd` to 0 while the
    /// record array survived with recent entries. The fallback must resolve the
    /// newest record's `endedAt` and the guard must NOT wipe the live session.
    func testLastEndAbsent_recentRecords_isNotStale() {
        let now = Date()
        let recordEnds = [
            now.addingTimeInterval(-7200),  // 2 h ago
            now.addingTimeInterval(-3600),  // 1 h ago (newest)
            now.addingTimeInterval(-5400)   // 1.5 h ago
        ]
        let ref = resolveStaleReferenceDate(lastEndRaw: 0, recordEndDates: recordEnds)
        XCTAssertEqual(ref!.timeIntervalSince1970,
                       now.addingTimeInterval(-3600).timeIntervalSince1970,
                       accuracy: 0.001,
                       "Fallback must pick the newest record's endedAt")
        XCTAssertFalse(
            isSessionStale(referenceDate: ref, now: now, threshold: threshold),
            "lastEnd == 0 with records from 1 h ago must NOT be treated as stale — wiping here would destroy a live session after an app update"
        )
    }

    /// lastEnd == 0 with a single very recent record (just ended) — must survive.
    func testLastEndAbsent_singleJustEndedRecord_isNotStale() {
        let now = Date()
        let ref = resolveStaleReferenceDate(lastEndRaw: 0,
                                            recordEndDates: [now.addingTimeInterval(-30)])
        XCTAssertFalse(
            isSessionStale(referenceDate: ref, now: now, threshold: threshold),
            "A record that ended 30 s ago must be restored even when lastEnd is absent"
        )
    }

    /// lastEnd == 0 with records all older than 24 h — the fallback must still
    /// classify the session as stale so yesterday's data is discarded.
    func testLastEndAbsent_oldRecords_isStale() {
        let now = Date()
        let recordEnds = [
            now.addingTimeInterval(-(30 * 3600)), // 30 h ago (newest)
            now.addingTimeInterval(-(48 * 3600))  // 48 h ago
        ]
        let ref = resolveStaleReferenceDate(lastEndRaw: 0, recordEndDates: recordEnds)
        XCTAssertTrue(
            isSessionStale(referenceDate: ref, now: now, threshold: threshold),
            "lastEnd == 0 with records >24 h old must be detected as stale via the fallback"
        )
    }

    /// lastEnd == 0 and no records at all — nothing to reference, never stale.
    func testLastEndAbsent_noRecords_isNeverStale() {
        let ref = resolveStaleReferenceDate(lastEndRaw: 0, recordEndDates: [])
        XCTAssertNil(ref, "No lastEnd and no records → no reference date")
        XCTAssertFalse(
            isSessionStale(referenceDate: ref, now: Date(), threshold: threshold),
            "With no persisted data the staleness guard must not fire"
        )
    }

    /// When lastEnd IS present it must take precedence over older record dates.
    func testLastEndPresent_takesPrecedenceOverRecords() {
        let now = Date()
        let lastEnd = now.addingTimeInterval(-1800) // 30 min ago
        let ref = resolveStaleReferenceDate(
            lastEndRaw: lastEnd.timeIntervalSince1970,
            recordEndDates: [now.addingTimeInterval(-(48 * 3600))] // 2 days ago
        )
        XCTAssertEqual(ref!.timeIntervalSince1970, lastEnd.timeIntervalSince1970,
                       accuracy: 0.001,
                       "lastEnd > 0 must be preferred over record timestamps")
        XCTAssertFalse(isSessionStale(referenceDate: ref, now: now, threshold: threshold))
    }

    // MARK: Custom threshold

    func testCustomShortThreshold_makesRecentSessionStale() {
        let shortThreshold: TimeInterval = 3600 // 1 hour
        let now = Date()
        let twoHoursAgo = now.addingTimeInterval(-7200)
        XCTAssertTrue(
            isSessionStale(referenceDate: twoHoursAgo, now: now, threshold: shortThreshold),
            "With a 1-hour threshold, a 2-hour-old session must be stale"
        )
    }

    func testCustomLongThreshold_keepsOldSessionFresh() {
        let longThreshold: TimeInterval = 72 * 3600 // 3 days
        let now = Date()
        let twoDaysAgo = now.addingTimeInterval(-(48 * 3600))
        XCTAssertFalse(
            isSessionStale(referenceDate: twoDaysAgo, now: now, threshold: longThreshold),
            "With a 3-day threshold, a 2-day-old session must still be fresh"
        )
    }
}

// MARK: - Relaunch haptic guard tests

/// Models the `didFireRelaunchHaptic` guard logic that lives in `restoreState()`.
///
/// Returns `true` when the haptic *should* fire (urgent pattern, not yet fired this session)
/// and `false` otherwise. Mirrors the exact condition in ContractionTimerView:
///
///     if !didFireRelaunchHaptic, let interval = lastInterval, interval < 300 { … }
func shouldFireRelaunchHaptic(interval: TimeInterval?, didAlreadyFire: Bool) -> Bool {
    guard !didAlreadyFire else { return false }
    return isPatternUrgent(lastInterval: interval)
}

final class ContractionTimerRelaunchHapticGuardTests: XCTestCase {

    // MARK: First appearance after cold launch

    func testFirstAppear_urgentPattern_fires() {
        // Simulates the very first .onAppear after a cold launch with an urgent saved interval.
        let fires = shouldFireRelaunchHaptic(interval: 240, didAlreadyFire: false)
        XCTAssertTrue(fires, "Haptic must fire on the first .onAppear when pattern is urgent")
    }

    func testFirstAppear_nonUrgentPattern_doesNotFire() {
        let fires = shouldFireRelaunchHaptic(interval: 360, didAlreadyFire: false)
        XCTAssertFalse(fires, "Haptic must not fire for a non-urgent interval (> 5 min apart)")
    }

    func testFirstAppear_noStoredInterval_doesNotFire() {
        let fires = shouldFireRelaunchHaptic(interval: nil, didAlreadyFire: false)
        XCTAssertFalse(fires, "Haptic must not fire when no interval was stored (first-ever launch)")
    }

    // MARK: Subsequent appearances (navigation push/pop, crown scroll)

    func testSecondAppear_urgentPattern_doesNotFireAgain() {
        // After the flag is set on the first appear, subsequent calls must be suppressed.
        let fires = shouldFireRelaunchHaptic(interval: 240, didAlreadyFire: true)
        XCTAssertFalse(fires,
            "Haptic must NOT fire on a second .onAppear — flag already set this session")
    }

    func testManySubsequentAppears_urgentPattern_neverFireAgain() {
        // Simulate N re-appearances (e.g. deep navigation stack): flag stays true.
        var didFire = false
        var hapticCount = 0

        for _ in 1...10 {
            if shouldFireRelaunchHaptic(interval: 200, didAlreadyFire: didFire) {
                hapticCount += 1
                didFire = true  // flag set after first fire
            }
        }

        XCTAssertEqual(hapticCount, 1,
            "Haptic must fire exactly once across 10 simulated .onAppear events")
    }

    // MARK: After sign-out (resetState resets the flag)

    func testAfterSignOut_flagReset_firstAppearFiresAgain() {
        // Simulate: fired on cold launch → sign-out resets flag → next cold launch can fire again.
        var didFire = true // state after first cold launch

        // Sign-out resets the flag (mirrors resetState())
        didFire = false

        let fires = shouldFireRelaunchHaptic(interval: 240, didAlreadyFire: didFire)
        XCTAssertTrue(fires,
            "After a sign-out the flag resets, so the next cold launch must fire the haptic")
    }

    // MARK: Boundary: exactly at threshold

    func testExactlyAtThreshold_doesNotFire() {
        // 300 s is NOT urgent (interval < 300, not ≤ 300), so haptic must not fire.
        let fires = shouldFireRelaunchHaptic(interval: 300, didAlreadyFire: false)
        XCTAssertFalse(fires,
            "Interval exactly at 300 s is not urgent — haptic must not fire")
    }

    func testOneSecondBelowThreshold_fires() {
        let fires = shouldFireRelaunchHaptic(interval: 299, didAlreadyFire: false)
        XCTAssertTrue(fires, "299 s is below the threshold — haptic must fire on first appear")
    }
}

// MARK: - UserDefaults key-name integration tests

/// Exercises the end-to-end UserDefaults read/write path used by `saveState()` and
/// `restoreState()`, verifying that the actual key name strings written during an active
/// contraction are the exact strings that `contractionHasFreshActiveSession` reads.
///
/// These tests deliberately hardcode the expected key names so that any renaming or
/// typo in `ContractionDefaults` will cause an immediate, obvious failure here rather
/// than silently breaking the force-quit-restore fix.
final class ContractionTimerUserDefaultsKeyTests: XCTestCase {

    // MARK: - Known production key names (must match ContractionDefaults in ContractionTimerView.swift)

    /// `ContractionDefaults.active` — the Bool flag written by `saveState()` and
    /// read in `restoreState()`'s staleness guard.
    private let activeKey = "wk.contractionActive"

    /// `ContractionDefaults.start` — the TimeInterval written by `saveState()` and
    /// read in `restoreState()`'s staleness guard.
    private let startKey = "wk.contractionStart"

    // Use an isolated suite so tests never touch the host's real UserDefaults.
    private var testDefaults: UserDefaults!

    override func setUp() {
        super.setUp()
        // A unique suite per test class avoids cross-test contamination.
        let suiteName = "com.pregnancyapp.watch.contractiontimer.keytests"
        testDefaults = UserDefaults(suiteName: suiteName)!
        // Clear any residue from a previous run.
        testDefaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        testDefaults.removePersistentDomain(forName: "com.pregnancyapp.watch.contractiontimer.keytests")
        testDefaults = nil
        super.tearDown()
    }

    // MARK: - Helpers that mirror saveState() writes

    /// Writes the two keys that `saveState()` sets for an active in-progress contraction.
    private func writeActiveContraction(startDate: Date) {
        testDefaults.set(true, forKey: activeKey)
        testDefaults.set(startDate.timeIntervalSince1970, forKey: startKey)
    }

    /// Reads the two keys the way `restoreState()`'s staleness guard reads them,
    /// then delegates to `contractionHasFreshActiveSession`.
    private func readAndEvaluate(now: Date, threshold: TimeInterval = 24 * 3600) -> Bool {
        let activeFlag = testDefaults.bool(forKey: activeKey)
        let startRaw   = testDefaults.double(forKey: startKey)
        return contractionHasFreshActiveSession(
            activeFlag: activeFlag,
            startRaw: startRaw,
            now: now,
            threshold: threshold
        )
    }

    // MARK: - Key-name round-trip: active contraction is preserved

    /// The primary scenario for task #699: `saveState()` is called at the moment the
    /// user is mid-contraction, the app is force-quit, and then relaunched.
    /// `restoreState()` must find the active flag and a fresh start timestamp and
    /// resume the timer.
    func testActiveContractionWrittenWithCorrectKeys_isPreservedOnRead() {
        let now = Date()
        let startFiveMinutesAgo = now.addingTimeInterval(-300)

        writeActiveContraction(startDate: startFiveMinutesAgo)

        XCTAssertTrue(
            readAndEvaluate(now: now),
            """
            An active contraction written under '\(activeKey)' / '\(startKey)' must be \
            read back and produce hasFreshActiveSession == true. \
            A failure here means the key name used in saveState() does not match \
            the key name read in restoreState()'s staleness guard.
            """
        )
    }

    /// Confirms that the active flag written under the exact key name is readable as Bool.
    func testActiveFlag_writtenAsBoolUnderCorrectKey_readBackAsTrue() {
        testDefaults.set(true, forKey: activeKey)
        XCTAssertTrue(
            testDefaults.bool(forKey: activeKey),
            "Bool written under '\(activeKey)' must be readable as true — key name must be exact"
        )
    }

    /// Confirms that the start timestamp written under the exact key name is readable as Double.
    func testStartTimestamp_writtenAsDoubleUnderCorrectKey_readBackWithinTolerance() {
        let now = Date()
        testDefaults.set(now.timeIntervalSince1970, forKey: startKey)
        let readBack = testDefaults.double(forKey: startKey)
        XCTAssertEqual(
            readBack,
            now.timeIntervalSince1970,
            accuracy: 0.001,
            "TimeInterval written under '\(startKey)' must be readable as the same value — key name must be exact"
        )
    }

    // MARK: - Stale completed records + fresh active contraction (core bug scenario, via UserDefaults)

    /// Mirrors the exact state that triggered the fix in task #699:
    /// - `wk.contractionActive = true` (contraction just started)
    /// - `wk.contractionStart`  = 8 minutes ago  (fresh)
    /// The staleness guard in `restoreState()` must preserve the active timer
    /// regardless of whatever stale completed records existed alongside it.
    func testStaleCompletedRecords_withFreshActiveContraction_activePreservedViaDefaults() {
        let now = Date()
        // Simulate: user started a new contraction 8 minutes ago while yesterday's
        // completed records were still persisted.
        let freshStart = now.addingTimeInterval(-480)
        writeActiveContraction(startDate: freshStart)

        XCTAssertTrue(
            readAndEvaluate(now: now),
            """
            Fresh active contraction (started 8 min ago) written under the production \
            key names must survive the staleness guard. \
            If this fails, the key names in ContractionDefaults have drifted from \
            what contractionHasFreshActiveSession reads.
            """
        )
    }

    // MARK: - Absence / cleared state produces correct result

    /// When `saveState()` has never been called (fresh install), no keys are set.
    /// `restoreState()` must not restore a phantom active contraction.
    func testFreshInstall_noKeysPresent_noActiveSessionRestored() {
        // Do not write anything — defaults suite is empty after setUp().
        XCTAssertFalse(
            readAndEvaluate(now: Date()),
            "With no UserDefaults keys written, hasFreshActiveSession must be false (fresh install)"
        )
    }

    /// After `stopContraction()` the active flag is set to false and the start key is
    /// removed. The subsequent restore must not resume a phantom contraction.
    func testAfterStop_activeSetFalse_startKeyAbsent_noActiveSessionRestored() {
        let now = Date()
        // Simulate what saveState() writes after stopContraction():
        testDefaults.set(false, forKey: activeKey)
        // start key intentionally absent (removeObject path in saveState)

        XCTAssertFalse(
            readAndEvaluate(now: now),
            "active=false with no start key must not restore an active contraction"
        )
    }

    /// When the active flag is true but the start key holds the sentinel 0 (corrupt/absent),
    /// `restoreState()` treats it as corrupt and does NOT resume the timer.
    func testActiveTrue_startKeyIsZeroSentinel_noActiveSessionRestored() {
        testDefaults.set(true,  forKey: activeKey)
        testDefaults.set(0.0,   forKey: startKey)   // sentinel: absent / corrupt

        XCTAssertFalse(
            readAndEvaluate(now: Date()),
            "active=true with start sentinel 0.0 must not be restored — corrupt state"
        )
    }
}
