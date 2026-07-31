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
}
