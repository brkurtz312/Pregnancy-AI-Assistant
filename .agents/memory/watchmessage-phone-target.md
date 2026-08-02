---
name: WatchMessage phone target scope
description: WatchMessage enum defined in Watch target is not visible to the phone app target — must be declared in both.
---

## Rule
`WatchMessage` (and any other shared enum/struct used by both the phone app and Watch app) must be declared in a file compiled into the phone app target. It cannot be imported from the Watch extension target.

## Why
Xcode compiles the phone app target (`PregnancyAIAssistant`) and the Watch app target (`PregnancyWatchApp`) as completely separate modules. Types defined only in `ios/PregnancyWatchApp/Models.swift` are invisible to files in `ios/PregnancyAIAssistant/`. Build fails with "cannot find 'WatchMessage' in scope".

## How to apply
- `WatchMessage` is declared in both `ios/PregnancyWatchApp/Models.swift` (Watch target) and `ios/PregnancyAIAssistant/PhoneWatchBridge.swift` (phone target).
- If new message keys are added to `WatchMessage`, update **both files**.
- Comment in `PhoneWatchBridge.swift` says "Keep in sync with PregnancyWatchApp/Models.swift" as a reminder.
- Any future shared type used by both targets needs the same treatment (duplicate declaration or a proper shared framework, which Expo managed workflow doesn't support easily).
