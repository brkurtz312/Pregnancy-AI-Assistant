/**
 * Whether the billing credentials will actually work where this server is
 * running — answered at boot, not at the first payment.
 *
 * Stripe and RevenueCat both read an environment variable and fall back to a
 * Replit connector when it is unset. That fallback is invisible: on Replit it
 * quietly works, and off Replit it quietly does not, until someone pays. The
 * Clerk keys had the same shape and cost a day.
 */

/**
 * The Replit connector needs a hostname and an identity token, both injected
 * by Replit. Off Replit neither exists, so every fallback path is dead — which
 * is exactly when a missing environment variable stops being harmless.
 */
export function replitConnectorAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.REPLIT_CONNECTORS_HOSTNAME &&
    (env.REPL_IDENTITY || env.WEB_REPL_RENEWAL),
  );
}

export type CredentialSource = "env" | "replit-connector" | "missing";

export interface BillingCredentialReport {
  /** Apple in-app purchases reach the server through this one. */
  revenueCatKey: CredentialSource;
  /** Card payments on the web. */
  stripeSecretKey: CredentialSource;
  /**
   * Verifies inbound Stripe webhooks. Its own case: stripe-replit-sync falls
   * back to a row in the `stripe._managed_webhooks` table, which lives in a
   * schema the database migration deliberately does not copy. So "unset" is
   * survivable on the database that has that row, and fatal on one that does
   * not — and nothing distinguishes them from the environment alone.
   */
  stripeWebhookSecret: CredentialSource;
  onReplit: boolean;
}

function sourceOf(
  value: string | undefined,
  connector: boolean,
): CredentialSource {
  if (value) return "env";
  return connector ? "replit-connector" : "missing";
}

export function billingCredentialReport(
  env: NodeJS.ProcessEnv = process.env,
): BillingCredentialReport {
  const connector = replitConnectorAvailable(env);
  return {
    revenueCatKey: sourceOf(env.REVENUECAT_SECRET_API_KEY, connector),
    stripeSecretKey: sourceOf(env.STRIPE_SECRET_KEY, connector),
    // The webhook secret has no connector fallback at all: the Replit Stripe
    // connection does not expose one (see .agents/memory/stripe-connector-fields).
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ? "env" : "missing",
    onReplit: connector,
  };
}

export interface BillingProblem {
  severity: "error" | "warn";
  message: string;
}

/**
 * What is actually broken, in the words of the consequence rather than the
 * variable name. A deploy log that says "REVENUECAT_SECRET_API_KEY is unset"
 * is a fact; one that says App Store purchases will not grant a pass is a
 * reason to stop.
 */
export function billingProblems(
  report: BillingCredentialReport,
): BillingProblem[] {
  const problems: BillingProblem[] = [];

  if (report.revenueCatKey === "missing") {
    problems.push({
      severity: "error",
      message:
        "REVENUECAT_SECRET_API_KEY is unset and the Replit connector is unavailable. " +
        "Every App Store purchase will fail to grant a pass: /billing/revenuecat/reconcile " +
        "returns 503 and the customer is charged by Apple with nothing to show for it.",
    });
  }

  if (report.stripeSecretKey === "missing") {
    problems.push({
      severity: "error",
      message:
        "STRIPE_SECRET_KEY is unset and the Replit connector is unavailable. " +
        "Web checkout will fail.",
    });
  }

  if (report.stripeWebhookSecret === "missing") {
    problems.push({
      // A warning rather than an error: stripe-replit-sync can still read the
      // secret from stripe._managed_webhooks, so this is fatal only on a
      // database without that row. Saying which would mean querying at boot.
      severity: "warn",
      message:
        "STRIPE_WEBHOOK_SECRET is unset. Signature verification falls back to the " +
        "stripe._managed_webhooks table, which only exists on a database Replit " +
        "provisioned the webhook against. On any other database every Stripe webhook " +
        "is rejected and paid checkouts never grant a pass.",
    });
  }

  return problems;
}
