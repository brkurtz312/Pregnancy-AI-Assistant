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

# Expo native needs an absolute API base URL

Web reaches the API via relative URLs through the shared proxy. **Expo native
does not share that proxy origin**, so it must call `setBaseUrl()` (from
`@workspace/api-client-react`) with an absolute URL. Use
`https://${process.env.EXPO_PUBLIC_DOMAIN}` — `EXPO_PUBLIC_DOMAIN` is the
dev/deploy domain **without** a protocol (set in the mobile `dev` script and
`scripts/build.js`). Do this once at module load in `app/_layout.tsx`.
