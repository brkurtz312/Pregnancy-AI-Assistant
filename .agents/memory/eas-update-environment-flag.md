---
name: eas update requires --environment production
description: OTA publishes must load EAS-hosted EXPO_PUBLIC_* env vars or the bundle ships with empty config and crashes at startup
---

`eas update --branch production` bundles **locally** and inlines `EXPO_PUBLIC_*` from the local shell env. This project keeps its runtime config (EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_CLERK_PROXY_URL, EXPO_PUBLIC_DOMAIN, RevenueCat keys) in the **EAS "production" environment**, not the workspace env. Publishing without `--environment production` ships a bundle with an empty Clerk key → the root layout renders the generic "Something went wrong" ErrorFallback on every launch, on every binary, until users reinstall or a fixed OTA lands.

**Why:** an OTA published without the flag bricked TestFlight installs at startup; the tiny JS diff was innocent — the env inlining was the cause. Diagnosis clue: crash appears only after the OTA downloads (fresh reinstall works once), and `env | grep EXPO_PUBLIC` in the workspace lacks the keys that `eas env:list production` shows.

**How to apply:** ALWAYS publish OTAs with `npx eas-cli update --branch production --environment production --message ...`. To verify a publish is sane, confirm the CLI prints "Environment variables ... loaded from the 'production' environment". Recovery: republish correctly; users on the crashed bundle can wait ~10s on the error screen for the background download, then force-quit twice.
