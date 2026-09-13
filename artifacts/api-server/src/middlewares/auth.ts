import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { accountDeletionRequestsTable, db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { clerkKeySources } from "../lib/clerk-env";
import { bearerFrom, verifyDemoToken } from "../lib/demo-token";

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
 * Returns the demo subject when the request carries a valid demo-session
 * token, otherwise null.
 *
 * Demo tokens are a SECOND credential type accepted by this middleware. They
 * exist only so Apple's reviewer can exercise the app without a Clerk sign-in,
 * which instance-wide MFA makes impossible for a demo mailbox they cannot read
 * (see `.agents/memory/clerk-mfa-blocks-app-review.md`).
 *
 * The blast radius is bounded by construction:
 *   - verifyDemoToken returns null unless DEMO_SESSION_SECRET is set, so
 *     unsetting that env var disables this path entirely.
 *   - Subjects are always `demo:`-prefixed and can never collide with a Clerk
 *     user id, so a demo session cannot address another user's rows.
 *   - Tokens are HMAC-signed with a hard expiry and no refresh path.
 */
function getDemoSubject(req: Request): string | null {
  const token = bearerFrom(req.headers["authorization"]);
  if (!token) return null;
  return verifyDemoToken(token)?.sub ?? null;
}

/**
 * Rejects the request with 401 unless a valid Clerk session OR a valid
 * demo-session token is present.
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
  // Checked before Clerk: it is a local HMAC verification with no network
  // call, and a demo token is never a valid Clerk session anyway.
  const userId = getDemoSubject(req) ?? getAuth(req).userId;
  if (!userId) {
    // Clerk explains its refusals in response headers that clerkMiddleware has
    // already attached by the time we get here — x-clerk-auth-reason carries a
    // code such as token-invalid or token-expired, and -message the detail.
    // Without them a rejected request is indistinguishable from a request that
    // simply arrived signed out, which makes a misconfigured instance look like
    // a client bug. Log them rather than discarding them; they cost one line
    // and are the only account of WHY the token failed.
    // The boot-time "Clerk instance" line reports the same key sources, but a
    // hosting platform's log collector can attach after a process has written
    // its first lines, and then that line is simply never seen. A rejection is
    // logged long after startup, so repeat the sources here: when a token is
    // refused, which variable supplied the key is the first thing worth
    // knowing, and it should not depend on catching the boot.
    req.log.warn(
      {
        hasAuthHeader: Boolean(req.headers["authorization"]),
        clerkAuthStatus: res.getHeader("x-clerk-auth-status") ?? null,
        clerkAuthReason: res.getHeader("x-clerk-auth-reason") ?? null,
        clerkAuthMessage: res.getHeader("x-clerk-auth-message") ?? null,
        ...clerkKeySources(),
      },
      "requireAuth rejected the request",
    );
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

/**
 * Returns the caller's identity when authenticated, otherwise null.
 * This is the Clerk user id for a normal session, or a `demo:`-prefixed
 * subject for an App Review demo session.
 */
export function getUserId(req: Request): string | null {
  return getDemoSubject(req) ?? getAuth(req).userId ?? null;
}
