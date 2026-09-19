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

## The web app is served by the API server

**Decided and implemented.** The web app (`artifacts/pregnancy-calculator`)
calls the API with _relative_ URLs and authenticates with session cookies, so
it only works when one origin serves both — which the Replit deployment did by
construction. The Railway API server originally served no static files at all,
so retiring Replit would have removed the web app's home, and nothing in the
deploy would have said so.

`lib/web-app.ts` now mounts the built client from the API server:

- **Static files** from `artifacts/pregnancy-calculator/dist/public`, or from
  `WEB_ROOT` when that is set.
- **A single-page fallback**, so client-side routes and refreshes away from `/`
  reach `index.html` instead of a 404. It is mounted _after_ `/api`, and skips
  `/api` paths explicitly, so an unknown API route stays a JSON-shaped 404
  rather than becoming the web app with a 200.
- **Caching that matches what Vite emits**: hashed files under `assets/` for a
  year and immutable, `index.html` never — it is what points at the current
  hashes — and unhashed files beside it (`opengraph.jpg`, icons) left alone,
  since their names survive deploys and a year-long cache could not be undone.

`railway.json` builds both artifacts. When the build is missing the server
still starts and logs a warning naming the directory it looked in, because an
API-only deploy is a valid thing to run and a silent 404 on the site is not.

One variable to set for this: **`VITE_APP_URL`**, to the site's own origin. It
is substituted into `index.html` at build time for the Open Graph and Twitter
card tags. Unset, the deployed page ships `content="%VITE_APP_URL%/"` and link
previews break — visible to everyone except you.

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
pointed at it. Use a custom domain anyway, under **Settings → Networking →
Custom Domain**, with the CNAME Railway gives you.

Use the **apex**, `pregnancy-assistant.com`, not `api.` — this one origin
serves the website as well as the API, so an `api.` name would put the public
site at `api.pregnancy-assistant.com`. It also matches the Clerk production
instance, which is configured for that domain.

**Leave the Cloudflare record DNS-only, grey cloud.** Proxying it breaks
certificate issuance — the same way it broke Clerk's, which is recorded in
`docs/replit-exit-plan.md`. If you later want Cloudflare in front of it, the
SSL/TLS mode has to be Full (strict); Flexible produces a redirect loop
against a host that already serves HTTPS.

Check what the record points at before adding one. If the apex currently
serves the Replit deployment, this moves the **website** the moment DNS
propagates — the mobile app is unaffected, because it calls the Replit host by
its own name until the OTA in step 3.

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
