import Foundation

// MARK: - Kick Session

struct KickSessionSummary: Codable {
    var kickCount: Int
    var startedAt: Date
    var endedAt: Date
}

// MARK: - Contraction

struct ContractionRecord: Codable, Identifiable {
    var id: UUID = UUID()
    var startedAt: Date
    var endedAt: Date
    var interval: TimeInterval?   // seconds since last contraction ended

    var duration: TimeInterval { endedAt.timeIntervalSince(startedAt) }
}

/// Summary of a stale contraction session that was discarded on relaunch.
/// Persisted just before the staleness guard wipes UserDefaults so the user
/// can be told what disappeared ("Discarded 4 contractions from yesterday").
struct StaleSessionSummary: Codable {
    var count: Int
    /// Timestamp of the most recent contraction event in the discarded session.
    var lastEventAt: Date
}

// MARK: - Tip

struct WatchTip: Codable, Identifiable {
    var id: UUID = UUID()
    var week: Int
    var emoji: String
    var text: String

    /// Exclude `id` from Codable so that tips arriving from JavaScript
    /// (which never send an `id` field) decode successfully. The field
    /// keeps its default value `UUID()` and is still used by SwiftUI's
    /// `ForEach`/`Identifiable` machinery.
    enum CodingKeys: String, CodingKey {
        case week, emoji, text
    }
}

// MARK: - Message keys (shared with phone bridge)

enum WatchMessage {
    static let kickUpdate = "kickUpdate"
    static let kickCount = "kickCount"
    static let kickSessionEnd = "kickSessionEnd"
    static let kickSession = "kickSession"
    static let contractionUpdate = "contractionUpdate"
    static let contractionSessionEnd = "contractionSessionEnd"
    static let contraction = "contraction"
    static let tips = "tips"
    static let gestationalWeek = "gestationalWeek"
    /// Sent by the Watch to the iPhone when it activates with no cached tips.
    /// The iPhone replies with the current gestationalWeek and tips payload.
    static let requestSync = "requestSync"
    /// Sent from the phone when the user signs out so the Watch can clear its persisted session.
    static let signOut = "signOut"
    /// Sent by the phone in the replyHandler of a contractionUpdate message.
    /// The value is the record's UUID string, confirming durable native receipt on the phone.
    /// The Watch removes the record from its retry queue only when this key is present and
    /// the UUID matches — a blank or absent reply means the phone did not durably persist it.
    static let contractionUpdateAck = "contractionUpdateAck"
}
