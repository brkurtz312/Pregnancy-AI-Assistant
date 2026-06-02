import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, RequestHandler } from "express";

// The Replit shared proxy forwards the original client IP as the leftmost
// entry of X-Forwarded-For (see the Clerk proxy middleware for the same
// convention). Deriving the key this way is independent of how many proxy
// hops sit in front of us, so we don't rely on a specific `trust proxy` count.
export function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || "unknown";
}

// ipKeyGenerator normalizes IPv6 addresses to a /56 subnet so a single client
// can't trivially rotate through addresses in its own block.
const keyGenerator = (req: Request): string => ipKeyGenerator(getClientIp(req));

function makeLimiter(
  windowMs: number,
  limit: number,
  message: string,
): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    // We derive the client IP ourselves from X-Forwarded-For, so the library's
    // trust-proxy/XFF validation warnings don't apply.
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: (req: Request, res: Response): void => {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000).toString());
      req.log.warn({ ip: getClientIp(req) }, "AI rate limit exceeded");
      res.status(429).json({ error: message });
    },
  });
}

// Burst protection: absorbs a natural session (one auto weekly-insight call
// plus an active Q&A back-and-forth) while stopping scripted hammering.
export const aiBurstLimiter: RequestHandler = makeLimiter(
  60 * 1000,
  15,
  "You're sending requests too quickly. Please wait a moment and try again.",
);

// Daily cost ceiling: well above any genuine single-user need, but caps what a
// single IP can spend in a day. Rejected burst requests don't reach this
// limiter (it runs after the burst limiter), so they don't burn the budget.
export const aiDailyLimiter: RequestHandler = makeLimiter(
  24 * 60 * 60 * 1000,
  120,
  "You've reached today's limit for the assistant. Please try again tomorrow.",
);
