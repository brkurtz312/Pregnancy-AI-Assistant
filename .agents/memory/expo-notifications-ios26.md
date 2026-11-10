---
name: expo-notifications crash on iOS 26 — full resolution
description: expo-notifications version mismatch (SDK 57 vs SDK 54 binary) crashes the Office Visits screen on iOS 26 via TurboModule lazy init; OTA alone cannot fix native crashes when expo-updates itself is also misversioned. Requires a new native build.
---

> **Superseded 9 Nov 2026:** the app is on Expo SDK 58 now — see expo-sdk58-iphone-duo-upgrade.md. Version numbers below are SDK 54-specific.

## Rule

When a native package version mismatches the Expo SDK binary AND the app uses `newArchEnabled: true` (TurboModules), that module is lazily initialized the first time JS calls `require()`. On iOS 26 this lazy init crashes the process. **OTA updates cannot fix native crashes** — they only replace JS, not the compiled native modules.

## Root cause chain (build 55 → fixed in build 56)

1. `expo-notifications@^57.0.3` (SDK 57 package) was installed in an SDK 54 binary with `newArchEnabled: true`.
2. `appointment-reminders.ts` statically imported it; `office-visit.tsx` was the only screen that imported `appointment-reminders.ts`.
3. On iOS 26, navigating to Office Visits triggered the lazy TurboModule init → native crash → whole app closed.
4. Three OTA updates (safe-require guard → full no-op → null module) were pushed but **none landed**: `expo-updates@57.0.7` is also misversioned for SDK 54, and on iOS 26 it crashes while trying to apply bundles, silently falling back to old code every restart.

## Fix (build 56 / v1.0.9)

Remove `expo-notifications` from both:
- `package.json` dependencies — so it is not compiled into the binary
- `app.json` `plugins` array — **critical**: if the plugin entry stays, EAS fails at "Read app config" with "Unknown error" before the build even starts

`appointment-reminders.ts` remains a full no-op (no import at all). Notification scheduling can be restored in a future build once SDK is upgraded.

**Why:** The only reliable fix for a native TurboModule crash is removing the module from the native binary. OTA is useless when expo-updates itself is broken by the same version-mismatch pattern.

## Plugin-removal checklist

When removing ANY Expo package that registers a config plugin, always remove it from **both** places:
1. `package.json` dependencies
2. `app.json` `plugins` array

Missing step 2 causes: `✖ Build failed — Unknown error. See logs of the Read app config build phase.`

## Re-enabling notifications (SDK 54)

For SDK 54, the compatible version is `expo-notifications@~0.29.14`. Install with safe-require (IIFE try/catch) in `appointment-reminders.ts` — do NOT use a static import. Add `"expo-notifications"` to `app.json` plugins array (needed for iOS capabilities). Call `requestNotificationPermission()` from a signed-in `useEffect` hook in `_layout.tsx`.

Trigger type for SDK 54 compatible scheduling: `SchedulableTriggerInputTypes.DATE` with a `date` field.

## Long-term fix

Upgrade to Expo SDK 57 to align all native module versions with iOS 26. This is a planned separate task.
