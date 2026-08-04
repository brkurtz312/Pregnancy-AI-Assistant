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
