---
name: babel-preset-expo pnpm Windows OTA
description: eas update bundles locally on Windows; pnpm isolation hides babel-preset-expo from Metro unless it is a direct dependency.
---

## Rule

`babel-preset-expo` must be a direct `devDependency` in the mobile package's `package.json` for `eas update` to succeed when run on Windows.

## Why

`eas update` runs Metro locally on the developer's machine (unlike `eas build` which runs on EAS servers). Metro resolves babel presets from the project's own `node_modules`. Under pnpm's strict module isolation, transitive dependencies are not automatically accessible — `babel-preset-expo` is pulled in by `expo`/`expo-router` but pnpm doesn't create a direct symlink for it in the mobile package's `node_modules`. On macOS/Linux this sometimes works due to symlink resolution differences; on Windows it reliably fails.

**Error seen:** `Cannot find module 'babel-preset-expo'` from inside `@babel/core`.

## Fix

Add `babel-preset-expo` as a direct `devDependency` in `artifacts/pregnancy-calculator-mobile/package.json`, pinned to match the transitively installed version (check `ls node_modules/.pnpm/ | grep babel-preset-expo`).

## Windows pnpm install workaround

The root `package.json` has a `preinstall` script using `sh` to clean up lock files. On Windows PowerShell, `sh` is not available and `pnpm install` fails. Workaround:

```powershell
pnpm install --ignore-scripts
```

This skips all pre/post install scripts but still correctly installs and links all packages. The preinstall script only removes stale `package-lock.json`/`yarn.lock` files — safe to skip on Windows.

**Superseded in part, 19 Sep 2026.** `--ignore-scripts` was only ever needed
because the root `preinstall` guard was `sh -c '...'`, which PowerShell cannot
run. It is a Node script now (`scripts/bin/preinstall-guard.mjs`), so plain
`pnpm install` works on Windows. Confirmed by an `eas update` published from
Windows that day with no `--ignore-scripts` anywhere.

**How to apply:** the part that still holds is `babel-preset-expo` being a
direct `devDependency`. That is what local bundling needs, and it is
independent of how the install was run.
