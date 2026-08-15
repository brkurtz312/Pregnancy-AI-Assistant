---
name: OTA new-code crash pattern
description: Every new OTA bundle built on Replit crashes the app on device; root cause unknown but consistent.
---

# OTA New-Code Crash Pattern

## The Rule
**Do not ship new feature code via OTA.** Any OTA that introduces new source files or meaningful new imports crashes the app on the user's device with the Error Boundary ("Something went wrong / Try Again"). OTAs that reuse a previously-uploaded bundle (Expo's content-addressable deduplication) work fine.

**Why:** Root cause is unknown. Hypotheses: React Compiler (`[expo-cli] React Compiler enabled`) incorrectly transforms code in the Replit Metro environment. Observed consistently across multiple unrelated features and files.

## Evidence
- Watch connectivity diagnostic OTA: trivial template-literal label change → crash
- Journal media viewer OTA: new `MediaViewerModal.tsx` importing `expo-av` → crash  
- Revert OTAs (reverting to a previously-uploaded bundle) always work

## How to Apply
- **New feature code** → binary build (EAS build --profile production), then submit
- **Revert to stable state** → safe to push as OTA (Expo deduplicates, serves previous bundle)
- **Hotfixes to existing lines** → risky; prefer binary build if possible
- The `check-native-imports.js` checker guards against restricted native imports but does NOT protect against this bundler crash pattern

## watchapp/ Swift sync direction
A separate but related trap: `check-watch-sync.js --fix` treats `watchapp/` as the canonical source and overwrites `ios/` copies. Always edit `watchapp/WatchConnectivityModule.swift` (and other watchapp/ files), never the `ios/PregnancyAIAssistant/` copies directly — edits to ios/ copies are silently lost on the next sync run.
