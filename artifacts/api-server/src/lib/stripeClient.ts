import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

type StripeCredentials = {
  secretKey: string;
  webhookSecret?: string;
};

/**
 * Fetches Stripe credentials from the Replit connection API.
 *
 * Only used when `STRIPE_SECRET_KEY` is unset, which today means production.
 * Deleted once the move off Replit is complete -- see docs/replit-exit-plan.md.
 *
 * The connection exposes `secret`, not `secret_key`, and has no
 * `webhook_secret` at all: Replit's managed webhook provisions and stores its
 * own signing secret. See .agents/memory/stripe-connector-fields.md.
 */
async function getStripeCredentialsFromReplit(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY, or run on Replit " +
        "with the Stripe integration connected via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`,
    );
  }

  const data = (await resp.json()) as {
    items?: Array<{ settings?: { secret?: string; webhook_secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret) {
    throw new Error(
      "Stripe integration not connected or missing secret key. " +
        "Connect Stripe via the Integrations tab, or set STRIPE_SECRET_KEY.",
    );
  }

  return {
    secretKey: settings.secret,
    webhookSecret: settings.webhook_secret,
  };
}

/**
 * Returns Stripe credentials, preferring the environment over Replit.
 *
 * `STRIPE_SECRET_KEY` is what remains once Replit is gone; the connector is a
 * fallback until then. Not cached -- connector tokens rotate, so fetch fresh
 * on every call.
 *
 * `STRIPE_WEBHOOK_SECRET` is optional on Replit, whose managed webhook holds
 * its own signing secret. **A self-hosted webhook endpoint must set it**, or
 * signature verification has nothing to verify against and no payment event
 * is ever accepted.
 */
async function getStripeCredentials(): Promise<StripeCredentials> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (secretKey) {
    return { secretKey, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET };
  }
  return getStripeCredentialsFromReplit();
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
