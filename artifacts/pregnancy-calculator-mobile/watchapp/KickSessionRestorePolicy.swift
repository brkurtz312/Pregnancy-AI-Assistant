import Foundation

// MARK: - Kick session restore policy
//
// Pure decision logic for KickCounterView.restoreSession(), extracted so unit
// tests can exercise the exact production implementation (rather than a
// mirrored copy that could drift from the real behaviour).

/// The result of evaluating persisted kick-session state on restore.
enum KickSessionRestoreOutcome: Equatable {
    /// No active session persisted — stay idle, leave storage untouched.
    case idle
    /// Persisted state is corrupt (missing/invalid start) or stale (older
    /// than the threshold) — caller must clear the persisted keys and stay idle.
    case clear
    /// A fresh session exists — restore the given count and start date.
    case restore(count: Int, start: Date)
}

enum KickSessionRestorePolicy {
    /// Saved state older than this threshold is discarded on restore so that
    /// yesterday's kick session doesn't reappear as a fresh session.
    /// Mirrors `ContractionDefaults.staleSessionThreshold`; default is 24 hours.
    static let staleSessionThreshold: TimeInterval = 24 * 3600

    /// Evaluates persisted kick-session state.
    ///
    /// - Parameters:
    ///   - active: the persisted `wk.kickSessionActive` flag
    ///   - count: the persisted `wk.kickCount` value
    ///   - startRaw: the persisted `wk.kickSessionStart` value
    ///     (`TimeInterval` since 1970; `0` when the key is absent)
    ///   - now: the current date (injectable for deterministic tests)
    ///   - threshold: staleness cutoff; defaults to `staleSessionThreshold`
    static func evaluate(
        active: Bool,
        count: Int,
        startRaw: Double,
        now: Date,
        threshold: TimeInterval = staleSessionThreshold
    ) -> KickSessionRestoreOutcome {
        guard active else { return .idle }

        // Guard against a zero/missing/negative start date which would
        // indicate stale or corrupt persisted data.
        guard startRaw > 0 else { return .clear }

        let start = Date(timeIntervalSince1970: startRaw)

        // Staleness guard: discard sessions older than the threshold so
        // yesterday's kicks don't silently carry over (strict `>`, matching
        // ContractionTimerView).
        if now.timeIntervalSince(start) > threshold {
            return .clear
        }

        return .restore(count: count, start: start)
    }
}
