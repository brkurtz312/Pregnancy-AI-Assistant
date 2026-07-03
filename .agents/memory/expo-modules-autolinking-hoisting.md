---
name: expo-modules-autolinking must be a direct, correctly-pinned dependency
description: EAS build entitlements resolution needs expo-modules-autolinking hoisted to the app's own node_modules, not just nested inside expo's dependency tree.
---

EAS build failed with "Cannot find 'expo-modules-autolinking' package in your project, make sure that you have 'expo' package installed" even though `expo` was installed correctly and `pnpm why` showed a valid transitive `expo-modules-autolinking` version under `expo`.

**Why:** EAS's config-plugin fallback resolves `expo-modules-autolinking` directly from the project root (not via `expo`'s own nested dependency). In a pnpm workspace, packages that are only *transitive* dependencies are not hoisted into the consuming package's `node_modules` — they only exist inside the `.pnpm` virtual store, reachable via `expo`'s own symlinks, not the app's. So even though the version was technically present and correct somewhere in the tree, it wasn't resolvable from the app root.

Two failure modes were seen for this same underlying requirement:
1. A stray direct dependency pinned to the wrong major version (e.g. `^56.0.16` when the installed Expo SDK's transitive version was `~3.0.26`) — mismatched version breaks entitlement resolution.
2. Removing the direct dependency entirely "fixes" the version mismatch warning but reintroduces the original resolution failure, since it's no longer hoisted to the app's node_modules at all.

**How to apply:** `expo-modules-autolinking` must be a **direct dependency** in the Expo app's `package.json`, version-pinned to match whatever `expo` itself transitively resolves (check via `pnpm why expo-modules-autolinking --filter <app>`), not to `latest`/an unrelated major. Verify it's actually hoisted with `ls node_modules/expo-modules-autolinking` inside the app directory (should be a symlink into `.pnpm`) before assuming the fix worked — a passing typecheck/test run does NOT catch this, only actually inspecting node_modules or running the real EAS build does.
