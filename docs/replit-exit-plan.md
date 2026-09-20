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

**Done — 13 Sep 2026.** The app runs on our own Clerk production instance
(`ins_3JFZzAp82jo7IrbO7T7IvJkYDJj`, Frontend API `clerk.pregnancy-assistant.com`)
with our own Google and Apple credentials and no proxy. Password, Google and
Apple sign-in were each verified on device.

The survey below is what we believed going in. Two of its load-bearing claims
were wrong, and correcting them mid-cutover cost a day and a live outage —
read the corrections before trusting anything else in this section.

**A production instance did exist.** Replit's own auth product — Publishing →
**Users & Auth** — provisions a Clerk instance per App, and `ins_3EYw…` was it,
holding the real users with logins as recent as twelve days before the cutover.
It does not appear in the Clerk dashboard's instance switcher, which is why this
plan concluded there was none. Bryan twice said a production account already
existed and was twice talked out of it.

**The shipped app authenticated against that production instance**, not
Development. The `pk_test_` key in the table below was real, but the proxy
routed the Frontend API through the API server, which held `sk_live_`. The
instance was decided by the proxy target and the secret key, never by the
publishable key — which is also why swapping publishable keys alone changed
nothing for hours.

**The live app runs on Clerk's Development instance.** Checked 12 Sep 2026:

| Where             | Variable                            | Value       |
| ----------------- | ----------------------------------- | ----------- |
| EAS, production   | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` |
| Replit deployment | `VITE_CLERK_PUBLISHABLE_KEY`        | `pk_test_…` |
| Replit deployment | `CLERK_SECRET_KEY`                  | `sk_test_…` |

**Superseded.** This paragraph used to read "There is no Production
instance", on the evidence that the Clerk dashboard showed only Development. The
dashboard does not list instances Replit provisions through Users & Auth, so the
absence proved nothing. `ins_3EYw…` existed the whole time and held the users.

The lesson is narrower than "check harder": an instance switcher is a list of
instances **someone chose to attach to this Clerk account**, not a list of every
Clerk instance serving this app. The authoritative check is the `kid` in a
session token, or `GET https://api.clerk.com/v1/instance` with whichever secret
key the server actually loaded.

Two things follow, and they are the opposite of what this plan said before.

**The MFA requirement is already off**, checked 12 Sep 2026 in the Development
instance the app uses — and its dashboard turns out to be reachable after all.
The two rejections it caused were resolved before the 11 Sep approval. It is
not an outstanding blocker, and nothing in this migration is needed to fix it.

**Running production on a development instance is its own problem.** Clerk's
development instances carry lower rate limits and are not intended to serve real
users; check the current limits against the user count before assuming there is
time. This is a reason to move, independent of leaving Replit.

`checkClerkManagementStatus()` returning `dashboardAccess: requires_personal_pro`
gates the dashboard, not the instances
(`.agents/memory/clerk-dashboard-access-gating.md`). Owning the account removes
that gate — and gives somewhere to move that is not a development instance.

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

   **Already off on the current instance** (checked 12 Sep 2026, in the
   Development instance the shipped app uses). The two rejections it caused are
   history — the app was approved on 11 Sep. Nothing to do there; this step is
   about the new instances, where the requirement must not be switched on.

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

### The shipped app is pinned to the current Clerk instance

`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CLERK_PROXY_URL` are
inlined into the JS bundle when it is exported, not read at runtime. Verified
12 Sep 2026 with `eas env:list --environment production`:

```
EXPO_PUBLIC_CLERK_PROXY_URL=https://pregnancy-calc--brkurtz.replit.app/api/__clerk
```

So 1.0.12 on the App Store reaches Clerk through that proxy path, with the
Replit-managed instance's key. **Switching keys in EAS changes nothing already
installed**, and deleting the proxy while those installs are live strands them
at the sign-in screen.

**The way out is OTA, not an App Store release.** `expo-updates` is configured
(`runtimeVersion: "1.0.12"`, `checkAutomatically: ON_LOAD`, channel
`production`), and both changes — the new publishable key and dropping
`proxyUrl` — are JS-only, so a published update carries them to existing
installs. Two caveats: `fallbackToCacheTimeout: 0` means a device downloads the
update on one launch and applies it on the next, so adoption lags by a launch;
and the update only reaches binaries whose runtime version matches, so confirm
`runtimeVersion` still matches the shipped build before publishing.

That makes the order:

1. New Clerk instance live on its own domain (steps 1-5 above).
2. Clear the stale variable, then publish an OTA update carrying the new key
   and no `proxyUrl`:

   ```
   cd artifacts/pregnancy-calculator-mobile
   pnpm exec eas env:delete production --variable-name EXPO_PUBLIC_CLERK_PROXY_URL
   pnpm exec eas update --branch production --environment production -m "..."
   ```

   **`--branch production` is not optional.** Without it the branch defaults to
   the current git branch, and the update lands on an EAS branch no channel
   points at — published, invisible, reaching nobody. The `production` channel
   serves the branch literally named `production` (verified 12 Sep 2026 with
   `eas channel:view production`). Clear the variable before publishing, since
   `--environment` resolves EAS variables at export time.

   Verify sign-in on a device that took the update.

