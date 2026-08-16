import SwiftUI
import WatchKit

// MARK: - UserDefaults keys

private enum KickDefaults {
    static let count    = "wk.kickCount"
    static let active   = "wk.kickSessionActive"
    static let start    = "wk.kickSessionStart"   // TimeInterval since 1970
}

struct KickCounterView: View {
    @EnvironmentObject var session: WatchSessionManager
    @Environment(\.scenePhase) private var scenePhase

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
        .onAppear {
            restoreSession()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .inactive || phase == .background {
                saveSession()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .watchDidSignOut)) { _ in
            resetSession()
        }
    }

    // MARK: - Session actions

    private func startSession() {
        kickCount = 0
        sessionStart = Date()
        sessionActive = true
        elapsed = 0
        startTimer()
        saveSession()
        WKInterfaceDevice.current().play(.start)
    }

    private func recordKick() {
        kickCount += 1
        saveSession()
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
        clearSession()
        session.sendKickSessionEnd(summary: summary)
        WKInterfaceDevice.current().play(.success)
    }

    // MARK: - Timer

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if let start = sessionStart {
                elapsed = Date().timeIntervalSince(start)
            }
        }
    }

    // MARK: - Persistence

    private func saveSession() {
        let ud = UserDefaults.standard
        ud.set(kickCount, forKey: KickDefaults.count)
        ud.set(sessionActive, forKey: KickDefaults.active)
        if let start = sessionStart {
            ud.set(start.timeIntervalSince1970, forKey: KickDefaults.start)
        } else {
            ud.removeObject(forKey: KickDefaults.start)
        }
    }

    private func clearSession() {
        let ud = UserDefaults.standard
        ud.removeObject(forKey: KickDefaults.count)
        ud.removeObject(forKey: KickDefaults.active)
        ud.removeObject(forKey: KickDefaults.start)
    }

    /// Resets all in-memory state to idle after a sign-out.
    /// UserDefaults keys are already cleared by `WatchSessionManager.clearPersistedSession()`.
    /// Delegates field assignments to `KickCounterSessionState.reset()` so the
    /// canonical idle values are defined in one place and unit-testable.
    private func resetSession() {
        timer?.invalidate()
        timer = nil
        var state = KickCounterSessionState(
            kickCount: kickCount,
            sessionActive: sessionActive,
            sessionStart: sessionStart,
            elapsed: elapsed
        )
        state.reset()
        kickCount = state.kickCount
        sessionActive = state.sessionActive
        sessionStart = state.sessionStart
        elapsed = state.elapsed
    }

    private func restoreSession() {
        let ud = UserDefaults.standard
        let now = Date()

        let outcome = KickSessionRestorePolicy.evaluate(
            active: ud.bool(forKey: KickDefaults.active),
            count: ud.integer(forKey: KickDefaults.count),
            startRaw: ud.double(forKey: KickDefaults.start),
            now: now
        )

        switch outcome {
        case .idle:
            return
        case .clear:
            // Stale (older than the threshold) or corrupt persisted data —
            // wipe it so yesterday's kicks don't reappear as a new session.
            clearSession()
        case .restore(let count, let start):
            kickCount    = count
            sessionStart = start
            sessionActive = true
            elapsed      = now.timeIntervalSince(start)
            startTimer()
        }
    }
}
