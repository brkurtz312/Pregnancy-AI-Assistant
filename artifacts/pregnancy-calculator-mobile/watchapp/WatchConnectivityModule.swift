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

        // Returns a snapshot of activation state + watch app install + reachability
        AsyncFunction("getSessionState") { () -> [String: Any] in
            PhoneWatchBridge.shared.sessionState()
        }

        Events("onKickSessionEnd", "onContractionUpdate", "onKickUpdate", "onWatchStateChange")

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
        }

        OnStopObserving {
            PhoneWatchBridge.shared.onKickSessionEnd = nil
            PhoneWatchBridge.shared.onContractionUpdate = nil
            PhoneWatchBridge.shared.onKickUpdate = nil
            PhoneWatchBridge.shared.onSessionStateChange = nil
        }
    }
}
