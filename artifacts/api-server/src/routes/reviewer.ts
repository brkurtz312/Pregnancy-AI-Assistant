import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const FALLBACK_DEMO_USER_ID = "user_3FbMbELUGoggA6nXU8lht1GWJOJ";

/**
 * Looks up a value from app_config. Returns null on any error (including
 * missing table, network issues, or missing row) so callers can fall through
 * to env-var / hardcoded fallbacks without breaking the endpoint.
 */
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

function codesMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

router.post("/reviewer/sign-in-token", async (req, res) => {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  // Prefer DB-stored code so it can be rotated without redeployment.
  // Falls back gracefully on any DB failure or missing row (e.g. before the
  // table is migrated, or before the first rotate-reviewer-code run).
  // Checks REVIEWER_ACCESS_CODE first (set by the rotation runbook), then
  // DEV_ACCESS_CODE for backwards compatibility with existing deployments.
  const dbCode = await getConfig("reviewer_access_code");
  const accessCode =
    dbCode ?? process.env.REVIEWER_ACCESS_CODE ?? process.env.DEV_ACCESS_CODE;

  if (!accessCode) {
    res.status(503).json({ error: "Reviewer access not configured" });
    return;
  }

  if (!codesMatch(code, accessCode)) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  // Prefer DB-stored demo user id so it updates automatically when the
  // demo account is recreated via the create-review-account script.
  // Falls back gracefully to env var then hardcoded ID.
  const dbUserId = await getConfig("reviewer_demo_user_id");
  const demoUserId =
    dbUserId ?? process.env.REVIEWER_DEMO_USER_ID ?? FALLBACK_DEMO_USER_ID;

  const clerkKey = process.env.CLERK_SECRET_KEY;
  if (!clerkKey) {
    res.status(503).json({ error: "Not configured" });
    return;
  }

  const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clerkKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: demoUserId, expires_in_seconds: 3600 }),
  });

  if (!tokenRes.ok) {
    res.status(502).json({ error: "Token generation failed" });
    return;
  }

  const data = (await tokenRes.json()) as { token: string };
  res.json({ token: data.token });
});

export default router;
