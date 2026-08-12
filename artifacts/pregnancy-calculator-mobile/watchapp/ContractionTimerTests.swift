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
