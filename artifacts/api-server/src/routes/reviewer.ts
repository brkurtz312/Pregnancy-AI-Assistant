import { Router, type IRouter } from "express";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { db, appConfigTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { reviewerSignInLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

const DEMO_EMAIL = "appreview@pregnancy-assistant.com";
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

async function upsertConfig(key: string, value: string): Promise<void> {
  try {
    await db
      .insert(appConfigTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appConfigTable.key,
        set: { value, updatedAt: sql`now()` },
      });
  } catch {
    // non-fatal — best effort
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

function generateTempPassword(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Finds or creates the reviewer demo user in Clerk, resets their password to a
 * fresh random value, grants them the pass in our DB, and returns their email
 * + the new password so the mobile app can sign in via the standard
 * email/password flow — bypassing sign-in token compatibility issues across
 * Clerk SDK versions.
 */
async function ensureDemoUserAndResetPassword(
  clerkKey: string,
  log: {
    error: (obj: object, msg: string) => void;
    info: (obj: object, msg: string) => void;
  },
): Promise<{ userId: string; email: string; password: string } | null> {
  const headers = {
    Authorization: `Bearer ${clerkKey}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Find or create the demo user by email
    const searchRes = await fetch(
      `${CLERK_API}/users?email_address=${encodeURIComponent(DEMO_EMAIL)}&limit=1`,
      { headers },
    );
    if (!searchRes.ok) {
      log.error({ status: searchRes.status }, "Clerk user search failed");
      return null;
    }
    const found = (await searchRes.json()) as Array<{ id: string }>;

    const tempPassword = generateTempPassword();
    let userId: string;

    if (found.length > 0) {
      userId = found[0].id;
      log.info({ userId }, "Found existing reviewer demo user");
      // Reset password so the returned credentials are always fresh
      const patchRes = await fetch(`${CLERK_API}/users/${userId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          password: tempPassword,
          skip_password_checks: true,
        }),
      });
      if (!patchRes.ok) {
        log.error({ status: patchRes.status }, "Clerk password reset failed");
        return null;
      }
    } else {
      log.info({}, "Reviewer demo user not found — creating");
      const createRes = await fetch(`${CLERK_API}/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email_address: [DEMO_EMAIL],
          password: tempPassword,
          skip_password_checks: true,
          email_address_verified: true,
        }),
      });
      if (!createRes.ok) {
        log.error({ status: createRes.status }, "Clerk user creation failed");
        return null;
      }
      const created = (await createRes.json()) as { id: string };
      userId = created.id;
      log.info({ userId }, "Created reviewer demo user");
    }

    // 2. Grant the pass in our DB
    await db
      .insert(usersTable)
      .values({ id: userId, email: DEMO_EMAIL, hasPass: true })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { hasPass: true },
      });

    // 3. Cache the user id so the next call skips the search
    await upsertConfig("reviewer_demo_user_id", userId);

    return { userId, email: DEMO_EMAIL, password: tempPassword };
  } catch (err) {
    log.error({ err }, "ensureDemoUserAndResetPassword threw");
    return null;
  }
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

    const demo = await ensureDemoUserAndResetPassword(clerkKey, req.log);
    if (!demo) {
      res.status(502).json({ error: "Demo account setup failed" });
      return;
    }

    // Return email + fresh temp password so the mobile app can sign in via the
    // standard signIn.password() flow, which works with all Clerk SDK versions.
    res.json({ email: demo.email, password: demo.password });
  },
);

export default router;
