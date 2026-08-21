import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { accountDeletionRequestsTable, db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function ensureActiveAccount(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const [tombstone] = await tx
      .select({ userId: accountDeletionRequestsTable.userId })
      .from(accountDeletionRequestsTable)
      .where(eq(accountDeletionRequestsTable.userId, userId))
      .limit(1);
    if (tombstone) return false;

    // Child tables use cascading foreign keys to this row. Once deletion gets
    // the same lock and removes it, a late write cannot recreate app data.
    await tx.insert(usersTable).values({ id: userId }).onConflictDoNothing();
    return true;
  });
}

/**
 * Rejects the request with 401 unless a valid Clerk session is present.
 * On success, attaches the Clerk user id as `req.userId` after atomically
 * confirming it has no deletion tombstone.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  req.log.info(
    { hasAuthHeader: !!req.headers["authorization"] },
    "requireAuth",
  );
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  (req as AuthedRequest).userId = userId;
  void ensureActiveAccount(userId)
    .then((available) => {
      if (!available) {
        res.status(410).json({
          error: "This account is no longer available.",
        });
        return;
      }
      next();
    })
    .catch(next);
}

/** Returns the Clerk user id when signed in, otherwise null. */
export function getUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}
