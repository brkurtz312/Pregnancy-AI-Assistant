# Apple Watch Companion App — Setup Guide

## What's included

| File                                      | Purpose                                               |
| ----------------------------------------- | ----------------------------------------------------- |
| `watchapp/PregnancyWatchApp.swift`        | Watch app entry point (`@main`)                       |
| `watchapp/ContentView.swift`              | Root tab view (3 tabs)                                |
| `watchapp/KickCounterView.swift`          | Fetal kick counter                                    |
| `watchapp/ContractionTimerView.swift`     | Contraction timer with interval alert                 |
| `watchapp/TipsView.swift`                 | Gestational-age tip cards                             |
| `watchapp/WatchSessionManager.swift`      | WCSession on the watch side                           |
| `watchapp/Models.swift`                   | Shared data models & WCSession message keys           |
| `watchapp/PhoneWatchBridge.swift`         | WCSession on the iPhone side                          |
| `watchapp/WatchConnectivityModule.swift`  | Expo Module that exposes the bridge to JavaScript     |
| `watchapp/Info.plist`                     | Watch App Info.plist                                  |
| `watchapp/PregnancyWatchApp.entitlements` | Watch App entitlements                                |
| `plugins/withWatchExtension.js`           | Expo config plugin (auto-wires everything into Xcode) |
| `hooks/useWatchConnectivity.ts`           | React hook for sending tips + receiving watch events  |
| `modules/WatchConnectivity.ts`            | JS shim for the native module                         |

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
4. **Embed Watch Content** — in the main target's **Build Phases**, the watch app is listed under _Embed Watch Content_

If the plugin didn't fully configure signing, set it manually in the Watch target's **Signing & Capabilities** tab.

---

## Step 5 — Using the JS bridge in the app

```typescript
import { useWatchConnectivity } from "@/hooks/useWatchConnectivity";
import { useListKickSessions } from "@workspace/api-client-react";

function ToolsScreen() {
  const { data: kickSessions, refetch } = useListKickSessions({
    limit: 10,
    offset: 0,
  });

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

## Pre-build validation scripts

Two scripts catch common Watch configuration issues before an EAS build is submitted:

| Script                          | Command                          | What it catches                                               |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| `validate-eas-provisioning.js`  | `pnpm run validate:provisioning` | Missing Watch bundle ID, App Group, or EAS credentials source |
| `validate-watch-icon-format.js` | `pnpm run validate:watch-icons`  | Legacy per-size AppIcon format that triggers ITMS-90391       |

### Automatic gate — runs before every EAS build

Both scripts are wired into `eas.json` via `prebuildCommand` on every build profile
(`development`, `preview`, `production`):

```json
"prebuildCommand": "bash scripts/eas-prebuild.sh"
```

`prebuildCommand` tells EAS to run `scripts/eas-prebuild.sh` **instead of** the
default `expo prebuild` step. EAS appends `--platform <ios|android> --non-interactive`
as arguments, which the script passes through to `expo prebuild` with `"$@"`.

The wrapper script (`scripts/eas-prebuild.sh`):

1. Runs `validate-eas-provisioning.js` — exits 1 if the Watch bundle ID, App Group,
   or EAS credentials source are misconfigured.
2. Runs `validate-watch-icon-format.js` — exits 1 if any watchOS AppIcon catalog
   uses the legacy per-size format that causes ITMS-90391.
3. Delegates to `npx expo prebuild "$@"` only when both checks pass.

If either validation exits with a non-zero code the build is aborted immediately and
the error output is printed to the EAS build log — no binary is produced and no
credits are consumed for the compilation phase.

You do **not** need to remember to run these manually before submitting. They are
impossible to skip via the normal `eas build` workflow.

To verify the configuration locally before building:

```bash
# Confirm eas.json is valid for all profiles
pnpm exec eas config --platform ios --profile development
pnpm exec eas config --platform ios --profile preview
pnpm exec eas config --platform ios --profile production

# Run the checks manually at any time
pnpm run validate:provisioning
pnpm run validate:watch-icons
```

### Why the icon format check matters (ITMS-90391)

Build #116 passed EAS compilation and produced a valid `Assets.car`, but Apple's App Store Connect validator rejected it with **ITMS-90391** because the `AppIcon.appiconset/Contents.json` used the **legacy per-size format** — multiple image entries (one per watch face slot) each reusing the same 1024×1024 PNG. Xcode's asset catalog compiler accepts this format silently. The rejection only appears after uploading to App Store Connect.

Build #124 fixed this by switching to the **modern single-image format**:

```json
{
  "images": [
    {
      "filename": "AppIcon.png",
      "idiom": "universal",
      "platform": "watchos",
      "size": "1024x1024"
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

The `validate:watch-icons` script enforces this before any build is triggered.
It runs automatically via `eas-prebuild.sh` — no manual step is required.

To verify the format locally at any time:

```bash
pnpm run validate:watch-icons
```

---

## App Store submission

1. _(No manual validation step needed — both checks run automatically before every `eas build`.)_
2. New binary build required (OTA cannot add a Watch App)
3. Add **iPad screenshots** and **Apple Watch screenshots** to App Store Connect
4. Watch screenshot sizes required: **40mm** and **44mm** (or 44mm and 49mm for Ultra)
5. In App Store Connect, the Watch App is bundled with the iPhone app — no separate listing needed
