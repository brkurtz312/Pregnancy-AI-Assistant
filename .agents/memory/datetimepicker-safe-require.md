---
name: DateTimePicker safe-require pattern
description: How to guard against missing native modules in Expo OTA screens that are lazy-loaded by Expo Router
---

## Rule

Never use a static ES `import` for `@react-native-community/datetimepicker` (or any community native module not guaranteed to be in the TestFlight binary). Use a try/catch `require()` IIFE instead.

```ts
const DateTimePicker: React.ComponentType<any> | null = (() => {
  try {
    return (require("@react-native-community/datetimepicker") as { default: React.ComponentType<any> }).default;
  } catch {
    return null;
  }
})();
```

Then guard rendering: `if (!DateTimePicker) { /* fallback */ }`.

**Why:** Expo Router lazy-loads each screen module — the `require()` only runs when you first navigate to the screen. A static ES import becomes a `require()` at the very top of that lazy evaluation. If the native module (`RNCDateTimePicker`) isn't registered in the TestFlight binary (because it was added after the last native build), `requireNativeComponent` throws at that point, the entire module evaluation fails, and the screen crashes on every navigation attempt. A render-only guard (`{showPicker && <DateTimePicker />}`) does NOT help because the crash happens before any render.

**Update (Aug 2026):** This class of bug can also crash the WHOLE app at launch, not just one screen. Tab routes (and any route evaluated at startup, e.g. the initial `(tabs)/index` route) are evaluated when the bundle loads. A broken OTA bundle then produces the "fresh install works, second launch dies at splash" pattern: first launch runs the embedded bundle; the OTA downloads in background and is applied on the next launch, where module-eval throws before the JS error boundary exists. When diagnosing "crashes only after force-quit/reopen", suspect the latest OTA bundle's startup import graph before suspecting native persistent state.

**How to apply:** Any screen that imports a non-Expo-core native module and is navigable via Expo Router should use this pattern. Expo-core modules (expo-notifications, expo-print, etc.) are guaranteed to be in the binary when listed in app.json plugins — the risk is only for `@react-native-community/*` or other community packages that rely solely on auto-linking.
