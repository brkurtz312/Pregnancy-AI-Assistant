---
name: GitHub sync token requirements
description: Why pushes to the GitHub mirror get rejected and what the token needs
---
The post-merge GitHub sync pushes main via `GITHUB_TOKEN` secret (scripts/sync-to-github.sh).

**Rule:** the token must be a classic PAT with BOTH `repo` and `workflow` scopes — the repo contains `.github/workflows/*.yml`, and GitHub rejects any push touching workflow files from a token lacking `workflow` scope. The rejection message is generic ("PUSH_REJECTED") through wrapper tooling; push with git CLI directly (masking the token) to see the real reason.

**Why:** Aug 2026 — sync failed for a long stretch (expired token), and the replacement token was rejected until `workflow` scope was added. Not branch protection (free private repo can't have it).

**How to apply:** never embed the token in the `origin` remote URL (it was found hardcoded there once — remove it; origin should be the clean https URL). If sync fails again: test token with `curl api.github.com/repos/...`, then push manually via the script's URL pattern.