3. Watch adoption in the Expo dashboard.
4. Only then merge the proxy deletion and retire the old instance. Clear
   `EXPO_PUBLIC_CLERK_PROXY_URL` from the EAS environment at the same time —
   removing the code that reads it leaves the variable behind.

Devices that never relaunch keep the old bundle indefinitely. Decide what
adoption number is good enough before starting, rather than after.

### Four traps, every one of which recurs in Phase 2

Each of these cost more than an hour on 13 Sep. None is Clerk's fault and none
is specific to auth — they are properties of how Replit hosts an app, so expect
all four again when the API server moves.

**1. Replit Auth injects its own `CLERK_SECRET_KEY`.** If Users & Auth is
enabled, Replit writes that variable into the deployed process, and its value
wins over the one set in the deployment's secrets. The server verified tokens
against Replit's instance no matter what we configured, answering
`jwk-kid-mismatch` to tokens that were perfectly valid.

The fix was to stop using the contested name: `app.ts` now reads
`PREGNANCY_CLERK_SECRET_KEY` / `PREGNANCY_CLERK_PUBLISHABLE_KEY` (see
`api-server/src/lib/clerk-env.ts`) and passes both to `clerkMiddleware`
explicitly. A bare `clerkMiddleware()` re-reads the environment and picks the
injected value straight back up, so the explicit pass matters as much as the
rename. The `CLERK_*` names remain as a fallback for local development and CI,
where nothing injects.

**2. There are two secrets panes and they are not the same store.** Tools →
Secrets is the workspace. Publishing → Adjust settings → **Production app
secrets** is what the deployment reads. They held different values for
`CLERK_SECRET_KEY` for most of a day — the workspace one correct, the
deployment one Replit's. Editing the wrong pane changes nothing and looks
exactly like a change that failed to take effect.

**3. `publishableKeyFromHost()` cannot work once the proxy is gone.** It was
sound only while the Frontend API was proxied through this server's own domain,
so the request host and the Clerk host were one name. Afterwards neither of its
branches can name the right instance: a `pk_test_` fallback is returned
verbatim, and any other fallback is discarded in favour of `clerk.<request
host>`. Pinned by `api-server/tests/clerk-publishable-key-source.test.ts`.

**4. The deployment's log collector drops a process's first lines.** The
boot-time `Clerk instance` line was emitted by three consecutive deployments and
captured from none of them, while `requireAuth` lines from the same builds came
through — which briefly convinced us the deploy was stale and cost two
republishes. Diagnostics that only exist at startup are not reliably readable
here. `requireAuth` therefore repeats the key sources on every rejection, which
is where they were finally read.

### Diagnostics worth keeping

Both were added during this cutover and both earn their place after the move:

- **Boot:** `Clerk instance` logs the resolved Frontend API, each key's instance
  type, and which variable supplied it.
- **On rejection:** `requireAuth rejected the request` logs Clerk's own
  `x-clerk-auth-reason` and `-message` alongside the key sources. Clerk explains
  its refusals in response headers that `clerkMiddleware` has already attached;
  discarding them is what made a misconfigured instance look like a client bug
  for six hours.

### User migration

**Not done, deliberately — 13 Sep 2026.** The 20 users in `ins_3EYw…` were
left behind after checking what they were:

```sql
SELECT count(*) FILTER (WHERE has_pass), count(*) FILTER (WHERE stripe_customer_id IS NOT NULL) FROM users;
```

20 users, 16 with a pass, 2 with a Stripe customer — and the two Stripe rows
were `brkurtz@msn.com` and `appreview@pregnancy-assistant.com`, both Bryan's own
test purchases. The remaining pass-holders were his second address, the orphan
row, ten `reviewer+<hash>@…` accounts the health check creates, and two `demo:`
session subjects. No outside user, so nothing to carry across.

**Run that query before assuming the same next time.** It is the check that
turned "probably just testers" into a decision rather than a hope, and with a
different answer the right move would have been to roll back the OTA rather than
press on.

**Outstanding:** the demo user row still carries the old instance's id
(`user_3FNurP19…`), and `reviewer-check.ts` looks it up by that id — so the App
Review demo account has no pass on the new instance. Repoint it before the next
submission.

`users.id` is the Clerk user id, so a new instance orphans existing rows. If
there is ever a migration worth doing:

