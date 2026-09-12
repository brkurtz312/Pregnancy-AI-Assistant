# Replit Exit Plan

Decided 12 Sep 2026, after App Store approval. Scope: **everything** — Clerk,
hosting, database. User base is effectively zero (Bryan + testers), which is
what makes an all-at-once move reasonable rather than reckless.

---

## Phase 0 — Survey (do this first)

Two Replit couplings are deeper than hosting and have not been assessed. Find
out what they actually do before planning around them:

```
@replit/connectors-sdk     # root dependency — Stripe connector credentials
@replit/revenuecat-sdk     # root dependency — RevenueCat integration
@replit/vite-plugin-*      # cartographer, dev-banner, runtime-error-modal
```

`.agents/memory/stripe-connector-fields.md` says connection settings use
`secret`/`publishable` rather than `secret_key`/`webhook_secret`. That reads
like Replit brokering the Stripe credentials. If so, leaving Replit means
wiring Stripe directly — a real work item, not a dependency swap.

Same question for `@replit/revenuecat-sdk`. `revenuecat-asc-sync.md` notes a
generic "Failed to sync products" error came from "the Replit→Apple layer",
which suggests Replit sits in the purchase path too.

**Answer this before committing to a timeline.** Everything below assumes these
are thin wrappers; if they aren't, they become their own phase.

---

## Phase 1 — Clerk

`checkClerkManagementStatus()` returns `requires_personal_pro`, so there has
never been a Clerk dashboard — which is why instance-wide MFA (the cause of two
App Store rejections) was invisible and unfixable. Owning the account ends that.

1. Create a Clerk account and application. Free tier covers this app easily.
2. Development instance first — `pk_test_` / `sk_test_`.
3. Production instance. Requires a domain: **`pregnancy-assistant.com`**, DNS on
   Cloudflare. Clerk will ask for CNAMEs (`clerk`, `accounts`, `clkmail`, two
   DKIM records). **Set these DNS-only in Cloudflare, not proxied** — orange-cloud
   proxying breaks Clerk's certificate issuance.
4. **Turn OFF "Require multi-factor authentication"** (Configure → User &
   authentication → Multi-factor) in *both* instances.
5. Sign-in methods: email/password, Google, Apple — now with Bryan's own OAuth
   credentials. Apple needs a Services ID and key from the developer account.
   **Sign in with Apple must keep working:** it satisfies Guideline 4.8, and
   losing it while Google is present means rejection on the next release.
6. Swap keys: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (EAS env, Production),
   `VITE_CLERK_PUBLISHABLE_KEY`.
7. **Delete the proxy.** `api-server/src/middlewares/clerkProxyMiddleware.ts`,
   its mount in `app.ts`, and `EXPO_PUBLIC_CLERK_PROXY_URL` /
   `VITE_CLERK_PROXY_URL`. It exists only to make Clerk work on `.replit.app`
   domains without CNAMEs, and it is the most fragile file in the repo — it
   needs `selfHandleResponse: true` plus hand-rolled chunked-response buffering,
   and any drift silently breaks production sign-in.

### User migration

`users.id` is the Clerk user id, so a new instance orphans existing rows. Cheap
now, but do it properly rather than assuming zero:

1. Export from the old instance — `CLERK_SECRET_KEY` works against
   `GET https://api.clerk.com/v1/users` even without a dashboard. Capture id,
   email, creation date.
2. Create matching users in the new instance via the Backend API, email verified.
3. Build an old-id → new-id map and update `users.id`. Child tables cascade from
   it — check FK behaviour before running anything.
4. Password hashes do not export. Email/password users need a reset; with a
   handful of users, email them personally.

**Worth considering:** key app data on an internal user id with `clerk_user_id`
as a lookup column, instead of using the Clerk id as the primary key. Makes this
the last migration of its kind.

---

## Phase 2 — Hosting and database

- **Postgres:** Neon or Railway. `pg_dump` from Replit, restore, verify row
  counts per table before switching anything.
- **API + web:** Railway is closest to what Replit does (git-push deploys,
  managed Postgres, env vars in a UI). Render and Fly also fine.
- **Secrets:** move everything out of `.replit` `[userenv]` — the RevenueCat
  keys are currently sitting in that committed file, which is its own problem.
- Run `migrate-deletion-integrity` deliberately against the new database, with
  someone watching, after fixing the `created_at`/`requested_at` mismatch.
- **`EXPO_PUBLIC_DOMAIN` points at `pregnancy-calc--brkurtz.replit.app`.**
  Repoint at `pregnancy-assistant.com`. Needs a new build and a full device test
  — the app talks to that host for everything.

---

## Phase 3 — Cleanup

- Delete `.replit`, `.replitignore`, `replit.md`.
- Remove `@replit/*` dependencies and Replit Vite plugins (pending Phase 0).
- Replace `sync-to-github.sh` and the Replit workflows with GitHub Actions
  running typecheck, lint and tests.
- Fix `check-watch-sync.js` to skip when `ios/` is absent.
- Rewrite the README — "Getting Started" still says the project runs on Replit.
- Unset `DEMO_SESSION_SECRET` on production to close the App Review demo path.

---

## Sequencing

Auth and hosting are independent; the database is coupled to hosting. Safe order:
Clerk first (self-contained, fixes the known problem), then database, then
hosting, then cleanup — verifying between each.

All at once is possible with no users, but if something breaks you won't know
which change did it. **This project took a week rather than a day because of
problems whose causes were invisible.** Don't manufacture more.

## Verify after each phase

1. Sign up as a new user.
2. Sign in with email/password, Google, and Apple.
3. Set a due date; confirm week-by-week content loads.
4. Ask the AI a question — proves the server auth path.
5. Save in Hospital Bag, force-quit, reopen — proves writes persist.
6. Watch app pairs and syncs.
7. Purchase flow in sandbox.
