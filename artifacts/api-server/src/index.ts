import {
  isProductionFromSecretKey,
  parsePublishableKey,
} from "@clerk/shared/keys";
import app from "./app";
import { logger } from "./lib/logger";
import { initStripe } from "./lib/stripe-init";
import { startReviewerCheckScheduler } from "./lib/reviewer-check-scheduler";
import { startAccountDeletionWorker } from "./lib/account-deletion";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// The database pool is now created on first use rather than on import (see
// @workspace/db), so a missing DATABASE_URL would otherwise surface as a
// failed request rather than a failed boot. Check it here to keep a
// misconfigured deploy loud and immediate, as it was before.
if (!process.env["DATABASE_URL"]) {
  throw new Error(
    "DATABASE_URL environment variable is required but was not provided.",
  );
}

// ── Clerk instance ───────────────────────────────────────────────────────────
// clerkMiddleware() picks its instance from CLERK_PUBLISHABLE_KEY and
// CLERK_SECRET_KEY. Two deploy-time mistakes — a missing publishable key, or a
// pair naming different instances — make Clerk reject every session token, so
// the API answers 401 to a caller holding a perfectly good session. Neither
// leaves a trace: Clerk reports only "unauthenticated", and a 401 is
// indistinguishable from a genuinely signed-out request. Both cost hours to
// find from the outside, so say which instance this process resolved, in the
// same breath as the PORT and DATABASE_URL checks above.
const clerkPublishableKey = process.env["CLERK_PUBLISHABLE_KEY"];
const clerkSecretKey = process.env["CLERK_SECRET_KEY"];
const clerkPublishable = parsePublishableKey(clerkPublishableKey ?? "");
const clerkSecretInstance = clerkSecretKey
  ? isProductionFromSecretKey(clerkSecretKey)
    ? "production"
    : "development"
  : null;

logger.info(
  {
    frontendApi: clerkPublishable?.frontendApi ?? null,
    publishableKeyInstance: clerkPublishable?.instanceType ?? null,
    secretKeyInstance: clerkSecretInstance,
  },
  "Clerk instance",
);

if (!clerkPublishableKey || !clerkSecretKey) {
  logger.error(
    {
      hasPublishableKey: Boolean(clerkPublishableKey),
      hasSecretKey: Boolean(clerkSecretKey),
    },
    "Clerk keys are incomplete; every authenticated request will return 401",
  );
} else if (!clerkPublishable) {
  logger.error(
    "CLERK_PUBLISHABLE_KEY is not a valid publishable key; every authenticated request will return 401",
  );
} else if (clerkPublishable.instanceType !== clerkSecretInstance) {
  logger.error(
    {
      publishableKeyInstance: clerkPublishable.instanceType,
      secretKeyInstance: clerkSecretInstance,
      frontendApi: clerkPublishable.frontendApi,
    },
    "Clerk publishable and secret keys name different instances; every authenticated request will return 401",
  );
}

// Best-effort: set up the Stripe schema/webhook/sync. Non-fatal if Stripe is
// not yet connected so the rest of the API still boots.
await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// ── Reviewer pass health check scheduler ─────────────────────────────────────
// Runs the Apple reviewer demo account pass check on a periodic schedule so
// that a revoked or missing pass is detected and auto-healed in production.
// Alerts are dispatched via Slack / Resend when a failure is detected.
// Set REVIEWER_CHECK_INTERVAL_MS=0 to disable (e.g. in unit-test environments).
startReviewerCheckScheduler();
startAccountDeletionWorker();
