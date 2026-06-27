import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runReviewerPassCheck } from "../lib/reviewer-check";

const router: IRouter = Router();

async function getConfig(key: string): Promise<string | null> {
  try {
    const [row] = await db
      .select()
      .from(appConfigTable)
      .where(eq(appConfigTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
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
 * Accepts the token from:
 *   1. ADMIN_CHECK_TOKEN env var (dedicated secret — preferred)
 *   2. REVIEWER_ACCESS_CODE env var / app_config DB row (reuses an already-deployed secret)
 *
 * Returns the raw token string, or null if none is configured.
 */
async function resolveAdminToken(): Promise<string | null> {
  if (process.env.ADMIN_CHECK_TOKEN) return process.env.ADMIN_CHECK_TOKEN;
  const dbCode = await getConfig("reviewer_access_code");
  return dbCode ?? process.env.REVIEWER_ACCESS_CODE ?? null;
}

/**
 * POST /api/admin/reviewer-check
 *
 * Runs the Apple reviewer demo account pass health check against the database
 * this server is connected to. In production that is the production DATABASE_URL,
 * so this endpoint is the canonical way to verify (and auto-heal) the reviewer
 * pass in the live environment.
 *
 * Auth: Bearer token in the Authorization header.
 *   - Use ADMIN_CHECK_TOKEN env var for a dedicated secret (recommended).
 *   - Falls back to REVIEWER_ACCESS_CODE / app_config reviewer_access_code.
 *
 * Responses:
 *   200 { ok: true,  demoUserId, healed: false, timestamp }  — pass is healthy
 *   200 { ok: false, demoUserId, reason, healed: true, timestamp } — was broken, auto-healed
 *   401  — missing or invalid token
 *   503  — no admin token configured on the server
 */
router.post("/admin/reviewer-check", async (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!bearerToken) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
    return;
  }

  const adminToken = await resolveAdminToken();

  if (!adminToken) {
    req.log.error("Admin reviewer-check called but no token is configured");
    res.status(503).json({ error: "Admin check not configured" });
    return;
  }

  if (!tokensMatch(bearerToken, adminToken)) {
    req.log.warn("Admin reviewer-check rejected — invalid token");
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    const result = await runReviewerPassCheck();
    res.status(200).json(result);
  } catch (err) {
    req.log.error({ err }, "reviewer-check crashed");
    res.status(500).json({ error: "Check failed — see server logs" });
  }
});

export default router;
