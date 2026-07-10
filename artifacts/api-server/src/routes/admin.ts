import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { runReviewerPassCheck } from "../lib/reviewer-check";

const router: IRouter = Router();

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
router.post("/admin/reviewer-check", async (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!bearerToken) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
    return;
  }

  const adminToken = resolveAdminToken();

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
