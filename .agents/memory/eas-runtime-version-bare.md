---
name: EAS runtimeVersion bare workflow
description: runtimeVersion policy:"appVersion" rejected by EAS when an ios/ dir is detected (bare workflow mode); must be a static string.
---

## Rule
`runtimeVersion` in `app.json` must be a **static string** (e.g. `"1.0.11"`), never `{"policy": "appVersion"}`.

**Why:** When EAS detects an `ios/` directory (or any other bare-workflow signal in the Replit build environment), it switches to bare workflow mode. In bare workflow, the `appVersion` policy is unsupported and the build fails with: *"You're currently using the bare workflow, where runtime version policies are not supported."*

**How to apply:** Every time `version` is bumped in `app.json`, update `runtimeVersion` to the same value. Keep them in sync manually. Previous workaround was running EAS CLI from PowerShell locally — that is no longer needed with the static string fix.
