import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * Rejects the request with 401 unless a valid Clerk session is present.
 * On success, attaches the Clerk user id as `req.userId`.
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
  next();
}

/** Returns the Clerk user id when signed in, otherwise null. */
export function getUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}
