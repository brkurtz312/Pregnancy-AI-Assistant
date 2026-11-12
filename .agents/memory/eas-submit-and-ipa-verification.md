---
name: EAS submit works non-interactively; verify builds via IPA inspection
description: An App Store Connect API key ("Expo EAS") is stored on EAS, so `eas submit --platform ios --latest` works unattended and from the GitHub workflow. IPA inspection is still how to verify Watch/plist build output.
---

- **Submitting:** an App Store Connect API key named "Expo EAS" (Key ID
  KH9JTV95LG) is stored on EAS servers, so `eas submit` needs no Apple sign-in.
  From a laptop: `pnpm exec eas submit --platform ios --latest` in
  `artifacts/pregnancy-calculator-mobile`. From GitHub: Actions → "EAS Submit
  (App Store)" → Run workflow. Either way, only after the build shows Finished
  on expo.dev, and check it names the version you mean.
- **Corrected 2026-11-11.** This note used to say non-interactive submit was
  impossible because no API key was stored. The key exists. The GitHub
  workflow's failures came from a missing `--platform ios`, which
  non-interactive mode requires ("--platform is required when building in
  non-interactive mode"). 1.1.1 (1.0.73) was submitted from a laptop that night
  with no prompts.
- **Verifying build contents:** `eas build -p ios --profile production
  --non-interactive --no-wait`, poll `eas build:view <id>`, then download the
  Application Archive URL (.ipa), unzip, and inspect
  `Payload/*.app/Watch/PregnancyWatchApp.app/Info.plist` (plistlib) and
  `strings` on the binary.
- ios/ is **gitignored**, so EAS always runs prebuild. The local ios/ copies are
  only for local reference and tests; the canonical files under watchapp/ are
  what ship. `check-watch-sync.js` covers only Swift files, NOT Info.plist.
- **Don't push mobile changes to `main` mid-build:** `cancel-stale-eas-builds`
  runs on pushes touching `artifacts/pregnancy-calculator-mobile/**` and
  cancels the in-progress EAS build.
