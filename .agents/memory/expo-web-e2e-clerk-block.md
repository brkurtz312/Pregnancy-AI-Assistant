---
name: Expo web preview e2e testing blocked by Clerk OAuth
description: runTest cannot get past Clerk sign-in on the Expo web preview build, even with testClerkAuth true; explains fallback verification strategy.
---

The `runTest` Playwright subagent, even when passed `testClerkAuth: true`, was blocked from
signing in on the Expo Router app's web preview. The blocker report cited "external OAuth
(Google sign-in) in a bot-detection-restricted environment" — the Clerk widget rendered on
Expo's web build routes through a flow the tester can't complete headlessly, and no
credentials were available for the password fallback either.

**Why:** Expo web preview renders the same Clerk components as native, but the web OAuth
redirect path triggers bot detection that blocks the automated browser before it reaches any
authenticated route (e.g. a tab screen gated by a root layout redirect to `/sign-in`).

**How to apply:** For mobile (Expo) apps gated behind Clerk auth, don't rely on `runTest` to
reach authenticated screens through the web preview. Instead:
- Verify with `tsc --noEmit` (typecheck) and unit tests (Jest) for the changed screens/logic.
- Use the `screenshot` tool (non-interactive) only for public/unauthenticated screens (e.g.
  sign-in, landing).
- If deeper interactive verification is required, ask the user to check the feature themselves
  in Expo Go / the simulator, since the agent cannot type into or submit auth forms via the
  screenshot tool and `runTest` cannot get past Clerk on Expo web.
