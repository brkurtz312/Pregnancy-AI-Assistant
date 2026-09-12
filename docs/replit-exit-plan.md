# Replit Exit Plan

Decided 12 Sep 2026, after App Store approval. Scope: **everything** — Clerk,
hosting, database. User base is effectively zero (Bryan + testers), which is
what makes an all-at-once move reasonable rather than reckless.

---

## Phase 0 — Survey (answered 12 Sep 2026)

Surveyed the couplings below. **Two of the three named here are thinner than
feared; a dependency this plan never listed is the one that needs real care.**

### `@replit/connectors-sdk` — dead, delete it

Zero references anywhere in the codebase. The connector API is called by
hand-rolled `fetch` in the client files below, never through this SDK. It is a
root dependency that does nothing. Remove it whenever convenient — nothing
depends on the timing.

### `@replit/revenuecat-sdk` — a thin wrapper, as hoped

`createClient` is pointed at an explicit RevenueCat base URL
(`https://api.revenuecat.com/v2`), and the named helpers (`listProjects`,
`listProducts`, `listEntitlements`, `attachProductsToPackage`, …) are typed
calls against RevenueCat's public REST v2 API. **Replit is not in the request
path.** The package is ordinary npm code and keeps working off Replit.

The only coupling is authentication: `getAccessToken()` fetches an OAuth token
from `REPLIT_CONNECTORS_HOSTNAME`. It lives in two near-identical ~80-line
files —

- `artifacts/api-server/src/lib/revenueCatClient.ts`
- `scripts/src/revenueCatClient.ts`

— and is replaced by a RevenueCat v2 secret key read from the environment. An
afternoon, not a phase.

### Purchases were never on Replit

`pregnancy-calculator-mobile/lib/revenuecat.tsx` configures
`react-native-purchases` directly with `REVENUECAT_IOS_API_KEY` /
`REVENUECAT_ANDROID_API_KEY` and calls `Purchases.purchasePackage` against
RevenueCat. **Nothing in the runtime purchase path touches Replit**, so leaving
cannot break buying, restoring, or entitlements on a device.

The "Failed to sync products" error in `revenuecat-asc-sync.md` came from
Replit's Publishing pane → Manage in-app purchases → Sync to App Store Connect,
a Replit UI convenience that pushes RevenueCat products into App Store Connect.
Leaving loses that button; in-app purchase metadata gets managed in ASC
directly instead. It was already failing, so this costs nothing.

### Stripe — same shape as RevenueCat

Credentials are brokered by the same connector API (`settings.secret`),
isolated to two files:

- `artifacts/api-server/src/lib/stripeClient.ts`
- `scripts/src/stripeClient.ts`

Replaced by `STRIPE_SECRET_KEY` in the environment. The webhook secret is a
different story — see below.

### `stripe-replit-sync` — the real work item

This plan did not list it. It is a Replit-authored npm package that **owns a
Postgres schema**: `runMigrations` in
`artifacts/api-server/src/lib/stripe-init.ts` creates the `stripe.*` tables,
`processWebhook` writes rows into them, and `lib/db/src/schema/users.ts`
explicitly defers that schema to it. It sits in the webhook → entitlement path
that decides whether a user has paid.

Two consequences:

1. **The webhook signing secret is Replit's, not yours.** Per
   `.agents/memory/stripe-connector-fields.md`, there is no `webhook_secret` on
   the connection — `findOrCreateManagedWebhook` provisions the endpoint and
   stores its own signing secret, which is why passing `webhookSecret: ""`
   works today. Leaving Replit means creating the webhook endpoint yourself in
   the Stripe dashboard, pointed at the new API host, and putting its
   `whsec_…` value in `STRIPE_WEBHOOK_SECRET`. **Until that is done no payment
   events arrive and nobody's pass activates.** Verify with the Stripe CLI
   before real traffic moves.
2. **A Replit-authored package owns the billing tables.** It is ordinary npm
   code, so it should keep running anywhere — the risk is maintenance and
   lock-in, not breakage. Keep it, or replace it with a hand-written webhook
   handler and Drizzle schema. Decide that deliberately, on its own, not in the
   middle of the hosting move.

### What this means for the timeline

The dependency swaps are four small files and an `npm remove`; they are not a
phase of their own and can ride along with Phase 3. The item that deserves care
is the **Stripe webhook**, and it belongs with Phase 2, because the endpoint URL
depends on where the API server ends up living.

