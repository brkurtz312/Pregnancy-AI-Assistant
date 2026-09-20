import SwiftUI

// A bold icon + label row for the Watch home screen.
// The icon sits in a large coloured circle so it's easy to read on a small display.
struct HomeRow: View {
    let icon: String
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(color)
                .clipShape(Circle())

            Text(label)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primary)

            Spacer()
        }
        .padding(.vertical, 4)
    }
}

struct ContentView: View {
    @EnvironmentObject var session: WatchSessionManager

    var body: some View {
        NavigationStack {
            List {
                NavigationLink(destination: KickCounterView()) {
                    HomeRow(icon: "hand.tap.fill",
                            label: "Kick Counter",
                            color: .pink)
                }

                NavigationLink(destination: ContractionTimerView()) {
                    HomeRow(icon: "timer",
                            label: "Contractions",
                            color: .purple)
                }

                NavigationLink(destination: TipsView()) {
                    HomeRow(icon: "sparkles",
                            label: "Weekly Tips",
                            color: .blue)
                }

                // Diagnostics for the Watch -> phone delivery defect. Reading
                // it needs no Mac, which is the whole reason it exists.
                NavigationLink(destination: WatchDeliveryStatusView()) {
                    HomeRow(icon: "antenna.radiowaves.left.and.right",
                            label: "Sync Status",
                            color: .gray)
                }
            }
            .navigationTitle("Pregnancy")
        }
    }
}
