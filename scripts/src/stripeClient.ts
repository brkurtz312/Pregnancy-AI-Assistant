import Stripe from "stripe";

/**
 * Fetches Stripe credentials from the Replit connection API.
 *
 * Only used when `STRIPE_SECRET_KEY` is unset. Deleted once the move off
 * Replit is complete -- see docs/replit-exit-plan.md.
 *
 * The connection exposes `secret`, not `secret_key`. See
 * .agents/memory/stripe-connector-fields.md.
 */
async function getStripeCredentialsFromReplit(): Promise<{
  secretKey: string;
}> {
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
    items?: Array<{ settings?: { secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret) {
    throw new Error(
      "Stripe integration not connected or missing secret key. " +
        "Connect Stripe via the Integrations tab, or set STRIPE_SECRET_KEY.",
    );
  }

  return { secretKey: settings.secret };
}

/**
 * Returns Stripe credentials, preferring the environment over Replit.
 *
 * Not cached -- connector tokens rotate, so fetch fresh on every call.
 */
async function getStripeCredentials(): Promise<{ secretKey: string }> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (secretKey) {
    return { secretKey };
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
