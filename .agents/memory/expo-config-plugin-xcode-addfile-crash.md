---
name: Expo config plugin — xcode addFile null group crash + Watch target wiring
description: project.addFile() null crash; Xcode 26 build system requires explicit PBXTargetDependency (not just scheme) for cross-platform Watch targets; scheme entry alone is insufficient.
---

# Expo config plugin — xcode addFile null group crash + Watch target wiring

## The addFile null crash rule
Never call `project.addFile(path, null, opts)` inside a `withXcodeProject` modifier. Passing `null` as the group causes `getPBXVariantGroupByKey(null)` to throw. The error is swallowed by the modifier system — no build failure, no warning — but none of the modifier's changes survive.

**Why:** The xcode npm library's `addFile` path hits `getPBXVariantGroupByKey(group)` even when group is null/falsy. The config-plugins modifier catches all exceptions and silently discards the modified project.

**How to apply:** Pass the actual group name string, or handle source file registration in a separate `withDangerousMod` that writes `.pbxproj` text directly.

## Xcode 26 build system: explicit PBXTargetDependency required for Watch targets
**Rule:** Xcode 26 (iOS 26 SDK, Swift Build system) will NOT schedule a watchOS target for compilation when building an iOS archive with `-destination generic/platform=iOS`, even if the watchOS target is listed in the scheme's `BuildActionEntries` with `buildForArchiving="YES"`. An explicit `PBXTargetDependency` in the pbxproj (from the iOS main app → watchOS target) is required for it to appear in `ComputeTargetDependencyGraph`.

**Why:** The new Xcode build system (Swift Build / XCBuild) ignores cross-platform `BuildActionEntry` items from the scheme when computing the dependency graph for a single destination. Only PBXTargetDependency entries in the pbxproj are followed across SDK/platform boundaries.

**How to apply:**
- Create a `PBXContainerItemProxy` pointing at the Watch target UUID
- Create a `PBXTargetDependency` referencing that proxy
- Add the dependency UUID to the main iOS app target's `dependencies = (...)` array
- This is INDEPENDENT of the scheme — the scheme `BuildActionEntry` can coexist but the pbxproj dependency is what actually triggers the build

**Verified with:** xcodebuild on iPhoneOS26.0.sdk. Before the fix: 156 targets in dependency graph, Watch target absent. After fix: Watch target appears at top level.

## Watch target config specifics
- Target type: `watch2_app` → `com.apple.product-type.application.watchapp2`
- `addTarget('Name', 'watch2_app', ...)` auto-creates "Embed Watch Content" on the first (main) target — do NOT add it manually
- EAS provisioning for the Watch bundle ID: declare in `app.json` under `extra.eas.build.experimental.ios.appExtensions` (NOT in `eas.json`)
- EAS must be run interactively once to create the Watch provisioning profile; subsequent non-interactive builds reuse it
- EAS finds targets via `trimQuotes(target.name) === targetName` — the xcode lib stores names with surrounding `"` chars, trimQuotes strips them correctly

## Debugging approach that works
1. Run `CI=1 npx expo prebuild --platform ios --clean` locally (no Xcode required — Linux/Replit is fine)
2. `grep PregnancyWatchApp ios/*/project.pbxproj` — if empty, the modifier failed silently
3. Reproduce in Node.js directly: `const p = xcode.project(pbxPath); p.parseSync(); /* run plugin logic */` — actual errors surface here
4. To see Watch compilation errors: download the `.log` file from the EAS build's "Xcode Logs" section (the fastlane summary suppresses Watch errors with `suppress_xcode_output: true`)
5. Search the full Xcode log for `ComputeTargetDependencyGraph` — if Watch target absent from the graph, it's a pbxproj wiring issue, not a Swift compile error
