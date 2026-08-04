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
            // Queue for ordered delivery when phone is reachable.
            // transferUserInfo guarantees every payload is delivered;
            // updateApplicationContext would silently discard all but the last.
            WCSession.default.transferUserInfo([WatchMessage.kickSessionEnd: data])
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
            // Queue for ordered delivery when phone is reachable.
            WCSession.default.transferUserInfo([WatchMessage.contractionUpdate: data])
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if let error = error {
            print("[WatchSession] Activation failed — state: \(state.rawValue), error: \(error.localizedDescription)")
        } else {
            switch state {
            case .activated:
                print("[WatchSession] Activated successfully.")
                // If we woke up with no cached tips (fresh install or cleared
                // UserDefaults), ask the phone for a sync.  The phone replies
                // with the current gestationalWeek + tips so the Tips tab fills
                // in within seconds, without requiring the user to open the app.
                requestSyncIfNeeded()
            case .inactive:
                print("[WatchSession] Activation completed in inactive state.")
            case .notActivated:
                print("[WatchSession] Activation completed in notActivated state.")
            @unknown default:
                print("[WatchSession] Activation completed with unknown state: \(state.rawValue).")
            }
        }
    }

    /// Sends a requestSync message to the phone when the Watch has no cached tips.
    ///
    /// - If the phone is reachable the message is delivered immediately and the
    ///   phone can reply inline with the current week + tips payload.
    /// - If the phone is not reachable the payload is queued via `transferUserInfo`
    ///   so it is delivered as soon as connectivity is restored.
    private func requestSyncIfNeeded() {
        // tips is already populated from UserDefaults inside init(), so this
        // check runs after the persisted state has been restored.
        guard tips.isEmpty else { return }

        let payload: [String: Any] = [WatchMessage.requestSync: true]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(
                payload,
                replyHandler: { [weak self] reply in
                    // The phone answers from its native cache, which is EMPTY
                    // until the JS layer has sent tips at least once in that
                    // process (e.g. right after the phone app cold-launches).
                    // An empty reply must not end the sync attempt — queue a
                    // durable transferUserInfo request so the phone's JS layer
                    // pushes a fresh snapshot once it has loaded the profile.
                    if reply[WatchMessage.tips] == nil {
                        WCSession.default.transferUserInfo(payload)
                    }
                    self?.handleIncoming(reply)
                },
                errorHandler: { error in
                    print("[WatchSession] requestSync sendMessage failed: \(error.localizedDescription)")
                    // Fall back to guaranteed background delivery.
                    WCSession.default.transferUserInfo(payload)
                }
            )
        } else {
            // transferUserInfo guarantees delivery even if the phone is backgrounded.
            WCSession.default.transferUserInfo(payload)
        }
    }

    /// Re-request a sync whenever the phone becomes reachable and we still
    /// have no tips. Activation-time requestSync can race a phone whose JS
    /// layer hasn't loaded the profile yet; this retry closes that gap.
    func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        DispatchQueue.main.async { [weak self] in
            self?.requestSyncIfNeeded()
        }
    }

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

    /// Receives payloads queued via `transferUserInfo` (guaranteed, ordered delivery).
    /// The phone uses this channel for sign-out messages so they cannot be overwritten
    /// by a subsequent `updateApplicationContext` call before the Watch wakes up.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleIncoming(userInfo)
    }

    // MARK: - Private helpers

    private func handleIncoming(_ payload: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            // A sign-out from the phone takes priority — clear all persisted session
            // data before processing any other keys in the same payload.
            if payload[WatchMessage.signOut] != nil {
                self.clearPersistedSession()
                return
            }

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

    /// Clears every `wk.*` UserDefaults key written by the Watch app and resets
    /// the published state so views restore to their idle state on next launch.
    /// Also posts `.watchDidSignOut` so `KickCounterView` and `ContractionTimerView`
    /// can immediately reset their in-memory `@State` without waiting for a relaunch.
    func clearPersistedSession() {
        let ud = UserDefaults.standard

        // WatchSessionManager keys
        ud.removeObject(forKey: "watchTips")
        ud.removeObject(forKey: "watchGestationalWeek")
        // lastKickCount setter handles its own UserDefaults key
        lastKickCount = nil

        // KickCounterView keys
        ud.removeObject(forKey: "wk.kickCount")
        ud.removeObject(forKey: "wk.kickSessionActive")
        ud.removeObject(forKey: "wk.kickSessionStart")

        // ContractionTimerView keys
        ud.removeObject(forKey: "wk.contractionActive")
        ud.removeObject(forKey: "wk.contractionStart")
        ud.removeObject(forKey: "wk.contractionLastEnd")
        ud.removeObject(forKey: "wk.contractionLastInterval")
        ud.removeObject(forKey: "wk.contractionRecords")

        // Reset published state
        tips = []
        gestationalWeek = 0

        // Notify views so they reset their @State immediately
        NotificationCenter.default.post(name: .watchDidSignOut, object: nil)
    }
}

extension Notification.Name {
    /// Posted by `WatchSessionManager` after a sign-out message is received from the phone.
    static let watchDidSignOut = Notification.Name("WatchSessionManagerDidSignOut")
}
