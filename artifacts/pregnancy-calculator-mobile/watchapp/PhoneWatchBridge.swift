/// PhoneWatchBridge.swift
/// Place this file in your Expo iOS project (ios/<AppName>/PhoneWatchBridge.swift).
/// It manages the WCSession on the iPhone side and exposes a method React Native
/// can call via the WatchConnectivityModule native module.

import Foundation
import WatchConnectivity

/// Message key constants used by the phone app to communicate with the Watch.
/// Keep in sync with Models.swift (WatchMessage is also declared there for the Watch target).
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

@objc final class PhoneWatchBridge: NSObject {
    @objc static let shared = PhoneWatchBridge()
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // MARK: - Cached values for atomic application-context fallback
    //
    // `sendGestationalWeek` and `sendTips` are called from JS sequentially
    // but independently.  `updateApplicationContext` replaces the entire
    // context on every call, so the second call would clobber the first.
    // We cache the latest value from each call site and always write *both*
    // together so the Watch receives a single atomic snapshot.
    //
    // Both properties are written on the JS (main) queue, so no additional
    // synchronisation is needed.
    private var lastKnownWeek: Int?
    private var lastKnownTipsData: Data?

    private override init() {
        super.init()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601

        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    // MARK: - Send tips to watch

    @objc func sendTips(_ tips: [[String: Any]]) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isWatchAppInstalled else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: tips) else { return }
        lastKnownTipsData = data    // cache for atomic fallback
        let realtimePayload: [String: Any] = [WatchMessage.tips: data]
        // Use sendMessage for immediate delivery when the Watch app is in the
        // foreground; fall back to a combined atomic context update otherwise.
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(realtimePayload, replyHandler: nil, errorHandler: { [weak self] _ in
                self?.sendFallbackContext()
            })
        } else {
            sendFallbackContext()
        }
    }

    @objc func sendGestationalWeek(_ week: Int) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isWatchAppInstalled else { return }
        lastKnownWeek = week        // cache for atomic fallback
        let realtimePayload: [String: Any] = [WatchMessage.gestationalWeek: week]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(realtimePayload, replyHandler: nil, errorHandler: { [weak self] _ in
                self?.sendFallbackContext()
            })
        } else {
            sendFallbackContext()
        }
    }

    /// Sends gestational week and tips as one atomic payload.
    /// When the Watch is reachable both values travel in a single sendMessage;
    /// when unreachable they are written to a single updateApplicationContext so
    /// neither value can overwrite the other mid-flight.
    @objc func sendWeekAndTips(_ week: Int, tips tipsJson: [[String: Any]]) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isWatchAppInstalled else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: tipsJson) else { return }
        // Update cache so any subsequent individual-field call still produces
        // a consistent combined context.
        lastKnownWeek = week
        lastKnownTipsData = data
        let payload: [String: Any] = [
            WatchMessage.gestationalWeek: week,
            WatchMessage.tips: data,
        ]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: { _ in
                try? WCSession.default.updateApplicationContext(payload)
            })
        } else {
            try? WCSession.default.updateApplicationContext(payload)
        }
    }

    // MARK: - Session state

    /// Returns a snapshot of the current WCSession connectivity state.
    func sessionState() -> [String: Any] {
        let session = WCSession.default
        let stateStr: String
        switch session.activationState {
        case .activated:   stateStr = "activated"
        case .inactive:    stateStr = "inactive"
        case .notActivated: stateStr = "notActivated"
        @unknown default:  stateStr = "unknown"
        }
        return [
            "activationState": stateStr,
            "isWatchAppInstalled": WCSession.isSupported() && session.isWatchAppInstalled,
            "isReachable": WCSession.isSupported() && session.isReachable,
        ]
    }

    // MARK: - Callbacks registered by React Native

    var onKickSessionEnd: (([String: Any]) -> Void)?
    var onContractionUpdate: (([String: Any]) -> Void)?
    var onKickUpdate: ((Int) -> Void)?
    /// Called whenever Watch connectivity state changes (reachability, activation, install)
    var onSessionStateChange: (([String: Any]) -> Void)?

    // MARK: - Private helpers

    /// Builds one application context containing every cached due-date value so
    /// the Watch always receives an atomic snapshot — never a partial update
    /// where week and tips belong to different due dates.
    private func sendFallbackContext() {
        var ctx: [String: Any] = [:]
        if let week = lastKnownWeek {
            ctx[WatchMessage.gestationalWeek] = week
        }
        if let data = lastKnownTipsData {
            ctx[WatchMessage.tips] = data
        }
        guard !ctx.isEmpty else { return }
        try? WCSession.default.updateApplicationContext(ctx)
    }
}

// MARK: - WCSessionDelegate

extension PhoneWatchBridge: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        notifyStateChange()
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        notifyStateChange()
    }

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
        notifyStateChange()
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        notifyStateChange()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        notifyStateChange()
    }

    private func notifyStateChange() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onSessionStateChange?(self.sessionState())
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleMessage(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        handleMessage(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        handleMessage(context)
    }

    private func handleMessage(_ payload: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            if let count = payload["kickUpdate"] as? Int {
                self.onKickUpdate?(count)
            }

            if let data = payload["kickSessionEnd"] as? Data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                self.onKickSessionEnd?(json)
            }

            if let data = payload["contractionUpdate"] as? Data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                self.onContractionUpdate?(json)
            }
        }
    }
}
