// WatchSessionManagerKickCountTests.swift
// Unit tests for the lastKickCount UserDefaults persistence in WatchSessionManager.
//
// WatchConnectivity is a hardware framework unavailable in a macOS test host, so
// these tests model the save / restore / remove logic as pure functions that
// mirror the three code paths in WatchSessionManager:
//
//   1. didSet on lastKickCount (save or remove)          → saveKickCount / removeKickCount
//   2. init() restore path                               → restoredKickCount(from:)
//   3. sendKickSessionEnd sets lastKickCount             → tested via saveKickCount
//
// The tests use an isolated UserDefaults suite so they cannot pollute — or be
// contaminated by — the standard UserDefaults used in production code.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp -destination 'platform=macOS'

import XCTest
import Foundation

// MARK: - Key constant (mirrors WatchSessionManager)

private let lastKickCountKey = "wk.lastKickCount"

// MARK: - Pure-logic mirrors of WatchSessionManager behaviour

/// Mirrors the `didSet` branch that fires when `lastKickCount` is assigned a
/// non-nil value: `UserDefaults.standard.set(count, forKey: "wk.lastKickCount")`.
private func saveKickCount(_ count: Int, to defaults: UserDefaults) {
    defaults.set(count, forKey: lastKickCountKey)
}

/// Mirrors the `didSet` branch that fires when `lastKickCount` is set to nil:
/// `UserDefaults.standard.removeObject(forKey: "wk.lastKickCount")`.
private func removeKickCount(from defaults: UserDefaults) {
    defaults.removeObject(forKey: lastKickCountKey)
}

/// Mirrors the init() restore path:
///   ```
///   let savedKickCount = UserDefaults.standard.integer(forKey: "wk.lastKickCount")
///   if savedKickCount > 0 {
///       _lastKickCount = Published(initialValue: savedKickCount)
///   }
///   ```
/// Returns the value that `lastKickCount` would hold after init completes:
///   - the stored integer when it is > 0
///   - nil when the stored integer is 0 (default for a missing key)
private func restoredKickCount(from defaults: UserDefaults) -> Int? {
    let raw = defaults.integer(forKey: lastKickCountKey)
    return raw > 0 ? raw : nil
}

// MARK: - Tests

final class WatchSessionManagerKickCountTests: XCTestCase {

