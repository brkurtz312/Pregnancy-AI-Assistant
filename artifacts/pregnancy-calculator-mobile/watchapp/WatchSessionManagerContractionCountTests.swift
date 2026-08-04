// WatchSessionManagerContractionCountTests.swift
// Unit tests for the lastContractionCount UserDefaults persistence in WatchSessionManager.
//
// WatchConnectivity is a hardware framework unavailable in a macOS test host, so
// these tests model the save / restore / remove logic as pure functions that
// mirror the three code paths in WatchSessionManager:
//
//   1. didSet on lastContractionCount (save or remove)       → saveContractionCount / removeContractionCount
//   2. init() restore path                                   → restoredContractionCount(from:)
//   3. sendContractionSessionEnd sets lastContractionCount   → tested via saveContractionCount
//
// The tests use an isolated UserDefaults suite so they cannot pollute — or be
// contaminated by — the standard UserDefaults used in production code.
//
// Run via: Product → Test in Xcode, or
//   xcodebuild test -scheme PregnancyWatchApp -destination 'platform=macOS'

import XCTest
import Foundation

// MARK: - Key constant (mirrors WatchSessionManager)

private let lastContractionCountKey = "wk.lastContractionCount"

// MARK: - Pure-logic mirrors of WatchSessionManager behaviour

/// Mirrors the `didSet` branch that fires when `lastContractionCount` is assigned a
/// non-nil value: `UserDefaults.standard.set(count, forKey: "wk.lastContractionCount")`.
private func saveContractionCount(_ count: Int, to defaults: UserDefaults) {
    defaults.set(count, forKey: lastContractionCountKey)
}

/// Mirrors the `didSet` branch that fires when `lastContractionCount` is set to nil:
/// `UserDefaults.standard.removeObject(forKey: "wk.lastContractionCount")`.
private func removeContractionCount(from defaults: UserDefaults) {
    defaults.removeObject(forKey: lastContractionCountKey)
}

/// Mirrors the init() restore path:
///   ```
///   let savedContractionCount = UserDefaults.standard.integer(forKey: "wk.lastContractionCount")
///   if savedContractionCount > 0 {
///       _lastContractionCount = Published(initialValue: savedContractionCount)
///   }
///   ```
/// Returns the value that `lastContractionCount` would hold after init completes:
///   - the stored integer when it is > 0
///   - nil when the stored integer is 0 (default for a missing key)
private func restoredContractionCount(from defaults: UserDefaults) -> Int? {
    let raw = defaults.integer(forKey: lastContractionCountKey)
    return raw > 0 ? raw : nil
}

// MARK: - Tests

final class WatchSessionManagerContractionCountTests: XCTestCase {

