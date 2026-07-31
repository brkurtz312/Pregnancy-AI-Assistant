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

    // MARK: - Callbacks registered by React Native

    var onKickSessionEnd: (([String: Any]) -> Void)?
    var onContractionUpdate: (([String: Any]) -> Void)?
    var onKickUpdate: ((Int) -> Void)?
}

// MARK: - WCSessionDelegate

extension PhoneWatchBridge: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
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
