import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  CreateCheckoutBody,
  ConfirmCheckoutBody,
  RedeemCodeBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";
import {
  getOrCreateUser,
  setStripeCustomerId,
  grantPass,
} from "../../lib/users";
import { userHasPass } from "../../lib/entitlement";
import { getUncachableStripeClient } from "../../lib/stripeClient";
import { currentPeriodKey, getUsage } from "../../lib/ai-usage";
import { FREE_WEEKLY_LIMIT, PASS_KIND } from "../../lib/billing-config";
import { redeemCodeLimiter } from "../../lib/rate-limit";

const router: IRouter = Router();

async function findPassPriceId(): Promise<string | undefined> {
  const result = await db.execute(sql`
    SELECT pr.id AS price_id
    FROM stripe.prices pr
    JOIN stripe.products p ON pr.product = p.id
    WHERE p.active = true
      AND pr.active = true
      AND p.metadata->>'kind' = ${PASS_KIND}
    LIMIT 1
  `);
  const row = result.rows[0] as { price_id?: string } | undefined;
  return row?.price_id;
}

async function passStatusPayload(userId: string) {
  const hasPass = await userHasPass(userId);
  const freeUsed = await getUsage(`user:${userId}`, currentPeriodKey());
  return { hasPass, freeUsed, freeLimit: FREE_WEEKLY_LIMIT };
}

router.get(
  "/billing/pass-status",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthedRequest).userId!;
    await getOrCreateUser(userId);
    res.json(await passStatusPayload(userId));
  },
);

router.post(
  "/billing/checkout",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthedRequest).userId!;
    const parsed = CreateCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = await getOrCreateUser(userId);

    let stripe;
    try {
      stripe = await getUncachableStripeClient();
    } catch (err) {
      req.log.error({ err }, "Stripe client unavailable");
      res.status(503).json({ error: "Payments are not available right now." });
      return;
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId },
      });
      await setStripeCustomerId(userId, customer.id);
      customerId = customer.id;
    }

    const priceId = await findPassPriceId();
    if (!priceId) {
      req.log.error(
        "Full Pregnancy Pass price not found in synced Stripe data",
      );
      res.status(503).json({ error: "The pass is not available right now." });
      return;
    }

    // Build the return URL on our own origin; only the path comes from the
    // client to avoid trusting a client-supplied origin (open-redirect).
    const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
    const proto = (
      (req.get("x-forwarded-proto") ?? req.protocol) ||
      "https"
    ).split(",")[0];
    let path = "/";
    try {
      path = new URL(parsed.data.returnUrl).pathname || "/";
    } catch {
      // keep default "/"
    }
    const base = `${proto}://${host}${path}`;
    const sep = base.includes("?") ? "&" : "?";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}${sep}checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${sep}checkout=cancel`,
      metadata: { userId },
      payment_intent_data: { metadata: { userId } },
    });

    if (!session.url) {
      res
        .status(502)
        .json({ error: "Could not start checkout. Please try again." });
      return;
    }
    res.json({ url: session.url });
  },
);

router.post(
  "/billing/confirm",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthedRequest).userId!;
    const parsed = ConfirmCheckoutBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = await getOrCreateUser(userId);
    const sessionId = parsed.data.sessionId;

    if (sessionId) {
      try {
        const stripe = await getUncachableStripeClient();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const belongs =
          session.metadata?.userId === userId ||
          (typeof session.customer === "string" &&
            !!user.stripeCustomerId &&
            session.customer === user.stripeCustomerId);
        if (belongs && session.payment_status === "paid") {
          await grantPass(userId);
        }
      } catch (err) {
        req.log.error({ err }, "Failed to confirm checkout session");
      }
    }

    res.json(await passStatusPayload(userId));
  },
);

// Compares the submitted code against the secret in constant time for
// equal-length inputs. A length mismatch returns early — the secret's length is
// not itself sensitive, and the per-IP rate limiter is what blocks guessing.
function codesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.post(
  "/billing/redeem-code",
  redeemCodeLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthedRequest).userId!;
    const parsed = RedeemCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const expected = process.env.DEV_ACCESS_CODE;
    if (!expected) {
      req.log.error("DEV_ACCESS_CODE is not configured");
      res
        .status(503)
        .json({ error: "Code redemption is not available right now." });
      return;
    }

    await getOrCreateUser(userId);

    if (!codesMatch(parsed.data.code.trim(), expected)) {
      res
        .status(403)
        .json({ error: "That access code isn't valid.", code: "INVALID_CODE" });
      return;
    }

    await grantPass(userId);
    req.log.info({ userId }, "Pass granted via developer access code");
    res.json(await passStatusPayload(userId));
  },
);

export default router;
