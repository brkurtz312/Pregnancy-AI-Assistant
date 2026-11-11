import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, funnelEventsTable } from "@workspace/db";
import { funnelEventsLimiter } from "../lib/rate-limit";

/**
 * Purchase-funnel event counting.
 *
 * POST /api/events records one anonymous funnel step so we can see where users
 * drop out before buying the pass. It works signed in or signed out (no auth
 * middleware) and stores no user id, email, device id or IP — see
 * lib/db/src/schema/funnel-events.ts.
 *
 * Anything outside the allowlist is rejected with 400 rather than stored, so a
 * typo in the app shows up as a failing request in tests instead of as a
 * mystery row in the report.
 */

export const FUNNEL_SOURCES = [
  "ai_limit",
  "home",
  "settings",
  "onboarding",
  "after_answer",
  "other",
] as const;

/** Events that must say where the paywall was reached from. */
const EVENTS_WITH_SOURCE = new Set(["paywall_viewed", "pass_cta_tapped"]);

/** Events that may carry an error code (and only these). */
const EVENTS_WITH_ERROR_CODE = new Set([
  "offerings_load_failed",
  "purchase_failed",
]);

export const FUNNEL_EVENTS = [
  "paywall_viewed",
  "pass_cta_tapped",
  "offerings_load_failed",
  "purchase_started",
  "purchase_completed",
  "purchase_cancelled",
  "purchase_failed",
  "restore_tapped",
  "signin_required_for_purchase",
  "ai_limit_reached",
] as const;

export const FUNNEL_PLATFORMS = ["ios", "android", "web"] as const;

/**
 * Error codes are machine-readable identifiers (RevenueCat's readable error
 * code such as PURCHASE_NOT_ALLOWED_ERROR, or one of the app's own like
 * identity_failed). No spaces, so a free-text message — which could contain
 * anything — cannot be smuggled in.
 */
const ERROR_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

export const FunnelEventBody = z
  .object({
    event: z.enum(FUNNEL_EVENTS),
    source: z.enum(FUNNEL_SOURCES).optional(),
    signedIn: z.boolean(),
    platform: z.enum(FUNNEL_PLATFORMS),
    appVersion: z
      .string()
      .regex(/^[0-9A-Za-z.+-]{1,32}$/, "appVersion must be a version string"),
    errorCode: z.string().regex(ERROR_CODE_PATTERN).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (EVENTS_WITH_SOURCE.has(body.event) && !body.source) {
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: `${body.event} requires a source`,
      });
    }
    if (!EVENTS_WITH_SOURCE.has(body.event) && body.source) {
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: `${body.event} does not take a source`,
      });
    }
    if (!EVENTS_WITH_ERROR_CODE.has(body.event) && body.errorCode) {
      ctx.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: `${body.event} does not take an errorCode`,
      });
    }
  });

const router: IRouter = Router();

// The limiter is attached to this one route only. Do not also add it with
// router.use() — see FUNNEL_EVENTS_LIMIT in lib/rate-limit.ts.
router.post("/events", funnelEventsLimiter, async (req, res): Promise<void> => {
  const parsed = FunnelEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid event" });
    return;
  }
  const body = parsed.data;

  try {
    await db.insert(funnelEventsTable).values({
      event: body.event,
      source: body.source ?? null,
      signedIn: body.signedIn,
      platform: body.platform,
      appVersion: body.appVersion,
      errorCode: body.errorCode ?? null,
    });
  } catch (err) {
    // Analytics must never look like an app failure. Log it and still answer
    // 204: the client drops the event either way, and a 500 here would only
    // add noise to error monitoring.
    req.log.error({ err }, "Failed to record funnel event");
  }

  res.status(204).end();
});

export default router;
