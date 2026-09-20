import Foundation
import WatchConnectivity
import Combine

/// Abstraction over the WatchConnectivity send/transfer operations so unit
/// tests can drive the REAL send paths (`sendKickSessionEnd`,
/// `sendContractionUpdate`, `sendContractionSessionEnd`, sync requests and the
/// retry-queue flush) through a fake transport and assert channel selection,
/// enqueue ordering, and failure fallbacks.
protocol WatchConnectivityTransport {
    var isReachable: Bool { get }
    func sendMessage(
        _ message: [String: Any],
        replyHandler: (([String: Any]) -> Void)?,
        errorHandler: ((Error) -> Void)?
    )
    func transferUserInfo(_ userInfo: [String: Any])
}

/// Production transport backed by `WCSession.default`.
struct WCSessionTransport: WatchConnectivityTransport {
    var isReachable: Bool { WCSession.default.isReachable }

    func sendMessage(
        _ message: [String: Any],
        replyHandler: (([String: Any]) -> Void)?,
        errorHandler: ((Error) -> Void)?
    ) {
        WCSession.default.sendMessage(message, replyHandler: replyHandler, errorHandler: errorHandler)
    }

    func transferUserInfo(_ userInfo: [String: Any]) {
        WCSession.default.transferUserInfo(userInfo)
    }
}

/// Manages WCSession on the Watch side. Receives data from the iPhone
/// and sends kick/contraction updates back.
final class WatchSessionManager: NSObject, ObservableObject {
    static let shared = WatchSessionManager()

    // Published state
    @Published var tips: [WatchTip] = []
    @Published var gestationalWeek: Int = 0

    /// True while the Watch has sent a requestSync to the phone and is waiting
    /// for the first tips payload to arrive.  Resets to false once tips land or
    /// after a short timeout so the view can fall back to the normal empty state.
    @Published var isSyncing: Bool = false

    /// Last completed kick-session count, persisted across force-quits.
    @Published var lastKickCount: Int? = nil {
        didSet {
            if let count = lastKickCount {
                userDefaults.set(count, forKey: WatchSessionPersistence.lastKickCountKey)
            } else {
                userDefaults.removeObject(forKey: WatchSessionPersistence.lastKickCountKey)
            }
        }
    }

    /// Last completed contraction-session count, persisted across force-quits.
    @Published var lastContractionCount: Int? = nil {
        didSet {
            if let count = lastContractionCount {
                userDefaults.set(count, forKey: WatchSessionPersistence.lastContractionCountKey)
            } else {
                userDefaults.removeObject(forKey: WatchSessionPersistence.lastContractionCountKey)
            }
        }
    }

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var syncTimeoutWork: DispatchWorkItem?

    /// Injected persistence store. `.standard` in production; an isolated suite in tests.
    let userDefaults: UserDefaults

    /// Injected notification center. `.default` in production; an isolated instance in tests.
    let notificationCenter: NotificationCenter

    /// Injected WatchConnectivity transport. `WCSessionTransport` in production;
    /// a recording fake in tests so the real send paths can be exercised.
    let transport: WatchConnectivityTransport

    /// Records what happens to each outbound message. Every send path below
    /// used to discard its own failures; this is where they go instead.
    let deliveryLog: WatchDeliveryLog

    /// UserDefaults key for the pending-acknowledgment retry queue.
    /// Records stay here until the phone sends a reply (or transferUserInfo delivers them).
    private let pendingContractionUpdatesKey = WatchSessionPersistence.pendingContractionUpdatesKey

    private override convenience init() {
        self.init(userDefaults: .standard, notificationCenter: .default, activateSession: true)
    }

    /// Designated initializer with injectable dependencies.
    /// Tests pass an isolated `UserDefaults` suite, their own `NotificationCenter`,
    /// and `activateSession: false` so no WCSession activation is attempted in a
    /// test host without paired-device connectivity.
    init(
        userDefaults: UserDefaults,
        notificationCenter: NotificationCenter,
        activateSession: Bool,
        transport: WatchConnectivityTransport = WCSessionTransport(),
        deliveryLog: WatchDeliveryLog? = nil
    ) {
        self.userDefaults = userDefaults
        self.notificationCenter = notificationCenter
        self.transport = transport
        // Defaults to a log on the same store, so a test suite with an isolated
        // UserDefaults suite gets an isolated log without asking for one.
        self.deliveryLog = deliveryLog ?? WatchDeliveryLog(userDefaults: userDefaults)
        super.init()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601

        if activateSession && WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }

        // Load persisted tips and gestational week from UserDefaults
        if let data = userDefaults.data(forKey: WatchSessionPersistence.tipsKey),
           let saved = try? decoder.decode([WatchTip].self, from: data) {
            tips = saved
        }
        let savedWeek = userDefaults.integer(forKey: WatchSessionPersistence.gestationalWeekKey)
        if savedWeek > 0 {
            gestationalWeek = savedWeek
        }

