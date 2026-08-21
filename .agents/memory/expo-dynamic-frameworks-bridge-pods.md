---
name: Expo dynamic frameworks and bridge pods
description: Keep React Native event-emitter bridge pods static when enabling dynamic frameworks for Clerk Swift packages.
---

When `ios.useFrameworks` must be `dynamic` for `@clerk/expo`'s Swift Package products, keep every installed native bridge pod that references `RCTEventEmitter` or `RCTRegisterModule` in `ios.forceStaticLinking`.

**Why:** Expo SDK 54 uses a prebuilt static React Native core. A bridge pod built as a dynamic framework cannot resolve those React symbols at its own link stage, even though the app itself has React Native.

**How to apply:** After adding or upgrading a native dependency, inspect its iOS bridge sources for those symbols and extend `forceStaticLinking` before the next iOS archive. Preserve dynamic linkage for Clerk rather than reverting the entire project to static frameworks.