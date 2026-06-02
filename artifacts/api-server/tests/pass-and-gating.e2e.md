# E2E test: Full Pregnancy Pass purchase + free-limit gating

Revenue-critical path. These are **testing-skill** plans (Playwright + Clerk auth
override + `[DB]` steps), not a shell test runner. Re-run them with the `testing`
skill: call `runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: true })`
for each plan below.

## Why no `pnpm test` runner

The AI endpoints (`/api/ai/ask`) call Anthropic, and the purchase flow uses Stripe
Checkout + Clerk sessions. There is no in-process test harness for that. The
testing skill drives a real browser, signs in real Clerk users programmatically,
seeds the DB, and runs a real Stripe **test-mode** checkout — which is the only way
to exercise this path end to end.

## Prerequisites (must hold for the plans to pass)

- Workflows running: `artifacts/api-server: API Server` and `artifacts/pregnancy-calculator: web`.
- Anthropic configured (`AI_INTEGRATIONS_ANTHROPIC_*`). The gating 403 lives **behind**
  the `isAnthropicConfigured()` 503 check in `src/routes/ai/index.ts`, so the 403 path
  is only reachable when Anthropic is configured.
- Stripe connected and synced: a product with metadata `kind = full_pregnancy_pass`
  and an active price must exist in the synced `stripe.*` schema (`findPassPriceId`
  returns 503 otherwise). Verify:
  ```sql
  SELECT pr.id, pr.unit_amount FROM stripe.prices pr
  JOIN stripe.products p ON pr.product = p.id
  WHERE p.metadata->>'kind' = 'full_pregnancy_pass' AND p.active AND pr.active;
  ```

## Shared technical context (pass as `relevantTechnicalDocumentation`)

- Web app base path `/`; API proxied at `/api`.
- Reach the AI assistant by running a calculation first: "By LMP" tab
  (`tab-lmp`, default), set `input-lmp-date` to a date ~20 weeks before today
  (e.g. `2026-01-13`), click `button-calculate-lmp`. Results render the
  `ai-assistant-section`.
- Account bar testids: signed-out → `button-sign-in` / `button-sign-up`;
  signed-in no pass → `badge-free-remaining` + `button-unlock-pass` + Clerk
  UserButton avatar; signed-in with pass → `badge-pass-active` ("Full Pass").
- Sign out: click the Clerk UserButton avatar, then "Sign out".
- AI assistant: `input-question`, `button-send`; replies render as
  `message-assistant`. On the weekly limit the server returns
  `403 {code:"FREE_LIMIT_REACHED"}` and the UI swaps the input for
  `limit-reached-prompt` (with inline `button-unlock-pass-inline`); the optimistic
  user turn is rolled back.
- Metering: free users get 5 AI questions per ISO week; pass holders are unlimited
  (metering fully bypassed). Table `ai_usage(identifier, period_key, count, updated_at)`,
  PK `(identifier, period_key)`. Signed-in identifier is `'user:'||<clerk_user_id>`;
  `clerk_user_id` is `users.id` (joined by email). The current `period_key` equals
  Postgres `to_char((now() at time zone 'utc'), 'IYYY"-W"IW')` (e.g. `2026-W23`).
- The `users` row is created automatically once signed-in and pass status loads;
  wait for `badge-free-remaining` or `badge-pass-active` before any `[DB]` step.
- Stripe **test** card: `4242 4242 4242 4242`, exp `12/34`, CVC `123`, ZIP `10001`.

### Seed a user to the free limit (used by the plans)

```sql
INSERT INTO ai_usage (identifier, period_key, count, updated_at)
VALUES ('user:'||(SELECT id FROM users WHERE email='${email}'),
        to_char((now() at time zone 'utc'), 'IYYY"-W"IW'), 5, now())
ON CONFLICT (identifier, period_key) DO UPDATE SET count = 5, updated_at = now();
```

## Plan 1 — free user hits the weekly limit (403 FREE_LIMIT_REACHED)

1. `[New Context]`.
2. `[Clerk Auth]` Sign in as a fresh `free_<nanoid>@example.com`; note the email.
3. `[Browser]` Navigate to `/`.
4. `[Verify]` Account bar shows `badge-free-remaining` + `button-unlock-pass`
   (no `badge-pass-active`).
5. `[DB]` Seed `ai_usage` to 5 for this user (query above).
6. `[DB]` Confirm `count = 5` for `user:<id>` / current period.
7. `[Browser]` Calculate (LMP `2026-01-13`); wait for `ai-assistant-section`.
8. `[Browser]` Ask "What foods should I avoid?" via `input-question` + `button-send`.
9. `[Verify]` `limit-reached-prompt` appears with `button-unlock-pass-inline`; no
   assistant answer was produced (request blocked, not answered).

## Plan 2 — buy the pass → unlimited (bypasses metering) → persists across sign-out/in

1. `[New Context]`.
2. `[Clerk Auth]` Sign in as a fresh `buyer_<nanoid>@example.com`; note the email.
3. `[Browser]` Navigate to `/`; verify non-pass state (`button-unlock-pass`).
4. `[Browser]` Click `button-unlock-pass` ONCE. The button disables for a few
   seconds while the checkout session is created — this is **expected**. Wait up to
   ~25s for navigation to `checkout.stripe.com`; do not click again.
5. `[Browser]` Complete Stripe test checkout with the test card above.
6. `[Verify]` Redirect back to `/` (`checkout=success`), then `badge-pass-active`
   ("Full Pass") appears; `button-unlock-pass` is gone (refresh if needed).
7. `[DB]` Seed `ai_usage` to 5 for this buyer (over the free limit).
8. `[DB]` Confirm `SELECT has_pass FROM users WHERE email='<buyer>'` is `true`.
9. `[Browser]` Calculate, then ask a question.
10. `[Verify]` A `message-assistant` reply appears and **no** `limit-reached-prompt`
    — unlimited despite usage at the limit (metering bypassed).
11. `[Browser]` Sign out via the UserButton; verify `button-sign-in`.
12. `[Clerk Auth]` Sign in again as the SAME buyer email (fresh session = new device).
13. `[Browser]` Navigate to `/`; `[Verify]` `badge-pass-active` is shown again — the
    pass is tied to the Clerk account, not the device.

## Notes / gotchas

- `button-unlock-pass` is `disabled` only while `checkout.isPending`; right after the
  click it is briefly disabled before redirecting to Stripe — not a bug.
- Seeding `ai_usage` (instead of making 5 real AI calls) keeps Plan 1 fast/cheap and
  avoids paid Anthropic usage; the 403 returns before any model call.
- Tests share the dev DB; always use unique `nanoid` emails.
