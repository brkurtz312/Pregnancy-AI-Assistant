import { getUncachableStripeClient } from "./stripeClient";

/**
 * Creates the one-time "Full Pregnancy Pass" product and its $24.99 price in
 * Stripe. Idempotent: safe to run multiple times.
 *
 * Run with: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */
const PASS_KIND = "full_pregnancy_pass";
const PASS_NAME = "Full Pregnancy Pass";
const PASS_DESCRIPTION =
  "Unlimited AI pregnancy questions for your whole pregnancy, tied to your account and restorable across devices.";
const PASS_PRICE_CENTS = 2499; // $24.99
const PASS_CURRENCY = "usd";

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

  if (existingPrice) {
    console.log(`Price already exists: ${existingPrice.id}`);
  } else {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: PASS_PRICE_CENTS,
      currency: PASS_CURRENCY,
      metadata: { kind: PASS_KIND },
    });
    console.log(`Created price: $24.99 one-time (${price.id})`);
  }

  console.log("Done. Webhooks will sync this to the database automatically.");
}

main().catch((err) => {
  console.error("Error seeding products:", err);
  process.exit(1);
});
