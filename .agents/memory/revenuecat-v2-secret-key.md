---
name: RevenueCat reconcile needs a v2 secret key
description: The server's REVENUECAT_SECRET_API_KEY must be a v2 secret key; a v1 key makes every purchase fail to unlock the pass.
---

## Rule

`/billing/revenuecat/reconcile` calls RevenueCat's **REST API v2**
(`listEntitlements`, `listCustomerActiveEntitlements`). `REVENUECAT_SECRET_API_KEY`
must be a **v2** secret key with read access to project configuration and
customer information. A **v1** key is rejected by every v2 call.

**Why:** found 9 Nov 2026 after the Railway move. The key created for Railway on
26 Oct was API version 1. Every reconcile failed with "Failed to list project
entitlements" → 503 → the app said "Purchase couldn't be completed" while Apple
had charged and RevenueCat had granted `pass`. On Replit this never showed,
because the Replit connector used an OAuth token, not this key.

**How to apply:** RevenueCat → Project → API keys → New secret API key → API
version **2**, read permissions for project configuration and customers. Set it
as `REVENUECAT_SECRET_API_KEY` on Railway and redeploy. Affected buyers recover
with Restore Purchases once the key is fixed (RevenueCat already holds their
entitlement).

## Same night: Watch contraction intervals

`POST /tools/contractions` 500'd for Watch records: the Watch sends
`intervalSeconds` as a Double (e.g. 33.333) and the column is an integer. The
route now rounds both seconds fields (`wholeSeconds`).
