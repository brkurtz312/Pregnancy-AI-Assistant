import {
  isProductionFromSecretKey,
  parsePublishableKey,
} from "@clerk/shared/keys";
import app from "./app";
import {
  clerkKeySources,
  clerkPublishableKey,
  clerkSecretKey,
} from "./lib/clerk-env";
import { logger } from "./lib/logger";
import { initStripe } from "./lib/stripe-init";
import { billingCredentialReport, billingProblems } from "./lib/billing-env";
import { aiCredentialReport, aiProblems } from "./lib/ai-env";
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
const publishableKey = clerkPublishableKey();
const secretKey = clerkSecretKey();
const clerkPublishable = parsePublishableKey(publishableKey ?? "");
const clerkSecretInstance = secretKey
  ? isProductionFromSecretKey(secretKey)
    ? "production"
    : "development"
  : null;

logger.info(
  {
    frontendApi: clerkPublishable?.frontendApi ?? null,
    publishableKeyInstance: clerkPublishable?.instanceType ?? null,
    secretKeyInstance: clerkSecretInstance,
    ...clerkKeySources(),
  },
  "Clerk instance",
);

if (!publishableKey || !secretKey) {
  logger.error(
    {
      hasPublishableKey: Boolean(publishableKey),
      hasSecretKey: Boolean(secretKey),
    },
    "Clerk keys are incomplete; every authenticated request will return 401",
  );
} else if (!clerkPublishable) {
  logger.error(
    "The Clerk publishable key is not valid; every authenticated request will return 401",
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

// Which billing credentials this deployment will actually use, and what is
// broken if any of them resolve to nothing. Both Stripe and RevenueCat fall
// back to a Replit connector that does not exist off Replit, and neither
// failure surfaces until someone tries to pay.
const billing = billingCredentialReport();
logger.info(billing, "Billing credentials");
for (const problem of billingProblems(billing)) {
  if (problem.severity === "error") logger.error(problem.message);
  else logger.warn(problem.message);
}

// The same question for the AI credentials, which Replit injects and no other
// host does. A wrong value here breaks the assistant and the scribe while
// every other route keeps working, so nothing else in the log would say.
const ai = aiCredentialReport();
logger.info(ai, "AI credentials");
for (const problem of aiProblems(ai)) {
  if (problem.severity === "error") logger.error(problem.message);
  else logger.warn(problem.message);
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
