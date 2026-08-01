---
name: Xcode 26 Watch target double-scheduling
description: How to wire an Apple Watch app target in EAS/Xcode 26 without "Multiple commands produce" or embed lstat errors
---

## The Rule (current — dep-only + ATPS)

Use **PBXTargetDependency only** (no scheme entry) + `ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES` on the iOS app target. The dep triggers the Watch build; ATPS tells Xcode 26 the dep may build for a different SDK.

Do NOT add a scheme `BuildActionEntry` for the Watch — every combination with both a dep and a scheme entry causes double-scheduling.

## Full Decision Table

| Combination | Result |
|---|---|
| Scheme entry only, no ATPS | Watch compiles for **iphoneos** (wrong) |
| Scheme entry only + ATPS, no dep | Watch builds for watchos ✓ but "Embed Watch Content" phase looks in `Release-iphoneos/` → **lstat ENOENT** at archive time |
| PBXTargetDependency only, no ATPS | Watch **not compiled** — Xcode 26 ignores cross-platform explicit deps |
| Both, buildForArchiving=YES | Watch compiles for watchos ✓ but **twice** → "Multiple commands produce" |
| Both, buildForArchiving=NO | Still double-schedules (dep fires regardless of scheme flag) |
| Dep only + ATPS=YES (**current**) | ATPS enables cross-platform dep; embed phase resolves watchos output correctly ✓ |

**Why scheme-only + ATPS fails on embed:** The "Embed Watch Content" `PBXCopyFilesBuildPhase` (auto-created by `addTarget("watch2_app")`) references the Watch product by file ref. At build time Xcode resolves it relative to `$(BUILT_PRODUCTS_DIR)` of the iOS app, which is `Release-iphoneos/`. With no PBXTargetDependency, Xcode never sets up the cross-platform build products mapping, so the Watch app (built to `Release-watchos/`) is invisible to the embed phase → `lstat ...Release-iphoneos/PregnancyWatchApp.app: No such file or directory` at archive time.

**Why dep-only failed without ATPS:** Xcode 26 silently skips cross-platform PBXTargetDependencies unless `ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES` is set on the parent target.

## Critical EAS Detail

`addTarget("watch2_app")` auto-creates a PBXTargetDependency on every fresh EAS build (EAS always clears `ios/` and re-runs prebuild). So the dep is always present after `addTarget`. To keep it present on re-runs (where `addTarget` is skipped because `alreadyPresent=true`), call `ensureWatchTargetDependency(project, watchUuid)` unconditionally — it is idempotent.

## Plugin Structure (withWatchExtension.js)

- Export: `withWatchFiles` → `withWatchXcodeTarget` only. `withWatchScheme` is NOT in the export chain.
- `ensureWatchTargetDependency` called unconditionally in the `if (watchUuid)` block.
- `applyAllowPlatformSpecializationToMainApp` called unconditionally in the same block.
- EAS always clears ios/ and re-runs prebuild from scratch — the committed ios/ files are irrelevant; the plugin is the single source of truth.
- Expo processes `withXcodeProject` mods **LIFO** — if scheme were re-added, apply it before `withWatchXcodeTarget` in the export chain.
