import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { logger } from "./logger";

/**
 * Initialize the Stripe schema and sync data on startup.
 *
 * This is intentionally non-fatal: if the Stripe integration is not yet
 * connected (common during development before the user completes OAuth), the
 * rest of the API — calculator, weekly insights, free AI questions — must keep
 * working. Billing endpoints surface a clear error until Stripe is connected.
 */
export async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set; skipping Stripe initialization");
    return;
  }

  try {
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookResult = await stripeSync.findOrCreateManagedWebhook(
        `https://${domain}/api/stripe/webhook`,
      );
      logger.info(
        { url: webhookResult?.url ?? "configured" },
        "Stripe webhook configured",
      );
    }

    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe data synced"))
      .catch((err) => logger.error({ err }, "Stripe backfill failed"));
  } catch (err) {
    logger.error(
      { err },
      "Stripe initialization failed; continuing without Stripe. " +
        "Connect the Stripe integration to enable payments.",
    );
  }
}
