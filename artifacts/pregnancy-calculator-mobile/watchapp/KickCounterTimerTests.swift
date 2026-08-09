// KickCounterTimerTests.swift
// Unit tests for the 24 h staleness guard in KickCounterView's restore path.
//
// The restore decision lives in `KickSessionRestorePolicy.evaluate` — a pure
// production function (see KickSessionRestorePolicy.swift) that
// KickCounterView.restoreSession() calls directly. These tests exercise that
// production implementation, so they cannot drift from the shipped behaviour.
//
// Running: the checked-in repo has no Xcode unit-test target (the Xcode
// project is generated at EAS prebuild by plugins/withWatchExtension.js).
// To execute these tests, add a macOS/watchOS unit-test target in Xcode and
// include BOTH of these files in it:
//   - watchapp/KickSessionRestorePolicy.swift  (production code under test)
//   - watchapp/KickCounterTimerTests.swift     (this file)
// No other app sources or frameworks are required — the policy depends only
// on Foundation.

import XCTest
import Foundation

final class KickCounterTimerTests: XCTestCase {

    private let threshold = KickSessionRestorePolicy.staleSessionThreshold

    /// Fixed "now" so boundary cases are deterministic.
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func startRaw(ageSeconds: TimeInterval) -> Double {
        now.addingTimeInterval(-ageSeconds).timeIntervalSince1970
    }

    // MARK: - Stale sessions are discarded

    /// A session started 25 hours ago must NOT be restored — this is the
    /// "yesterday's kicks reappear" bug this guard exists to prevent.
    func testEvaluate_sessionOlderThan24Hours_isCleared() {
        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 8, startRaw: startRaw(ageSeconds: 25 * 3600), now: now)

        XCTAssertEqual(outcome, .clear, "A 25 h-old session must be discarded, not restored")
    }

    /// A very old session (a week) is also discarded — the guard is not
    /// limited to "yesterday".
    func testEvaluate_weekOldSession_isCleared() {
        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 3, startRaw: startRaw(ageSeconds: 7 * 24 * 3600), now: now)

        XCTAssertEqual(outcome, .clear)
    }

    // MARK: - Fresh sessions are restored

    /// A session started 5 minutes ago (e.g. force-quit mid-count) must be
    /// fully restored: count and start date.
    func testEvaluate_freshSession_isRestored() {
        let raw = startRaw(ageSeconds: 300)

        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 4, startRaw: raw, now: now)

        XCTAssertEqual(outcome, .restore(count: 4, start: Date(timeIntervalSince1970: raw)))
    }

    /// A zero-kick active session (started, no kicks yet) is still restored.
    func testEvaluate_freshSessionWithZeroKicks_isRestored() {
        let raw = startRaw(ageSeconds: 60)

        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 0, startRaw: raw, now: now)

        XCTAssertEqual(outcome, .restore(count: 0, start: Date(timeIntervalSince1970: raw)))
    }

    // MARK: - Boundary cases

    /// A session exactly at the 24 h threshold is NOT stale (guard uses
    /// strict `>`), matching ContractionTimerView's behaviour.
    func testEvaluate_exactly24HoursOld_isStillRestored() {
        let raw = startRaw(ageSeconds: threshold)

        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 6, startRaw: raw, now: now)

        XCTAssertEqual(
            outcome, .restore(count: 6, start: Date(timeIntervalSince1970: raw)),
            "Exactly-24h session must still be restored (strict >)")
    }

    /// One second past the threshold tips into stale.
    func testEvaluate_oneSecondPast24Hours_isCleared() {
        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 6, startRaw: startRaw(ageSeconds: threshold + 1), now: now)

        XCTAssertEqual(outcome, .clear, "24h + 1s session must be discarded")
    }

    /// One second inside the threshold is still fresh.
    func testEvaluate_oneSecondUnder24Hours_isRestored() {
        let raw = startRaw(ageSeconds: threshold - 1)

        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 6, startRaw: raw, now: now)

        XCTAssertEqual(outcome, .restore(count: 6, start: Date(timeIntervalSince1970: raw)))
    }

    // MARK: - Nil / corrupt reference cases

    /// No active session persisted → idle; storage must be left untouched
    /// (idle, not clear).
    func testEvaluate_inactive_returnsIdle() {
        let outcome = KickSessionRestorePolicy.evaluate(
            active: false, count: 7, startRaw: startRaw(ageSeconds: 60), now: now)

        XCTAssertEqual(outcome, .idle, "Inactive persisted state must stay idle without clearing")
    }

    /// Active flag set but start timestamp missing (0 — UserDefaults default
    /// for an absent key) → corrupt-data guard clears the session.
    func testEvaluate_activeWithMissingStart_isCleared() {
        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 9, startRaw: 0, now: now)

        XCTAssertEqual(outcome, .clear, "active=true with no start timestamp must clear")
    }

    /// A negative start timestamp is treated like missing (startRaw > 0 guard).
    func testEvaluate_negativeStartTimestamp_isCleared() {
        let outcome = KickSessionRestorePolicy.evaluate(
            active: true, count: 5, startRaw: -100, now: now)

        XCTAssertEqual(outcome, .clear)
    }

    // MARK: - Custom threshold injection

    /// The threshold parameter is honored — a 2 h-old session is stale under
    /// a 1 h threshold but fresh under the default 24 h one.
    func testEvaluate_customThreshold_isRespected() {
        let raw = startRaw(ageSeconds: 2 * 3600)

        let underOneHour = KickSessionRestorePolicy.evaluate(
            active: true, count: 2, startRaw: raw, now: now, threshold: 3600)
        let underDefault = KickSessionRestorePolicy.evaluate(
            active: true, count: 2, startRaw: raw, now: now)

        XCTAssertEqual(underOneHour, .clear)
        XCTAssertEqual(underDefault, .restore(count: 2, start: Date(timeIntervalSince1970: raw)))
    }
}
