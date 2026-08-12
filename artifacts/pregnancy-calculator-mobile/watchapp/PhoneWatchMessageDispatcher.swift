/// PhoneWatchMessageDispatcher.swift
/// The phone-side record-dispatch logic extracted from `PhoneWatchBridge` so it
/// can be exercised directly by unit tests (PhoneWatchBridgeCallbackTests).
///
/// `PhoneWatchBridge` cannot be compiled into the watchOS unit-test bundle —
/// it implements iOS-only `WCSessionDelegate` requirements
/// (`sessionDidBecomeInactive` / `sessionDidDeactivate`) and touches
/// `WCSession.default` at init.  This class is pure Foundation: it owns the
/// React Native callback closures and the per-payload dispatch branching, while
/// the bridge keeps the WCSession wiring, the main-queue hop, and the native
/// receipt store (injected here via `persistContractionReceipt`).
///
/// Invariant this type is responsible for (and that the tests pin):
/// `dispatch(_:)` fires each registered callback once PER payload that carries
/// the matching key — never only for the first record of a drain.
///
/// This file is compiled into BOTH the iPhone app target (used by
/// PhoneWatchBridge) and the PregnancyWatchAppTests bundle (driven directly by
/// the tests), so the tests exercise the exact production dispatch code.

import Foundation

final class PhoneWatchMessageDispatcher {

    // MARK: - Callbacks registered by React Native (owned here; PhoneWatchBridge
    // exposes them via forwarding properties so WatchConnectivityModule's
    // registration surface is unchanged).

    var onKickSessionEnd: (([String: Any]) -> Void)?
    var onContractionUpdate: (([String: Any]) -> Void)?
    var onKickUpdate: ((Int) -> Void)?
    var onSyncRequest: (() -> Void)?

    /// Native receipt persistence hook, injected by PhoneWatchBridge
    /// (`persistContractionReceipt(id:data:)`).  Returns `true` when the record
    /// was durably written (or is an idempotent duplicate); `false` when no
    /// user is active.  Dispatch to JS happens regardless — the JS layer owns
    /// the save/ack lifecycle — matching the historical handleMessage behavior.
    var persistContractionReceipt: ((_ id: String, _ data: Data) -> Bool)?

    // Message keys — string literals (not the WatchMessage enum) because this
    // file is compiled into two targets whose WatchMessage declarations differ
    // (PhoneWatchBridge.swift on the phone, Models.swift in the Watch/test
    // targets).  Keep in sync with both.
    private enum Key {
        static let requestSync = "requestSync"
        static let kickUpdate = "kickUpdate"
        static let kickSessionEnd = "kickSessionEnd"
        static let contractionUpdate = "contractionUpdate"
    }

    /// Dispatches ONE received payload to the registered callbacks.  Called by
    /// `PhoneWatchBridge.handleMessage` once per delivered message / userInfo /
    /// applicationContext payload (on the main queue).
    func dispatch(_ payload: [String: Any]) {
        // Watch is asking for a sync (delivered via transferUserInfo when the
        // Watch was not reachable at activation time).  Notify JS so it can
        // call sendWeekAndTips with the current state.
        if payload[Key.requestSync] != nil {
            onSyncRequest?()
            return
        }

        if let count = payload[Key.kickUpdate] as? Int {
            onKickUpdate?(count)
        }

        if let data = payload[Key.kickSessionEnd] as? Data,
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            onKickSessionEnd?(json)
        }

        if let data = payload[Key.contractionUpdate] as? Data,
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            // Persist to native store (no replyHandler on this path — delivered via
            // transferUserInfo or applicationContext). The Watch's retry queue will
            // later resend via sendMessage to get an explicit ack; persisting here
            // ensures idempotent de-duplication when that retry arrives.
            if let idString = json["id"] as? String {
                _ = persistContractionReceipt?(idString, data)
            }
            onContractionUpdate?(json)
        }
    }
}
