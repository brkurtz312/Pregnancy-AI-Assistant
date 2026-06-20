# Threat Model

## Project Overview

This project is a public-facing pregnancy assistant ecosystem with a React web app, an Expo mobile app, and an Express API backed by PostgreSQL. The production security boundary is centered on the `artifacts/api-server` service, which exposes AI, billing, entitlement, and webhook endpoints to internet users and to first-party web/mobile clients.

## Assets

- **User accounts and sessions** — Clerk-authenticated identities gate pass ownership and paid features. Compromise allows account impersonation and premium-feature abuse.
- **Paid entitlement state** — the `users.hasPass` flag, Stripe customer linkage, synced Stripe payment data, and RevenueCat entitlement state determine whether a user receives paid access.
- **AI usage budget and access controls** — Anthropic-backed endpoints can incur cost and disclose premium responses. Abuse impacts both availability and billing.
- **Application secrets and integration credentials** — Clerk secret key, Stripe credentials, RevenueCat access tokens, Anthropic API credentials, and database connection strings enable privileged server-side actions.
- **Usage and profile data** — user email, Stripe customer id, pass purchase timestamps, and AI usage counters are sensitive account-linked data.

## Trust Boundaries

- **Browser/mobile client to API** — all request bodies, query params, headers, and URLs are untrusted until validated server-side.
- **Authenticated vs anonymous users** — some AI functionality is public but metered; billing and entitlement endpoints require a valid Clerk identity.
- **API to PostgreSQL** — the API can read and mutate entitlement and usage state. Logic flaws here can turn payments or counters into privilege escalation.
- **API to Stripe / RevenueCat / Anthropic / Clerk** — the server uses privileged credentials to verify payments, proxy auth traffic, and call the AI provider. Inputs that influence these calls must be tightly scoped.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox/**`, local scripts, and tests are out of scope unless they are proven reachable from the public deployment.

## Scan Anchors

- Production entry point: `artifacts/api-server/src/index.ts` and `artifacts/api-server/src/app.ts`.
- Highest-risk server areas: `artifacts/api-server/src/routes/billing/index.ts`, `artifacts/api-server/src/routes/ai/index.ts`, `artifacts/api-server/src/lib/entitlement.ts`, `artifacts/api-server/src/lib/rate-limit.ts`, `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`.
- Public unauthenticated surfaces: `/api/healthz`, `/api/ai/ask`, `/api/ai/weekly-insight`, `/api/stripe/webhook`, Clerk proxy path `/api/__clerk`, and the mobile static landing/manifest server if deployed.
- Authenticated user surfaces: `/api/billing/pass-status`, `/api/billing/checkout`, `/api/billing/confirm`, `/api/billing/revenuecat/reconcile`, `/api/billing/redeem-code`.
- Normally dev-only / skip unless proven prod-reachable: `artifacts/mockup-sandbox/**`, `scripts/**`, test files.

## Threat Categories

### Spoofing

The API trusts Clerk for identity and Stripe/RevenueCat for payment truth. Protected endpoints must accept only a valid server-verified Clerk session or bearer token, and webhook or purchase-verification flows must rely on server-to-server verification rather than client-asserted payment state.

### Tampering

Attackers can fully control request bodies and selected request metadata. Billing flows must derive the paid product, ownership, and entitlement grant strictly from server-verified provider data; AI flows must cap and validate message inputs before they reach Anthropic or persistent usage counters.

### Information Disclosure

Authenticated JSON endpoints return account-linked entitlement and usage data, and the server handles privileged integration secrets. Responses and logs must avoid leaking secrets, cookies, bearer tokens, or provider internals; cross-origin behavior must not expose authenticated data to arbitrary sites.

### Denial of Service

The public AI routes can be abused for request floods or cost amplification, while billing/webhook endpoints can be used to create expensive or noisy upstream calls. On this public autoscaled deployment, the project cannot rely on per-process in-memory throttles as its sole abuse control; cost-sensitive limits must remain effective across instances, and expensive requests should reserve quota before calling Anthropic.

### Elevation of Privilege

The most important privilege boundary is between free users and paid-pass holders. A user must gain `hasPass` only after proving ownership of the intended paid product or an explicitly authorized developer code; similarly, free users must not be able to obtain paid-volume AI responses by racing quota checks or bypassing rate limits that are supposed to enforce the free-vs-paid boundary.
