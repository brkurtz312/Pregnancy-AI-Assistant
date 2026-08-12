---
name: Mobile jest suite flaky under load
description: Full pregnancy-calculator-mobile jest runs time out on random unrelated suites; how to distinguish real failures from load flakiness.
---
Full-suite `jest --forceExit --maxWorkers=2` runs in validation intermittently fail with "Exceeded timeout" on a *different* suite each run (e.g. syncColdReinstall, watchKickSync, googleSSOFlow, scribeLimitReached).

**Why:** suites are slow under parallel load; 5–60s per-test timeouts get exceeded even though the tests are correct.

**How to apply:** when validation fails on `pnpm run test`, first run the failing suites in isolation. If they pass alone and your own suite passes in every run, the failure is load flakiness, not a regression. Also: `pnpm run typecheck` for mobile runs `check-watch-sync.js` first — if ios/ Swift copies drift from canonical `watchapp/`, run `node scripts/check-watch-sync.js --fix` (and `sync-watch-test-target.js` if test suites were added).
