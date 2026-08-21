import {
  aiUsageTable,
  accountDeletionRequestsTable,
  birthPlanAnswersTable,
  contractionLogsTable,
  db,
  hospitalBagStateTable,
  journalEntriesTable,
  kickSessionsTable,
  prenatalVisitsTable,
  scribeIdempotencyKeysTable,
  supportContactsTable,
  symptomLogsTable,
  userProfilesTable,
  usersTable,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { and, eq, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_RETRY_INTERVAL_MS = 60_000;
const MAX_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const MAX_SWEEP_BATCH_SIZE = 25;
const RETRY_WORKER_INTERVAL_MS = 60_000;

function retryIntervalMs(attemptCount: number): number {
  return Math.min(
    MAX_RETRY_INTERVAL_MS,
    DEFAULT_RETRY_INTERVAL_MS *
      2 ** Math.min(Math.max(attemptCount - 1, 0), 10),
  );
}

export function isAlreadyDeletedClerkUserError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    status?: unknown;
    errors?: Array<{ code?: unknown }>;
  };
  return (
    candidate.status === 404 ||
    candidate.errors?.some((item) => item.code === "resource_not_found") ===
      true
  );
}

async function purgeAppData(
  userId: string,
  tx: Pick<typeof db, "delete">,
): Promise<void> {
  await tx
    .delete(scribeIdempotencyKeysTable)
    .where(eq(scribeIdempotencyKeysTable.userId, userId));
  await tx
    .delete(supportContactsTable)
    .where(eq(supportContactsTable.userId, userId));
  await tx
    .delete(prenatalVisitsTable)
    .where(eq(prenatalVisitsTable.userId, userId));
  await tx
    .delete(contractionLogsTable)
    .where(eq(contractionLogsTable.userId, userId));
  await tx
    .delete(kickSessionsTable)
    .where(eq(kickSessionsTable.userId, userId));
  await tx.delete(symptomLogsTable).where(eq(symptomLogsTable.userId, userId));
  await tx
    .delete(journalEntriesTable)
    .where(eq(journalEntriesTable.userId, userId));
  await tx
    .delete(hospitalBagStateTable)
    .where(eq(hospitalBagStateTable.userId, userId));
  await tx
    .delete(birthPlanAnswersTable)
    .where(eq(birthPlanAnswersTable.userId, userId));
  await tx
    .delete(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  await tx
    .delete(aiUsageTable)
    .where(eq(aiUsageTable.identifier, `user:${userId}`));
  await tx
    .delete(aiUsageTable)
    .where(eq(aiUsageTable.identifier, `scribe:${userId}`));
  await tx.delete(usersTable).where(eq(usersTable.id, userId));
}

/**
 * Creates the tombstone and purges all app-owned data atomically. The
 * transaction commits before Clerk is contacted, so a lost network response
 * cannot leave the account usable or make the deletion request disappear.
 */
async function recordDeletionAndPurge(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Every authenticated request holds this same lock until its response
    // completes. Waiting here means an in-flight write either finishes before
    // this transaction purges it, or begins later and sees the tombstone.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const existing = await tx
      .select({ status: accountDeletionRequestsTable.status })
      .from(accountDeletionRequestsTable)
      .where(eq(accountDeletionRequestsTable.userId, userId))
      .limit(1);

    if (existing[0]?.status === "completed") return false;

    await tx
      .insert(accountDeletionRequestsTable)
      .values({ userId, status: "pending" })
      .onConflictDoNothing();
    await purgeAppData(userId, tx);
    return true;
  });
}

async function markDeletionCompleted(userId: string): Promise<void> {
  const completedAt = new Date();
  await db
    .update(accountDeletionRequestsTable)
    .set({
      status: "completed",
      clerkDeletedAt: completedAt,
      completedAt,
      lastError: null,
      nextAttemptAt: completedAt,
    })
    .where(eq(accountDeletionRequestsTable.userId, userId));
}

async function markDeletionAttemptFailed(
  userId: string,
  error: unknown,
): Promise<void> {
  const [request] = await db
    .select({ attemptCount: accountDeletionRequestsTable.attemptCount })
    .from(accountDeletionRequestsTable)
    .where(eq(accountDeletionRequestsTable.userId, userId))
    .limit(1);
  if (!request) return;

  const attemptCount = request.attemptCount + 1;
  const now = new Date();
  await db
    .update(accountDeletionRequestsTable)
    .set({
      attemptCount,
      lastAttemptAt: now,
      nextAttemptAt: new Date(now.getTime() + retryIntervalMs(attemptCount)),
      lastError:
        error instanceof Error ? error.message.slice(0, 1_000) : String(error),
    })
    .where(
      and(
        eq(accountDeletionRequestsTable.userId, userId),
        eq(accountDeletionRequestsTable.status, "pending"),
      ),
    );
}

async function attemptClerkDeletion(userId: string): Promise<void> {
  try {
    await clerkClient.users.deleteUser(userId);
    await markDeletionCompleted(userId);
  } catch (error) {
    if (isAlreadyDeletedClerkUserError(error)) {
      await markDeletionCompleted(userId);
      return;
    }

    await markDeletionAttemptFailed(userId, error);
    throw error;
  }
}

/**
 * Permanently removes app-owned data for one Clerk user, then removes the
 * Clerk identity. The deletion tombstone and database work are transactional,
 * and Clerk failures are recorded for the background worker to retry.
 *
 * Payment-provider records are not deleted here because they are retained by
 * those providers for purchase, refund, and tax obligations.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const shouldAttempt = await recordDeletionAndPurge(userId);
  if (shouldAttempt) await attemptClerkDeletion(userId);
}

/**
 * Returns true for both pending and completed tombstones. Completed
 * tombstones stay blocking so a stale Clerk token cannot recreate app data.
 */
export async function isAccountDeletionBlocked(
  userId: string,
): Promise<boolean> {
  const [request] = await db
    .select({ userId: accountDeletionRequestsTable.userId })
    .from(accountDeletionRequestsTable)
    .where(eq(accountDeletionRequestsTable.userId, userId))
    .limit(1);
  return request !== undefined;
}

const activeRetries = new Set<string>();

/**
 * Processes due tombstones. Clerk's delete operation is idempotent for this
 * purpose: a 404 means the external deletion already succeeded.
 */
export async function retryPendingAccountDeletions(): Promise<void> {
  const due = await db
    .select({ userId: accountDeletionRequestsTable.userId })
    .from(accountDeletionRequestsTable)
    .where(
      and(
        eq(accountDeletionRequestsTable.status, "pending"),
        lte(accountDeletionRequestsTable.nextAttemptAt, new Date()),
      ),
    )
    .limit(MAX_SWEEP_BATCH_SIZE);

  await Promise.all(
    due.map(async ({ userId }) => {
      if (activeRetries.has(userId)) return;
      activeRetries.add(userId);
      try {
        await attemptClerkDeletion(userId);
      } catch (error) {
        logger.warn({ err: error, userId }, "Account deletion retry failed");
      } finally {
        activeRetries.delete(userId);
      }
    }),
  );
}

export function startAccountDeletionWorker(
  opts: { intervalMs?: number } = {},
): () => void {
  const intervalMs = opts.intervalMs ?? RETRY_WORKER_INTERVAL_MS;
  if (intervalMs <= 0) return () => {};

  let stopped = false;
  const run = () => {
    if (stopped) return;
    void retryPendingAccountDeletions().catch((error) => {
      logger.error({ err: error }, "Account deletion retry sweep failed");
    });
  };
  run();
  const timer = setInterval(run, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
