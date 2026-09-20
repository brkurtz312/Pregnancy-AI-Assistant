# Removing the Stripe integration

A decision document, not a commitment. It describes what leaving Stripe for
RevenueCat Web Billing would involve, what it would delete, and what it would
cost — so the choice can be made on the actual shape of the work.

**Nothing here has been done.** Read the last section before the first.

---

## Why this is worth considering now

Stripe has no live payments. Checked 19 Sep 2026: the only charges are Bryan's
own tests, and the Replit Stripe connection is still on a sandbox. So there is
nothing to migrate and no customer to disrupt — a window that closes the day
the first real web payment lands.

Meanwhile the Stripe integration is the most Replit-entangled part of the
codebase. `stripe-replit-sync` is a Replit-authored package that **owns a
Postgres schema**: it creates the `stripe.*` tables, writes to them from the
webhook, and stores the webhook signing secret in
`stripe._managed_webhooks`. Phase 0 of the exit plan called it "the real work
item". Removing the Stripe integration removes it, and with it:

- the `stripe.*` schema question hanging over the database migration
- the signing secret that lives in a database row and does not travel with a
  `--schema=public` dump
- a Replit dependency in a project whose current purpose is leaving Replit

RevenueCat already handles every purchase that carries money — all of them are
App Store purchases. Web Billing supports one-time non-consumable products, so
the Full Pregnancy Pass fits its model without redesign.

---

## What Stripe does today

Two purchase paths, one entitlement:

| Path | Mechanism              | Grants the pass via                                 |
| ---- | ---------------------- | --------------------------------------------------- |
| iOS  | Apple IAP → RevenueCat | `/billing/revenuecat/reconcile` (a pull)            |
| Web  | Stripe Checkout        | `/api/stripe/webhook` (a push) + `/billing/confirm` |

The mobile app offers both: a native in-app purchase when RevenueCat offerings
load, and **web Stripe checkout as the fallback when they do not**
(`AccountSheet.tsx`, `PassGate.tsx`). That fallback is the one piece of user
-facing behaviour this change would remove, and it is dealt with under
Sequencing.

Entitlement lives in `users.has_pass`, with a fallback in `entitlement.ts`:

```sql
SELECT 1 FROM stripe.payment_intents
WHERE customer = $1 AND status = 'succeeded'
```

That fallback exists because a webhook can be missed. It is the safety net that
catches a payment the push path dropped.

---

## What would change

### Server — deletions

| File                                        | Lines | Note                                     |
| ------------------------------------------- | ----- | ---------------------------------------- |
| `src/lib/stripeClient.ts`                   | 111   |                                          |
| `src/lib/stripe-init.ts`                    | 48    | runs `runMigrations`, creates `stripe.*` |
| Webhook handler in `src/app.ts`             | 134   |                                          |
| `scripts/src/stripeClient.ts`               | 78    |                                          |
| `scripts/src/seed-products.ts`              | —     | creates the $9.99 Stripe product         |
| `tests/stripe-checkout-integration.test.ts` | 777   |                                          |
| `tests/stripe-webhook.test.ts`              | 82    |                                          |

Routes `/billing/checkout` and `/billing/confirm` go with them, and their
generated client hooks (`useCreateCheckout`, `useConfirmCheckout`).

Dependencies dropped: `stripe`, `stripe-replit-sync`.

### Server — the part that is not deletion

`entitlement.ts` loses its `stripe.payment_intents` fallback, so `has_pass`
becomes the sole record of ownership. The replacement safety net already
exists: `/billing/revenuecat/reconcile` asks RevenueCat directly whether a user
holds the entitlement, and grants the pass when it does. It is a pull rather
than a push, which is the more robust of the two — it cannot be missed, only
delayed until the next call.

Worth making explicit while doing this: the reconcile endpoint should be
callable on demand, not only immediately after a purchase, so a user whose
grant was missed can recover without support.

### Web app

`use-pass.tsx` currently redirects to Stripe Checkout and handles the
`?checkout=success` return. That becomes a RevenueCat Web SDK purchase or a Web
Purchase Link. The `?checkout=success` return handling can go.

### Mobile app

`usePass.ts`'s `startCheckout` and its two call sites lose their target. See
Sequencing — this needs care, not just deletion.

### Database

- `stripe.*` schema: no longer created. Existing tables can be dropped once
  nothing reads them.
- `users.stripe_customer_id`: unused. Leave the column in place initially;
  dropping it is a separate migration with nothing to gain by rushing.

---

## Sequencing

The order matters because there must never be a moment with no way to buy.

1. **Set up Web Billing in RevenueCat.** Create the one-time non-consumable
   product at $9.99, attached to the _same entitlement_ the iOS product uses.
   Same entitlement is the whole point: `has_pass` stays one flag, and a user
   who bought on the web is recognised on their phone.
2. **Verify a real web purchase end to end** against the new product, in
   RevenueCat's test mode, confirming the entitlement appears and
   `/billing/revenuecat/reconcile` grants the pass.
3. **Switch the web app** to the RevenueCat purchase flow. Stripe checkout is
   still live at this point; nothing has been deleted.
4. **Ship a mobile build** whose fallback path points at the new web flow
   rather than Stripe checkout. This is a build and a release, so it is the
   long pole.
5. **Wait for adoption** of that build before deleting anything. Older installs
   still call `/billing/checkout`; deleting the route strands them with a
   button that fails.
6. **Delete the server code, routes, dependencies and tests.**
7. **Drop the `stripe.*` schema** once nothing queries it.

Steps 1–3 are reversible. Step 6 is the commitment.

---

## What this does not resolve, and what I do not know

- **Apple's rules on external purchase links.** The mobile app currently sends
  users to a web checkout. That was historically forbidden and the position has
  changed recently in the US; the app is approved as it stands. Whether the
  replacement flow is equally acceptable is a compliance question I have not
  verified, and it should be answered before step 4 rather than discovered in
  review.
- **RevenueCat's web fees**, on top of Stripe's, which remains the processor
  underneath. Small in absolute terms at current volume, but real. Check their
  pricing rather than taking a number from here.
- **Whether the RevenueCat Web SDK fits the web app's architecture.** I have
  not read its integration requirements.

---

## The case for not doing this

- Stripe Checkout works and is well understood. RevenueCat Web Billing is
  newer, and moving means depending on one vendor for every payment path.
- It is a real amount of work — a mobile release, a web change, and a waiting
  period — for a payment path that currently earns nothing.
- Keeping Stripe means keeping `stripe-replit-sync`, but that package can be
  replaced with direct Stripe SDK calls later without touching the purchase
  flow. The Replit entanglement is removable without removing Stripe.

The strongest argument for acting now is timing rather than urgency: no live
payments means no risk, and that is not a permanent condition.
