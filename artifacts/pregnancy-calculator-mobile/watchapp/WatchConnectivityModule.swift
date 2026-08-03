/// WatchConnectivityModule.swift
/// Expo Module that bridges PhoneWatchBridge to JavaScript.
/// Place in ios/<AppName>/WatchConnectivityModule.swift

import ExpoModulesCore
import WatchConnectivity

public class WatchConnectivityModule: Module {
    public func definition() -> ModuleDefinition {
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

        // Called from JavaScript when the user signs out so the Watch can clear its session.
        AsyncFunction("signOut") {
            PhoneWatchBridge.shared.sendSignOut()
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
