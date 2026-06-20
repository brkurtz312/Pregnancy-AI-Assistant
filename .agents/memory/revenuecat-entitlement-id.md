---
name: RevenueCat entitlement_id vs lookup_key
description: Server-side reconcile must resolve the entitlement lookup_key to its internal id before matching a customer's active entitlements.
---

# RevenueCat entitlement matching (REST v2 / @replit/revenuecat-sdk)

When verifying a purchase server-side via `listCustomerActiveEntitlements`, each
returned `CustomerEntitlement.entitlement_id` is the entitlement's **opaque
internal id** (e.g. `entlxxxx`), NOT the human `lookup_key` you set at seed time
(e.g. `"pass"`).

**Rule:** first call `listEntitlements({ path: { project_id } })`, find the item
whose `lookup_key === "pass"`, take its `.id`, then match customer active
entitlements by `entitlement_id === that id`. Comparing `entitlement_id` directly
to the lookup_key silently never matches → paid users never get granted.

**Why:** the `Entitlement` type carries both `id` (opaque) and `lookup_key`
(custom identifier); the per-customer active-entitlement objects only carry the
internal `id`.

**How to apply:** any reconcile / entitlement-check route. On RevenueCat fetch
errors or an unresolved lookup_key, return 503 (retryable) so the client can
re-attempt after a successful purchase rather than silently returning stale
status. Correctness also depends on the mobile app calling
`Purchases.logIn(clerkUserId)` so RevenueCat `app_user_id === Clerk userId` (the
reconcile invariant).
