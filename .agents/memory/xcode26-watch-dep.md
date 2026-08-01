---
name: Xcode 26 Watch cross-platform target dependency
description: How to wire a watchOS companion target so Xcode 26 / EAS builds it exactly once without lstat or "Multiple commands produce" errors.
---

## The rule

`ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES` must be set on the **iOS app** target's build configurations (both Debug and Release), not only on the Watch target.
Without it on the host target, Xcode 26's new build system refuses to schedule the cross-platform watchOS dependency even when `PBXTargetDependency` is correctly wired — producing `lstat(Release-watchos/PregnancyWatchApp.app): No such file or directory`.

## Complete working wiring checklist

1. **PBXContainerItemProxy** — `containerPortal = <PBXProject UUID>`, `proxyType = 1`, `remoteGlobalIDString = <Watch target UUID>`
2. **PBXTargetDependency** — `target = <Watch UUID>`, `targetProxy = <proxy UUID>`
3. **iOS app `dependencies = (<dep UUID>)`** — the dependency entry above
4. **iOS app build configs (Debug + Release)** — `ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES`
5. **Watch target build configs (Debug + Release)** — `SDKROOT = watchos`, `SUPPORTED_PLATFORMS = "watchos watchsimulator"`, `ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES` (belt-and-suspenders)
6. **Embed Watch Content phase PBXBuildFile** — `settings = {ATTRIBUTES = (RemoveHeadersOnCopy, CodeSignOnCopy);}`
7. **TargetAttributes in PBXProject** — `WatchApps = (<Watch UUID>)` inside main app's entry; separate entry for Watch target with `CreatedOnToolsVersion` + `ProvisioningStyle`
8. **Scheme** — Watch NOT in `BuildActionEntries`; `buildImplicitDependencies = "YES"` on the scheme root

## Why "Multiple commands produce" happened in builds #72–75

The Watch was in the scheme's `BuildActionEntries` *and* wired via `PBXTargetDependency`. Both triggers fired simultaneously in the watchOS context, hitting the same output path. Fix: remove Watch from scheme entries; keep only the `PBXTargetDependency`.

## Why lstat error came back in builds #77-79 (the real root cause)

The Expo config plugin (`withWatchExtension.js`) runs during EAS prebuild and its `withWatchScheme` function was **removing** the Watch `BuildActionEntry` from the scheme on every build. All manual edits to the scheme file were wiped before xcodebuild ran. The plugin also set `buildImplicitDependencies = "NO"` and added a `PBXTargetDependency` — exactly the failing combination.

**Why `PBXTargetDependency` kept being re-added:** `addTarget("watch2_app")` in the xcode JS library auto-creates a `PBXTargetDependency`. The plugin never stripped it.

## Correct plugin design for Xcode 26

`withWatchScheme` must:
1. Use `withXcodeProject` (not `withDangerousMod`) to look up the Watch UUID from the project object
2. **Add** the Watch `BuildActionEntry` with `buildForArchiving = "YES"` (not remove it)
3. Restore `buildImplicitDependencies = "YES"` (not flip it to NO)

`withWatchXcodeTarget` must also always (idempotent):
- Strip the auto-created `PBXTargetDependency` via `removeWatchTargetDependency()`
- Add `ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES` to the iOS app target's build configs via `applyAllowPlatformSpecializationToMainApp()`

**Why:** Xcode 26's build system gates cross-platform dependency scheduling at the host target. PBXTargetDependency alone never schedules the Watch. Scheme entry is the only reliable trigger.

**How to apply:** Any future Watch plugin changes must verify both the scheme file and pbxproj state AFTER prebuild, not before.
