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
its own name until the OTA in step 4.

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

## Step 3 — Diff the mobile app against the shipped build

**Do this before every OTA, without exception.**

`eas update` bundles your working tree. Not the variable you changed, not the
commit you have in mind — everything in `artifacts/pregnancy-calculator-mobile`
as it stands. Whatever has merged since the store build was cut goes out with
it, to every installed phone, without review.

Find the commit the live build was made from:

```
cd artifacts/pregnancy-calculator-mobile
pnpm exec eas build:list --platform ios --limit 5
```

Then look at what has accumulated since:

```
git diff --stat <that commit>..HEAD -- artifacts/pregnancy-calculator-mobile
```

Read every file in that list and decide, one at a time, whether you mean to
ship it to production right now with no TestFlight round. Test and
build-script changes are free. Anything touching a screen, a hook or a
provider is a behaviour change reaching users tonight.

**If the answer is no**, publish from the build's own commit so the update
carries the variable and nothing else:

```
git checkout <that commit>
pnpm exec eas update --branch production --environment production -m "..."
git checkout main
```

The EAS variables resolve at export time, so the new `EXPO_PUBLIC_DOMAIN` is
picked up even though the code is older. That is the minimal OTA: one value
changed, nothing else moved.

**Learned the hard way, 19 Sep 2026.** An OTA meant to carry one variable
carried four behaviour changes that had merged since the store build —
including one that had frozen the app on the home screen and its fix. It cost
an evening of debugging symptoms that had nothing to do with the cutover, and
a rollback.

---

## Step 4 — Publish the OTA

`eas update` bundles **locally**, unlike `eas build`, so install first:

```
pnpm install
```

(`--ignore-scripts` used to be necessary on Windows because the root
`preinstall` guard called `sh`. It is a Node script since Sep 2026 and plain
`pnpm install` works; `babel-preset-expo` is a direct devDependency, which is
the other thing local bundling needs.)

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

## Step 5 — Verify on a device

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

## Step 6 — A binary that does not need the OTA

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

## Step 7 — Retire Replit

Only after step 6 is live and adopted.

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

## Step 8 — Disconnect Cloudflare Pages

Two Pages projects in this Cloudflare account build from this repository and
post a check on every pull request:

- `pregnancy-calculator` — redundant since step 4. The API server serves the
  built web app itself now.
- `brk-services` — a different site that was wired to this repository.

Both have failed on every recent pull request. In the check run,
`started_at` equals `completed_at`: the build fails before any step runs, so
neither project deploys anything from here. The red check is pure noise, and
noise on every PR is how a real failure gets waved through.

For each project: Cloudflare dashboard → Compute → Workers & Pages → the
project → Settings → Build → Git repository → Disconnect. (Pages lives under
Compute in the current dashboard; older docs say "Workers & Pages" is a
top-level item.) That stops the checks
immediately, deploys nothing, leaves every existing deployment and custom
domain in place, and is reversible in one click.

Disconnecting is enough to clear the checks. Deleting the projects is also
safe — see below — but they are different acts, and disconnecting first costs
nothing. `brk-services` should only ever be disconnected here: it is a
different site of yours that was pointed at the wrong repository, and its
deletion is not this migration's business.

### What the apex is served by — checked 20 Sep 2026

Worth recording, because the two hostnames resolve differently and the
difference looks alarming until you chase it down:

| Hostname                      | Resolves to                          |
| ----------------------------- | ------------------------------------ |
| `www.pregnancy-assistant.com` | CNAME → `*.up.railway.app` (Railway) |
| `pregnancy-assistant.com`     | `2606:4700:…` (a Cloudflare address) |

A Cloudflare address on the apex could mean the apex was still attached to the
`pregnancy-calculator` Pages project as a custom domain, in which case deleting
that project would take the apex down. It is not. Asking the apex for something
only the API server has:

```powershell
Invoke-RestMethod https://pregnancy-assistant.com/api/healthz
# status: ok
```

Pages has no API server; a Pages-served apex would 404. So Railway is the
origin and the apex record is simply proxied — orange cloud, with Cloudflare
terminating TLS in front of Railway. The project's **Custom domains** tab was
empty, which says the same thing independently. **The `pregnancy-calculator` Pages project
serves nothing and can be deleted outright, not merely disconnected.**

### Deleting the project is blocked by its deployment history

The dashboard refuses: _"Your project has too many deployments to be deleted."_
There is no button for this. The deployments have to be removed through the API
first — `DELETE /accounts/{account}/pages/projects/{project}/deployments/{id}?force=true`
in a loop, with a token carrying **Account → Cloudflare Pages → Edit**, and then
the project deletes normally.

This is cosmetic. A disconnected project serves nothing, costs nothing and
posts no checks, so leaving it in place is a legitimate end state. Deleting it
also releases `pregnancy-calculator.pages.dev` back to the pool, where anyone
can claim it — irrelevant unless something still links there.

### The apex is proxied, which is worth knowing separately

Step 1 of this document and `docs/replit-exit-plan.md` both call for grey
cloud. The apex is orange. It works — so the zone is on Full or Full (strict),
not Flexible, which would have been a redirect loop — and this is not urgent.
Two consequences to keep in mind rather than act on today:

- **Cloudflare drops an origin response that takes longer than 100 seconds**
  (a 524) on the free plan. Railway has no such limit. The mobile app calls
  `https://$EXPO_PUBLIC_DOMAIN`, so whichever hostname that variable holds
  decides whether the limit applies. It bites the slow AI routes first —
  `/api/scribe/transcribe` and `/api/scribe/generate-note` — which is latent
  while the scribe feature is shelved, and would surface the day it is not.
- Clerk's own records (`clerk`, `accounts`, `clkmail`, the DKIM pair) must stay
  DNS-only regardless. Proxying those broke certificate issuance earlier in
  this migration; that lesson is about those records, not the apex.

---

## Rolling back

At any point before step 7:

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
- **Two servers in the logs at once.** Expected between steps 4 and 7. They
  share a database, so it does not matter which one answers.
