import { db, appConfigTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export type ReviewerCheckReason =
  | "no_demo_user_id"
  | "user_missing"
  | "pass_revoked";

export interface ReviewerCheckResult {
  ok: boolean;
  demoUserId: string | null;
  healed: boolean;
  timestamp: string;
  reason?: ReviewerCheckReason;
}

export interface ReviewerCheckStatus {
  lastRunAt: string | null;
  lastResult: "ok" | "fail" | null;
  lastReason: ReviewerCheckReason | null;
}

const _state: ReviewerCheckStatus = {
  lastRunAt: null,
  lastResult: null,
  lastReason: null,
};

/** Returns a snapshot of the most recent scheduled check result. */
export function getReviewerCheckStatus(): ReviewerCheckStatus {
  return { ..._state };
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
 * Verifies the demo reviewer account has its pass intact:
 *   1. Resolves the demo user ID (DB config row takes priority over env var)
 *   2. Checks the user row in the database
 *   3. If the row is missing, upserts it with hasPass=true (healed)
 *   4. If hasPass is false, restores it to true (healed)
 *   5. If hasPass is already true, returns ok=true with no writes
 *
 * Called from POST /api/admin/reviewer-check so it runs against whichever
 * DATABASE_URL the server is connected to (prod in production).
 *
 * The demo user ID is resolved from (in priority order):
 *   1. app_config row with key "reviewer_demo_user_id"
 *   2. REVIEWER_DEMO_USER_ID environment variable
 */
export async function runReviewerPassCheck(): Promise<ReviewerCheckResult> {
  const timestamp = new Date().toISOString();

  function record(result: ReviewerCheckResult): ReviewerCheckResult {
    _state.lastRunAt = result.timestamp;
    _state.lastResult = result.ok ? "ok" : "fail";
    _state.lastReason = result.reason ?? null;
    return result;
  }

  // 1. Resolve demo user ID — DB config takes priority over env var
  const dbUserId = await getConfig("reviewer_demo_user_id");
  const demoUserId = dbUserId ?? process.env.REVIEWER_DEMO_USER_ID ?? null;

  if (!demoUserId) {
    logger.error(
      "Demo user ID not configured (checked app_config + REVIEWER_DEMO_USER_ID env)",
    );
    return record({
      ok: false,
      demoUserId: null,
      healed: false,
      timestamp,
      reason: "no_demo_user_id",
    });
  }

  // 2. Look up the user row
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, demoUserId));

  if (!user) {
    // User row is missing — upsert with hasPass: true
    await db
      .insert(usersTable)
      .values({ id: demoUserId, hasPass: true })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { hasPass: true, updatedAt: sql`now()` },
      });
    logger.warn(
      { demoUserId },
      "Demo user row was missing; created with hasPass=true",
    );
    return record({
      ok: false,
      demoUserId,
      healed: true,
      timestamp,
      reason: "user_missing",
    });
  }

  if (!user.hasPass) {
    // Pass was revoked — restore it
    await db
      .update(usersTable)
      .set({ hasPass: true, updatedAt: sql`now()` })
      .where(eq(usersTable.id, demoUserId));
    logger.warn({ demoUserId }, "Demo user hasPass was false; healed to true");
    return record({
      ok: false,
      demoUserId,
      healed: true,
      timestamp,
      reason: "pass_revoked",
    });
  }

  // Pass is present — all good
  logger.info({ demoUserId }, "Reviewer pass check passed");
  return record({ ok: true, demoUserId, healed: false, timestamp });
}
