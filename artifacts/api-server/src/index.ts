import app from "./app";
import { logger } from "./lib/logger";
import { initStripe } from "./lib/stripe-init";

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
