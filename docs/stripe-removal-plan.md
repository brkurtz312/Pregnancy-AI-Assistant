# Removing web purchasing

**Decided 20 Sep 2026: the web app stops selling the pass. It is not moving to
another processor.** Purchases happen in the App Store, through Apple's in-app
purchase, and later through Google Play when an Android build ships. The web
app keeps every free feature, keeps sign-in, and recognises a pass bought on a
phone.

This document was written as an open question — Stripe, or RevenueCat Web
Billing? The answer turned out to be neither.

---

## Why removal beat migration

The original plan compared Stripe against RevenueCat Web Billing. Both keep a
web purchase path, and both carry a cost:

- **Keeping Stripe** keeps `stripe-replit-sync`, a Replit-authored package that
  **owns a Postgres schema**. It creates the `stripe.*` tables, writes to them
  from the webhook, and stores the webhook signing secret in
  `stripe._managed_webhooks` — a secret that lives in a database row and does
  not travel with a `--schema=public` dump. Phase 0 of the exit plan called it
  "the real work item".
- **Moving to RevenueCat Web Billing** means a new vendor dependency for every
  payment path, a web rewrite, a mobile release, an adoption wait, and two
  questions nobody had answered: Apple's rules on external purchase links, and
  whether their Web SDK fits this app's architecture.

Removing web purchasing costs neither. It answers the Apple question by
deleting the external purchase link rather than defending it, and it removes
the Replit entanglement outright instead of trading it for something else.

The timing was the deciding factor. Checked 19 Sep 2026: Stripe has no live
payments — the only charges are Bryan's own tests, and the Replit Stripe
connection is still on a sandbox. So there is no customer to disrupt and
nothing to migrate. That window closes the day the first real web payment
lands, which is an argument for acting, not for waiting.

## What it costs

**Someone without an iPhone cannot buy the pass.** A visitor on Android or a
desktop gets the free tier and a pointer to the App Store, until an Android
build ships. That is the whole cost, and it was accepted deliberately: the web
app is not expected to carry meaningful traffic, and the product's attention
belongs on the store apps.

Everything else survives:

- A pass bought on a phone is **active on the web**. Entitlement lives in
  `users.has_pass`, against the account, not the device.
- The **redeem-code** path is untouched. It is what App Review and support use.
- Free features, sign-in, and cross-device sync are unaffected.

---

## What Stripe did

Two purchase paths, one entitlement:

| Path | Mechanism              | Grants the pass via                                 |
| ---- | ---------------------- | --------------------------------------------------- |
| iOS  | Apple IAP → RevenueCat | `/billing/revenuecat/reconcile` (a pull)            |
| Web  | Stripe Checkout        | `/api/stripe/webhook` (a push) + `/billing/confirm` |

The mobile app offered both: a native in-app purchase when RevenueCat offerings
load, and **web Stripe checkout as the fallback when they do not**
(`AccountSheet.tsx`, `PassGate.tsx`). That fallback is the one piece of
user-facing behaviour this removes, and it is why the sequencing below is not
simply "delete it".

Entitlement lives in `users.has_pass`, with a fallback in `entitlement.ts`:

```sql
SELECT 1 FROM stripe.payment_intents
WHERE customer = $1 AND status = 'succeeded'
```

That fallback existed because a webhook can be missed. Its replacement already
exists: `/billing/revenuecat/reconcile` asks RevenueCat directly whether a user
holds the entitlement. It is a pull rather than a push, which is the more
robust of the two — it cannot be missed, only delayed until the next call.

---

## Sequencing

The order matters because there must never be a moment where a paying user is
stranded, or a shipped build has a button pointing at a route that no longer
exists.

1. **Web app stops selling.** ✅ Done 20 Sep 2026. `startCheckout` is gone from
   `use-pass.tsx`; the four CTAs (landing, account bar, AI assistant, Scribe)
   link to the App Store. The `?checkout=success` return handler stays for now,
   so a checkout already in flight across the deploy still completes.
   Reversible, and no server change.
2. **Ship a mobile build** whose purchase surfaces no longer point at
   `/billing/checkout`. ✅ Merged 20 Sep 2026 in 1.0.15, alongside the Watch
   delivery instrumentation. `startCheckout` is gone from the mobile app.

   Worth recording what this found: `PassGate.tsx` and `AiAssistant.tsx`
   called `startCheckout()` with **no platform gate at all**. On iOS, hitting
   the free-question limit or tapping a gated feature opened a browser to
   Stripe checkout — an external purchase for digital content. The
   `AccountSheet` branch was platform-gated (`isNative ? IAP : Stripe`), so
   only that one was web-only. Removing them closes a compliance exposure as
   well as a dead route.

   The pass is now bought in one place, the account sheet, with the in-app
   purchase. `PassGate` and the AI assistant banner point at it instead of
   duplicating a purchase flow.

3. **Wait for adoption** of that build. Older installs still call
   `/billing/checkout`; deleting the route before then strands them with a
   button that fails.
4. **Delete the server code, routes, dependencies and tests.**
5. **Drop the `stripe.*` schema** once nothing queries it.

Steps 1–2 are reversible. Step 4 is the commitment.

While doing step 4, make the reconcile endpoint callable on demand rather than
only immediately after a purchase, so a user whose grant was missed can recover
without support.

---

## What step 4 deletes

### Server

| File                                        | Lines | Note                                     |
| ------------------------------------------- | ----- | ---------------------------------------- |
| `src/lib/stripeClient.ts`                   | 111   |                                          |
| `src/lib/stripe-init.ts`                    | 48    | runs `runMigrations`, creates `stripe.*` |
| Webhook handler in `src/app.ts`             | 134   |                                          |
| `scripts/src/stripeClient.ts`               | 78    |                                          |
| `scripts/src/seed-products.ts`              | —     | created the $9.99 Stripe product         |
| `tests/stripe-checkout-integration.test.ts` | 777   |                                          |
| `tests/stripe-webhook.test.ts`              | 82    |                                          |

Routes `/billing/checkout` and `/billing/confirm` go with them, and their
generated client hooks (`useCreateCheckout`, `useConfirmCheckout`).

Dependencies dropped: `stripe`, `stripe-replit-sync`.

`entitlement.ts` loses its `stripe.payment_intents` fallback, so `has_pass`
becomes the sole record of ownership, backed by reconcile.

### Web app

The `?checkout=success` handling in `use-pass.tsx`, along with `justPurchased`
and `dismissJustPurchased` if nothing else uses them by then.

### Mobile app

`usePass.ts`'s `startCheckout` and its two call sites. Step 2, not step 4.

### Database

- `stripe.*` schema: no longer created. Existing tables can be dropped once
  nothing reads them.
- `users.stripe_customer_id`: unused. Leave the column initially; dropping it
  is a separate migration with nothing to gain by rushing.

---

## Android

An Android build is under discussion. It changes nothing here: Play Store
purchases go through RevenueCat exactly as Apple's do, and the
`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` plumbing already exists. Two store
purchase paths, one entitlement, still no web payments.

If anything, it shortens the cost above: the visitor who cannot buy today is
largely the Android visitor.
