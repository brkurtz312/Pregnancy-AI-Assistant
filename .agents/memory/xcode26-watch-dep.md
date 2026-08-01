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

## Why lstat error came back in build #77

`ALLOW_TARGET_PLATFORM_SPECIALIZATION` was only on the Watch target. Xcode 26 requires it on the *host* (iOS app) target to permit cross-platform dependency resolution.

**Why:** Xcode 26's new build system gates platform-specialization of dependencies at the host target level. The Watch target setting alone is not sufficient.

**How to apply:** When adding any watchOS (or tvOS/macOS) companion target to an iOS app, add `ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES` to the iOS app's own XCBuildConfiguration entries, not just the companion's.