1. Export from the old instance — `CLERK_SECRET_KEY` works against
   `GET https://api.clerk.com/v1/users` even without a dashboard. Capture id,
   email, creation date.

   **The workspace key is the right one.** It reaches the Development
   instance, which is the only instance there is, and where the real users
   are — the deployment runs on `sk_test_` too. Confirm the count against
   Clerk's own Users page, not the `users` table: the production and
   development databases are separate, but both sets of people are Clerk users
   in the same instance, and that is what counts against its limits.

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
- **RevenueCat is the billing path that actually carries money.** Checked on
  19 Sep 2026: Stripe has no live payments, only Bryan's own test charges, and
  the Replit Stripe connection is still on a sandbox. Every real purchase is an
  App Store one, and it reaches the server through
  `/billing/revenuecat/reconcile` — a pull, not a webhook. That endpoint calls
  RevenueCat with `REVENUECAT_SECRET_API_KEY`, falling back to the Replit
  connector while unset. Off Replit the connector does not exist, so an unset
  key means every App Store purchase returns 503 and grants nothing, while
  Apple has already taken the money.

  Set `REVENUECAT_SECRET_API_KEY` (a v2 secret key, Project settings → API
  keys) before the API serves a single request off Replit. The key needs
  **Customer information: read** as well as Project configuration: reconcile
  reads the customer's active entitlements, and a key without that scope passes
  every other check and still 503s on every purchase.

  `REVENUECAT_PROJECT_ID` has to travel too, and it is the easier one to lose:
  it is not a secret, so it is not in the secret manager — it sits in `.replit`
  under `[userenv]` as `proj9120626a`. Reconcile checks it before it
  authenticates, so without it a perfect key grants nothing. The boot check in
  `billing-env.ts` now fails on it.

  Verify both with the credential actually set, from any machine:

  ```
  pnpm --filter @workspace/scripts run check-revenuecat
  ```

  It makes the same calls the server makes — including
  `listCustomerActiveEntitlements`, the one the revenue path depends on — and
  exits non-zero with the HTTP status when a scope is missing.

- **Stripe webhook — not urgent, but do not leave it half-done.** With no live
  Stripe payments, breaking this breaks nothing today; it was listed as the
  critical billing risk before anyone checked whether Stripe was live. It still
  has to work before web payments are switched on. Create the endpoint in the
  Stripe dashboard against the new API host, put its `whsec_…` secret in
  `STRIPE_WEBHOOK_SECRET`, and confirm with `stripe trigger` that a payment
  flips a user's pass.

  The trap worth knowing: when `STRIPE_WEBHOOK_SECRET` is unset,
  `stripe-replit-sync` reads the signing secret from the
  `stripe._managed_webhooks` table instead. That is why the webhook works today
  with the variable unset — and why it will stop on any database that does not
  carry that row, which includes every database the migration creates, since
  `--schema=public` excludes it deliberately. Signature verification throws
  rather than skipping, so the failure is rejected webhooks, never forged ones.

- **The AI credentials are Replit's, and this plan had missed them.** The AI
  assistant (`/api/ai`) and the scribe (`/api/scribe`) reach Anthropic and
  OpenAI through `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`,
  `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL` and
  `AI_INTEGRATIONS_OPENAI_API_KEY`, all four injected by Replit. Off Replit
  both features throw on first use; the rest of the API is unaffected and the
  server still boots, so this fails quietly rather than loudly.

  No code change is needed — those libraries hand the values straight to the
  official `@anthropic-ai/sdk` and `openai` clients, so direct API keys work.
  What it decides is who pays for the AI usage: today it is billed through the
  Replit account, and afterwards it is billed by Anthropic and OpenAI directly.
  There is no arrangement that keeps Replit's billing while the server runs
  elsewhere. Settle this before `EXPO_PUBLIC_DOMAIN` is repointed, or the app
  ships with two dead features.

  `pnpm --filter @workspace/scripts run check-ai-keys` verifies both
  credentials by making the calls the server makes, so a wrong account, an
  empty balance or an unavailable model is found before a user finds it. The
  setup steps are in `docs/railway-deploy.md`.

- **Deploying the API to Railway** has its own runbook:
  `docs/railway-deploy.md`, and pointing users at it has another,
  `docs/cutover.md` — including the one question that has to be answered
  first: what serves the web app once Replit is gone. `railway.json` in the repository root already
  carries the build command, start command and `/api/healthz` health check, so
  the service needs no build configuration in the Railway UI — only variables.

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
- Disconnect the two Cloudflare Pages projects (`pregnancy-calculator`,
  `brk-services`) from this repository — `docs/cutover.md` step 8. Neither
  deploys anything from here; both post a failing check on every pull request.
  Verified 20 Sep 2026 that the apex is served by Railway through Cloudflare's
  proxy, not by Pages, so `pregnancy-calculator` can be deleted rather than
  just disconnected. Leave `brk-services` itself alone — disconnect only.

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