        // Restore last kick count
        let savedKickCount = userDefaults.integer(forKey: WatchSessionPersistence.lastKickCountKey)
        if savedKickCount > 0 {
            // Bypass didSet to avoid re-writing what is already stored
            _lastKickCount = Published(initialValue: savedKickCount)
        }

        // Restore last contraction count
        let savedContractionCount = userDefaults.integer(forKey: WatchSessionPersistence.lastContractionCountKey)
        if savedContractionCount > 0 {
            // Bypass didSet to avoid re-writing what is already stored
            _lastContractionCount = Published(initialValue: savedContractionCount)
        }
    }

    // MARK: - Outbound messages to iPhone

    func sendKickUpdate(count: Int) {
        // Live counts are cosmetic and deliberately not queued — but a Watch
        // that is never reachable is the headline symptom, so say so.
        guard transport.isReachable else {
            deliveryLog.record(.unreachable)
            return
        }
        deliveryLog.record(.sent)
        transport.sendMessage(
            [WatchMessage.kickUpdate: count],
            replyHandler: nil,
            errorHandler: { [deliveryLog] error in
                deliveryLog.record(failure: error)
            }
        )
    }

    func sendKickSessionEnd(summary: KickSessionSummary) {
        // Persist the completed session count for the idle screen
        lastKickCount = summary.kickCount

        guard let data = try? encoder.encode(summary) else { return }
        let payload: [String: Any] = [WatchMessage.kickSessionEnd: data]
        if transport.isReachable {
            deliveryLog.record(.sent)
            transport.sendMessage(
                payload,
                replyHandler: nil,
                errorHandler: { [transport, deliveryLog] error in
                    // Reachability can flip mid-send (e.g. the phone is force-quit
                    // right after the check). Fall back to the durable OS queue so
                    // the session summary is delivered on the phone's next launch.
                    deliveryLog.record(failure: error)
                    deliveryLog.record(.queued)
                    transport.transferUserInfo(payload)
                }
            )
        } else {
            // Queue for ordered delivery when phone is reachable.
            // transferUserInfo guarantees every payload is delivered;
            // updateApplicationContext would silently discard all but the last.
            deliveryLog.record(.queued)
            transport.transferUserInfo(payload)
        }
    }

    func sendContractionUpdate(record: ContractionRecord) {
        guard let data = try? encoder.encode(record) else { return }

        // Persist in the retry queue *before* attempting delivery so that a
        // force-quit of the Watch app between encoding and sending cannot lose the
        // record. The record is removed once the phone acknowledges receipt.
        enqueuePendingContractionUpdate(record)

        if transport.isReachable {
            deliveryLog.record(.sentAwaitingAck)
            transport.sendMessage(
                [WatchMessage.contractionUpdate: data],
                replyHandler: { [weak self] reply in
                    // Dequeue only when the phone replies with a matching ack UUID.
                    // An empty or mismatched reply means the phone did not durably
                    // persist the record — leave it in the queue for retry.
                    guard let ackId = reply[WatchMessage.contractionUpdateAck] as? String,
                          ackId == record.id.uuidString else {
                        // Indistinguishable from success on the phone's side, and
                        // silent here until now: the phone answered, the record
                        // stayed queued, and nobody was told.
                        self?.deliveryLog.record(.unacknowledged)
                        return
                    }
                    self?.deliveryLog.record(.acknowledged)
                    self?.dequeuePendingContractionUpdate(id: record.id)
                },
                errorHandler: { [transport, deliveryLog] error in
                    // Real-time send failed; keep the record in the queue so the
                    // next reachability window can retry, and also fall back to
                    // transferUserInfo for guaranteed background delivery.
                    deliveryLog.record(failure: error)
                    deliveryLog.record(.queued)
                    transport.transferUserInfo([WatchMessage.contractionUpdate: data])
                }
            )
        } else {
            // transferUserInfo guarantees ordered delivery when the phone becomes
            // reachable. The record stays in the retry queue until the phone acks.
            deliveryLog.record(.queued)
            transport.transferUserInfo([WatchMessage.contractionUpdate: data])
        }
    }

    /// Called when the user explicitly ends a contraction session.
    /// Persists the session count for the idle screen and forwards it to the
    /// iPhone when reachable; falls back to transferUserInfo when offline.
    func sendContractionSessionEnd(count: Int) {
        // Persist for the Watch idle screen — survives restarts even without iPhone.
        lastContractionCount = count

        let payload: [String: Any] = [WatchMessage.contractionSessionEnd: count]
        if transport.isReachable {
            deliveryLog.record(.sent)
            transport.sendMessage(payload, replyHandler: nil, errorHandler: { [transport, deliveryLog] error in
                // Reachability can flip mid-send (phone force-quit racing the
                // check) — fall back to the durable OS queue.
                deliveryLog.record(failure: error)
                deliveryLog.record(.queued)
                transport.transferUserInfo(payload)
            })
        } else {
            deliveryLog.record(.queued)
            transport.transferUserInfo(payload)
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if let error = error {
            print("[WatchSession] Activation failed — state: \(state.rawValue), error: \(error.localizedDescription)")
            deliveryLog.recordActivation("failed (state \(state.rawValue)): \(error.localizedDescription)")
        } else {
            switch state {
            case .activated:
                print("[WatchSession] Activated successfully.")
                deliveryLog.recordActivation("activated")
                // If we woke up with no cached tips (fresh install or cleared
                // UserDefaults), ask the phone for a sync.  The phone replies
                // with the current gestationalWeek + tips so the Tips tab fills
                // in within seconds, without requiring the user to open the app.
                requestSyncIfNeeded()
            case .inactive:
                print("[WatchSession] Activation completed in inactive state.")
                deliveryLog.recordActivation("inactive")
            case .notActivated:
                print("[WatchSession] Activation completed in notActivated state.")
                deliveryLog.recordActivation("notActivated")
            @unknown default:
                print("[WatchSession] Activation completed with unknown state: \(state.rawValue).")
                deliveryLog.recordActivation("unknown (\(state.rawValue))")
            }
        }
    }

    /// Sends a requestSync message to the phone when the Watch has no cached tips,
    /// or when the cached tips are stale (their week doesn't match the current
    /// gestational week received from the phone).
    ///
    /// Staleness is detected by comparing `tips[0].week` to the last known
    /// `gestationalWeek` stored in UserDefaults.  When the week has rolled over
    /// the Watch requests a fresh snapshot even if the cache is non-empty, so
    /// the Tips tab always reflects the current week on re-activation.
    ///
    /// - If the phone is reachable the message is delivered immediately and the
    ///   phone can reply inline with the current week + tips payload.
    /// - If the phone is not reachable the payload is queued via `transferUserInfo`
    ///   so it is delivered as soon as connectivity is restored.
    private func requestSyncIfNeeded() {
        // tips and gestationalWeek are already populated from UserDefaults inside
        // init(), so this check runs after the persisted state has been restored.

        // Tips are considered stale when the phone has previously told us the
        // current gestational week and the cached tips were built for a different
        // week.  A week value of 0 means we have never received a week from the
        // phone, so we treat that as "unknown" and skip the staleness check to
        // avoid a spurious sync on a fresh install where both values are 0.
        let tipsStale = !tips.isEmpty
            && gestationalWeek > 0
            && tips.first?.week != gestationalWeek

        guard tips.isEmpty || tipsStale else { return }

        // Show a loading indicator while we wait for the phone to respond.
        // A 10-second timeout resets to false so the view can fall back to
        // the normal empty state if the phone never replies.
        startSyncingWithTimeout()

        let payload: [String: Any] = [WatchMessage.requestSync: true]
        if transport.isReachable {
            transport.sendMessage(
                payload,
                replyHandler: { [weak self, transport] reply in
                    // The phone answers from its native cache, which is EMPTY
                    // until the JS layer has sent tips at least once in that
                    // process (e.g. right after the phone app cold-launches).
                    // An empty reply must not end the sync attempt — queue a
                    // durable transferUserInfo request so the phone's JS layer
                    // pushes a fresh snapshot once it has loaded the profile.
                    if reply[WatchMessage.tips] == nil {
                        transport.transferUserInfo(payload)
                    }
                    self?.handleIncoming(reply)
                },
                errorHandler: { [transport] error in
                    print("[WatchSession] requestSync sendMessage failed: \(error.localizedDescription)")
                    // Fall back to guaranteed background delivery.
                    transport.transferUserInfo(payload)
                }
            )
        } else {
            // transferUserInfo guarantees delivery even if the phone is backgrounded.
            transport.transferUserInfo(payload)
        }
    }

    /// Marks `isSyncing = true` and schedules a 10-second timeout that resets
    /// it to false if no tips arrive in time.  Any incoming tips cancel the timer.
    private func startSyncingWithTimeout() {
        syncTimeoutWork?.cancel()
        DispatchQueue.main.async { self.isSyncing = true }

        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            // Only clear the flag if we still have no tips; if tips arrived
            // the flag was already cleared in handleIncoming.
            if self.tips.isEmpty {
                self.isSyncing = false
            }
        }
        syncTimeoutWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: work)
    }

    /// Re-request a sync whenever the phone becomes reachable and we still
    /// have no tips. Activation-time requestSync can race a phone whose JS
    /// layer hasn't loaded the profile yet; this retry closes that gap.
    /// Also flushes any contraction records that were not yet acknowledged by
    /// the phone (e.g. because the phone was force-quit mid-session).
    func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        DispatchQueue.main.async { [weak self] in
            self?.requestSyncIfNeeded()
            self?.flushPendingContractionUpdates()
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

    // MARK: - Contraction retry queue

    /// Adds `record` to the UserDefaults pending-acknowledgment queue if it is
    /// not already present (idempotent by `record.id`).
    func enqueuePendingContractionUpdate(_ record: ContractionRecord) {
        var pending = loadPendingContractionQueue()
        guard !pending.contains(where: { $0.id == record.id }) else { return }
        pending.append(record)
        savePendingContractionQueue(pending)
    }

    /// Removes the record with `id` from the pending queue.
    /// Called when the phone sends a reply acknowledging the record.
    func dequeuePendingContractionUpdate(id: UUID) {
        var pending = loadPendingContractionQueue()
        pending.removeAll { $0.id == id }
        savePendingContractionQueue(pending)
    }

    /// Resends every record in the pending queue now that the phone is reachable.
    /// Each record is removed from the queue only after the phone sends back a
    /// `contractionUpdateAck` whose UUID matches the sent record.  A blank,
    /// absent, or mismatched reply is treated as "not yet durably persisted" and
    /// the record is kept for the next reconnect.
    func flushPendingContractionUpdates() {
        let pending = loadPendingContractionQueue()
        guard !pending.isEmpty else { return }

        for record in pending {
            guard let data = try? encoder.encode(record) else { continue }
            deliveryLog.record(.sentAwaitingAck)
            transport.sendMessage(
                [WatchMessage.contractionUpdate: data],
                replyHandler: { [weak self] reply in
                    guard let ackId = reply[WatchMessage.contractionUpdateAck] as? String,
                          ackId == record.id.uuidString else {
                        self?.deliveryLog.record(.unacknowledged)
                        return
                    }
                    self?.deliveryLog.record(.acknowledged)
                    self?.dequeuePendingContractionUpdate(id: record.id)
                },
                errorHandler: { [transport, deliveryLog] error in
                    // Leave in queue; transferUserInfo ensures eventual delivery.
                    deliveryLog.record(failure: error)
                    deliveryLog.record(.queued)
                    transport.transferUserInfo([WatchMessage.contractionUpdate: data])
                }
            )
        }
    }

    /// Loads the pending-acknowledgment queue from UserDefaults.
    func loadPendingContractionQueue() -> [ContractionRecord] {
        guard let data = userDefaults.data(forKey: pendingContractionUpdatesKey),
              let records = try? decoder.decode([ContractionRecord].self, from: data) else {
            return []
        }
        return records
    }

    /// Persists the pending queue to UserDefaults.
    /// Removes the key entirely when the queue is empty.
    private func savePendingContractionQueue(_ records: [ContractionRecord]) {
        if records.isEmpty {
            userDefaults.removeObject(forKey: pendingContractionUpdatesKey)
        } else if let data = try? encoder.encode(records) {
            userDefaults.set(data, forKey: pendingContractionUpdatesKey)
        }
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
                self.userDefaults.set(data, forKey: WatchSessionPersistence.tipsKey)
                // Tips have arrived — cancel the timeout and clear the loading flag.
                self.syncTimeoutWork?.cancel()
                self.syncTimeoutWork = nil
                self.isSyncing = false
            }

            if let week = payload[WatchMessage.gestationalWeek] as? Int {
                self.gestationalWeek = week
                self.userDefaults.set(week, forKey: WatchSessionPersistence.gestationalWeekKey)
            }

            if let count = payload[WatchMessage.kickCount] as? Int {
                self.lastKickCount = count
            }
        }
    }

    /// Clears every persisted UserDefaults key written by the Watch app and resets
    /// the published state so views restore to their idle state on next launch.
    /// The key list lives in `WatchSessionPersistence.allKeys` — the single source
    /// of truth shared with the unit tests.
    /// Also posts `.watchDidSignOut` so `KickCounterView` and `ContractionTimerView`
    /// can immediately reset their in-memory `@State` without waiting for a relaunch.
    func clearPersistedSession() {
        // Remove every persisted key across all three subsystems (session manager,
        // kick counter, contraction timer) plus the pending retry queue — a
        // freshly signed-in user's session must never see the previous account's data.
        WatchSessionPersistence.removeAll(from: userDefaults)

        // removeAll cleared the log's key; reset its in-memory copy too, or the
        // next write would put the old counters straight back.
        deliveryLog.reset()

        // Reset published state. The lastKickCount / lastContractionCount didSet
        // observers remove their own (already-removed) keys — harmless no-ops.
        lastKickCount = nil
        lastContractionCount = nil
        tips = []
        gestationalWeek = 0

        // Notify views so they reset their @State immediately
        notificationCenter.post(name: .watchDidSignOut, object: nil)
    }
}
