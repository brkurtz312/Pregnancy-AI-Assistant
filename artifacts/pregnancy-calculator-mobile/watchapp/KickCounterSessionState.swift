// KickCounterSessionState.swift
// Extracted mutable state for KickCounterView's active kick session.
//
// Kept in its own file without SwiftUI / WatchKit imports so unit tests
// can instantiate, populate, and call `reset()` directly — without
// requiring a SwiftUI host or WatchKit runtime.
//
// `KickCounterView.resetSession()` delegates its field-reset assignments to
// `KickCounterSessionState.resetValues()`, guaranteeing that the view and the
// unit tests share the same definition of "idle state".

import Foundation

/// The in-memory fields that `KickCounterView` holds while a kick session is
/// active or has just been ended.  Extracted here so `resetSession()` can be
/// exercised in unit tests without a SwiftUI host.
struct KickCounterSessionState {
    var kickCount: Int
    var sessionActive: Bool
    var sessionStart: Date?
    var elapsed: TimeInterval

    /// Idle/post-sign-out defaults — the same values `KickCounterView` must
    /// present to a freshly signed-in user.
    init(
        kickCount: Int = 0,
        sessionActive: Bool = false,
        sessionStart: Date? = nil,
        elapsed: TimeInterval = 0
    ) {
        self.kickCount = kickCount
        self.sessionActive = sessionActive
        self.sessionStart = sessionStart
        self.elapsed = elapsed
    }

    /// Resets every field to its idle default in place.
    /// `KickCounterView.resetSession()` calls this to guarantee the view and
    /// tests share one canonical definition of "no active kick session".
    mutating func reset() {
        kickCount = 0
        sessionActive = false
        sessionStart = nil
        elapsed = 0
    }
}
