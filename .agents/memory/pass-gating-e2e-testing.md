---
name: Pass purchase + AI free-limit e2e testing
description: How to e2e-test the Full Pregnancy Pass purchase and AI free-weekly-limit gating without burning paid AI calls.
---

# Testing the pass/gating revenue path

Persisted plans live in `artifacts/api-server/tests/pass-and-gating.e2e.md`. They are
**testing-skill** plans (Playwright + `testClerkAuth: true` + `[DB]` steps), not a
shell test runner — there is no in-process harness for Anthropic + Stripe + Clerk.

**Rule:** the AI free-limit 403 (`FREE_LIMIT_REACHED`) check sits **behind** the
`isAnthropicConfigured()` 503 guard in the `/ai/ask` route. So the 403 path is only
reachable when Anthropic is configured; if it is not, you get 503 and never reach gating.

**How to apply:**
- To hit the limit cheaply, seed `ai_usage` count to the limit via a `[DB]` step
  instead of making real AI calls — the 403 returns before any model call, so no paid
  Anthropic usage. The current `period_key` is `to_char((now() at time zone 'utc'),
  'IYYY"-W"IW')`, which matches `currentPeriodKey()`'s `${ISO-year}-W${ISO-week}` format.
- Signed-in metering identifier is `'user:'||users.id` (the Clerk user id); join the
  `users` row by email. The row is created lazily once signed-in and pass status loads,
  so wait for the account bar before any `[DB]` step.
- Pass holders bypass metering entirely: seed usage over the limit, then a pass holder
  still gets an answer (assert a reply + absence of `limit-reached-prompt`).
- Persistence: `has_pass` is keyed to the Clerk user id, so signing back in as the same
  email (a fresh browser context = "new device") still shows the pass.
- Stripe checkout test mode works in the testing browser (card `4242 4242 4242 4242`).
  The `button-unlock-pass` is `disabled` only while the checkout session is being
  created (`checkout.isPending`) — it briefly disables right after the click before
  redirecting to `checkout.stripe.com`. That transient disable is **not** a bug; the
  test must click once and wait ~25s for the redirect rather than re-clicking.
- Combine purchase + sign-out/sign-in into one run; running this plan in parallel with
  another browser test can exceed the code-execution 10-min cap — run plans serially.
