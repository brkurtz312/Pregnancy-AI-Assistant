// WatchDeliveryLog.swift
// What the Watch knows about its own outbound delivery, kept somewhere a
// person can read it on the Watch itself.
//
// Contraction and kick sessions recorded on the Watch do not reach the iPhone
// — see "The Apple Watch sync defect" in docs/app-review-notes.md. Every
// diagnosis so far has been made from the phone, where the news is uniformly
// good: setActiveWatchUser succeeds, the session reports activated, and a
// force-quit drains an empty receipt store. The phone cannot explain records
// it never receives.
//
// The Watch can, and has been throwing the explanation away. Every
// `sendMessage` takes an error handler; each one discarded its error and fell
// back to `transferUserInfo`, which reports nothing at all. A reply that
// arrives without a matching ack is discarded the same way — the record stays
// queued and nobody is told. This type keeps all of it.
//
// Imports Foundation only — no WatchConnectivity, WatchKit or SwiftUI — so it
// compiles into the unit-test bundle, as WatchSessionPersistence does.

import Foundation

/// A delivery outcome, in the order the Watch attempts them.
enum WatchDeliveryOutcome: String, Codable {
    /// Handed to `sendMessage` while the phone reported itself reachable,
    /// with no reply requested. Kick counts and session ends are fire and
    /// forget, so they can never be acknowledged and must not be counted
    /// against the acknowledgement rate.
    case sent
    /// Handed to `sendMessage` WITH a reply handler — a contraction record,
    /// which the phone is supposed to acknowledge by UUID. Only these can be
    /// said to have gone unanswered.
    case sentAwaitingAck
    /// The phone replied with an ack UUID matching the record sent.
    case acknowledged
    /// The phone replied, but not with a matching ack. The record stays in the
    /// retry queue and the Watch says nothing — a prime suspect, because it
    /// looks identical to success from the phone's side.
    case unacknowledged
    /// `sendMessage` called its error handler.
    case failed
    /// Handed to `transferUserInfo`, either as an offline queue or as the
    /// fallback after a `sendMessage` failure. The OS reports no outcome.
    case queued
    /// Dropped without any send attempt because the phone was unreachable.
    /// Only the live kick counter does this; it is cosmetic and not queued.
    case unreachable
}

/// Counters and last-seen detail for each outcome.
struct WatchDeliveryStats: Codable, Equatable {
    var sent = 0
    var sentAwaitingAck = 0
    var acknowledged = 0
    var unacknowledged = 0
    var failed = 0
    var queued = 0
    var unreachable = 0

    var lastAttemptAt: Date?
    var lastAcknowledgedAt: Date?
    var lastFailure: String?
    var lastFailureAt: Date?

    /// The most recent WCSession activation result. Until now this was printed
    /// to a console unreadable without a Mac attached.
    var activation: String?
    var activationAt: Date?

    /// True when the Watch has sent records that ask to be acknowledged and
    /// none ever has been. The exact shape of the defect being chased.
    ///
    /// Counts only `sentAwaitingAck`: a healthy app fires many kick updates
    /// that request no reply, and counting those would make every Watch look
    /// broken.
    var isDeliveringIntoTheVoid: Bool {
        sentAwaitingAck > 0 && acknowledged == 0
    }

    /// True when nothing has been attempted, so there is no verdict to give.
    var hasAttemptedDelivery: Bool {
        (sent + sentAwaitingAck + queued) > 0
    }
}

/// Thread-safe, persisted across launches.
///
/// WatchConnectivity invokes its reply and error handlers on a background
/// queue, so every mutation takes a lock rather than hopping to the main queue
/// — `snapshot()` is then synchronous and always current, which keeps the
/// tests free of expectations and the view free of a subscription.
final class WatchDeliveryLog {
    private let defaults: UserDefaults
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let lock = NSLock()
    private var current: WatchDeliveryStats

    init(userDefaults: UserDefaults = .standard) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        self.defaults = userDefaults
        self.encoder = encoder
        self.decoder = decoder

        if let data = userDefaults.data(forKey: WatchSessionPersistence.deliveryLogKey),
           let saved = try? decoder.decode(WatchDeliveryStats.self, from: data) {
            self.current = saved
        } else {
            self.current = WatchDeliveryStats()
        }
    }

    /// The current counters. Synchronous and always up to date.
    func snapshot() -> WatchDeliveryStats {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    /// Records one delivery outcome. `detail` is kept only for `.failed`,
    /// where it is the error's own description.
    func record(_ outcome: WatchDeliveryOutcome, detail: String? = nil) {
        mutate { stats in
            let now = Date()
            switch outcome {
            case .sent:
                stats.sent += 1
                stats.lastAttemptAt = now
            case .sentAwaitingAck:
                stats.sentAwaitingAck += 1
                stats.lastAttemptAt = now
            case .acknowledged:
                stats.acknowledged += 1
                stats.lastAcknowledgedAt = now
            case .unacknowledged:
                stats.unacknowledged += 1
            case .failed:
                stats.failed += 1
                stats.lastFailure = detail ?? "unknown error"
                stats.lastFailureAt = now
            case .queued:
                stats.queued += 1
                stats.lastAttemptAt = now
            case .unreachable:
                stats.unreachable += 1
            }
        }
    }

    /// Records a `sendMessage` error by its own description.
    func record(failure error: Error) {
        record(.failed, detail: describe(error))
    }

    /// Records the WCSession activation result.
    func recordActivation(_ description: String) {
        mutate { stats in
            stats.activation = description
            stats.activationAt = Date()
        }
    }

    /// Clears the counters. Called from `clearPersistedSession()` along with
    /// every other persisted key, so a sign-out starts a clean diagnosis.
    func reset() {
        mutate { $0 = WatchDeliveryStats() }
    }

    // MARK: - Private

    private func mutate(_ change: (inout WatchDeliveryStats) -> Void) {
        lock.lock()
        change(&current)
        let next = current
        lock.unlock()
        persist(next)
    }

    private func persist(_ stats: WatchDeliveryStats) {
        if let data = try? encoder.encode(stats) {
            defaults.set(data, forKey: WatchSessionPersistence.deliveryLogKey)
        }
    }

    /// `localizedDescription` on a WCError is often just "The operation
    /// couldn't be completed", which says nothing on a 40mm screen. The code
    /// is the part worth reading, so lead with it.
    private func describe(_ error: Error) -> String {
        let nsError = error as NSError
        let code = "\(nsError.domain) \(nsError.code)"
        let text = nsError.localizedDescription
        return text.isEmpty ? code : "\(code): \(text)"
    }
}
