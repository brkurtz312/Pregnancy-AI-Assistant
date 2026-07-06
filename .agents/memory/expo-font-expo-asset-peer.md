---
name: expo-font undeclared expo-asset peer
description: jest fails to resolve expo-asset when required by expo-font under pnpm strict isolation
---

`expo-font`'s `FontLoader.ts` does `import { Asset } from 'expo-asset'` unconditionally, but its
`package.json` does not declare `expo-asset` as a dependency or peer dependency. Under pnpm's
default strict (non-hoisted) `node_modules` layout, this only becomes a problem once something in
the workspace adds `expo-asset` as its own direct dependency — the resulting node_modules graph has
no path for `expo-font` to resolve it, and jest (which follows real symlink paths strictly) throws
`Cannot find module 'expo-asset'` from deep inside `expo-font/build/FontLoader.js`, breaking any
test that transitively imports `@expo/vector-icons` (which pulls in `expo-font`).

**Why:** pnpm never symlinks a package's dependency into a third package's isolated `node_modules`
slot unless that third package's own `package.json` declares it. `expo-font` never declares
`expo-asset`, so no amount of installing `expo-asset` elsewhere in the workspace fixes this — you
have to tell pnpm to treat `expo-font` as if it declared the dependency.

**How to apply:** add a `packageExtensions` entry to the root `pnpm-workspace.yaml`:

```yaml
packageExtensions:
  expo-font:
    dependencies:
      expo-asset: "*"
```

Then re-run `pnpm install` and re-run the jest suite. Do not try to fix this by pinning/removing
`expo-asset` from the app's own `package.json` — that dependency is legitimately needed by whatever
app code imports it (e.g. `Asset.fromModule`) and is unrelated to the underlying `expo-font` bug.
