/// WatchConnectivityModule.swift
/// Expo Module that bridges PhoneWatchBridge to JavaScript.
/// Place in ios/<AppName>/WatchConnectivityModule.swift

// `internal import` (not a bare `import`): from Expo SDK 58 the generated
// ExpoModulesProvider.swift and SceneDelegate.swift in this same app target
// import Expo modules as `internal`, and Xcode 27 rejects a bare import of
// the same module elsewhere ("ambiguous implicit access level for import of
// 'ExpoModulesCore'"). The class is internal to match; ExpoModulesProvider
// lives in this target, so it can still see it.
internal import ExpoModulesCore
import WatchConnectivity

class WatchConnectivityModule: Module {
    func definition() -> ModuleDefinition {
        Name("WatchConnectivity")

        OnCreate {
            // Boot the bridge singleton (activates WCSession)
            _ = PhoneWatchBridge.shared
        }

        // JS calls this to push tips to the watch
        AsyncFunction("sendTips") { (tips: [[String: Any]]) in
            PhoneWatchBridge.shared.sendTips(tips)
        }

        AsyncFunction("sendGestationalWeek") { (week: Int) in
            PhoneWatchBridge.shared.sendGestationalWeek(week)
        }

        // Preferred over the individual calls above: sends week and tips in a
        // single atomic payload so the Watch never receives a mismatched state.
        AsyncFunction("sendWeekAndTips") { (week: Int, tips: [[String: Any]]) in
            PhoneWatchBridge.shared.sendWeekAndTips(week, tips: tips)
        }

        // Returns a snapshot of activation state + watch app install + reachability
        AsyncFunction("getSessionState") { () -> [String: Any] in
            PhoneWatchBridge.shared.sessionState()
        }

        // Returns the last result from WCSession activationDidCompleteWith as a
        // human-readable string (e.g. "OK state=2" or "ERROR state=0 err=...").
        // Falls back to the UserDefaults value persisted from a previous launch.
        // Returns "activationDidCompleteWith not yet called" if it has never fired.
        AsyncFunction("getActivationDiagnostic") { () -> String in
            PhoneWatchBridge.shared.getActivationDiagnostic()
        }

        // Called from JavaScript when the user signs out so the Watch can clear its session.
        AsyncFunction("signOut") {
            PhoneWatchBridge.shared.sendSignOut()
        }

        // MARK: - Active user gate
        //
        // JS must call setActiveWatchUser(userId) immediately on sign-in (before the
        // startup drain) and setActiveWatchUser(null) on sign-out (handled internally
        // by signOut() which calls sendSignOut() → clearAllContractionReceipts() →
        // activeUserId = nil, so the explicit null call is optional but harmless).
        //
        // Without the active user set, late Watch `transferUserInfo` deliveries that
        // arrive after sign-out are silently dropped instead of being attributed to the
        // next account (cross-account health-data isolation).
        AsyncFunction("setActiveWatchUser") { (userId: String?) -> Bool in
            PhoneWatchBridge.shared.setActiveUserId(userId)
            // Returns a value deliberately. A Void-returning AsyncFunction
            // reached through the deprecated NativeModulesProxy leaves its JS
            // promise unsettled: the native work happens — records are
            // persisted and acknowledged — but `await` never returns, so the
            // drain chained behind it never ran. That was the Watch sync
            // defect. See docs/app-review-notes.md.
            return true
        }

        // Called by JS at launch to drain contraction records that the phone persisted
        // natively (before replying to the Watch with the ack UUID) but whose JS/API
        // save never completed (e.g. phone was force-quit after the ack).
        // Returns an empty array when no user is active (signed out).
        AsyncFunction("getPendingContractionReceipts") { () -> [[String: Any]] in
            return PhoneWatchBridge.shared.pendingContractionReceipts()
        }

        // Called by JS once a contraction record has been durably saved (to the API or
        // an offline queue that guarantees eventual delivery) so the phone's native
        // pending store can be cleared and the record is not replayed on next launch.
        AsyncFunction("acknowledgeContractionReceipt") { (id: String) -> Bool in
            PhoneWatchBridge.shared.acknowledgeContractionReceipt(id: id)
            return true
        }

        Events("onKickSessionEnd", "onContractionUpdate", "onKickUpdate", "onWatchStateChange", "onSyncRequest")

        OnStartObserving {
            PhoneWatchBridge.shared.onKickSessionEnd = { [weak self] session in
                self?.sendEvent("onKickSessionEnd", session)
            }
            PhoneWatchBridge.shared.onContractionUpdate = { [weak self] record in
                self?.sendEvent("onContractionUpdate", record)
            }
            PhoneWatchBridge.shared.onKickUpdate = { [weak self] count in
                self?.sendEvent("onKickUpdate", ["count": count])
            }
            PhoneWatchBridge.shared.onSessionStateChange = { [weak self] state in
                self?.sendEvent("onWatchStateChange", state)
            }
            // Fired when the Watch activates with no cached tips and asks the phone
            // to push the current gestational week and tips payload.  The JS handler
            // in useWatchConnectivity calls sendWeekAndTips in response.
            PhoneWatchBridge.shared.onSyncRequest = { [weak self] in
                self?.sendEvent("onSyncRequest", [:])
            }
        }

        OnStopObserving {
            PhoneWatchBridge.shared.onKickSessionEnd = nil
            PhoneWatchBridge.shared.onContractionUpdate = nil
            PhoneWatchBridge.shared.onKickUpdate = nil
            PhoneWatchBridge.shared.onSessionStateChange = nil
            PhoneWatchBridge.shared.onSyncRequest = nil
        }
    }
}
