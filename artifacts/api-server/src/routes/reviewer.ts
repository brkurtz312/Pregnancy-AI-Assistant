import { Router, type IRouter } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db, appConfigTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { reviewerSignInLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

const REVIEWER_EMAIL_DOMAIN = "pregnancy-assistant.com";
const CLERK_API = "https://api.clerk.com/v1";

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

/**
 * Creates a brand-new isolated Clerk user for this reviewer session,
 * grants them the pass in our DB, and returns a sign-in token.
 *
 * Each call to this function produces a unique account so that reviewers
 * and developers never share data with one another.
 */
async function createReviewerSession(
  clerkKey: string,
  log: {
    error: (obj: object, msg: string) => void;
    info: (obj: object, msg: string) => void;
  },
): Promise<string | null> {
  const uniqueId = randomBytes(8).toString("hex");
  const email = `reviewer+${uniqueId}@${REVIEWER_EMAIL_DOMAIN}`;

  const headers = {
    Authorization: `Bearer ${clerkKey}`,
    "Content-Type": "application/json",
  };

  // Create a fresh Clerk user for this session
  const createRes = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email_address: [email],
      password: randomBytes(24).toString("base64url"),
      skip_password_checks: true,
      email_address_verified: true,
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "(unreadable)");
    log.error(
      { status: createRes.status, body },
      "Clerk reviewer user creation failed",
    );
    return null;
  }

  const created = (await createRes.json()) as { id: string };
  const userId = created.id;
  log.info({ userId, email }, "Created isolated reviewer session in Clerk");

  // Grant the pass immediately in our DB
  await db
    .insert(usersTable)
    .values({ id: userId, email, hasPass: true })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        hasPass: true,
        passPurchasedAt: sql`COALESCE(${usersTable.passPurchasedAt}, now())`,
        updatedAt: sql`now()`,
      },
    });

  // Issue a short-lived sign-in token
  const tokenRes = await fetch(`${CLERK_API}/sign_in_tokens`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 3600 }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "(unreadable)");
    log.error(
      { status: tokenRes.status, body },
      "Clerk sign_in_tokens failed for reviewer session",
    );
    return null;
  }

  const data = (await tokenRes.json()) as { token: string };
  return data.token;
}

router.post(
  "/reviewer/sign-in-token",
  reviewerSignInLimiter,
  async (req, res) => {
    const { code } = req.body as { code?: string };

    if (!code) {
      res.status(400).json({ error: "Missing code" });
      return;
    }

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

    const clerkKey = process.env.CLERK_SECRET_KEY;
    if (!clerkKey) {
      res.status(503).json({ error: "Not configured" });
      return;
    }

    const token = await createReviewerSession(clerkKey, req.log);
    if (!token) {
      res.status(502).json({ error: "Token generation failed" });
      return;
    }

    res.json({ token });
  },
);

export default router;
