---
name: Xcode 26 Watch target double-scheduling
description: How to wire an Apple Watch app target in EAS/Xcode 26 without "Multiple commands produce"
---

## The Rule

Use **both** scheme entry AND PBXTargetDependency, but set `buildForArchiving="NO"` on the scheme entry.

## Xcode 26 Behavior Table

| Combination | Result |
|---|---|
| Scheme entry only (buildForArchiving=YES) | Watch compiles for **iphoneos** (wrong) — `-destination generic/platform=iOS` overrides SDKROOT |
| PBXTargetDependency only | Watch **not compiled** — Xcode 26 ignores cross-platform explicit deps |
| Both, buildForArchiving=YES | Watch compiles for watchos (correct) but **twice** → "Multiple commands produce" |
| Both, buildForArchiving=NO | Watch compiles for watchos (correct) **once** ✓ |

**Why:** The scheme entry with `buildForArchiving=NO` gives Xcode the watchOS platform context it needs to resolve the cross-platform dep without independently scheduling a second archive build. The dep handles the actual build trigger; the scheme entry is only for platform resolution.

**How to apply:** In the config plugin's `withWatchScheme`, always write `buildForArchiving = "NO"` for the Watch `BuildActionEntry`. `ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES` on the iOS app target is also required (set by `applyAllowPlatformSpecializationToMainApp`).

## Plugin Structure (withWatchExtension.js)

- Export order: `withWatchScheme` applied before `withWatchXcodeTarget` — Expo processes `withXcodeProject` mods **LIFO**, so `withWatchXcodeTarget` (applied last) runs first.
- `ensureWatchTargetDependency` must be called unconditionally (not just on fresh target creation) — `addTarget()` is skipped on subsequent prebuild runs when the target already exists.
- EAS always clears ios/ and re-runs prebuild from scratch — the committed ios/ files are irrelevant; the plugin is the single source of truth.
