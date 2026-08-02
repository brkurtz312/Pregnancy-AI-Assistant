import Foundation
import WatchConnectivity
import Combine

/// Manages WCSession on the Watch side. Receives data from the iPhone
/// and sends kick/contraction updates back.
final class WatchSessionManager: NSObject, ObservableObject {
    static let shared = WatchSessionManager()

    // Published state
    @Published var tips: [WatchTip] = []
    @Published var gestationalWeek: Int = 0

    /// Last completed kick-session count, persisted across force-quits.
    @Published var lastKickCount: Int? = nil {
        didSet {
            if let count = lastKickCount {
                UserDefaults.standard.set(count, forKey: "wk.lastKickCount")
            } else {
                UserDefaults.standard.removeObject(forKey: "wk.lastKickCount")
            }
        }
    }

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private override init() {
        super.init()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601

        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }

        // Load persisted tips and gestational week from UserDefaults
        if let data = UserDefaults.standard.data(forKey: "watchTips"),
           let saved = try? decoder.decode([WatchTip].self, from: data) {
            tips = saved
        }
        let savedWeek = UserDefaults.standard.integer(forKey: "watchGestationalWeek")
        if savedWeek > 0 {
            gestationalWeek = savedWeek
        }

        // Restore last kick count
        let savedKickCount = UserDefaults.standard.integer(forKey: "wk.lastKickCount")
        if savedKickCount > 0 {
            // Bypass didSet to avoid re-writing what is already stored
            _lastKickCount = Published(initialValue: savedKickCount)
        }
    }

    // MARK: - Outbound messages to iPhone

    func sendKickUpdate(count: Int) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(
            [WatchMessage.kickUpdate: count],
            replyHandler: nil,
            errorHandler: nil
        )
    }

    func sendKickSessionEnd(summary: KickSessionSummary) {
        // Persist the completed session count for the idle screen
        lastKickCount = summary.kickCount

        guard let data = try? encoder.encode(summary) else { return }
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(
                [WatchMessage.kickSessionEnd: data],
                replyHandler: nil,
                errorHandler: nil
            )
        } else {
            // Queue for transfer when phone is reachable
            try? WCSession.default.updateApplicationContext(
                [WatchMessage.kickSessionEnd: data]
            )
        }
    }

    func sendContractionUpdate(record: ContractionRecord) {
        guard let data = try? encoder.encode(record) else { return }
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(
                [WatchMessage.contractionUpdate: data],
                replyHandler: nil,
                errorHandler: nil
            )
        } else {
            try? WCSession.default.updateApplicationContext(
                [WatchMessage.contractionUpdate: data]
            )
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}

    /// Receives real-time messages from the iPhone
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleIncoming(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        handleIncoming(message)
        replyHandler([:])
    }

    /// Receives context updates (background sync)
    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        handleIncoming(context)
    }

    // MARK: - Private helpers

    private func handleIncoming(_ payload: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            if let data = payload[WatchMessage.tips] as? Data,
               let decoded = try? self.decoder.decode([WatchTip].self, from: data) {
                self.tips = decoded
                UserDefaults.standard.set(data, forKey: "watchTips")
            }

            if let week = payload[WatchMessage.gestationalWeek] as? Int {
                self.gestationalWeek = week
                UserDefaults.standard.set(week, forKey: "watchGestationalWeek")
            }

            if let count = payload[WatchMessage.kickCount] as? Int {
                self.lastKickCount = count
            }
        }
    }
}
