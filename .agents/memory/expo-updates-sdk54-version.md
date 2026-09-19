---
name: expo-updates SDK 54 correct version
description: The correct expo-updates version for Expo SDK 54, and why the wrong version silently breaks OTA.
---

## Rule

For Expo SDK 54, use `expo-updates@~29.0.19`. The version `^57.0.7` (which npm/pnpm may resolve by default) is the SDK 57 package and is incompatible — OTA publishes successfully (EAS reports the update as live) but the device binary silently ignores it and never applies the bundle.

**Why:** expo-updates major version tracks the Expo SDK major. SDK 54 → expo-updates 29.x. Using 57.x installs a binary that speaks a different protocol than the SDK 54 runtime, so updates are never applied.

**How to apply:** When adding expo-updates to a SDK 54 project, always pin `~29.0.19` in package.json. If EAS CLI prompts to install it, answer No — it is already in package.json.

**Superseded in part, 19 Sep 2026:** the `--ignore-scripts` advice below was for the old `sh -c` preinstall guard. It is a Node script now, so plain `pnpm install` works on Windows.

## Windows pnpm install workaround

EAS CLI may still detect the package is "missing" from local node_modules and try to run `pnpm add expo-updates` — which fails on Windows because the root workspace preinstall script calls `sh`. Fix: run `pnpm install` from the repo root before `eas build`, then answer No when EAS asks to install. (This said `--ignore-scripts` until 19 Sep 2026, when the `sh` preinstall guard it worked around was rewritten in Node.)