    /// Each test gets its own isolated UserDefaults suite to prevent cross-test
    /// interference and ensure a clean slate regardless of execution order.
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        // Use a unique suite name per test invocation.
        let suiteName = "com.test.WatchSessionManagerContractionCount.\(name)"
        defaults = UserDefaults(suiteName: suiteName)!
        // Ensure the suite starts empty.
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults = nil
        super.tearDown()
    }

    // MARK: - Save on sendContractionSessionEnd

    /// Mirrors the `lastContractionCount = count` assignment inside
    /// `sendContractionSessionEnd`. The didSet must write the count to UserDefaults.
    func testSaveOnSessionEnd_writesCountToUserDefaults() {
        // Act — simulate sendContractionSessionEnd setting lastContractionCount = 8
        saveContractionCount(8, to: defaults)

        // Assert — the raw integer must be present and correct
        XCTAssertEqual(defaults.integer(forKey: lastContractionCountKey), 8,
                       "sendContractionSessionEnd must persist count to UserDefaults")
    }

    func testSaveOnSessionEnd_overwritesPreviousCount() {
        saveContractionCount(4, to: defaults)
        saveContractionCount(11, to: defaults)

        XCTAssertEqual(defaults.integer(forKey: lastContractionCountKey), 11,
                       "A subsequent session end must overwrite the previous count")
    }

    /// Edge case: a session with exactly one contraction must also be saved.
    func testSaveOnSessionEnd_singleContraction_isSaved() {
        saveContractionCount(1, to: defaults)

        XCTAssertEqual(defaults.integer(forKey: lastContractionCountKey), 1,
                       "A single-contraction session must be persisted (count = 1)")
    }

    // MARK: - Restore on init when value > 0

    /// After a force-quit with a stored count of 6, init() must restore
    /// lastContractionCount to 6.
    func testRestoreOnInit_positiveCount_isRestored() {
        // Arrange — simulate a previously persisted count
        saveContractionCount(6, to: defaults)

        // Act — simulate init()
        let restored = restoredContractionCount(from: defaults)

        XCTAssertEqual(restored, 6,
                       "init() must restore lastContractionCount from UserDefaults when value > 0")
    }

    /// Verifies a larger count is also restored correctly (not just small values).
    func testRestoreOnInit_largeCount_isRestored() {
        saveContractionCount(42, to: defaults)

        XCTAssertEqual(restoredContractionCount(from: defaults), 42,
                       "Large contraction counts must be restored accurately")
    }

    // MARK: - Zero sentinel treated as absent

    /// `UserDefaults.integer(forKey:)` returns 0 when the key is missing.
    /// init() must interpret 0 as "nothing stored" and leave lastContractionCount nil.
    func testRestoreOnInit_noStoredValue_returnsNil() {
        // No saveContractionCount call → key is absent → integer returns 0
        let restored = restoredContractionCount(from: defaults)

        XCTAssertNil(restored,
                     "init() must leave lastContractionCount nil when UserDefaults has no stored count")
    }

    /// If somehow 0 is written (shouldn't happen in normal flow), init() must
    /// still treat it as absent — the zero sentinel must hold.
    func testRestoreOnInit_zeroStoredDirectly_returnsNil() {
        defaults.set(0, forKey: lastContractionCountKey)

        XCTAssertNil(restoredContractionCount(from: defaults),
                     "A raw value of 0 must be treated as the sentinel for 'no count stored'")
    }

    // MARK: - Removal when lastContractionCount is set to nil

    /// Mirrors `lastContractionCount = nil` → didSet removes the key.
    func testRemoval_nilAssignment_removesKeyFromUserDefaults() {
        // Arrange — ensure a value is present first
        saveContractionCount(5, to: defaults)
        XCTAssertEqual(defaults.integer(forKey: lastContractionCountKey), 5,
                       "Precondition: value must exist before removal test")

        // Act — simulate lastContractionCount = nil
        removeContractionCount(from: defaults)

        // Assert — key must be gone; integer(forKey:) returns 0 for missing keys
        XCTAssertEqual(defaults.integer(forKey: lastContractionCountKey), 0,
                       "Setting lastContractionCount to nil must remove the UserDefaults key")
    }

    /// After removal, init() must see no stored value → lastContractionCount stays nil.
    func testRemoval_thenRestoreOnInit_returnsNil() {
        saveContractionCount(9, to: defaults)
        removeContractionCount(from: defaults)

        XCTAssertNil(restoredContractionCount(from: defaults),
                     "After nil removal, init() must not restore any value")
    }

    /// Removing when no key is present must not crash or leave a bad value.
    func testRemoval_whenKeyAbsent_isIdempotent() {
        removeContractionCount(from: defaults)   // no prior save — must not throw

        XCTAssertNil(restoredContractionCount(from: defaults),
                     "Removing a non-existent key must leave the restore result as nil")
    }

    // MARK: - Sign-out clears the persisted count

    /// Mirrors `clearPersistedSession()` setting `lastContractionCount = nil`,
    /// which triggers didSet → removeObject(forKey:).
    func testSignOut_clearPersistedSession_removesKey() {
        saveContractionCount(7, to: defaults)

        // Simulate clearPersistedSession() → lastContractionCount = nil → didSet
        removeContractionCount(from: defaults)

        XCTAssertNil(restoredContractionCount(from: defaults),
                     "clearPersistedSession must erase the stored contraction count")
    }

    // MARK: - Round-trip (save → remove → save → restore)

    func testRoundTrip_saveRemoveSave_restoresLatestCount() {
        saveContractionCount(3, to: defaults)
        removeContractionCount(from: defaults)
        saveContractionCount(15, to: defaults)

        XCTAssertEqual(restoredContractionCount(from: defaults), 15,
                       "After save → remove → save, init() must restore the latest saved count")
    }

    // MARK: - Bypass-didSet pattern (init uses Published(initialValue:))

    /// init() sets `_lastContractionCount = Published(initialValue: savedContractionCount)` to
    /// bypass didSet and avoid re-writing the already-stored value.
    /// This test confirms that restoring a value leaves the stored key intact
    /// (i.e. reading does NOT remove or overwrite the key as a side effect).
    func testRestoreOnInit_doesNotModifyStoredKey() {
        saveContractionCount(20, to: defaults)

        // Simulate init() read — must be non-destructive
        _ = restoredContractionCount(from: defaults)

        // The key must still hold the original value unchanged
        XCTAssertEqual(defaults.integer(forKey: lastContractionCountKey), 20,
                       "init() restore must be a read-only operation — the stored key must not change")
    }

    // MARK: - Isolation from kick count key

    /// The contraction count key must be distinct from the kick count key so that
    /// kick and contraction data never bleed into each other.
    func testContractionKey_isDistinctFromKickKey() {
        let kickKey = "wk.lastKickCount"
        XCTAssertNotEqual(lastContractionCountKey, kickKey,
                          "Contraction count and kick count must use separate UserDefaults keys")
    }

    func testContractionCount_doesNotAffectKickCount() {
        saveContractionCount(10, to: defaults)

        // Kick count key must remain absent
        XCTAssertEqual(defaults.integer(forKey: "wk.lastKickCount"), 0,
                       "Writing the contraction count must not touch the kick count key")
    }
}
