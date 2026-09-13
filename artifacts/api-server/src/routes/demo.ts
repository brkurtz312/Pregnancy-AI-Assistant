import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { demoSessionLimiter } from "../lib/rate-limit";
import { getConfig } from "../lib/app-config";
import {
  isDemoModeEnabled,
  issueDemoToken,
  newDemoSubject,
  DEMO_TOKEN_TTL_SECONDS,
} from "../lib/demo-token";

const router: IRouter = Router();

function codesMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * GET /api/demo/available
 *
 * Lets the client decide whether to show the demo entry point at all, without
 * revealing the code. Returns { available: false } once DEMO_SESSION_SECRET is
 * unset after App Review approval.
 */
router.get("/demo/available", (_req, res) => {
  res.json({ available: isDemoModeEnabled() });
});

/**
 * POST /api/demo/session  { code }
 *
 * Exchanges the review access code for a short-lived demo session token.
 * Deliberately does NOT touch Clerk: the whole point is that Clerk's
 * instance-wide MFA requirement makes password sign-in impossible for a
 * reviewer who cannot read the demo mailbox.
 *
 * Every call mints a *fresh* isolated identity, so concurrent reviewers (and
 * your own testing) never see each other's data.
 */
router.post("/demo/session", demoSessionLimiter, async (req, res) => {
  if (!isDemoModeEnabled()) {
    res.status(503).json({ error: "Demo access is not available." });
    return;
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  const accessCode =
    (await getConfig("demo_access_code")) ?? process.env.DEMO_ACCESS_CODE;
  if (!accessCode) {
    res.status(503).json({ error: "Demo access is not configured." });
    return;
  }

  if (!codesMatch(code.trim(), accessCode)) {
    req.log.warn({}, "Demo session rejected: bad code");
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const sub = newDemoSubject();

  // Provision the identity with the Full Pregnancy Pass so the reviewer sees
  // every paid feature. `id` is the demo subject, never a Clerk user id.
  await db
    .insert(usersTable)
    .values({ id: sub, email: null, hasPass: true })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        hasPass: true,
        passPurchasedAt: sql`COALESCE(${usersTable.passPurchasedAt}, now())`,
        updatedAt: sql`now()`,
      },
    });

  const token = issueDemoToken(sub);
  req.log.info({ sub }, "Issued demo session for App Review");

  res.json({ token, expiresInSeconds: DEMO_TOKEN_TTL_SECONDS });
});

export default router;
