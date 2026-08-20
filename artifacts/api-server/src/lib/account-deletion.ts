import {
  aiUsageTable,
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
import { eq } from "drizzle-orm";

function isAlreadyDeletedClerkUserError(error: unknown): boolean {
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

/**
 * Permanently removes app-owned data for one Clerk user, then removes the
 * Clerk identity. The database work is transactional so a database failure
 * leaves the user's account and app data intact for a safe retry.
 *
 * Payment-provider records are not deleted here because they are retained by
 * those providers for purchase, refund, and tax obligations.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
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
    await tx
      .delete(symptomLogsTable)
      .where(eq(symptomLogsTable.userId, userId));
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
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
  });

  try {
    await clerkClient.users.deleteUser(userId);
  } catch (error) {
    // A network interruption can occur after Clerk accepted deletion but before
    // its response reached us. App-data deletes above are idempotent, and a
    // retry should still finish local sign-out instead of trapping the user in
    // a now-invalid session because Clerk reports that the identity is gone.
    if (!isAlreadyDeletedClerkUserError(error)) throw error;
  }
}
