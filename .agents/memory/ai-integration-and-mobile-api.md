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

# Expo native needs an absolute API base URL

Web reaches the API via relative URLs through the shared proxy. **Expo native
does not share that proxy origin**, so it must call `setBaseUrl()` (from
`@workspace/api-client-react`) with an absolute URL. Use
`https://${process.env.EXPO_PUBLIC_DOMAIN}` — `EXPO_PUBLIC_DOMAIN` is the
dev/deploy domain **without** a protocol (set in the mobile `dev` script and
`scripts/build.js`). Do this once at module load in `app/_layout.tsx`.
