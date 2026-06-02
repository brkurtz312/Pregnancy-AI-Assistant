import { getUncachableStripeClient } from "./stripeClient";

/**
 * Creates the one-time "Full Pregnancy Pass" product and its $19.99 price in
 * Stripe. Idempotent: safe to run multiple times.
 *
 * Stripe prices are immutable, so changing PASS_PRICE_CENTS creates a new price
 * and archives (deactivates) any other active one-time prices on the product,
 * leaving exactly one active price for checkout to pick up.
 *
 * Run with: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */
const PASS_KIND = "full_pregnancy_pass";
const PASS_NAME = "Full Pregnancy Pass";
const PASS_DESCRIPTION =
  "Unlimited AI pregnancy questions for your whole pregnancy, tied to your account and restorable across devices.";
const PASS_PRICE_CENTS = 1999; // $19.99
const PASS_CURRENCY = "usd";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const stripe = await getUncachableStripeClient();

  // Find an existing pass product by metadata marker.
  const search = await stripe.products.search({
    query: `metadata['kind']:'${PASS_KIND}' AND active:'true'`,
  });

  let product = search.data[0];
  if (product) {
    console.log(`Pass product already exists: ${product.id}`);
  } else {
    product = await stripe.products.create({
      name: PASS_NAME,
      description: PASS_DESCRIPTION,
      metadata: { kind: PASS_KIND },
    });
    console.log(`Created product: ${product.name} (${product.id})`);
  }

  // Ensure a matching one-time price exists.
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
  });
  const existingPrice = prices.data.find(
    (p) =>
      p.unit_amount === PASS_PRICE_CENTS &&
      p.currency === PASS_CURRENCY &&
      !p.recurring,
  );

  let activePriceId: string;
  if (existingPrice) {
    console.log(`Price already exists: ${existingPrice.id}`);
    activePriceId = existingPrice.id;
  } else {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: PASS_PRICE_CENTS,
      currency: PASS_CURRENCY,
      metadata: { kind: PASS_KIND },
    });
    console.log(
      `Created price: ${formatUsd(PASS_PRICE_CENTS)} one-time (${price.id})`,
    );
    activePriceId = price.id;
  }

  // Archive any other active prices on the product so checkout always resolves
  // to the current price (findPassPriceId picks the first active price).
  for (const p of prices.data) {
    if (p.id !== activePriceId && p.active) {
      await stripe.prices.update(p.id, { active: false });
      console.log(
        `Archived stale price: ${formatUsd(p.unit_amount ?? 0)} (${p.id})`,
      );
    }
  }

  console.log("Done. Webhooks will sync this to the database automatically.");
}

main().catch((err) => {
  console.error("Error seeding products:", err);
  process.exit(1);
});
