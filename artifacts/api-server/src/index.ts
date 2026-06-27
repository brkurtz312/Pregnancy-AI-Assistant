import app from "./app";
import { logger } from "./lib/logger";
import { initStripe } from "./lib/stripe-init";
import { runReviewerPassCheck } from "./lib/reviewer-check";

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
// that a revoked or missing pass is detected and auto-healed in production
// (where this server connects to the production DATABASE_URL). The interval is
// configurable; defaults to every hour. Set REVIEWER_CHECK_INTERVAL_MS=0 to
// disable the background scheduler (e.g. in unit-test environments).
const REVIEWER_CHECK_INTERVAL_MS = (() => {
  const raw = process.env["REVIEWER_CHECK_INTERVAL_MS"];
  if (raw === undefined) return 60 * 60 * 1000; // 1 hour default
  const n = Number(raw);
  return Number.isNaN(n) || n < 0 ? 60 * 60 * 1000 : n;
})();

if (REVIEWER_CHECK_INTERVAL_MS > 0) {
  // Run once shortly after startup, then on the configured interval.
  const runCheck = async () => {
    try {
      const result = await runReviewerPassCheck();
      if (!result.ok) {
        logger.warn(
          { reason: result.reason, healed: result.healed },
          "Scheduled reviewer pass check failed (auto-heal attempted)",
        );
      }
    } catch (err) {
      logger.error({ err }, "Scheduled reviewer pass check crashed");
    }
  };

  // Initial run: 30 s after boot so the server is fully ready.
  setTimeout(() => void runCheck(), 30_000);
  // Recurring run on the configured interval.
  setInterval(() => void runCheck(), REVIEWER_CHECK_INTERVAL_MS);

  logger.info(
    { intervalMs: REVIEWER_CHECK_INTERVAL_MS },
    "Reviewer pass health check scheduler started",
  );
}
