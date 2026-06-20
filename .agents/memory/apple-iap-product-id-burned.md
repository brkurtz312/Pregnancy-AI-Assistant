---
name: Apple permanently reserves IAP product IDs
description: Why an IAP product ID can become unusable forever and how that forces a RevenueCat product swap.
---

# Apple burns IAP product IDs permanently

Once an in-app purchase product ID has been used anywhere on an Apple team, Apple
**permanently reserves it** — you cannot create another IAP with that product ID
again, even after the original IAP (or the whole app listing) is deleted. App
Store Connect reports it as "already being used by another in-app purchase
associated with this team."

**Why it bit us:** the Full Pregnancy Pass product ID was first created on an
orphan listing (`com.pregnancyassistant.app`). Deleting that orphan did NOT free
the ID, so the real app (`app.replit.pregnancycalculator`, Apple ID 6774959007)
could never reuse it. The fix was a brand-new product ID with a `_v2` suffix.

**How to apply:**
- If ASC says a product ID is "already being used," do not try to free it — pick
  a new, never-used ID. Product IDs are invisible to customers, so a suffix is fine.
- IAPs also cannot be moved between apps, so you cannot rescue an ID stranded on
  the wrong listing.
- RevenueCat's product `store_identifier` is **immutable** — to change which Apple
  product an offering points at, you must CREATE a new RC product with the new
  store id, re-attach it to the entitlement (`pass`) + package (`$rc_lifetime`),
  and archive the old one. Do not expect `updateProduct` to change it.
- Because the app reads products via RevenueCat **offerings/entitlements** (never a
  hardcoded product string), swapping the store id needs NO app rebuild — existing
  TestFlight builds pick up the new product live.
- Test Store / Play Store products are independent of Apple's reservation; only the
  App Store product needs the new id.
