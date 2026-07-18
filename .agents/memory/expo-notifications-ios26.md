---
name: expo-notifications safe-require + iOS 26
description: expo-notifications version mismatch (SDK 57 installed, binary is SDK 54) causes screen crash on iOS 26; fix is safe IIFE require + OTA update.
---

## Rule

Any screen that statically imports a native module whose version mismatches the Expo SDK binary will crash immediately on navigation to that screen on iOS 26. Apply a safe IIFE require guard so the screen loads even if the native module fails.

## Context

- `expo-notifications@^57.0.3` was installed (SDK 57 package) while the binary was built with Expo SDK 54.
- iOS 26 is stricter about native module compatibility — the mismatch causes a module-load crash.
- `appointment-reminders.ts` was the **only** file importing `expo-notifications`, and it was **only** imported by `office-visit.tsx`. That's why only that one screen crashed.
- The same pattern was already applied to `@react-native-community/datetimepicker` (see `datetimepicker-safe-require.md`).

## Fix applied

Changed `appointment-reminders.ts` from:
```ts
import * as Notifications from "expo-notifications";
```
to:
```ts
const Notifications: NotificationsModule | null = (() => {
  try {
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
})();
```

Every exported function now checks `if (!Notifications) return;` before using the module. `scheduleNotificationAsync` is wrapped in an additional try/catch since `SchedulableTriggerInputTypes.DATE` may not exist across versions.

**Why:** Module-load failures in a static import propagate to the importing screen and crash the entire screen. The IIFE pattern isolates the failure to a graceful no-op.

**How to apply:** Any native module imported only on one screen (i.e. not shared app-wide) is a candidate for this pattern, especially if there are version mismatch warnings from `expo doctor`. Check `expo doctor` output before each build.

## Long-term fix

Upgrade to Expo SDK 57 to properly align all native module versions with iOS 26. This is a significant upgrade and should be a planned separate task.
