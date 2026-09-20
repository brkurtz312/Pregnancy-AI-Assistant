// WatchSessionPersistence.swift
// Single source of truth for every UserDefaults key the Watch app persists
// and for the bulk-removal used on sign-out.
//
// This file deliberately imports only Foundation (no WatchConnectivity /
// WatchKit / SwiftUI) so it can be compiled into the unit-test bundle and
// exercised directly by XCTest.

import Foundation

/// Production registry of every UserDefaults key written by the Watch app,
/// grouped by the subsystem that owns it. `clearPersistedSession()` removes
/// exactly `allKeys` — adding a new persisted key here is all that is needed
/// for it to be cleared on sign-out.
enum WatchSessionPersistence {

    // MARK: WatchSessionManager keys
    static let tipsKey = "watchTips"
    static let gestationalWeekKey = "watchGestationalWeek"
    static let lastKickCountKey = "wk.lastKickCount"
    static let lastContractionCountKey = "wk.lastContractionCount"

    // MARK: KickCounterView keys
    static let kickCountKey = "wk.kickCount"
    static let kickSessionActiveKey = "wk.kickSessionActive"
    static let kickSessionStartKey = "wk.kickSessionStart"

    // MARK: ContractionTimerView keys
    static let contractionActiveKey = "wk.contractionActive"
    static let contractionStartKey = "wk.contractionStart"
    static let contractionLastEndKey = "wk.contractionLastEnd"
    static let contractionLastIntervalKey = "wk.contractionLastInterval"
    static let contractionRecordsKey = "wk.contractionRecords"
    static let contractionStaleSummaryKey = "wk.contractionStaleSummary"

    // MARK: Pending-acknowledgment retry queue
    static let pendingContractionUpdatesKey = "wk.pendingContractionUpdates"

    // MARK: Delivery diagnostics
    /// Counters written by `WatchDeliveryLog`. Cleared with everything else on
    /// sign-out: this registry is every key the Watch writes, and a diagnosis
    /// that outlived the account it was about would be misleading.
    static let deliveryLogKey = "wk.deliveryLog"

    /// Every key that must be removed when a sign-out message arrives.
    static let allKeys: [String] = [
        tipsKey,
        gestationalWeekKey,
        lastKickCountKey,
        lastContractionCountKey,
        kickCountKey,
        kickSessionActiveKey,
        kickSessionStartKey,
        contractionActiveKey,
        contractionStartKey,
        contractionLastEndKey,
        contractionLastIntervalKey,
        contractionRecordsKey,
        contractionStaleSummaryKey,
        pendingContractionUpdatesKey,
        deliveryLogKey,
    ]

    /// Removes every persisted Watch-session key from `defaults`.
    static func removeAll(from defaults: UserDefaults) {
        for key in allKeys {
            defaults.removeObject(forKey: key)
        }
    }
}

extension Notification.Name {
    /// Posted by `WatchSessionManager` after a sign-out message is received from the phone.
    static let watchDidSignOut = Notification.Name("WatchSessionManagerDidSignOut")
}
