import SwiftUI

struct ContentView: View {
    @EnvironmentObject var session: WatchSessionManager

    var body: some View {
        TabView {
            KickCounterView()
            ContractionTimerView()
            TipsView()
        }
    }
}
