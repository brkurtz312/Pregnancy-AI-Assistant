---
name: Expo config plugin — xcode addFile null group crash + Watch target wiring
description: project.addFile() null crash; Xcode 26 build system requires explicit PBXTargetDependency (not just scheme) for cross-platform Watch targets; scheme entry alone is insufficient.
---

# Expo config plugin — xcode addFile null group crash + Watch target wiring

## The addFile null crash rule
Never call `project.addFile(path, null, opts)` inside a `withXcodeProject` modifier. Passing `null` as the group causes `getPBXVariantGroupByKey(null)` to throw. The error is swallowed by the modifier system — no build failure, no warning — but none of the modifier's changes survive.

**Why:** The xcode npm library's `addFile` path hits `getPBXVariantGroupByKey(group)` even when group is null/falsy. The config-plugins modifier catches all exceptions and silently discards the modified project.

**How to apply:** Pass the actual group name string, or handle source file registration in a separate `withDangerousMod` that writes `.pbxproj` text directly.

## Xcode 26 Watch app build: three sources of double-scheduling
**Rule:** In Xcode 26, a watchOS companion app embedded in an iOS archive can be scheduled to build by THREE independent mechanisms. Having more than ONE active simultaneously causes "Multiple commands produce / CreateUniversalBinary duplicate-output" errors. Only ONE must be active.

The three mechanisms:
1. **Scheme `BuildActionEntry`** with `buildForArchiving="YES"` — Xcode 26's new build system IGNORES this for cross-platform targets when building `generic/platform=iOS`. Produces nothing. Safe to remove.
2. **Explicit `PBXTargetDependency`** from iOS main app → watchOS target — DOES schedule the Watch build. If combined with (3) produces a double-build.
3. **Embed Watch Content phase implicit dep** — The `PBXCopyFilesBuildPhase` with `dstSubfolderSpec=16` referencing `BUILT_PRODUCTS_DIR/PregnancyWatchApp.app` creates a build-system-level implicit dependency that is **NOT** controlled by the scheme's `buildImplicitDependencies` flag. It always fires.

**Confirmed failure states:**
- Scheme entry only (no PBXTargetDep): Watch absent from dependency graph entirely (Xcode 26 ignores scheme cross-platform entries)
- PBXTargetDep + embed implicit dep: Watch built twice → `CreateUniversalBinary arm64 arm64_32` duplicate-output error
- PBXTargetDep + `buildImplicitDependencies=NO`: same duplicate error (flag controls scheme-level implicits only, not phase-level)

**Correct setup for Xcode 26:**
- NO scheme `BuildActionEntry` for Watch
- NO explicit `PBXTargetDependency` from iOS → watchOS
- `buildImplicitDependencies = "YES"` in scheme (default, controls scheme-level; phase-level is always active)
- Let the "Embed Watch Content" phase's `BUILT_PRODUCTS_DIR` file reference be the sole scheduler

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
