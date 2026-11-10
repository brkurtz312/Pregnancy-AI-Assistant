---
name: Expo SDK 58 / iPhone Duo upgrade
description: What changed moving the mobile app from Expo SDK 54 to 58 (iOS 27, UIScene, iPhone Duo) and the traps found doing it.
---

## Why

Apps built with Xcode 27 only launch on iOS 27 if they use the UIScene life
cycle, and Apple requires the iOS 27 SDK for uploads from April 2027. SDK 54
builds on Xcode 26.0 and has no scene support; SDK 58 (RN 0.88.1, React
19.3) is the first Expo SDK with iOS 27 + iPhone Duo support. Prebuild now
generates `SceneDelegate.swift` and `UIApplicationSceneManifest`; none of our
config plugins touch AppDelegate, so nothing needed porting.

## Traps

- **expo-av is gone** (removed in SDK 55). Scribe + fetal heart rate use
  `expo-audio` (`useAudioRecorder`, `createAudioPlayer` — release players
  yourself); MediaViewerModal uses `expo-video` in its own `JournalVideo`
  component because `useVideoPlayer` can't be conditional. Package-level
  mocks: `__mocks__/expo-audio.js`, `__mocks__/expo-video.js`.
- **Microphone purpose string** now comes from the `expo-audio` plugin entry
  in app.json. Without it prebuild writes Expo's generic text.
- **Jest + reanimated 4.7/worklets 0.13:** `react-native-reanimated/mock`
  loads the real worklets runtime and crashes. Their shipped resolvers fix it
  but match on "path contains package name", and pnpm folder names like
  `react-native-reanimated@x_react-native-worklets@y` defeat that. We use
  `test-helpers/jest-resolver.js`, which matches the real package folder.
- **jest-expo 58 needs Jest 30** and `@react-native/jest-preset`.
- **expo-router 58 custom tab bars** get `navigateToTab(routeKey)` instead of
  `navigation`; `tabBarIcon` colour is `ColorValue` (cast for Ionicons).
- **RN 0.88 strict types:** `useRef<TextInputInstance>` /
  `useRef<ScrollViewInstance>`, `StyleSheet.absoluteFillObject` removed,
  RefreshControl `onRefresh` must return void/Promise<void>.
- **Keep mobile `@types/react` at the version the rest of the repo resolves**
  (19.2.14). A second copy breaks the mockup-sandbox typecheck.
- **EAS image pinned** to `macos-tahoe-26.6-xcode-27.1` in eas.json; the
  `sdk-54` image was Xcode 26.0.
- `withWatchExtension`'s Watch test file list is missing
  `KickCounterViewBadgeTests.swift` (pre-existing; check-watch-sync reports it
  after prebuild).

## iPhone Duo layout

`useIsTablet` threshold is 600 pt (was 768) so the unfolded inner screen
(~669 pt) gets the sidebar layout. Never size from `Dimensions.get` at module
load — use `useWindowDimensions` so folding/unfolding reflows.
