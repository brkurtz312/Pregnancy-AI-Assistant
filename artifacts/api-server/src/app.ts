import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { getStripeSync } from "./lib/stripeClient";
import { revokePassByStripeCustomerId } from "./lib/users";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk Frontend API proxy — streams raw bytes, so it must run before the body
// parsers below.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Stripe webhook — needs the raw request body for signature verification, so it
// must be registered before express.json() parses the body.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const signature = req.headers["stripe-signature"];
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      req.log.error("Stripe webhook body was parsed before raw handler");
      res.status(500).json({ error: "Webhook processing error" });
      return;
    }
    try {
      const sync = await getStripeSync();
      await sync.processWebhook(req.body, sig);

      // processWebhook already verified the HMAC signature, so it is safe to
      // parse the raw body. For refund and payment-failure events we must
      // explicitly clear the denormalized hasPass flag — StripeSync updates the
      // stripe.payment_intents table, but the fast-path in userHasPass reads
      // hasPass directly and would keep returning true for a refunded user.
      try {
        const event = JSON.parse(req.body.toString("utf8")) as {
          type: string;
          data: { object: { customer?: string } };
        };
        const REVOCATION_EVENTS = new Set([
          "charge.refunded",
          "payment_intent.payment_failed",
        ]);
        if (REVOCATION_EVENTS.has(event.type) && event.data.object.customer) {
          await revokePassByStripeCustomerId(event.data.object.customer);
        }
      } catch {
        // Non-fatal: the StripeSync tables are still updated correctly.
        req.log.error("Failed to revoke pass after refund/failure webhook");
      }

      res.status(200).json({ received: true });
    } catch (err) {
      req.log.error({ err }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(clerkMiddleware());

app.use("/api", router);

export default app;
