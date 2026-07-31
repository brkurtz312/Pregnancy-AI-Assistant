# Apple Watch Companion App — Setup Guide

## What's included

| File | Purpose |
|---|---|
| `watchapp/PregnancyWatchApp.swift` | Watch app entry point (`@main`) |
| `watchapp/ContentView.swift` | Root tab view (3 tabs) |
| `watchapp/KickCounterView.swift` | Fetal kick counter |
| `watchapp/ContractionTimerView.swift` | Contraction timer with interval alert |
| `watchapp/TipsView.swift` | Gestational-age tip cards |
| `watchapp/WatchSessionManager.swift` | WCSession on the watch side |
| `watchapp/Models.swift` | Shared data models & WCSession message keys |
| `watchapp/PhoneWatchBridge.swift` | WCSession on the iPhone side |
| `watchapp/WatchConnectivityModule.swift` | Expo Module that exposes the bridge to JavaScript |
| `watchapp/Info.plist` | Watch App Info.plist |
| `watchapp/PregnancyWatchApp.entitlements` | Watch App entitlements |
| `plugins/withWatchExtension.js` | Expo config plugin (auto-wires everything into Xcode) |
| `hooks/useWatchConnectivity.ts` | React hook for sending tips + receiving watch events |
| `modules/WatchConnectivity.ts` | JS shim for the native module |

---

## Prerequisites

- Xcode 15+
- Apple Developer account with the **Pregnancy AI Assistant** app registered
- A separate **Watch App Bundle ID** provisioned:
  `app.replit.pregnancycalculator.watchapp`
- An **App Group** enabled on both the iPhone app and Watch app:
  `group.app.replit.pregnancycalculator`

---

## Step 1 — Register the Watch Bundle ID

In [developer.apple.com](https://developer.apple.com):

1. **Identifiers → +** → App IDs → App
2. Bundle ID: `app.replit.pregnancycalculator.watchapp`
3. Capabilities: enable **App Groups** → add `group.app.replit.pregnancycalculator`
4. Also enable **App Groups** on the existing iPhone app identifier (`app.replit.pregnancycalculator`)

---

## Step 2 — Enable the config plugin

In `app.json`, add the plugin **before** `expo-build-properties`:

```json
"plugins": [
  ["expo-router", { "origin": "https://replit.com/" }],
  "expo-updates",
  "expo-font",
  "expo-web-browser",
  "./plugins/withWatchExtension",
  ["expo-build-properties", { ... }]
]
```

---

## Step 3 — Build with EAS

The config plugin runs automatically during `eas build` and:
- Copies Swift source files into the generated `ios/PregnancyWatchApp/` folder
- Copies `PhoneWatchBridge.swift` and `WatchConnectivityModule.swift` into the main app's iOS folder
- Adds the `PregnancyWatchApp` WatchKit Extension target to the Xcode project
- Links `WatchConnectivity.framework` to the main app
- Adds an **Embed Watch Content** copy-files build phase

```bash
eas build --platform ios --profile production
```

---

## Step 4 — Manual Xcode verification (after first build)

Download the generated archive from EAS and open the `.xcworkspace` in Xcode.
Verify:

1. **Targets** — you see `PregnancyWatchApp` alongside the main target
2. **Signing** — set the Watch target's team and ensure `app.replit.pregnancycalculator.watchapp` is selected
3. **App Group** — both targets have the App Group capability enabled
4. **Embed Watch Content** — in the main target's **Build Phases**, the watch app is listed under *Embed Watch Content*

If the plugin didn't fully configure signing, set it manually in the Watch target's **Signing & Capabilities** tab.

---

## Step 5 — Using the JS bridge in the app

```typescript
import { useWatchConnectivity } from "@/hooks/useWatchConnectivity";
import { useListKickSessions } from "@workspace/api-client-react";

function ToolsScreen() {
  const { data: kickSessions, refetch } = useListKickSessions({ limit: 10, offset: 0 });

  // Build tip list for the current gestational week
  const tips = [
    { week: 28, emoji: "👁️", text: "Baby can now open their eyes." },
    { week: 28, emoji: "💤", text: "You may notice sleep-wake cycles." },
  ];

  useWatchConnectivity({
    gestationalWeek: 28,
    tips,
    onKickSessionEnd: async (session) => {
      // A completed watch kick session → save to the API
      console.log("Watch kick session:", session);
      refetch();
    },
    onContractionUpdate: (record) => {
      console.log("Contraction from watch:", record);
    },
  });

  return null; // rest of screen
}
```

---

## Offline behaviour

- The watch stores kick counts and contraction records **locally in `WatchSessionManager`** and sends them to the iPhone via WCSession when reachable
- Tips received from the iPhone are persisted in `UserDefaults` on the watch so they survive watch restarts without a phone connection
- Kick sessions started on the watch that end while the phone is unreachable are queued via `updateApplicationContext` and delivered the next time the phone is reachable

---

## Contraction alert logic

The watch alerts (haptic + red warning text) when the interval between contractions is **less than 5 minutes** — the standard clinical threshold for calling a provider. This is handled entirely on the watch in `ContractionTimerView.swift` without a server round-trip.

---

## App Store submission

1. New binary build required (OTA cannot add a Watch App)
2. Add **iPad screenshots** and **Apple Watch screenshots** to App Store Connect
3. Watch screenshot sizes required: **40mm** and **44mm** (or 44mm and 49mm for Ultra)
4. In App Store Connect, the Watch App is bundled with the iPhone app — no separate listing needed