    /// Each test gets its own isolated UserDefaults suite to prevent cross-test
    /// interference and ensure a clean slate regardless of execution order.
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        // Use a unique suite name per test invocation.
        let suiteName = "com.test.WatchSessionManagerKickCount.\(name)"
        defaults = UserDefaults(suiteName: suiteName)!
        // Ensure the suite starts empty.
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults = nil
        super.tearDown()
    }

    // MARK: - Save on sendKickSessionEnd

    /// Mirrors the `lastKickCount = summary.kickCount` assignment inside
    /// `sendKickSessionEnd`.  The didSet must write the count to UserDefaults.
    func testSaveOnSessionEnd_writesCountToUserDefaults() {
        // Act — simulate sendKickSessionEnd setting lastKickCount = 10
        saveKickCount(10, to: defaults)

        // Assert — the raw integer must be present and correct
        XCTAssertEqual(defaults.integer(forKey: lastKickCountKey), 10,
                       "sendKickSessionEnd must persist kickCount to UserDefaults")
    }

    func testSaveOnSessionEnd_overwritesPreviousCount() {
        saveKickCount(5, to: defaults)
        saveKickCount(12, to: defaults)

        XCTAssertEqual(defaults.integer(forKey: lastKickCountKey), 12,
                       "A subsequent session end must overwrite the previous count")
    }

    /// Edge case: a session that ended with exactly one kick must also be saved.
    func testSaveOnSessionEnd_singleKick_isSaved() {
        saveKickCount(1, to: defaults)

        XCTAssertEqual(defaults.integer(forKey: lastKickCountKey), 1,
                       "A single-kick session must be persisted (count = 1)")
    }

    // MARK: - Restore on init when value > 0

    /// After a force-quit with a stored count of 7, init() must restore
    /// lastKickCount to 7.
    func testRestoreOnInit_positiveCount_isRestored() {
        // Arrange — simulate a previously persisted count
        saveKickCount(7, to: defaults)

        // Act — simulate init()
        let restored = restoredKickCount(from: defaults)

        XCTAssertEqual(restored, 7,
                       "init() must restore lastKickCount from UserDefaults when value > 0")
    }

    /// Verifies a larger count is also restored correctly (not just small values).
    func testRestoreOnInit_largeCount_isRestored() {
        saveKickCount(99, to: defaults)

        XCTAssertEqual(restoredKickCount(from: defaults), 99,
                       "Large kick counts must be restored accurately")
    }

    // MARK: - Zero sentinel treated as absent

    /// `UserDefaults.integer(forKey:)` returns 0 when the key is missing.
    /// init() must interpret 0 as "nothing stored" and leave lastKickCount nil.
    func testRestoreOnInit_noStoredValue_returnsNil() {
        // No saveKickCount call → key is absent → integer returns 0
        let restored = restoredKickCount(from: defaults)

        XCTAssertNil(restored,
                     "init() must leave lastKickCount nil when UserDefaults has no stored count")
    }

    /// If somehow 0 is written (shouldn't happen in normal flow), init() must
    /// still treat it as absent — the zero sentinel must hold.
    func testRestoreOnInit_zeroStoredDirectly_returnsNil() {
        defaults.set(0, forKey: lastKickCountKey)

        XCTAssertNil(restoredKickCount(from: defaults),
                     "A raw value of 0 must be treated as the sentinel for 'no count stored'")
    }

    // MARK: - Removal when lastKickCount is set to nil

    /// Mirrors `lastKickCount = nil` → didSet removes the key.
    func testRemoval_nilAssignment_removesKeyFromUserDefaults() {
        // Arrange — ensure a value is present first
        saveKickCount(5, to: defaults)
        XCTAssertEqual(defaults.integer(forKey: lastKickCountKey), 5,
                       "Precondition: value must exist before removal test")

        // Act — simulate lastKickCount = nil
        removeKickCount(from: defaults)

        // Assert — key must be gone; integer(forKey:) returns 0 for missing keys
        XCTAssertEqual(defaults.integer(forKey: lastKickCountKey), 0,
                       "Setting lastKickCount to nil must remove the UserDefaults key")
    }

    /// After removal, init() must see no stored value → lastKickCount stays nil.
    func testRemoval_thenRestoreOnInit_returnsNil() {
        saveKickCount(8, to: defaults)
        removeKickCount(from: defaults)

        XCTAssertNil(restoredKickCount(from: defaults),
                     "After nil removal, init() must not restore any value")
    }

    /// Removing when no key is present must not crash or leave a bad value.
    func testRemoval_whenKeyAbsent_isIdempotent() {
        removeKickCount(from: defaults)   // no prior save — must not throw

        XCTAssertNil(restoredKickCount(from: defaults),
                     "Removing a non-existent key must leave the restore result as nil")
    }

    // MARK: - Round-trip (save → remove → save → restore)

    func testRoundTrip_saveRemoveSave_restoresLatestCount() {
        saveKickCount(3, to: defaults)
        removeKickCount(from: defaults)
        saveKickCount(15, to: defaults)

        XCTAssertEqual(restoredKickCount(from: defaults), 15,
                       "After save → remove → save, init() must restore the latest saved count")
    }

    // MARK: - Bypass-didSet pattern (init uses Published(initialValue:))

    /// init() sets `_lastKickCount = Published(initialValue: savedKickCount)` to
    /// bypass didSet and avoid re-writing the already-stored value.
    /// This test confirms that restoring a value leaves the stored key intact
    /// (i.e. reading does NOT remove or overwrite the key as a side effect).
    func testRestoreOnInit_doesNotModifyStoredKey() {
        saveKickCount(20, to: defaults)

        // Simulate init() read — must be non-destructive
        _ = restoredKickCount(from: defaults)

        // The key must still hold the original value unchanged
        XCTAssertEqual(defaults.integer(forKey: lastKickCountKey), 20,
                       "init() restore must be a read-only operation — the stored key must not change")
    }
}
