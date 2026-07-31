---
name: Expo config plugin — xcode addFile null group crash
description: project.addFile() with null group silently unwinds the whole withXcodeProject modifier; Watch target debugging via local prebuild + direct Node.js test.
---

# Expo config plugin — xcode addFile null group crash

## The rule
Never call `project.addFile(path, null, opts)` inside a `withXcodeProject` modifier. Passing `null` as the group causes `getPBXVariantGroupByKey(null)` to throw inside `pbxProject.addFile`. The error is swallowed by the modifier system — no build failure, no warning — but the modifier's return value is discarded and none of its Xcode project changes (including any `addTarget` calls made earlier) survive into the final `project.pbxproj`.

**Why:** The xcode npm library's `addFile` path hits `getPBXVariantGroupByKey(group)` even when group is null/falsy in certain code paths. The config-plugins modifier catches all exceptions and silently skips writing the modified project back.

**How to apply:** When adding Swift source files from a config plugin, either:
- Pass the actual group name string (e.g. the app name) rather than null
- Or add the files in a separate `withDangerousMod` that directly writes the `.pbxproj` text
- Or omit the `addFile` calls and handle source file registration separately

## Debugging approach that works
1. Run `CI=1 npx expo prebuild --platform ios --clean` locally (no Xcode required — Linux/Replit is fine)
2. `grep PregnancyWatchApp ios/*/project.pbxproj` — if empty, the modifier failed silently
3. Reproduce in Node.js directly: `const p = xcode.project(pbxPath); p.parseSync(); /* run plugin logic */` — actual errors surface here
4. Fix, re-run step 1, re-grep to confirm before pushing a build

## Watch target config specifics
- Target type: `watch2_app` → `com.apple.product-type.application.watchapp2`
- `addTarget('Name', 'watch2_app', ...)` auto-creates "Embed Watch Content" on the first (main) target — do NOT add it manually
- EAS provisioning for the Watch bundle ID: declare in `app.json` under `extra.eas.build.experimental.ios.appExtensions` (NOT in `eas.json`)
- EAS must be run interactively once to create the Watch provisioning profile; subsequent non-interactive builds reuse it
- EAS finds targets via `trimQuotes(target.name) === targetName` — the xcode lib stores names with surrounding `"` chars, trimQuotes strips them correctly
