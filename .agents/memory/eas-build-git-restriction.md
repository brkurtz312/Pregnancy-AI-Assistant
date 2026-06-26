---
name: EAS build git restriction in main agent
description: EAS CLI cannot run in the main agent bash tool — Replit blocks all .git/ writes at the filesystem level.
---

The EAS CLI packages source code using git (creates `.git/index.lock` during archive). Replit's sandbox intercepts any write to `.git/` and blocks it with "Destructive git operations are not allowed in the main agent."

**Why:** Replit monitors filesystem writes to `.git/` to prevent data corruption in the shared git index. Even `rm .git/index.lock` is blocked.

**How to apply:** Never try to run `eas build` from the main agent's bash tool or from a project task running in the same environment. Instead, tell the user to run it manually from the Replit Shell tab:
```
cd artifacts/pregnancy-calculator-mobile
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform ios --profile production --non-interactive
```
