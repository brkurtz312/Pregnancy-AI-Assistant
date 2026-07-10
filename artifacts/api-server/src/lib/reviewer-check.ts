import { db, appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const CLERK_API = "https://api.clerk.com/v1";

export type ReviewerCheckReason =
  | "no_access_code"
  | "no_clerk_key"
  | "clerk_unreachable";

export interface ReviewerCheckResult {
  ok: boolean;
  timestamp: string;
  reason?: ReviewerCheckReason;
}

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

/**
 * Verifies the reviewer sign-in system is fully operational:
 *   1. A reviewer access code is configured
 *   2. CLERK_SECRET_KEY is present
 *   3. The Clerk API is reachable with that key
 *
 * Called from POST /api/admin/reviewer-check so it runs against whichever
 * DATABASE_URL and Clerk instance the server is connected to (prod in production).
 *
 * Each reviewer sign-in now creates a unique isolated Clerk account, so there
 * is no single "demo user" to monitor — the system check is the right signal.
 */
export async function runReviewerPassCheck(): Promise<ReviewerCheckResult> {
  const timestamp = new Date().toISOString();

  // 1. Access code must be configured
  const dbCode = await getConfig("reviewer_access_code");
  const accessCode =
    dbCode ??
    process.env.REVIEWER_ACCESS_CODE ??
    process.env.DEV_ACCESS_CODE ??
    null;

  if (!accessCode) {
    logger.error(
      "Reviewer access code not configured (checked app_config + env)",
    );
    return { ok: false, timestamp, reason: "no_access_code" };
  }

  // 2. Clerk secret key must be present
  const clerkKey = process.env.CLERK_SECRET_KEY;
  if (!clerkKey) {
    logger.error("CLERK_SECRET_KEY missing — reviewer sign-in will fail");
    return { ok: false, timestamp, reason: "no_clerk_key" };
  }

  // 3. Clerk API must be reachable (lightweight read, no user creation)
  try {
    const res = await fetch(`${CLERK_API}/users?limit=1`, {
      headers: { Authorization: `Bearer ${clerkKey}` },
    });
    if (!res.ok) {
      logger.error(
        { status: res.status },
        "Clerk API returned non-OK status — reviewer sign-in will fail",
      );
      return { ok: false, timestamp, reason: "clerk_unreachable" };
    }
  } catch (err) {
    logger.error({ err }, "Clerk API unreachable — reviewer sign-in will fail");
    return { ok: false, timestamp, reason: "clerk_unreachable" };
  }

  logger.info("Reviewer pass check passed");
  return { ok: true, timestamp };
}
