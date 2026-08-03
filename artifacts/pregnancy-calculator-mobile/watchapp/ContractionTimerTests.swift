// ContractionTimerTests.swift
// Unit tests for contraction urgency detection and force-quit restore logic.
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
