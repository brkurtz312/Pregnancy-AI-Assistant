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

**How to apply:** Any screen that imports a non-Expo-core native module and is navigable via Expo Router should use this pattern. Expo-core modules (expo-notifications, expo-print, etc.) are guaranteed to be in the binary when listed in app.json plugins — the risk is only for `@react-native-community/*` or other community packages that rely solely on auto-linking.
