# Deploying the API to Railway

The database already lives on Railway (see `docs/db-migration.md`). This moves
the API server to sit beside it, which is the step that makes Replit stop being
production.

Read **"The one thing that is not ready"** before starting. Everything else
here works today.

---

## The one thing that is not ready

Two of the app's features — the AI assistant (`/api/ai`) and the scribe
(`/api/scribe`) — call Anthropic and OpenAI through **credentials Replit
provisions**:

```
AI_INTEGRATIONS_ANTHROPIC_BASE_URL   AI_INTEGRATIONS_ANTHROPIC_API_KEY
AI_INTEGRATIONS_OPENAI_BASE_URL      AI_INTEGRATIONS_OPENAI_API_KEY
```

Replit injects all four. Off Replit none of them exist, and both features throw
on first use — the rest of the API is unaffected, and the server still boots.
This was not in the exit plan; it was found while preparing this deploy.

The code has no Replit dependency in it. `lib/integrations-anthropic-ai` and
`lib/integrations-openai-ai-server` construct the official `@anthropic-ai/sdk`
and `openai` clients with whatever `baseURL` and `apiKey` they are handed, so
direct keys work with no code change:

| Variable                             | Value with your own account    |
| ------------------------------------ | ------------------------------ |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | `https://api.anthropic.com`    |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY`  | key from console.anthropic.com |
| `AI_INTEGRATIONS_OPENAI_BASE_URL`    | `https://api.openai.com/v1`    |
| `AI_INTEGRATIONS_OPENAI_API_KEY`     | key from platform.openai.com   |

What this actually decides is **who bills the AI usage**. On Replit it goes
through the Replit account; with direct keys it goes to Anthropic and OpenAI.
There is no way to keep Replit's billing while running the server elsewhere.

You can deploy without these and leave the AI features broken on the Railway
host while Replit still serves production — but they must be set before
`EXPO_PUBLIC_DOMAIN` is repointed at the new host, or the app ships with two
dead features.

---

## What is already in the repository

`railway.json` at the root, which Railway reads on every deploy:

- **Build:** `pnpm --filter @workspace/api-server run build` — esbuild bundles
  `src/index.ts` and every workspace package it imports into
  `artifacts/api-server/dist/index.mjs`. No separate library build step is
  needed; the workspace packages export TypeScript source directly.
- **Start:** `pnpm --filter @workspace/api-server run start`
- **Health check:** `/api/healthz`
- **Restart:** on failure, up to 10 times

Node 24 is pinned by `engines.node` in the root `package.json`, matching CI.
Deliberately not `.nvmrc`: Cloudflare Pages reads that file too, and the two
Pages projects in this repository build from the same root. A version pin meant
for Railway should not quietly change what Cloudflare builds with.

---

## Steps

### 1. Add a service to the existing Railway project

Use the project that already holds the Postgres database — the API needs to
reach it over Railway's private network, which only works inside one project.

**New** → **GitHub Repo** → `brkurtz312/Pregnancy-AI-Assistant` → branch
`main`.

Railway reads `railway.json`, so leave the build and start commands in the UI
empty. If it has already guessed some, clear them.

### 2. Set the variables

In the new service's **Variables** tab.

**Four to type exactly as written.** The first is a reference, not a literal —
the braces are part of it, and Railway resolves it to the database's private
URL:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
PORT=8080
NODE_ENV=production
REVENUECAT_PROJECT_ID=proj9120626a
```

If the Postgres service in your project is named something other than
`Postgres`, use that name inside the braces instead.

**Three whose values you paste in from elsewhere.** Add each as its own
variable, with the real value — nothing in this document is the value itself:

| Variable                          | Where the value comes from                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `PREGNANCY_CLERK_PUBLISHABLE_KEY` | Clerk dashboard, production instance — the `pk_live_…` for `clerk.pregnancy-assistant.com` |
| `PREGNANCY_CLERK_SECRET_KEY`      | Clerk dashboard, same instance — the matching `sk_live_…`                                  |
| `REVENUECAT_SECRET_API_KEY`       | the `sk_…` v2 secret key already verified by `check-revenuecat`                            |

Both Clerk keys must come from the **same** instance. A mismatched pair is the
failure that cost a day earlier in this project.

`REVENUECAT_PROJECT_ID` is not a secret and is not in any secret store — it is
in `.replit` under `[userenv]`. It is the one that gets left behind.

**Not needed:** `REVIEWER_DEMO_USER_ID`, `ALERT_SLACK_WEBHOOK_URL`,
`ALERT_RESEND_API_KEY`, `ALERT_EMAIL`, `ALERT_FROM_EMAIL` and the reviewer
access code all read from the `app_config` table first, and those rows were
copied with the database. They are environment fallbacks, not the source.

**Deliberately left unset for now:** `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET`. Stripe has no live payments (see
`docs/stripe-removal-plan.md`), so web checkout stays broken on this host until
that decision is made. The boot log says so in as many words, which is correct
rather than alarming.

Also unset: `DEMO_SESSION_SECRET`, which disables the demo path entirely. It
was for App Review and the app is approved.

### 3. Deploy and read the boot log

Railway builds and starts automatically. Open **Deploy Logs** and find these
lines, in this order:

1. `"msg":"Clerk instance"` — check `frontendApi` reads
   `clerk.pregnancy-assistant.com` and that `publishableKeyInstance` and
   `secretKeyInstance` both say `production`. If they disagree, the keys are
   from different Clerk instances and every authenticated request will 401.
2. `"msg":"Billing credentials"` — `revenueCatKey` and `revenueCatProjectId`
   must both read `"env"`, and `onReplit` must read `false`.
3. `"msg":"Server listening"`.

Two `ERROR` lines about `STRIPE_SECRET_KEY` and one `WARN` about
`STRIPE_WEBHOOK_SECRET` are expected while Stripe is unset. Any error naming
RevenueCat is not.

### 4. Check the health endpoint

Generate a domain under **Settings → Networking → Generate Domain**, then open
`https://<that-domain>/api/healthz` in a browser. It returns:

```json
{ "status": "ok" }
```

**If it returns 500, check the Clerk keys first.** Clerk's middleware runs
before every route, including this one, and throws when the key pair is missing
or malformed — so a Clerk misconfiguration shows up as a failed Railway health
check with nothing in it about Clerk. Verified: with no Clerk keys set,
`/api/healthz` returns 500; with a valid pair, 200.

### 5. Leave it running beside Replit

At this point two servers are talking to the same database and the app still
points at Replit. Nothing has switched over. That is the intended resting
state until:

- the AI credentials above are decided, and
- `EXPO_PUBLIC_DOMAIN` is repointed at the new host, which needs a new build
  and a full device test — see `docs/replit-exit-plan.md`.

Before the cutover, re-run `compare-databases` so the switch happens on a
database known to match.

---

## Notes on things that will look wrong but are not

- **`pnpm install` warnings about peer dependencies.** `.npmrc` sets
  `strict-peer-dependencies=false` deliberately.
- **The `preinstall` guard.** It refuses any package manager that is not pnpm
  by reading `npm_config_user_agent`. Railway uses pnpm because
  `pnpm-lock.yaml` is present, so it passes silently.
- **`index.mjs` is ~3.8 MB.** That is the whole server bundled into one file,
  which is what `build.mjs` is for.
- **A `pg` SSL deprecation warning.** Unrelated to this move; it appears on
  Replit too.
