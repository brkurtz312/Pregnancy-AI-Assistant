---
name: EAS prebuildCommand cannot run bash
description: eas.json prebuildCommand is an expo CLI subcommand, not a shell command; use lifecycle npm hooks for custom validation
---

`eas.json` `prebuildCommand` replaces only the *arguments* to `expo` — EAS runs `pnpm expo <prebuildCommand> --platform <p>`. Setting it to `bash scripts/foo.sh` produces `expo bash ... --platform ios` → "unknown or unexpected option: --platform" and every build fails in the Prebuild phase (locally-triggered and GitHub-triggered alike).

**Why:** a task merge once added a validation wrapper script this way and silently broke all iOS builds.

**How to apply:** put custom validation in package.json lifecycle hooks (`eas-build-pre-install` / `eas-build-post-install`, e.g. `node scripts/validate-*.js`) and leave `prebuildCommand` unset unless passing real `expo prebuild` flags. Build logs are gzip-compressed JSON lines — `curl` the `logFiles` URL and `zcat`, then filter by `phase`.
