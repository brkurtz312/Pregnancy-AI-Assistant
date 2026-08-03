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
    static let contraction = "contraction"
    static let tips = "tips"
    static let gestationalWeek = "gestationalWeek"
    /// Sent by the Watch to the iPhone when it activates with no cached tips.
    /// The iPhone replies with the current gestationalWeek and tips payload.
    static let requestSync = "requestSync"
    /// Sent from the phone when the user signs out so the Watch can clear its persisted session.
    static let signOut = "signOut"
}
