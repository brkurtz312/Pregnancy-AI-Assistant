import SwiftUI
import WatchKit

// MARK: - UserDefaults keys

private enum ContractionDefaults {
    static let active           = "wk.contractionActive"
    static let start            = "wk.contractionStart"     // TimeInterval since 1970
    static let lastEnd          = "wk.contractionLastEnd"   // TimeInterval since 1970
    static let lastInterval     = "wk.contractionLastInterval" // TimeInterval (0 = absent)
    static let records          = "wk.contractionRecords"   // JSON-encoded [ContractionRecord]
}

struct ContractionTimerView: View {
    @EnvironmentObject var session: WatchSessionManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var isActive: Bool = false
    @State private var contractionStart: Date? = nil
    @State private var duration: TimeInterval = 0
    @State private var lastInterval: TimeInterval? = nil
    @State private var lastContractionEnd: Date? = nil
    @State private var contractions: [ContractionRecord] = []
    @State private var displayTimer: Timer? = nil

    private let encoder: JSONEncoder = {
        let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d
    }()

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
        .onAppear {
            restoreState()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .inactive || phase == .background {
                saveState()
            }
        }
    }

    // MARK: - Contraction actions

    private func startContraction() {
        let now = Date()
        if let end = lastContractionEnd {
            lastInterval = now.timeIntervalSince(end)
        }
        contractionStart = now
        isActive = true
        duration = 0
        startDisplayTimer()
        saveState()
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
        saveState()
        session.sendContractionUpdate(record: record)
        WKInterfaceDevice.current().play(.stop)
    }

    // MARK: - Timer

    private func startDisplayTimer() {
        displayTimer?.invalidate()
        displayTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if let start = contractionStart {
                duration = Date().timeIntervalSince(start)
            }
        }
    }

    // MARK: - Persistence

    private func saveState() {
        let ud = UserDefaults.standard
        ud.set(isActive, forKey: ContractionDefaults.active)

        if let start = contractionStart {
            ud.set(start.timeIntervalSince1970, forKey: ContractionDefaults.start)
        } else {
            ud.removeObject(forKey: ContractionDefaults.start)
        }

        if let end = lastContractionEnd {
            ud.set(end.timeIntervalSince1970, forKey: ContractionDefaults.lastEnd)
        } else {
            ud.removeObject(forKey: ContractionDefaults.lastEnd)
        }

        // Store 0 to mean "no interval" so we can use a plain Double key
        ud.set(lastInterval ?? 0, forKey: ContractionDefaults.lastInterval)

        if let data = try? encoder.encode(contractions) {
            ud.set(data, forKey: ContractionDefaults.records)
        }
    }

    private func restoreState() {
        let ud = UserDefaults.standard

        // Restore logged contractions
        if let data = ud.data(forKey: ContractionDefaults.records),
           let saved = try? decoder.decode([ContractionRecord].self, from: data) {
            contractions = saved
        }

        let intervalRaw = ud.double(forKey: ContractionDefaults.lastInterval)
        lastInterval = intervalRaw > 0 ? intervalRaw : nil

        let lastEndRaw = ud.double(forKey: ContractionDefaults.lastEnd)
        if lastEndRaw > 0 {
            lastContractionEnd = Date(timeIntervalSince1970: lastEndRaw)
        }

        // Restore an in-progress contraction only if start is valid
        guard ud.bool(forKey: ContractionDefaults.active) else { return }

        let startRaw = ud.double(forKey: ContractionDefaults.start)
        guard startRaw > 0 else {
            // Stale/corrupt persisted active flag — reset gracefully
            ud.set(false, forKey: ContractionDefaults.active)
            return
        }

        let savedStart = Date(timeIntervalSince1970: startRaw)
        contractionStart = savedStart
        isActive = true
        duration = Date().timeIntervalSince(savedStart)
        startDisplayTimer()
    }

    // MARK: - Helpers

    private func formatSeconds(_ seconds: TimeInterval) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
