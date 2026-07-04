import { Router, type IRouter } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
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

/**
 * Finds the reviewer demo user by email in Clerk, creating them if absent.
 * Works regardless of which Clerk instance (test vs live) the server is using.
 * Returns the Clerk user id, or null on any error.
 */
async function ensureDemoUser(
  clerkKey: string,
  log: { error: (obj: object, msg: string) => void; info: (obj: object, msg: string) => void },
): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${clerkKey}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Look for the user by email
    const searchRes = await fetch(
      `${CLERK_API}/users?email_address=${encodeURIComponent(DEMO_EMAIL)}&limit=1`,
      { headers },
    );
    if (!searchRes.ok) {
      log.error({ status: searchRes.status }, "Clerk user search failed");
      return null;
    }
    const found = (await searchRes.json()) as Array<{ id: string; email_addresses?: Array<{ id: string }> }>;

    let userId: string;

    if (found.length > 0) {
      userId = found[0].id;
      log.info({ userId }, "Found existing reviewer demo user in Clerk");
    } else {
      // 2. Create the user if not found
      log.info({}, "Reviewer demo user not in Clerk — creating");
      // The reviewer never logs in with a password — access is always granted
      // via a freshly issued Clerk sign-in token — so generate a random,
      // never-persisted password purely to satisfy Clerk's user-creation API.
      const randomPassword = randomBytes(24).toString("base64url");
      const createRes = await fetch(`${CLERK_API}/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email_address: [DEMO_EMAIL],
          password: randomPassword,
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
      log.info({ userId }, "Created reviewer demo user in Clerk");
    }

    // 3. Ensure the user has the pass in our DB
    await db
      .insert(usersTable)
      .values({ id: userId, email: DEMO_EMAIL, hasPass: true })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { hasPass: true },
      });

    // 4. Persist user id to app_config so future calls skip the lookup
    await upsertConfig("reviewer_demo_user_id", userId);

    return userId;
  } catch (err) {
    log.error({ err }, "ensureDemoUser threw");
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

    // Resolve the demo user — prefer cached DB id, but verify it works.
    // If the id is stale (different Clerk instance) fall through to self-heal.
    const dbUserId = await getConfig("reviewer_demo_user_id");
    const demoUserId = dbUserId ?? process.env.REVIEWER_DEMO_USER_ID;

    const headers = {
      Authorization: `Bearer ${clerkKey}`,
      "Content-Type": "application/json",
    };

    // Try issuing a token with the cached id first (fast path)
    if (demoUserId) {
      const tokenRes = await fetch(`${CLERK_API}/sign_in_tokens`, {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: demoUserId, expires_in_seconds: 3600 }),
      });
      if (tokenRes.ok) {
        const data = (await tokenRes.json()) as { token: string };
        res.json({ token: data.token });
        return;
      }
      req.log.warn({ userId: demoUserId, status: tokenRes.status }, "Cached demo user id rejected by Clerk — self-healing");
    }

    // Slow path: find or create the user by email
    const healedUserId = await ensureDemoUser(clerkKey, req.log);
    if (!healedUserId) {
      res.status(502).json({ error: "Token generation failed" });
      return;
    }

    const tokenRes = await fetch(`${CLERK_API}/sign_in_tokens`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id: healedUserId, expires_in_seconds: 3600 }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "(unreadable)");
      req.log.error({ status: tokenRes.status, body }, "Clerk sign_in_tokens failed after self-heal");
      res.status(502).json({ error: "Token generation failed" });
      return;
    }

    const data = (await tokenRes.json()) as { token: string };
    res.json({ token: data.token });
  },
);

export default router;
