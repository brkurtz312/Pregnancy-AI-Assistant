---
name: Xcode 26 Watch double-scheduling fix
description: How to add a watchOS companion target to an EAS/Expo iOS build without "Multiple commands produce" or lstat ENOENT errors.
---

## The rule
Use **scheme-only scheduling + shell script embed**. Never use PBXTargetDependency for cross-platform (iOS→watchOS) targets in Xcode 26.

## Full history of failed approaches

| Config | Failure |
|---|---|
| PBXTargetDependency only, no scheme entry | Watch NOT compiled (Xcode 26 ignores cross-platform deps entirely) |
| Scheme entry only, dep removed, auto "Embed Watch Content" phase kept | Phase looks in Release-iphoneos/ → lstat ENOENT at archive |
| Scheme entry + PBXTargetDependency | Double-scheduling → "Multiple commands produce ...watchos/PregnancyWatchApp.app" |
| addTarget auto-dep + ensureWatchTargetDependency | Two deps → double-schedule |
| Scheme only + withWatchSchemeCleanup strips auto-entry | Watch never in scheme → not compiled |

## Working design (v6, commit 0948e3a)

1. **addTarget("watch2_app")** auto-creates: PBXTargetDependency + scheme BuildActionEntry + "Embed Watch Content" PBXCopyFilesBuildPhase
2. **removeWatchTargetDependency** — strips the auto-dep unconditionally (dep + scheme = double-schedule)
3. **removeEmbedWatchPhase** — strips "Embed Watch Content" copy phase (looks in Release-iphoneos/ which Watch never occupies)
4. **addEmbedWatchShellScript** — adds PBXShellScriptBuildPhase to iOS app:
   - Finds Watch at `${OBJROOT}/UninstalledProducts/watchos/PregnancyWatchApp.app` (SKIP_INSTALL=YES archive path)
   - Falls back to `find` in build tree
   - Copies to `${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/Watch/`
5. **withWatchScheme** — strips auto-added Watch scheme entry, re-injects it **FIRST** in BuildActionEntries (Watch must build before iOS app's embed script runs)

## LIFO execution order in module.exports

```
withWatchFiles       → applied first  → executes third   (Swift source files)
withWatchScheme      → applied second → executes second  (scheme XML fixup)
withWatchXcodeTarget → applied last   → executes first   (pbxproj target + phases)
```

## Critical pbxproj format rule
Shell script content stored in PBXShellScriptBuildPhase must NOT contain unescaped `"` characters. The pbxproj string format uses `\n` (2-char literal) for newlines inside quoted values. Avoid double-quotes inside the script body entirely — use unquoted bash variables (safe for simple paths).

**Why:** The xcode npm library writes values with outer `"` as-is; any inner `"` that isn't escaped as `\"` breaks the pbxproj parser on next read → `SyntaxError: Expected "/*" or ";" but "P" found`.

## Critical embed phase detection rule
`addTarget("watch2_app")` names the auto-created PBXCopyFilesBuildPhase differently by context:
- Local (stale ios/ dir, older xcode lib): `"Embed Watch Content"`
- EAS (fresh generate): `"Embed PregnancyWatchApp"` (uses target product name)

**Always detect by `dstSubfolderSpec = 16`** (Xcode's Watch Content destination), never by name. Build #106 (v7, commit 6ed14a1) confirmed this fix — archive succeeded.

## Watch app icons required for App Store submission
Apple's binary validator (ITMS-90391/90713) requires the Watch bundle to contain compiled icons from an asset catalog. Without `Assets.xcassets`:
- Build succeeds, archive succeeds, upload succeeds
- Apple processing fails: "No icons found for watch application" (90391) + "Missing CFBundleIconName" (90713)
Fix requires ALL four of:
1. `watchapp/Assets.xcassets/AppIcon.appiconset/` with a `Contents.json` covering all watchOS icon slots (notificationCenter, appLauncher, quickLook, companionSettings, watch-marketing 1024x1024) and an `AppIcon.png`
2. `CFBundleIconName = AppIcon` in `watchapp/Info.plist`
3. `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` in `applyWatchBuildSettings`
4. Register `Assets.xcassets` as a PBXFileReference + PBXBuildFile in the Watch target's Resources phase (see `addWatchAssetCatalogToResources`)

## Critical productType rule
`addTarget("watch2_app")` always sets `productType = "com.apple.product-type.application.watchapp2"` (legacy WatchKit 2 container). For modern standalone watchOS 7+ apps (`@main App` + `WKApplication = true` in Info.plist), the correct type is `"com.apple.product-type.application"`. With the wrong type:
- Archive succeeds, TestFlight upload succeeds
- Watch app never appears in the iPhone Watch app → Available Apps (silent failure)
Fix: overwrite `nts[watchUuid].productType` to `'"com.apple.product-type.application"'` after `addTarget`. Run fix unconditionally in both fresh-add and re-run paths.
After this fix both iOS and Watch share `productType = application`, so all "find main iOS app target" helpers MUST exclude the Watch by name (`t.name !== WATCH_TARGET_NAME`) — see `findMainAppTargetUuid(nts)` helper in plugin.

## Key identifiers
- Watch bundle ID: `app.replit.pregnancycalculator.watchapp`
- iOS bundle ID: `app.replit.pregnancycalculator`
- Watch archive output: `$OBJROOT/UninstalledProducts/watchos/PregnancyWatchApp.app`
- Plugin file: `artifacts/pregnancy-calculator-mobile/plugins/withWatchExtension.js`
