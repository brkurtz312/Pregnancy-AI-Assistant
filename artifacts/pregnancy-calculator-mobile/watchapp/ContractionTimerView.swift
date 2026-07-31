import SwiftUI
import WatchKit

struct ContractionTimerView: View {
    @EnvironmentObject var session: WatchSessionManager
    @State private var isActive: Bool = false
    @State private var contractionStart: Date? = nil
    @State private var duration: TimeInterval = 0
    @State private var lastInterval: TimeInterval? = nil
    @State private var lastContractionEnd: Date? = nil
    @State private var contractions: [ContractionRecord] = []
    @State private var displayTimer: Timer? = nil

    var durationString: String { formatSeconds(duration) }

    var intervalString: String? {
        guard let interval = lastInterval else { return nil }
        return formatSeconds(interval) + " apart"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("Contractions")
                    .font(.headline)

                if isActive {
                    Text(durationString)
                        .font(.system(.title2, design: .monospaced))
                        .foregroundColor(.orange)

                    Text("Active")
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Button("Stop") {
                        stopContraction()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                } else {
                    if let interval = intervalString {
                        Text(interval)
                            .font(.caption)
                            .foregroundColor(
                                (lastInterval ?? 999) < 300 ? .red : .secondary
                            )
                        if (lastInterval ?? 999) < 300 {
                            Text("⚠️ < 5 min apart")
                                .font(.caption2)
                                .foregroundColor(.red)
                        }
                    }

                    Button("Start Contraction") {
                        startContraction()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                }

                if !contractions.isEmpty {
                    Divider()
                    Text("\(contractions.count) logged")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
        }
    }

    private func startContraction() {
        let now = Date()
        if let end = lastContractionEnd {
            lastInterval = now.timeIntervalSince(end)
        }
        contractionStart = now
        isActive = true
        duration = 0
        displayTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if let start = contractionStart {
                duration = Date().timeIntervalSince(start)
            }
        }
        WKInterfaceDevice.current().play(.start)
        if (lastInterval ?? 999) < 300 {
            WKInterfaceDevice.current().play(.notification)
        }
    }

    private func stopContraction() {
        displayTimer?.invalidate()
        displayTimer = nil
        isActive = false
        let end = Date()
        let record = ContractionRecord(
            startedAt: contractionStart ?? end,
            endedAt: end,
            interval: lastInterval
        )
        contractions.append(record)
        lastContractionEnd = end
        session.sendContractionUpdate(record: record)
        WKInterfaceDevice.current().play(.stop)
    }

    private func formatSeconds(_ seconds: TimeInterval) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