---

## Phase 1 — Clerk

`checkClerkManagementStatus()` returns `dashboardAccess: requires_personal_pro`.
That gates the **dashboard**, not the instances. Per
`.agents/memory/clerk-dashboard-access-gating.md`, Replit creates a full
Production Clerk instance the moment an app is published — own keys, own user
store — and this app is published. It exists and is serving the live app right
now; it was only ever invisible, confirmed independently by production database
rows that differ from development's.

That distinction decides how Phase 1 goes. Instance-wide MFA — the cause of two
App Store rejections — is set on that Production instance and was unfixable
because the dashboard would not show it, not because no instance existed. And
the users to migrate live there, not in development. Owning the account is what
makes both reachable.

1. Create a Clerk account and application. Free tier covers this app easily.
2. Development instance first — `pk_test_` / `sk_test_`.
3. Production instance. Requires a domain: **`pregnancy-assistant.com`**, DNS on
   Cloudflare. Clerk will ask for CNAMEs (`clerk`, `accounts`, `clkmail`, two
   DKIM records). **Set these DNS-only in Cloudflare, not proxied** — orange-cloud
   proxying breaks Clerk's certificate issuance.
4. **Turn OFF "Require multi-factor authentication"** (Configure → User &
   authentication → Multi-factor) in _both_ instances. It is instance-wide: it
   forces an `email_code` second factor on every password sign-in, including
   accounts with `two_factor_enabled: false`. That is what no reviewer can get
   past, and no app-side change can work around it.
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

   **Use the Production instance's key, not the workspace's.** Per
   `.agents/memory/clerk-mfa-blocks-app-review.md`, the `CLERK_SECRET_KEY` in
   the Replit workspace reaches the Development instance only — a separate user
   store. Exporting with it migrates test accounts and silently leaves every
   real user behind. The production key lives in the deployment's environment.

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
  The credential plumbing already reads three of these, so setting them is the
  whole cutover: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `REVENUECAT_SECRET_API_KEY` (a v2 secret key from RevenueCat's dashboard,
  Project settings → API keys). Each falls back to the Replit connector while
  unset, so they can be set and verified one at a time.
- **Stripe webhook — the one thing that can silently break billing.** Replit's
  managed webhook goes away with Replit. Create the endpoint in the Stripe
  dashboard against the new API host, put its `whsec_…` secret in
  `STRIPE_WEBHOOK_SECRET`, and confirm with `stripe trigger` that a payment
  actually flips a user's pass. See Phase 0 for why this is not a config swap.
- Run `migrate-deletion-integrity` deliberately against the new database, with
  someone watching, after fixing the `created_at`/`requested_at` mismatch.
- **`EXPO_PUBLIC_DOMAIN` points at `pregnancy-calc--brkurtz.replit.app`.**
  Repoint at `pregnancy-assistant.com`. Needs a new build and a full device test
  — the app talks to that host for everything.

---

## Phase 3 — Cleanup

- Delete `.replit`, `.replitignore`, `replit.md`.
- Remove the remaining `@replit/*` dependencies and the Replit Vite plugins.
  `@replit/connectors-sdk` is already gone (it was unused). The Vite plugins
  are dev-only and gated behind `REPL_ID`; `@replit/revenuecat-sdk` is a plain
  REST wrapper that can stay or go on its own schedule.
- Delete the connector fallbacks in `artifacts/api-server/src/lib/`
  {`stripeClient.ts`, `revenueCatClient.ts`} and their two twins under
  `scripts/src/`, once the environment variables above are set everywhere.
  `artifacts/api-server/tests/connector-credentials.test.ts` shrinks with them.
- Decide separately what to do about `stripe-replit-sync`, which owns the
  `stripe.*` tables. Not cleanup — see Phase 0.
- Replace `sync-to-github.sh` and the Replit workflows. The GitHub Actions
  half is done: `.github/workflows/ci.yml` runs lint, format, typecheck and
  tests on every pull request and every push to `main`, covering every package
  including the mobile app, and builds the web apps and API server.
  `sync-to-github.sh` still needs to go.
- ~~Fix `check-watch-sync.js` to skip when `ios/` is absent.~~ Done — it
  skips when `ios/` is absent and still catches drift when it is there.
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
