---
name: @babel/generator pnpm isolation fix
description: react-native-worklets@0.5.1 requires @babel/generator at runtime without declaring it; pnpm strict isolation hides it — fix is a root workspace devDep.
---

# @babel/generator must be a root workspace devDep

## The rule
When the mobile build breaks with `Cannot find module '@babel/generator'` from inside
`react-native-worklets/plugin/index.js`, the fix is:

```bash
pnpm add -w --save-dev @babel/generator@7
```

This creates a hoisted `node_modules/@babel/generator` symlink accessible workspace-wide.
**Use `@babel/generator@7` (not the default `@babel/generator` which resolves to v8).**

## Why
`react-native-worklets@0.5.1` bundles its Babel plugin into a single `plugin/index.js`
that calls `require('@babel/generator')` at runtime (line 787) without declaring
`@babel/generator` as a dependency. pnpm's strict isolation means the package is only
accessible if it's in the package's own declared dependency tree. It is not — so Metro
throws HTTP 500 on every bundle request.

This breaks silently when `@babel/core` is upgraded (the module layout changed between
7.25.x and 7.29.x), but the root cause is the undeclared dep, not the Babel version.

## How to apply
- Any time the mobile Metro build fails with `Cannot find module '@babel/generator'`
- After any pnpm/Babel upgrade that changes the virtual store layout
- The version should match `@babel/core`'s own `@babel/generator` dep (both are `7.29.x`)

## What NOT to do
- Do NOT use `public-hoist-pattern[]=@babel/generator` in `.npmrc` — it requires a full
  modules rebuild (`pnpm install --force`) which fails non-interactively in the Replit
  environment (exits with -1, no output).
- Do NOT add `"@babel/core": "<version>"` as a global override solely to fix this — the
  Babel version isn't the root cause, and a global override breaks the mobile build.
- When `pnpm add -w @babel/generator` resolves `^8.0.0`, npm has released Babel 8 — you
  need `@babel/generator@7` explicitly.
