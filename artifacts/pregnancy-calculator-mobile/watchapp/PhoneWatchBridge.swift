/// PhoneWatchBridge.swift
/// Place this file in your Expo iOS project (ios/<AppName>/PhoneWatchBridge.swift).
/// It manages the WCSession on the iPhone side and exposes a method React Native
/// can call via the WatchConnectivityModule native module.

import Foundation
import WatchConnectivity

@objc final class PhoneWatchBridge: NSObject {
    @objc static let shared = PhoneWatchBridge()
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
    }

    // MARK: - Send tips to watch

    @objc func sendTips(_ tips: [[String: Any]]) {
        guard WCSession.default.activationState == .activated else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: tips) else { return }
        let payload: [String: Any] = ["tips": data]
        if WCSession.default.isWatchAppInstalled {
            try? WCSession.default.updateApplicationContext(payload)
        }
    }

    @objc func sendGestationalWeek(_ week: Int) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isWatchAppInstalled else { return }
        try? WCSession.default.updateApplicationContext(["gestationalWeek": week])
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
