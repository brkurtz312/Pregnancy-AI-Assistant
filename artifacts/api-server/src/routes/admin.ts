import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { timingSafeEqual } from "node:crypto";
import { db, appConfigTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  runReviewerPassCheck,
  getReviewerCheckStatus,
} from "../lib/reviewer-check";

const router: IRouter = Router();

const ALERT_KEYS = [
  "alert_slack_webhook_url",
  "alert_resend_api_key",
  "alert_email",
  "alert_from_email",
] as const;

type AlertKey = (typeof ALERT_KEYS)[number];

function isAlertKey(key: string): key is AlertKey {
  return (ALERT_KEYS as readonly string[]).includes(key);
}

function maskSecret(value: string): string {
  if (value.length <= 12) return "••••••••";
  return value.slice(0, 8) + "…" + value.slice(-4);
}

function tokensMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Verifies the caller holds the admin bearer token.
 * Requires a dedicated ADMIN_CHECK_TOKEN secret — this endpoint intentionally
 * does NOT accept the reviewer access code (that code is shared with Apple in
 * App Review notes, so it must never grant admin-level access).
 *
 * Returns the raw token string, or null if none is configured.
 */
function resolveAdminToken(): string | null {
  return process.env.ADMIN_CHECK_TOKEN ?? null;
}

/**
 * Middleware that verifies the admin bearer token.
 * Responds with 401 or 503 on failure; calls next() on success.
 */
function requireAdminToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader: string = req.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!bearerToken) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
    return;
  }

  const adminToken = resolveAdminToken();

  if (!adminToken) {
    (
      req as Request & { log: { error: (...args: unknown[]) => void } }
    ).log.error("Admin endpoint called but no token is configured");
    res.status(503).json({ error: "Admin check not configured" });
    return;
  }

  if (!tokensMatch(bearerToken, adminToken)) {
    (req as Request & { log: { warn: (...args: unknown[]) => void } }).log.warn(
      "Admin endpoint rejected — invalid token",
    );
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  next();
}

/**
 * POST /api/admin/reviewer-check
 *
 * Verifies the reviewer sign-in system is fully operational against the
 * database and Clerk instance this server is connected to.
 *
 * Checks (in order):
 *   1. A reviewer access code is configured (app_config or env)
 *   2. CLERK_SECRET_KEY is present
 *   3. The Clerk API is reachable with that key
 *
 * Each reviewer sign-in creates a unique isolated Clerk account, so there is
 * no single "demo user" to verify — a passing system check means any reviewer
 * who enters the code will get a fresh working account.
 *
 * Auth: Bearer token in the Authorization header, matched against the
 * dedicated ADMIN_CHECK_TOKEN env var. Does NOT accept REVIEWER_ACCESS_CODE
 * or the app_config reviewer_access_code row — that code is distributed to
 * Apple in App Review notes and must never grant admin-level access.
 *
 * Responses:
 *   200 { ok: true,  timestamp }                      — system is healthy
 *   200 { ok: false, reason, timestamp }              — system check failed
 *   401  — missing or invalid token
 *   503  — no admin token configured on the server
 */
router.post("/admin/reviewer-check", requireAdminToken, async (req, res) => {
  try {
    const result = await runReviewerPassCheck();
    res.status(200).json(result);
  } catch (err) {
    req.log.error({ err }, "reviewer-check crashed");
    res.status(500).json({ error: "Check failed — see server logs" });
  }
});

/**
 * GET /api/admin/reviewer-check/status
 *
 * Returns the most recent result from the background reviewer pass health
 * check scheduler — without requiring a log search.
 *
 * Fields:
 *   lastRunAt    — ISO-8601 timestamp of the most recent run, or null if the
 *                  scheduler has not yet fired since the server started.
 *   lastResult   — "ok" | "fail" | null
 *   lastReason   — reason code when lastResult is "fail", otherwise null
 *
 * Auth: Bearer token matched against ADMIN_CHECK_TOKEN env var.
 *
 * Responses:
 *   200 { lastRunAt, lastResult, lastReason }
 *   401  — missing or invalid token
 *   503  — no admin token configured on the server
 */
