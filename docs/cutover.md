# Cutting over to Railway

The Railway server is running, verified, and idle beside Replit. This is how
the app starts using it — and, separately, how Replit gets retired.

`docs/railway-deploy.md` covers standing the server up. This covers pointing
users at it.

---

## What makes this safe

**Both servers talk to the same database.** There is no split brain to manage
and no migration window: a phone talking to Railway and a phone talking to
Replit see identical data. Traffic can move gradually, and moving it back
costs nothing.

**The domain the app calls is JavaScript, not native code.** `EXPO_PUBLIC_DOMAIN`
is inlined into the bundle at export time, and `expo-updates` can replace that
bundle on installed phones. So the cutover ships as an OTA update, not an App
Store release — minutes rather than a review cycle, and reversible the same
way.

That combination is the whole reason this can be done carefully instead of all
at once.

---

## The open question: what serves the web app?

**Resolve this before starting.** The web app (`artifacts/pregnancy-calculator`)
calls the API with _relative_ URLs and relies on session cookies, which only
works when the same origin serves both — which is what the Replit deployment
does today. The Railway API server serves no static files at all: `app.ts`
mounts a logger, the Clerk proxy, the Stripe webhook, CORS, the body parsers
and `/api`. Nothing else.

So retiring Replit removes the web app's home, and nothing in the deploy would
say so. Three ways out:

1. **Serve the web build from the API server.** Add static file serving to
   `app.ts` and build `pregnancy-calculator` as part of the Railway build.
   Keeps one origin, so cookies and CSRF behaviour are unchanged. Smallest
   change to how anything works.
2. **Host it separately** (Cloudflare Pages already has a project for it,
   currently failing to build). Then it needs an absolute API base URL, CORS
   for that origin, and cookie handling that works cross-site — a different
   auth model, not a config change.
3. **Decide it does not need to survive.** Its distinct purpose is Stripe web
   checkout, which `docs/stripe-removal-plan.md` proposes deleting. If that
   plan is adopted, this question answers itself.

Option 1 is the least work and the least risk. Option 3 is the one that makes
the question go away. Either way it is a decision, not a step.

---

## Step 0 — Ground truth

Do not change anything until these three agree with what you expect.

**What the EAS production environment actually holds:**

```
cd artifacts/pregnancy-calculator-mobile
pnpm exec eas env:list --environment production
```

