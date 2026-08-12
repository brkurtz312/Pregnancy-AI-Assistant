---
name: EAS submit blocked non-interactively; verify builds via IPA inspection
description: How to verify iOS/Watch build output from this Linux env when TestFlight submission can't run
---
- `eas submit --non-interactive` fails: "App Store Connect API Keys cannot be set up in --non-interactive mode" — no ASC API key is stored; TestFlight submission must be done interactively by the user.
- **How to verify instead:** `eas build -p ios --profile production --non-interactive --no-wait`, poll `eas build:view <id>`, then download the Application Archive URL (.ipa), unzip, and inspect `Payload/*.app/Watch/PregnancyWatchApp.app/Info.plist` (plistlib) and `strings` on the binary.
- ios/ is **gitignored**, so EAS always runs prebuild — the committed-looking local ios/ copies are only for local reference/tests; watchapp/ canonical files are what ship. `check-watch-sync.js` covers only Swift files, NOT Info.plist.
- Production build takes ~7 min on EAS.
