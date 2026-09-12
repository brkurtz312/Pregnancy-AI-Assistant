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
