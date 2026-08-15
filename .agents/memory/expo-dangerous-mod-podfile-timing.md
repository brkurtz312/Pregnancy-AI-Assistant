---
name: withDangerousMod Podfile timing
description: withDangerousMod runs BEFORE Expo's Podfile base mod — any Podfile patch gets overwritten. Use Xcode build phases for post-pod-install patching.
---

## Rule
Never use `withDangerousMod` to patch the Podfile. Expo's Podfile base mod runs AFTER dangerous mods and regenerates the file from scratch, silently discarding any changes.

## Why
The Podfile base mod is part of `compileModsAsync` and writes the Podfile after all dangerous mods have run. In EAS builds (clean ios/ directory), the Podfile simply doesn't exist yet when `withDangerousMod` runs, and after the base mod creates it, our patch is gone.

This was confirmed in practice: two successive builds (1.0.45, 1.0.46) showed the Podfile patch absent from the output file.

## How to apply
For anything that needs to run AFTER `pod install` (e.g., patching `ExpoModulesProvider.swift` before Swift compilation), use a **PBXShellScriptBuildPhase** added via `withXcodeProject`, inserted before the "Compile Sources" phase. This runs at Xcode build time, which is:
1. AFTER `pod install` has generated the target file
2. BEFORE "Compile Sources" reads it

AppDelegate.swift can be patched via `withDangerousMod` because it has no base mod; it's copied from a template before `compileModsAsync` runs. The Podfile does NOT have this property.

## Context
Discovered while trying to register `WatchConnectivityModule` in `ExpoModulesProvider.swift`. The module is a bare Swift file (not an npm package), so expo-modules-autolinking never adds it to `ExpoModulesProvider.getModuleClasses()`, causing `NativeModulesProxy.WatchConnectivity` to be null in JS.