This is where `EXPO_PUBLIC_DOMAIN`, the Clerk publishable key and the
RevenueCat keys live — not in the workspace shell. Note whether
`EXPO_PUBLIC_CLERK_PROXY_URL` is still present; if it is, it belongs to the
old Replit-hosted Clerk instance and should go in the same OTA (see
`docs/replit-exit-plan.md`, "The shipped app is pinned to the current Clerk
instance").

**That the runtime version still matches the shipped build:**

```
pnpm exec eas channel:view production
```

`app.json` pins `runtimeVersion: "1.0.13"`. An OTA only reaches binaries whose
runtime version matches, so if the store build has moved on, this number has to
move with it or the update reaches nobody.

**That the databases still agree:**

```
pnpm --filter @workspace/scripts run compare-databases
```

Run this immediately before the switch, not days earlier. It is the only thing
that proves the two databases are still identical in content, and the whole
"same data either way" premise rests on it.

---

## Step 1 — A domain you own

Railway will hand out a `*.up.railway.app` hostname, and the app would work
pointed at it. Use a custom domain anyway — `api.pregnancy-assistant.com` or
similar, under **Settings → Networking → Custom Domain**, with the CNAME
Railway gives you.

The reason is this migration. `EXPO_PUBLIC_DOMAIN` is baked into shipped
binaries, so every future change of host is an OTA at best and an App Store
release at worst. Behind a domain you control, the next move is a DNS record.

Confirm it serves before going further:

```
https://<your domain>/api/healthz   →   {"status":"ok"}
```

A 500 here means the Clerk keys, not the domain — see step 4 of
`docs/railway-deploy.md`.

---

## Step 2 — Repoint the variable

```
cd artifacts/pregnancy-calculator-mobile
pnpm exec eas env:update production --variable-name EXPO_PUBLIC_DOMAIN
```

The value is the host **without** a protocol: the app builds
`https://${EXPO_PUBLIC_DOMAIN}` itself. A value with `https://` in it produces
`https://https://…` and every request fails.

This changes nothing that is already installed. It only decides what the next
export inlines.

---

## Step 3 — Publish the OTA

On Windows, install first so Metro can find its Babel preset — `eas update`
bundles **locally**, unlike `eas build`:

```
pnpm install --ignore-scripts
```

Then, from `artifacts/pregnancy-calculator-mobile`:

```
pnpm exec eas update --branch production --environment production -m "Point the app at Railway"
```

**Both flags are mandatory, and each has already caused an outage in this
project:**

- `--environment production` resolves the EAS variables at export time.
  Without it the bundle inlines whatever the local shell has — which is
  nothing — and ships an empty Clerk publishable key. That bricked every
  TestFlight install at startup until a fixed OTA landed.
  (`.agents/memory/eas-update-environment-flag.md`)
- `--branch production` targets the branch the `production` channel serves.
  Without it the branch defaults to the current git branch, and the update is
  published, invisible, and reaching nobody.

---

## Step 4 — Verify on a device

`fallbackToCacheTimeout: 0` means a phone **downloads** the update on one
launch and **applies** it on the next. So: open the app, close it fully, open
it again. Until that second launch you are still testing the old bundle, which
is the most common way to conclude wrongly that an OTA did nothing.

Then exercise the paths that only break in production, in this order —
each one depends on the previous working:

1. **Sign in.** Failure here is Clerk, and it is the failure that 401s
   everything else while looking like a network problem.
2. **The AI assistant.** Proves `AI_INTEGRATIONS_ANTHROPIC_*` on Railway.
3. **Record a visit.** Proves `AI_INTEGRATIONS_OPENAI_*` — transcription and
   then note generation, which is both providers in one flow.
4. **A sandbox purchase**, or **Restore Purchases** on an account that already
   has the pass. Proves `REVENUECAT_SECRET_API_KEY` and
   `REVENUECAT_PROJECT_ID`, and the reconcile path that grants the pass.
5. **The Watch**, if paired — it reaches the API through the phone, so it
   should follow, but it has surprised us before.

Watch Railway's logs while doing this. Requests appearing there is the actual
confirmation that the phone switched hosts.

---

## Step 5 — A binary that does not need the OTA

After the OTA, installed phones talk to Railway. **A fresh App Store install
still does not** — it runs the embedded bundle on first launch and only applies
the OTA on the second. So a brand-new user's first session goes to the old
host.

That is fine while Replit is alive, and it is the reason Replit stays alive.
To end it, ship a build whose embedded bundle carries the new domain:

```
pnpm exec eas build -p ios --profile production
pnpm exec eas submit -p ios --profile production
```

`eas.json` has `autoIncrement: true` and `appVersionSource: "remote"`, so the
build number takes care of itself. If you bump `version` in `app.json`, bump
`runtimeVersion` to match — otherwise the next OTA will not reach the build you
just shipped.

Once that build is the one the store serves, the embedded bundle and the OTA
agree, and first launches go to Railway.

---

## Step 6 — Retire Replit

Only after step 5 is live and adopted.

**Re-enable the background workers on Railway.** Remove both variables added in
`docs/railway-deploy.md` step 5:

```
REVIEWER_CHECK_INTERVAL_MS
ACCOUNT_DELETION_WORKER_INTERVAL_MS
```

They were turned off so two servers would not duplicate the work. With one
server left, an account deletion that never runs is a compliance problem, not
an inconvenience. The boot log should read `Account deletion worker started`
rather than `disabled` — check it.

**Then, and only then**, turn off the Replit deployment. Note what this also
settles: the "Connect a live Stripe account before publishing" block only
mattered because production was published from Replit. It stops applying
rather than getting solved.

Leave the Neon database that Replit provisioned in place for a while. It costs
nothing to keep and it is the only copy of the pre-migration state.

---

## Rolling back

At any point before step 6:

```
pnpm exec eas env:update production --variable-name EXPO_PUBLIC_DOMAIN   # back to the old host
pnpm exec eas update --branch production --environment production -m "Roll back to Replit"
```

Phones pick it up on the launch after next. Nothing needs to be undone on
Railway, and no data has to move, because both servers were always reading the
same database. This is the property worth protecting: **do not turn Replit off
until you no longer want this option.**

---

## Things that will look wrong but are not

- **`Stripe initialization failed` in the Railway log.** Stripe is deliberately
  unset. Web checkout is broken there on purpose, pending the decision in
  `docs/stripe-removal-plan.md`.
- **The OTA appearing to do nothing.** It applies on the launch _after_ the one
  that downloads it. Close the app fully and reopen.
- **Cloudflare Pages checks failing on every PR.** A standing failure unrelated
  to any of this; the project builds cleanly from this repository.
- **Two servers in the logs at once.** Expected between steps 3 and 6. They
  share a database, so it does not matter which one answers.
