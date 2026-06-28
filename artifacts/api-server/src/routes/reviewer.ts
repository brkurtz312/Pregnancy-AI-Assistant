import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
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
 * Finds or creates the reviewer demo user in Clerk.
 * Caches the user ID to avoid repeated Clerk API calls.
 * Returns the Clerk user ID so the caller can create a sign-in token.
 */
async function ensureDemoUserId(
  clerkKey: string,
  log: {
    error: (obj: object, msg: string) => void;
    info: (obj: object, msg: string) => void;
  },
): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${clerkKey}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Return cached user ID if we have one
    const cachedId = await getConfig("reviewer_demo_user_id");
    if (cachedId) {
      log.info({ userId: cachedId }, "Using cached reviewer demo user id");
      // Ensure the pass is still granted in our DB (idempotent)
      await db
        .insert(usersTable)
        .values({ id: cachedId, email: DEMO_EMAIL, hasPass: true })
        .onConflictDoUpdate({
          target: usersTable.id,
          set: { hasPass: true },
        });
      return cachedId;
    }

    // 2. Find by email in Clerk
    const searchRes = await fetch(
      `${CLERK_API}/users?email_address=${encodeURIComponent(DEMO_EMAIL)}&limit=1`,
      { headers },
    );
    if (!searchRes.ok) {
      log.error({ status: searchRes.status }, "Clerk user search failed");
      return null;
    }
    const found = (await searchRes.json()) as Array<{ id: string }>;

    let userId: string;

    if (found.length > 0) {
      userId = found[0].id;
      log.info({ userId }, "Found existing reviewer demo user");
    } else {
      log.info({}, "Reviewer demo user not found — creating");
      const createRes = await fetch(`${CLERK_API}/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email_address: [DEMO_EMAIL],
          skip_password_requirement: true,
          email_address_verified: true,
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.text();
        log.error(
          { status: createRes.status, body },
          "Clerk user creation failed",
        );
        return null;
      }
      const created = (await createRes.json()) as { id: string };
      userId = created.id;
      log.info({ userId }, "Created reviewer demo user");
    }

    // 3. Grant the pass in our DB
    await db
      .insert(usersTable)
      .values({ id: userId, email: DEMO_EMAIL, hasPass: true })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { hasPass: true },
      });

    // 4. Cache the user ID
    await upsertConfig("reviewer_demo_user_id", userId);

    return userId;
  } catch (err) {
    log.error({ err }, "ensureDemoUserId threw");
    return null;
  }
}

/**
 * Creates a Clerk sign-in token for the given user.
 * Sign-in tokens bypass password auth and client-trust checks entirely —
 * the mobile app redeems it with signIn.create({ strategy: 'ticket', ticket: token }).
 */
async function createSignInToken(
  clerkKey: string,
  userId: string,
  log: {
    error: (obj: object, msg: string) => void;
    info: (obj: object, msg: string) => void;
  },
): Promise<string | null> {
  try {
    const res = await fetch(`${CLERK_API}/sign_in_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
      const body = await res.text();
      log.error(
        { status: res.status, body },
        "Clerk sign-in token creation failed",
      );
      return null;
    }
    const data = (await res.json()) as { token: string; url: string };
    log.info({ userId }, "Created Clerk sign-in token");
    return data.token;
  } catch (err) {
    log.error({ err }, "createSignInToken threw");
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

    const userId = await ensureDemoUserId(clerkKey, req.log);
    if (!userId) {
      res.status(502).json({ error: "Demo account setup failed" });
      return;
    }

    const token = await createSignInToken(clerkKey, userId, req.log);
    if (!token) {
      res.status(502).json({ error: "Sign-in token creation failed" });
      return;
    }

    res.json({ token });
  },
);

export default router;