router.get("/admin/reviewer-check/status", requireAdminToken, async (req, res) => {
  try {
    const status = await getReviewerCheckStatus();
    res.status(200).json(status);
  } catch (err) {
    req.log.error({ err }, "reviewer-check status read failed");
    res.status(500).json({ error: "Failed to read reviewer check status" });
  }
});

/**
 * GET /api/admin/alert-config
 *
 * Returns the current alert channel configuration from app_config.
 * Sensitive values (Resend API key, Slack webhook URL) are masked in the
 * response so callers can confirm a value is set without reading the secret.
 *
 * Each field is null when no DB row exists for that key (the server will
 * fall back to the corresponding env var at alert-send time).
 *
 * Auth: Bearer token matched against ADMIN_CHECK_TOKEN env var.
 *
 * Responses:
 *   200 { alertSlackWebhookUrl, alertResendApiKey, alertEmail, alertFromEmail }
 *   401  — missing or invalid token
 *   503  — no admin token configured on the server
 */
router.get("/admin/alert-config", requireAdminToken, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(appConfigTable)
      .where(inArray(appConfigTable.key, [...ALERT_KEYS]));

    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    const slackRaw = byKey.get("alert_slack_webhook_url") ?? null;
    const resendRaw = byKey.get("alert_resend_api_key") ?? null;

    res.status(200).json({
      alertSlackWebhookUrl: slackRaw !== null ? maskSecret(slackRaw) : null,
      alertResendApiKey: resendRaw !== null ? maskSecret(resendRaw) : null,
      alertEmail: byKey.get("alert_email") ?? null,
      alertFromEmail: byKey.get("alert_from_email") ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "alert-config GET failed");
    res.status(500).json({ error: "Failed to read alert config" });
  }
});

const UpdateAlertConfigBody = z.object({
  alertSlackWebhookUrl: z.string().max(2048).nullable().optional(),
  alertResendApiKey: z.string().max(500).nullable().optional(),
  alertEmail: z.email().max(320).nullable().optional(),
  alertFromEmail: z.email().max(320).nullable().optional(),
});

const KEY_MAP: Record<keyof z.infer<typeof UpdateAlertConfigBody>, AlertKey> = {
  alertSlackWebhookUrl: "alert_slack_webhook_url",
  alertResendApiKey: "alert_resend_api_key",
  alertEmail: "alert_email",
  alertFromEmail: "alert_from_email",
};

/**
 * PUT /api/admin/alert-config
 *
 * Writes one or more alert channel settings to app_config.
 * Pass null for a field to clear that key (server falls back to the env var).
 * Omit a field entirely to leave it unchanged.
 *
 * Auth: Bearer token matched against ADMIN_CHECK_TOKEN env var.
 *
 * Responses:
 *   200 { updated: string[] }  — list of db keys that were written or cleared
 *   400  — invalid request body
 *   401  — missing or invalid token
 *   503  — no admin token configured on the server
 */
router.put("/admin/alert-config", requireAdminToken, async (req, res) => {
  const parsed = UpdateAlertConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }

  const body = parsed.data;
  const updated: string[] = [];

  try {
    for (const [field, dbKey] of Object.entries(KEY_MAP) as Array<
      [keyof typeof KEY_MAP, AlertKey]
    >) {
      if (!(field in body)) continue;
      const value = body[field];
      if (value === null) {
        await db.delete(appConfigTable).where(eq(appConfigTable.key, dbKey));
        req.log.info({ key: dbKey }, "alert-config key cleared");
      } else if (value !== undefined) {
        await db
          .insert(appConfigTable)
          .values({ key: dbKey, value })
          .onConflictDoUpdate({
            target: appConfigTable.key,
            set: { value, updatedAt: sql`now()` },
          });
        req.log.info({ key: dbKey }, "alert-config key updated");
      }
      updated.push(dbKey);
    }

    res.status(200).json({ updated });
  } catch (err) {
    req.log.error({ err }, "alert-config PUT failed");
    res.status(500).json({ error: "Failed to update alert config" });
  }
});

// Keep isAlertKey available for future use
export { isAlertKey };
export default router;
