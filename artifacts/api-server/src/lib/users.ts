import { db, usersTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  return user;
}

/**
 * Returns the app user row for a Clerk user id, creating it (just-in-time) on
 * first sight. Email is fetched from Clerk on a best-effort basis.
 */
export async function getOrCreateUser(id: string): Promise<User> {
  const existing = await getUser(id);
  if (existing) return existing;

  let email: string | null = null;
  try {
    const clerkUser = await clerkClient.users.getUser(id);
    email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;
  } catch {
    // Email is best-effort; proceed without it.
  }

  await db.insert(usersTable).values({ id, email }).onConflictDoNothing();
  const created = await getUser(id);
  if (!created) {
    throw new Error(`Failed to provision user ${id}`);
  }
  return created;
}

export async function setStripeCustomerId(
  id: string,
  stripeCustomerId: string,
): Promise<void> {
  await db
    .update(usersTable)
    .set({ stripeCustomerId, updatedAt: sql`now()` })
    .where(eq(usersTable.id, id));
}

/** Marks the user as owning the Full Pregnancy Pass. Idempotent. */
export async function grantPass(id: string): Promise<void> {
  await db
    .update(usersTable)
    .set({
      hasPass: true,
      passPurchasedAt: sql`COALESCE(${usersTable.passPurchasedAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(usersTable.id, id));
}

/** Revokes the Full Pregnancy Pass for the given user. Idempotent. */
export async function revokePass(id: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ hasPass: false, updatedAt: sql`now()` })
    .where(eq(usersTable.id, id));
}

/**
 * Revokes the Full Pregnancy Pass for any user linked to the given Stripe
 * customer ID. Called when a charge.refunded or payment_intent.payment_failed
 * webhook is received so the denormalized hasPass flag is cleared promptly,
 * preventing the fast-path from returning true for a refunded payment.
 */
export async function revokePassByStripeCustomerId(
  stripeCustomerId: string,
): Promise<void> {
  await db
    .update(usersTable)
    .set({ hasPass: false, updatedAt: sql`now()` })
    .where(eq(usersTable.stripeCustomerId, stripeCustomerId));
}
