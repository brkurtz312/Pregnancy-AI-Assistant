import SwiftUI

struct ContentView: View {
    @EnvironmentObject var session: WatchSessionManager

    var body: some View {
        TabView {
            KickCounterView()
                .tabItem { Label("Kicks", systemImage: "hand.tap") }

            ContractionTimerView()
                .tabItem { Label("Contractions", systemImage: "timer") }

            TipsView()
                .tabItem { Label("Tips", systemImage: "sparkles") }
        }
        .tabViewStyle(.page)
    }
}
