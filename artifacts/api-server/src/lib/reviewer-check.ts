import {
  accountDeletionRequestsTable,
  appConfigTable,
  db,
  usersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export type ReviewerCheckReason =
  | "no_demo_user_id"
  | "deleted_account"
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

const STATUS_KEYS = {
  lastRunAt: "reviewer_check_last_run_at",
  lastResult: "reviewer_check_last_result",
  lastReason: "reviewer_check_last_reason",
} as const;

const _state: ReviewerCheckStatus = {
  lastRunAt: null,
  lastResult: null,
  lastReason: null,
};

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

async function setConfig(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) {
      await db.delete(appConfigTable).where(eq(appConfigTable.key, key));
    } else {
      await db
        .insert(appConfigTable)
        .values({ key, value })
        .onConflictDoUpdate({
          target: appConfigTable.key,
          set: { value, updatedAt: sql`now()` },
        });
    }
  } catch (err) {
    logger.warn(
      { err, key },
      "Failed to persist reviewer check status to app_config",
    );
  }
}

/**
 * Returns a snapshot of the most recent scheduled check result.
 *
 * When the scheduler has run at least once in the current process the
 * in-memory `_state` is always up-to-date (record() keeps it in sync), so
 * we return it directly without hitting the DB.
 *
 * On a cold start (before the first scheduler tick) we read from app_config
 * so the last-known status survives a server restart. Falls back to the
 * zeroed in-memory state if the DB is unavailable.
 */
export async function getReviewerCheckStatus(): Promise<ReviewerCheckStatus> {
  if (_state.lastRunAt !== null) {
    return { ..._state };
  }

  try {
    const [runAt, result, reason] = await Promise.all([
      getConfig(STATUS_KEYS.lastRunAt),
      getConfig(STATUS_KEYS.lastResult),
      getConfig(STATUS_KEYS.lastReason),
    ]);

    return {
      lastRunAt: runAt,
      lastResult: (result as "ok" | "fail" | null) ?? null,
      lastReason: (reason as ReviewerCheckReason | null) ?? null,
    };
  } catch {
    return { ..._state };
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

  async function record(
    result: ReviewerCheckResult,
  ): Promise<ReviewerCheckResult> {
    _state.lastRunAt = result.timestamp;
    _state.lastResult = result.ok ? "ok" : "fail";
    _state.lastReason = result.reason ?? null;

    await Promise.all([
      setConfig(STATUS_KEYS.lastRunAt, result.timestamp),
      setConfig(STATUS_KEYS.lastResult, result.ok ? "ok" : "fail"),
      setConfig(STATUS_KEYS.lastReason, result.reason ?? null),
    ]);

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

  // Serialize all reviewer-account provisioning with account deletion. A
  // completed tombstone is permanent: intentionally deleted reviewer accounts
  // must be provisioned with a new Clerk ID, never silently restored here.
  const accountState = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${demoUserId}))`,
    );
    const [tombstone] = await tx
      .select({ userId: accountDeletionRequestsTable.userId })
      .from(accountDeletionRequestsTable)
      .where(eq(accountDeletionRequestsTable.userId, demoUserId))
      .limit(1);
    if (tombstone) return "deleted" as const;

    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, demoUserId))
      .limit(1);
    if (!user) {
      await tx.insert(usersTable).values({ id: demoUserId, hasPass: true });
      return "missing" as const;
    }
    if (!user.hasPass) {
      await tx
        .update(usersTable)
        .set({ hasPass: true, updatedAt: sql`now()` })
        .where(eq(usersTable.id, demoUserId));
      return "revoked" as const;
    }
    return "ok" as const;
  });

  if (accountState === "deleted") {
    logger.warn(
      { demoUserId },
      "Reviewer demo account has a deletion tombstone; skipping pass healing",
    );
    return record({
      ok: false,
      demoUserId,
      healed: false,
      timestamp,
      reason: "deleted_account",
    });
  }

  if (accountState === "missing") {
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

  if (accountState === "revoked") {
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
