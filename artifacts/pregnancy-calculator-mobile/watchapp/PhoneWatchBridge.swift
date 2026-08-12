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
    static let contractionSessionEnd = "contractionSessionEnd"
    static let contraction = "contraction"
    static let tips = "tips"
    static let gestationalWeek = "gestationalWeek"
    /// Sent by the Watch to the iPhone when it activates with no cached tips.
    static let requestSync = "requestSync"
    /// Sent from the phone when the user signs out so the Watch can clear its persisted session.
    static let signOut = "signOut"
    /// Sent by the phone in the replyHandler of a contractionUpdate message.
    /// The value is the record's UUID string, confirming durable native receipt on the phone.
    /// The Watch dequeues only when this key is present and the UUID matches.
    static let contractionUpdateAck = "contractionUpdateAck"
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

        // Wire the shared dispatcher's persistence hook to the native receipt
        // store so records dispatched via handleMessage are durably written
        // before the JS callback fires.
        dispatcher.persistContractionReceipt = { [weak self] id, data in
            self?.persistContractionReceipt(id: id, data: data) ?? false
        }

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

    /// Sends a sign-out notification to the Watch so it can clear its persisted session data.
    ///
    /// Delivery strategy:
    /// - `sendMessage` for immediate delivery when the Watch app is in the foreground.
    /// - `transferUserInfo` for guaranteed background delivery.  Unlike `updateApplicationContext`,
    ///   which is last-write-wins and would be silently overwritten if `sendWeekAndTips` runs
    ///   before the Watch wakes up, `transferUserInfo` queues each payload independently so the
    ///   sign-out message is always delivered even when subsequent context updates occur.
    @objc func sendSignOut() {
        // Wipe native contraction receipt store for the departing user FIRST so
        // that even a late Watch `transferUserInfo` that arrives during or after
        // this call cannot be attributed to them.  After clearing, set activeUserId
        // to nil so any subsequent receipt delivery (before the next user signs in)
        // is silently dropped — the Watch's own retry queue holds the record and
        // resends once an authenticated session is re-established.
        clearAllContractionReceipts()
        activeUserId = nil

        guard WCSession.default.activationState == .activated,
              WCSession.default.isWatchAppInstalled else { return }

        let payload: [String: Any] = [WatchMessage.signOut: true]

        // Best-effort real-time delivery when the Watch app is in the foreground.
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }

        // Durable background delivery: transferUserInfo queues each payload
        // independently — a later sendWeekAndTips (via updateApplicationContext)
        // cannot overwrite or discard this message before the Watch wakes up.
        WCSession.default.transferUserInfo(payload)
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

    // MARK: - Native contraction receipt store
    //
    // When the phone receives a `contractionUpdate` it writes the record to a
    // native UserDefaults store **before** replying to the Watch.  This guarantees
    // that a phone force-quit between the reply and a JS/API save cannot silently
    // lose the record — on next launch JS reads the pending store and retries.
    //
    // Key layout (all keys are scoped to the signed-in user's ID):
    //   ph.contractionReceiptIds:<userId>   [String]  — ordered list of received record UUIDs
    //   ph.contractionRecord:<userId>.<id>  Data       — raw encoded record for each UUID
    //
    // Scoping by userId prevents a `transferUserInfo` that was already enqueued on the
    // Watch from being attributed to the *next* signed-in account when the phone receives
    // it after sign-out.  If no account is active (`activeUserId == nil`), receipt
    // persistence is silently skipped — the Watch's own retry queue will resend when
    // the next authenticated user restores the session.

    // MARK: Active user gate

    /// The signed-in user whose receipts are accepted.  JS must call
    /// `setActiveUserId` on sign-in (before the startup drain) and on sign-out
    /// (via `sendSignOut`, which clears the store for the departing user and then
    /// sets this to nil).  When nil, incoming Watch receipts are silently dropped.
    var activeUserId: String?

    /// Called by JS when a user signs in or signs out.  Always set BEFORE reading
    /// `pendingContractionReceipts` on sign-in so that reads use the correct scope.
    func setActiveUserId(_ userId: String?) {
        activeUserId = userId
    }

    // MARK: Scoped key helpers

    private func receiptIdsKey(for userId: String) -> String {
        "ph.contractionReceiptIds:\(userId)"
    }

    private func receiptDataKey(for userId: String, recordId: String) -> String {
        "ph.contractionRecord:\(userId).\(recordId)"
    }

    // MARK: Receipt operations

    /// Durably writes `record` data to native UserDefaults keyed by `id`.
    ///
    /// Returns `true` when the data was actually written; returns `false` and does
    /// **not** persist in two cases:
    ///   1. `activeUserId` is nil (signed out) — the caller MUST send an empty reply
    ///      `replyHandler([:])` so the Watch keeps its retry record queued.  Sending
    ///      a matching ack UUID when this returns `false` would cause the Watch to
    ///      dequeue the record, losing the contraction silently.
    ///   2. The ID is already present (idempotent duplicate — returns `true` so the
    ///      caller sends a matching ack UUID; the Watch dequeues safely because the
    ///      record is already durable and will be returned by the next drain call).
    ///
    /// This must be called **synchronously before** replying to the Watch so that
    /// a phone crash after the reply still leaves the data recoverable on relaunch.
    @discardableResult
    func persistContractionReceipt(id: String, data: Data) -> Bool {
        guard let userId = activeUserId else {
            // No active user — drop the record.  The Watch's own retry queue still
            // holds the record and will resend when the next authenticated session
            // is established.  The caller must NOT send a matching ack.
            return false
        }
        let idsKey = receiptIdsKey(for: userId)
        var ids = UserDefaults.standard.stringArray(forKey: idsKey) ?? []
        // Idempotent: record already durably stored — signal success so the caller
        // sends a matching ack UUID and the Watch can safely dequeue the retry record.
        // This covers the transferUserInfo-then-sendMessage flush pattern:
        //   1. transferUserInfo persists the receipt (no Watch ack on this path)
        //   2. Watch retries via sendMessage → duplicate → return true → ack sent
        //   3. Watch dequeues; native store still holds the receipt for JS drain
        guard !ids.contains(id) else { return true }
        // Write data FIRST, then add to the IDs index.
        // This ordering guarantees that a force-quit between the two writes leaves an
        // orphan data key (with no ID in the list), NOT an orphan ID with no data.
        // An orphan data key is harmless — the next Watch retry will overwrite it and
        // then add the ID.  An orphan ID with no data would cause pendingContractionReceipts()
        // to skip it forever (since the data key is missing), making the record unrecoverable.
        UserDefaults.standard.set(data, forKey: receiptDataKey(for: userId, recordId: id))
        ids.append(id)
        UserDefaults.standard.set(ids, forKey: idsKey)
        return true
    }

    /// Returns all pending contraction records that have been natively persisted
    /// but not yet acknowledged as saved by JS (e.g. after a phone force-quit).
    /// Returns an empty array when `activeUserId` is nil.
    ///
    /// Also repairs any orphan IDs whose data key was lost due to a partial write
    /// (e.g. app terminated between the data write and the IDs-list update in the old
    /// ordering); such IDs are silently removed from the list.
    @objc func pendingContractionReceipts() -> [[String: Any]] {
        guard let userId = activeUserId else { return [] }
        let idsKey = receiptIdsKey(for: userId)
        let ids = UserDefaults.standard.stringArray(forKey: idsKey) ?? []
        var result: [[String: Any]] = []
        var validIds: [String] = []
        for id in ids {
            let dataKey = receiptDataKey(for: userId, recordId: id)
            if let data = UserDefaults.standard.data(forKey: dataKey),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                result.append(json)
                validIds.append(id)
            } else {
                // Orphan ID — data was never written or was removed; clean up.
                UserDefaults.standard.removeObject(forKey: dataKey)
            }
        }
        if validIds.count != ids.count {
            UserDefaults.standard.set(validIds, forKey: idsKey)
        }
        return result
    }

    /// Clears all natively persisted contraction receipts for the current
    /// `activeUserId`.  Called on sign-out so that late Watch deliveries arriving
    /// after account switch cannot be attributed to the next user.
    /// After this returns, `sendSignOut()` sets `activeUserId = nil` so any
    /// subsequent incoming `transferUserInfo` delivery is silently dropped.
    @objc func clearAllContractionReceipts() {
        guard let userId = activeUserId else { return }
        let idsKey = receiptIdsKey(for: userId)
        let ids = UserDefaults.standard.stringArray(forKey: idsKey) ?? []
        for id in ids {
            UserDefaults.standard.removeObject(forKey: receiptDataKey(for: userId, recordId: id))
        }
        UserDefaults.standard.removeObject(forKey: idsKey)
    }

    /// Called by JS once a contraction record has been durably saved (to the API or
    /// an offline queue that guarantees eventual delivery) so the phone's native
    /// pending store can be cleared and the record is not replayed on next launch.
    @objc func acknowledgeContractionReceipt(id: String) {
        guard let userId = activeUserId else { return }
        let idsKey = receiptIdsKey(for: userId)
        var ids = UserDefaults.standard.stringArray(forKey: idsKey) ?? []
        ids.removeAll { $0 == id }
        UserDefaults.standard.set(ids, forKey: idsKey)
        UserDefaults.standard.removeObject(forKey: receiptDataKey(for: userId, recordId: id))
    }

    // MARK: - Callbacks registered by React Native
    //
    // The record-dispatch callbacks live on the shared PhoneWatchMessageDispatcher
    // (the extracted, unit-tested dispatch logic — see PhoneWatchMessageDispatcher.swift);
    // these forwarding properties keep WatchConnectivityModule's registration
    // surface unchanged.

    let dispatcher = PhoneWatchMessageDispatcher()

    var onKickSessionEnd: (([String: Any]) -> Void)? {
        get { dispatcher.onKickSessionEnd }
        set { dispatcher.onKickSessionEnd = newValue }
    }
    var onContractionUpdate: (([String: Any]) -> Void)? {
        get { dispatcher.onContractionUpdate }
        set { dispatcher.onContractionUpdate = newValue }
    }
    var onKickUpdate: ((Int) -> Void)? {
        get { dispatcher.onKickUpdate }
        set { dispatcher.onKickUpdate = newValue }
    }
    /// Called whenever Watch connectivity state changes (reachability, activation, install)
    var onSessionStateChange: (([String: Any]) -> Void)?
    /// Called when the Watch requests a tip sync (no cached tips on Watch side).
    /// The receiver should respond by calling sendWeekAndTips with current data.
    var onSyncRequest: (() -> Void)? {
        get { dispatcher.onSyncRequest }
        set { dispatcher.onSyncRequest = newValue }
    }

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
        // requestSync: reply immediately with the latest cached week + tips so
        // the Watch gets data without a JS round-trip, then also fire the JS
        // callback so React Native can push a fresh snapshot if the cache is stale.
        if message[WatchMessage.requestSync] != nil {
            var reply: [String: Any] = [:]
            if let week = lastKnownWeek {
                reply[WatchMessage.gestationalWeek] = week
            }
            if let data = lastKnownTipsData {
                reply[WatchMessage.tips] = data
            }
            replyHandler(reply)
            DispatchQueue.main.async { [weak self] in self?.onSyncRequest?() }
            return
        }

        // contractionUpdate: persist the record to native storage *before* replying
        // so a phone force-quit after the reply cannot silently discard the data.
        // The reply carries the record's UUID so the Watch dequeues only on a
        // confirmed, durable receipt — not on a bare empty acknowledgment.
        if let data = message[WatchMessage.contractionUpdate] as? Data,
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let idString = json["id"] as? String {
            // 1. Write to native store synchronously (survives an immediate force-quit).
            //    persistContractionReceipt returns true ONLY when activeUserId is set and the
            //    record was actually written.  When it returns false (signed-out delivery),
            //    we MUST NOT send a matching ack — an ack causes the Watch to dequeue its
            //    retry record, permanently losing the contraction.
            let persisted = persistContractionReceipt(id: idString, data: data)
            if persisted {
                // 2a. Durable receipt written — send matching ack so Watch dequeues.
                replyHandler([WatchMessage.contractionUpdateAck: idString])
                // 3. Dispatch to JS so React Native can persist to API / offline queue.
                DispatchQueue.main.async { [weak self] in self?.onContractionUpdate?(json) }
            } else {
                // 2b. Signed out (activeUserId was nil at persist time) — empty reply keeps
                //     the record in the Watch retry queue for the next authenticated session.
                //     Duplicate receipts now return true (handled above with a matching ack),
                //     so this branch is reached only when no user is active.
                replyHandler([:])
            }
            return
        }

        handleMessage(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        handleMessage(context)
    }

    /// Receives queued payloads sent via `transferUserInfo` (e.g. offline contraction
    /// and kick-session-end records).  Unlike `applicationContext`, every transferred
    /// userInfo dictionary is delivered in order, so no records are silently dropped.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleMessage(userInfo)
    }

    /// Hops to the main queue and hands the payload to the shared dispatcher —
    /// the extracted, unit-tested dispatch logic that fires each registered JS
    /// callback once per delivered record (see PhoneWatchMessageDispatcher.swift).
    private func handleMessage(_ payload: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            self?.dispatcher.dispatch(payload)
        }
    }
}
