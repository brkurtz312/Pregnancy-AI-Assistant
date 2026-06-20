---
name: RevenueCat ASC product sync — verify live state, not seed constants
description: How to diagnose "Failed to sync products" from Replit's Manage in-app purchases → Sync to App Store Connect.
---

# Trust the live RevenueCat API, not the seed-script constants

The seed script (`scripts/src/seedRevenueCat.ts`) is idempotent and finds
existing apps/products by type/identifier — it does NOT overwrite them. So its
hard-coded constants (e.g. `APP_STORE_BUNDLE_ID`) can be **stale** while the
live RevenueCat app was created/corrected to a different value later.

**Always inspect the live state via the v2 API before concluding anything.** A
read-only `scripts/src/checkRevenueCat.ts` (run `pnpm --filter @workspace/scripts
run check-revenuecat`) lists apps (with bundle_id/package_name), products
(store_identifier + app_id), and offerings (is_current). That is the source of
truth.

**Why:** I almost "fixed" a bundle mismatch that did not exist — the seed
constant said `com.pregnancyassistant.app` but the live app_store app already
had the correct `app.replit.pregnancycalculator`. Editing based on the seed
constant would have been wrong.

# "Failed to sync products" is the Replit→Apple layer, not our code

Replit's Publishing pane → Manage in-app purchases → Sync to App Store Connect
pushes RevenueCat products into App Store Connect. When the RevenueCat side is
verified correct (App Store app bundle matches the real ASC app, product +
offering exist) but the UI shows a generic "Failed to sync products" with no
detail, the failure is on the Replit/Apple bridge — not app code or RevenueCat.

**How to apply:** the actionable external causes are (1) the product identifier
already exists in App Store Connect from a prior partial sync — Apple permanently
reserves IDs and rejects re-creates ("This product ID has already been used");
(2) the in-app purchase needs its required metadata completed in ASC; (3) ASC
API-key permissions. If the product already appears under the ASC app's In-App
Purchases, the sync effectively succeeded — finish it in ASC. Persistent generic
failures with no detail are a Replit platform issue → Replit Support (the sync
logs are not exposed in the workspace).
