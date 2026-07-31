import SwiftUI
import WatchKit

struct KickCounterView: View {
    @EnvironmentObject var session: WatchSessionManager
    @State private var kickCount: Int = 0
    @State private var sessionActive: Bool = false
    @State private var sessionStart: Date? = nil
    @State private var elapsed: TimeInterval = 0
    @State private var timer: Timer? = nil

    var elapsedString: String {
        let m = Int(elapsed) / 60
        let s = Int(elapsed) % 60
        return String(format: "%d:%02d", m, s)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("Kick Counter")
                    .font(.headline)
                    .foregroundColor(.primary)

                if sessionActive {
                    Text(elapsedString)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.secondary)

                    // Big kick button
                    Button {
                        recordKick()
                    } label: {
                        VStack(spacing: 2) {
                            Text("\(kickCount)")
                                .font(.system(size: 36, weight: .bold))
                            Text("kicks")
                                .font(.caption2)
                        }
                        .frame(width: 80, height: 80)
                        .background(Color.pink)
                        .foregroundColor(.white)
                        .clipShape(Circle())
                    }
                    .buttonStyle(.plain)

                    Button("End Session") {
                        endSession()
                    }
                    .foregroundColor(.secondary)
                    .font(.footnote)
                } else {
                    if let last = session.lastKickCount {
                        Text("Last: \(last) kicks")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Button("Start Counting") {
                        startSession()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.pink)
                }
            }
            .padding()
        }
    }

    private func startSession() {
        kickCount = 0
        sessionStart = Date()
        sessionActive = true
        elapsed = 0
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if let start = sessionStart {
                elapsed = Date().timeIntervalSince(start)
            }
        }
        WKInterfaceDevice.current().play(.start)
    }

    private func recordKick() {
        kickCount += 1
        WKInterfaceDevice.current().play(.click)
        session.sendKickUpdate(count: kickCount)
    }

    private func endSession() {
        timer?.invalidate()
        timer = nil
        sessionActive = false
        let summary = KickSessionSummary(
            kickCount: kickCount,
            startedAt: sessionStart ?? Date(),
            endedAt: Date()
        )
        session.sendKickSessionEnd(summary: summary)
        WKInterfaceDevice.current().play(.success)
    }
}
