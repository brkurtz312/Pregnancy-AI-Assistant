# What the Full Pregnancy Pass costs

**$9.99, one-time, decided 20 Sep 2026.**

## Where the price actually lives

**App Store Connect is the price of record.** The IAP surfaces in the app read
`subscription.passPackage?.product.priceString` — the live StoreKit price — and
render whatever the store says. They cannot drift.

Everything else is a hardcoded string that can, and has. On 20 Sep 2026 the
repository contained four different prices at once: $9.99 on the App Store,
$14.99 on the web and in the mobile Stripe branch, $19.99 in both seed scripts
and the pitch deck. The web could have advertised $14.99 and charged $19.99.

So: **when the price changes, change it in App Store Connect first, then grep
the repository.** `grep -rn '\$[0-9]\+\.[0-9][0-9]'` finds every literal.

Two deliberate exceptions:

- `__tests__/accountSheetIAP.test.tsx` mocks `$19.99`, mismatched on purpose. A
  fixture equal to the real price would pass even if the component hardcoded
  it. Leave it.
- `mockup-sandbox` holds unshipped design explorations. They are kept in step
  only so a future reader is not misled.

## Why $9.99

The assistant runs on `claude-sonnet-4-6` — $3 per million input tokens, $15
per million output. At roughly 3,000 tokens in and 600 out per question, a
question costs about **2 cents**.

| User                                        | Questions over a pregnancy | AI cost |
| ------------------------------------------- | -------------------------- | ------- |
| Typical buyer, 5/week × 30 weeks            | ~150                       | ~$2.70  |
| Heavy buyer, 20/week × 35 weeks             | ~700                       | ~$12.60 |
| Free user who never buys, 5/week × 40 weeks | ~200                       | ~$3.60  |

At $9.99 the net is about $8.49 under Apple's 15% small-business rate, or $6.99
at 30%. Typical buyers leave a comfortable margin; only genuine outliers lose
money.

But the cost math is not why $9.99 was chosen. **The app has almost no users,
and the bottleneck is adoption and feedback rather than revenue per sale.** Ten
buyers at $9.99 teach more than four at $19.99, and $19.99 is a harder ask for
an app with no reviews. Raising a one-time purchase later is easy and
uncontroversial — existing owners keep what they bought.

## Two things to watch

**The free tier is not free.** A visitor who uses five questions a week for a
whole pregnancy costs around $3.60 and pays nothing. Fine as a funnel, real as
a line item once volume grows. This is the first number to watch.

**"Unlimited AI questions, forever" has no ceiling.** Irrelevant at current
volume. If usage ever surprises, a fair-use cap is a gentler fix than a price
rise and much easier to explain.

**The token estimates above are assumptions about the prompts, not
measurements.** The real figure is the Anthropic bill divided by questions
answered. Check it once there are a hundred or so.

## Changing the price

1. App Store Connect → the app → In-App Purchases → Full Pregnancy Pass →
   price. Apple applies it on their schedule, so expect a window where StoreKit
   still reports the old price and the app faithfully shows it.
2. Grep the repository for literals and update them to match.
3. `scripts/src/seedRevenueCat.ts` seeds RevenueCat's **test store** only — the
   real iOS price comes from App Store Connect. Re-run it only if the test
   store matters to you.
4. `scripts/src/seed-products.ts` creates the Stripe price. Web purchasing was
   removed (`docs/stripe-removal-plan.md`), so this is dormant; Stripe prices
   are immutable and re-running creates a new one and archives the old.
