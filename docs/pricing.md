# What the Full Pregnancy Pass costs

**$9.99, one-time, decided 20 Sep 2026.**

## The app is free. The pass is the paid thing.

**Until 20 Sep 2026 the app itself was a paid download at $9.99**, while its own
account sheet offered a "Free plan — 5 of 5 free AI questions left this week".
Anyone who found the listing had to pay before they could reach the free tier
they were being offered, and then be asked for the pass on top. Set to $0.00 on
20 Sep 2026.

Two separate prices in App Store Connect, and confusing them is what made this
hard to see:

| Screen                                     | Controls                          | Correct value    |
| ------------------------------------------ | --------------------------------- | ---------------- |
| **Pricing and Availability**               | What it costs to download the app | **Free ($0.00)** |
| **In-App Purchases → Full Pregnancy Pass** | What the pass costs               | **$9.99**        |

Both screens are titled "Current Price" and both list every country, so a
screenshot of one is indistinguishable from the other. Check the heading.

The quickest check needs no App Store Connect at all: open the App Store
listing. **"Get"** means the app is free; a price on the button means it is not.

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

At $9.99 the proceeds are **$7.00** — App Store Connect confirmed this on
20 Sep 2026, which is the standard 30% commission. Apple's Small Business
Program would make it about $8.49; **enrolling is worth roughly $1.49 on every
sale** and has not been done.

Typical buyers still leave a comfortable margin against a ~$2.70 AI cost; only
genuine outliers lose money.

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

## Which Apple product the price belongs to

There have been **two Apple product IDs** for this pass. The first was burned —
Apple permanently reserves a product ID once used, and the original was created
on an orphan listing — so a `_v2` replacement exists
(`.agents/memory/apple-iap-product-id-burned.md`).

The app never hardcodes a product string. It renders whatever product
RevenueCat's `$rc_lifetime` package points at, which means **App Store Connect
showing $9.99 does not prove the app will show $9.99** — only that _some_
product costs $9.99. If the RevenueCat package is attached to the other one,
the app shows the other price, and both are "the real App Store price".

When the app and App Store Connect disagree, check in this order:

1. App Store Connect → In-App Purchases. How many exist, which product IDs,
   what price each.
2. RevenueCat → the `pass` entitlement and `$rc_lifetime` package. Which
   `store_identifier` is attached.

A mismatch there is the whole answer, and fixing it needs **no app rebuild** —
existing builds pick up a repointed package live. RevenueCat's
`store_identifier` is immutable, so repointing means creating a new RC product
and re-attaching it, not editing the old one.

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
