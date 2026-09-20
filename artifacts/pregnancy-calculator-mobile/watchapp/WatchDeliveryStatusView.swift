// WatchDeliveryStatusView.swift
// Reads WatchDeliveryLog out loud, on the Watch, without a Mac attached.
//
// The point of this screen is to answer one question: when the Watch records a
// contraction and the phone never shows it, which side stopped? Counters that
// climb with no acknowledgements mean the Watch is sending into the void.
// Counters that never climb at all mean it never tried.

import Combine
import SwiftUI

struct WatchDeliveryStatusView: View {
    @EnvironmentObject var session: WatchSessionManager

    @State private var stats = WatchDeliveryStats()
    @State private var queuedRecords = 0
    @State private var reachable = false

    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        List {
            Section {
                verdict
            }

            Section("Now") {
                row("Phone reachable", reachable ? "yes" : "no")
                row("Queued records", "\(queuedRecords)")
                row("Session", stats.activation ?? "—", when: stats.activationAt)
            }

            Section("Delivery") {
                row("Records sent", "\(stats.sentAwaitingAck)", when: stats.lastAttemptAt)
                row("Acknowledged", "\(stats.acknowledged)", when: stats.lastAcknowledgedAt)
                row("Other messages", "\(stats.sent)")
                if stats.unacknowledged > 0 {
                    row("Replied, no ack", "\(stats.unacknowledged)")
                }
                if stats.failed > 0 {
                    row("Failed", "\(stats.failed)", when: stats.lastFailureAt)
                }
                row("Handed to OS queue", "\(stats.queued)")
                if stats.unreachable > 0 {
                    row("Dropped, unreachable", "\(stats.unreachable)")
                }
            }

            if let failure = stats.lastFailure {
                Section("Last error") {
                    Text(failure)
                        .font(.system(size: 12))
                        .foregroundColor(.orange)
                }
            }
        }
        .navigationTitle("Sync Status")
        .onAppear(perform: refresh)
        .onReceive(tick) { _ in refresh() }
    }

    // MARK: - Pieces

    @ViewBuilder
    private var verdict: some View {
        if stats.isDeliveringIntoTheVoid {
            label("Records never acknowledged",
                  detail: "\(stats.sentAwaitingAck) sent, none confirmed.",
                  color: .orange,
                  icon: "exclamationmark.triangle.fill")
        } else if !stats.hasAttemptedDelivery {
            label("Nothing sent yet",
                  detail: "Record a contraction to test delivery.",
                  color: .secondary,
                  icon: "circle.dashed")
        } else {
            label("Records acknowledged",
                  detail: "The phone is confirming receipt.",
                  color: .green,
                  icon: "checkmark.circle.fill")
        }
    }

    private func label(_ title: String, detail: String, color: Color, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Image(systemName: icon).foregroundColor(color)
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(color)
            }
            Text(detail)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
    }

    private func row(_ title: String, _ value: String, when: Date? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 1) {
                Text(value)
                    .font(.system(size: 13, weight: .medium))
                if let when {
                    Text(Self.relative.localizedString(for: when, relativeTo: Date()))
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    private func refresh() {
        stats = session.deliveryLog.snapshot()
        queuedRecords = session.loadPendingContractionQueue().count
        reachable = session.transport.isReachable
    }

    private static let relative: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()
}
