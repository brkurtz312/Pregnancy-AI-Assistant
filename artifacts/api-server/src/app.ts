import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { getStripeSync, getUncachableStripeClient } from "./lib/stripeClient";
import {
  getUser,
  grantPass,
  revokePassByStripeCustomerId,
  setStripeCustomerId,
} from "./lib/users";

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
          data: {
            object: {
              customer?: string | { id?: string } | null;
              metadata?: { userId?: string };
              payment_status?: string;
              status?: string;
            };
          };
        };
        const obj = event.data.object;
        const customerId =
          typeof obj.customer === "string"
            ? obj.customer
            : (obj.customer?.id ?? undefined);

        const REVOCATION_EVENTS = new Set([
          "charge.refunded",
          "payment_intent.payment_failed",
        ]);
        if (REVOCATION_EVENTS.has(event.type) && customerId) {
          await revokePassByStripeCustomerId(customerId);
        }

        // Grant path: a paid checkout (or succeeded payment intent) carries our
        // metadata.userId. Link the Stripe customer to the user right here so a
        // webhook that arrives before /billing/checkout finished persisting the
        // customer ID (or after a failed save) still results in a granted pass.
        const isPaidCheckout =
          event.type === "checkout.session.completed" &&
          obj.payment_status === "paid";
        const isSucceededIntent =
          event.type === "payment_intent.succeeded" ||
          (event.type === "payment_intent.created" &&
            obj.status === "succeeded");
        if (isPaidCheckout || isSucceededIntent) {
          const userId = obj.metadata?.userId;
          if (userId && customerId) {
            const user = await getUser(userId);
            if (!user) {
              req.log.warn(
                { userId, customerId },
                "Paid webhook referenced unknown user; pass will be granted on first entitlement check after sign-in",
              );
            } else if (user.stripeCustomerId === customerId) {
              // Already linked to this exact customer — safe to grant directly.
              await grantPass(userId);
            } else if (user.stripeCustomerId) {
              // Linked to a DIFFERENT customer: never re-link or grant based on
              // event metadata alone.
              req.log.warn(
                { userId, customerId, linked: user.stripeCustomerId },
                "Paid webhook customer does not match the user's linked Stripe customer; skipping grant",
              );
            } else {
              // User not linked yet (webhook raced /billing/checkout's save, or
              // the save failed). Metadata alone must not authorize a permanent
              // customer↔user association — confirm against the Stripe customer
              // record, which we stamp with metadata.userId at creation.
              try {
                const stripe = await getUncachableStripeClient();
                const customer = await stripe.customers.retrieve(customerId);
                if (!customer.deleted && customer.metadata?.userId === userId) {
                  await setStripeCustomerId(userId, customerId);
                  await grantPass(userId);
                } else {
                  req.log.warn(
                    { userId, customerId },
                    "Stripe customer metadata does not confirm this user; skipping link/grant",
                  );
                }
              } catch (verifyErr) {
                req.log.error(
                  { err: verifyErr, userId, customerId },
                  "Could not verify Stripe customer link (network/rate-limit); granting pass from HMAC-authenticated webhook",
                );
                // The webhook body is already HMAC-verified — the payment is
                // authenticated. Customer retrieval failed (transient network
                // error, rate limit), but we must not silently lose the pass.
                // Grant without persisting the customer↔user link; the link
                // will be established on the user's next sign-in via the
                // /billing/checkout flow or a successful webhook retry.
                try {
                  await grantPass(userId);
                } catch (grantErr) {
                  req.log.error(
                    { err: grantErr, userId, customerId },
                    "Fallback grantPass also failed; entitlement backfill will retry on next sign-in",
                  );
                }
              }
            }
          }
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

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains (or the proxy domain in prod).
// Falls back to CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
// getClerkProxyHost is shared with clerkProxyMiddleware so both halves agree on
// which hostname is canonical.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
