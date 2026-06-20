---
name: AI integration + mobile API base URL
description: Footguns when wiring the copied Anthropic integration into the API server, and how Expo native reaches the API.
---

# Copied AI integration client is an import-time footgun

The Replit Anthropic integration template's `client.ts` (when copied into
`lib/integrations-*`) **throws at module import time** if the integration env
vars are missing. If a route file imports that client at the top level and the
router is always mounted, a missing/unprovisioned integration crashes the
**entire** Express process at startup — including unrelated routes like health.

**Why:** import-time side effects run before any request; one missing env var
takes down the whole server, not just the AI endpoints.

**How to apply:** make the client lazy — export a `getAnthropic()` that
constructs on first call plus an `isAnthropicConfigured()` guard. Call
`getAnthropic()` inside handlers, and return 503 (not 502) from the AI
endpoints when `isAnthropicConfigured()` is false. 502 is for provider call
failures. Apply the same pattern to any other copied integration template.

# Server-side guardrails on LLM endpoints

Clients are untrusted: the UI may cap chat history to N turns, but the server
must independently cap history length and per-message content size (and rate
limit) — never trust the client to bound prompt size/cost.

# API server dev script builds once — no watch

`@workspace/api-server`'s `dev` script runs `build` then `start` (esbuild one-shot
bundle → `node dist`). It does **not** watch source files. Editing server source
does **not** hot-reload — you must restart the workflow
(`artifacts/api-server: API Server`) to rebuild before curl tests reflect changes.

**Why:** silently testing against the stale build wastes a debug cycle (e.g. new
middleware appears "not running"). If expected headers/behavior are missing after
a server edit, restart the workflow first.

# Per-IP rate limiting behind the Replit proxy

Key per-IP limiters off the **leftmost** `X-Forwarded-For` entry (same convention
as the Clerk proxy middleware), not `req.ip`. The Replit shared proxy supplies the
authoritative client IP there, so this is independent of proxy hop count and needs
no `trust proxy` tuning — but it is **only safe behind that trusted proxy boundary**
(direct ingress would make XFF spoofable).

**Decisions:** order burst limiter before daily limiter so rejected bursts don't
consume the daily budget. In-memory store is fine for a single instance, but
**Autoscale (multi-instance) needs a shared store (e.g. Redis)** or per-IP limits
multiply per instance.

# Weekly insight is cacheable; the Q&A answer is not

The weekly-insight output depends **only on the gestational week** (not on the
user), so it's cached in-process keyed by week. The Q&A answer depends on the
user's free-text question + history, so it is **not** cached.

**Why:** the weekly insight fires automatically on every calculation, so it was
the dominant AI cost; caching collapses repeated same-week calls to a single
paid generation (verified: ~7.5s miss → ~1ms hit).
**How to apply:** in-memory TTL cache is correct here because the value is
identical for everyone — even under Autoscale each instance just warms its own
copy. Don't cache empty/failed generations (retry instead). If the prompt or
model changes, stale cached text persists until TTL expiry or a deploy/restart
(which resets the in-memory cache) — bump/clear if you need it to propagate now.

# Expo env injection: build.js is canonical; app.config.js is forbidden

EXPO_PUBLIC_* values (Clerk publishable key, Clerk proxy URL, RevenueCat keys,
EXPO_PUBLIC_DOMAIN, REPL_ID) reach the bundle ONLY via build-time forwarding:
the mobile `dev` script (development) and `scripts/build.js` (the env block it
passes to the spawned Metro export) — which is the canonical place clerk-auth's
mobile setup forwards them. Replit's **Expo Launch native/TestFlight build runs
build.js**, so build.js is the single source for production env forwarding.

**Do NOT add `app.config.js` / `app.config.ts`** — the expo skill forbids it; a
dynamic config **breaks the Expo Launch build**. Expo config must stay a static
`app.json`. `setupClerkWhitelabelAuth()` deliberately does NOT create
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` as a secret — it's derived at build time.

**Why:** a TestFlight launch crash from an empty `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
(empty key → `<ClerkProvider>` throws) is almost always a **stale build** made
before build.js forwarded it — the fix is to **re-publish**, not to add config
plumbing. Defensive hardening that IS allowed: keep ErrorBoundary outermost and
guard an empty publishable key so a missing key degrades gracefully instead of
hard-crashing on launch.

# Replit Expo Launch is a MANAGED identity — app.json must not fight it

Replit's Expo Launch (the Publish → App Store flow) injects its OWN managed
identity at build time and submits to a Replit-managed App Store app. The
"View logs" job spec shows the truth in the `launching expo:manifest "{...}"`
step: it sets `owner` (`replit-private-<uuid>`), `slug`, `extra.eas.projectId`,
and `ios.bundleIdentifier` (Replit assigns `app.replit.<name>`), plus the App
Store numeric app id and the Apple ID it submits under.

**Do NOT hand-add `owner`, `extra.eas.projectId`, or a custom
`ios.bundleIdentifier` to `app.json`.** If app.json declares a bundle id that
differs from the Replit-managed one, `expo:prebuild` generates the native
project with app.json's id while signing/submission use the managed id → the
provisioning profile can't sign the binary → "Failed to publish". A personal
`owner`/`projectId` (the user's own Expo account) similarly conflicts with the
managed Expo org the Launch is authenticated for.

**Why:** a prior session "improved" app.json by adding owner/projectId and a
custom bundle id (`com.pregnancyassistant.app`) — but the real App Store listing
was already `app.replit.pregnancycalculator`. Those edits never took effect;
they only broke every publish.

**How to apply:** to fix a "Failed to publish" with no other clear error, read
the `expo:manifest` line in the publish "View logs", then make app.json match
the managed identity (set `ios.bundleIdentifier`/`android.package` to the
`app.replit.*` value; remove `owner` and `extra.eas.projectId` so Launch's
injection is authoritative). Keep it a static app.json. The app's real store
identity is whatever the publish log shows, not whatever app.json claims.

# App Store resubmit needs a higher app.json `version`, not just build number

Apple closes a "pre-release train" once a marketing version (e.g. 1.0.0) has
been approved. A new TestFlight/App Store submit then fails at the `pilot`/
`altool` upload step (NOT a build/identity error) with two 409s:
"Invalid Pre-Release Train. The train version 'X' is closed for new build
submissions" and "CFBundleShortVersionString [X] must contain a higher version
than the previously approved version [X]".

**Fix:** bump `expo.version` in `app.json` (1.0.0 → 1.0.1). That is the
marketing version (CFBundleShortVersionString). The integer build number is
auto-incremented by EAS (eas.json `appVersionSource: remote` +
`production.autoIncrement: true`), so the build number is NOT the problem — the
**marketing version** must increase on every new App Store train.

**Why:** the submission reaching `pilot`/`altool` means build + signing +
identity all succeeded — so a 409 here is purely a version-collision, not a
config/identity bug. Don't chase bundle id / credentials when you see this.

# Expo native needs an absolute API base URL

Web reaches the API via relative URLs through the shared proxy. **Expo native
does not share that proxy origin**, so it must call `setBaseUrl()` (from
`@workspace/api-client-react`) with an absolute URL. Use
`https://${process.env.EXPO_PUBLIC_DOMAIN}` — `EXPO_PUBLIC_DOMAIN` is the
dev/deploy domain **without** a protocol (set in the mobile `dev` script and
`scripts/build.js`). Do this once at module load in `app/_layout.tsx`.
