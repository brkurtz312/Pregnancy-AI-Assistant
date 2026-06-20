---
name: iOS EAS build — Clerk reCAPTCHA pods need modular headers
description: Why the Expo iOS EAS build fails at "Install pods" and the surgical fix
---

# Symptom
EAS iOS build (Expo managed / CNG, no committed `ios/`) fails at the **Install pods**
phase with: `The Swift pod AppCheckCore depends upon GoogleUtilities and RecaptchaInterop,
which do not define modules ... set use_modular_headers! ... or :modular_headers => true`.

# Root cause
`@clerk/expo`'s bot-protection (reCAPTCHA) pulls in Google Swift static pods
(`AppCheckCore`, `GoogleUtilities`, `RecaptchaInterop`). As static libraries they have
no module maps, so the Swift pod can't import them. This is NOT the pnpm/node-linker
issue (deps install fine; failure is at pod install, after JS install succeeds).

# Fix (surgical, chosen over the heavier hammer)
`expo-build-properties` plugin in `app.json` with `ios.extraPods` setting
`modular_headers: true` for `GoogleUtilities` and `RecaptchaInterop`.

**Why this over `ios.useFrameworks: "static"`:** static frameworks change linkage for
ALL pods (Reanimated/Hermes/new-arch) and risk a *different* build failure. Targeted
modular_headers only generates module maps for the two offending pods.

**How to apply:** edit `app.json` plugins, no native files to touch (CNG regenerates the
Podfile on EAS). Verify locally with `expo config --type prebuild` (pod-level mods only
appear in prebuild introspection, not the runtime config). Then re-run the EAS build —
pod install runs only on EAS macOS workers, never on Replit/Linux.
