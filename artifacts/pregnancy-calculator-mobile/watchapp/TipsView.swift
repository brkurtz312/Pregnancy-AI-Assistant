import SwiftUI

struct TipsView: View {
    @EnvironmentObject var session: WatchSessionManager
    @State private var tipIndex: Int = 0

    var currentTip: WatchTip? {
        guard !session.tips.isEmpty else { return nil }
        return session.tips[tipIndex % session.tips.count]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let tip = currentTip {
                    Text("Week \(tip.week)")
                        .font(.headline)
                        .foregroundColor(.pink)

                    Text(tip.emoji)
                        .font(.largeTitle)

                    Text(tip.text)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .foregroundColor(.primary)

                    if session.tips.count > 1 {
                        HStack(spacing: 6) {
                            Button {
                                tipIndex = max(0, tipIndex - 1)
                            } label: {
                                Image(systemName: "chevron.left")
                            }
                            .disabled(tipIndex == 0)

                            Text("\(tipIndex + 1)/\(session.tips.count)")
                                .font(.caption2)
                                .foregroundColor(.secondary)

                            Button {
                                tipIndex = min(session.tips.count - 1, tipIndex + 1)
                            } label: {
                                Image(systemName: "chevron.right")
                            }
                            .disabled(tipIndex == session.tips.count - 1)
                        }
                    }
                } else if session.isSyncing {
                    // Loading state: a sync request has been sent to the phone
                    // and we are waiting for the first tips payload to arrive.
                    // This is distinct from the "no due date" empty state below.
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.pink)
                    Text("Syncing tips…")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                    Text("Just a moment")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                } else {
                    // Idle empty state: tips are not available and no sync is
                    // in progress (phone may not be nearby or due date not set).
                    Image(systemName: "sparkles")
                        .font(.largeTitle)
                        .foregroundColor(.pink)
                    Text("Tips will appear here")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                    Text("Open the app on your iPhone to sync")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding()
        }
        // Reset to the first tip whenever the gestational week changes so
        // users see up-to-date content immediately after a due-date edit.
        .onChange(of: session.gestationalWeek) { _ in
            tipIndex = 0
        }
        // Also reset when a fresh batch of tips arrives (e.g. background sync)
        .onChange(of: session.tips.first?.week) { _ in
            tipIndex = 0
        }
    }
}
