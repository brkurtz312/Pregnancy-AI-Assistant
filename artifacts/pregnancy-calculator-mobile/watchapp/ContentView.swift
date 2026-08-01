import SwiftUI

struct ContentView: View {
    @EnvironmentObject var session: WatchSessionManager

    var body: some View {
        NavigationStack {
            List {
                NavigationLink(destination: KickCounterView()) {
                    Label("Kick Counter", systemImage: "hand.tap.fill")
                }

                NavigationLink(destination: ContractionTimerView()) {
                    Label("Contractions", systemImage: "timer")
                }

                NavigationLink(destination: TipsView()) {
                    Label("Weekly Tips", systemImage: "sparkles")
                }
            }
            .navigationTitle("Pregnancy")
        }
    }
}
