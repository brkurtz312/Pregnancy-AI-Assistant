import { describe, it, expect, vi } from "vitest";
import express, { type Express, type Request } from "express";
import request from "supertest";

// Replace the PostgreSQL-backed store with a hermetic in-memory implementation
// so the real express-rate-limit middleware runs but does not need a database.
// Each limiter instance gets its own Map, which is the in-process equivalent of
// the per-prefix scoping the Postgres store provides via key prefixes.
vi.mock("../src/lib/rate-limit-store", () => {
  class InMemoryRateLimitStore {
    // Marks this store as local so express-rate-limit won't warn about the
    // store being shared across instances (irrelevant in tests).
    localKeys = true;
    private counts = new Map<string, { hits: number; resetTime: Date }>();
    private windowMs = 60_000;

    init(options: { windowMs: number }): void {
      this.windowMs = options.windowMs;
    }

    async increment(
      key: string,
    ): Promise<{ totalHits: number; resetTime: Date }> {
      const now = Date.now();
      const entry = this.counts.get(key);
      if (!entry || entry.resetTime.getTime() <= now) {
        const resetTime = new Date(now + this.windowMs);
        this.counts.set(key, { hits: 1, resetTime });
        return { totalHits: 1, resetTime };
      }
      entry.hits += 1;
      return { totalHits: entry.hits, resetTime: entry.resetTime };
    }

    async decrement(key: string): Promise<void> {
      const entry = this.counts.get(key);
      if (entry && entry.hits > 0) entry.hits -= 1;
    }

    async resetKey(key: string): Promise<void> {
      this.counts.delete(key);
    }
  }

  return {
    PostgresRateLimitStore: InMemoryRateLimitStore,
    RATE_LIMIT_PREFIXES: {
      aiBurst: "ai-burst",
      aiDaily: "ai-daily",
      redeemCode: "redeem-code",
    },
  };
});

import {
  redeemCodeLimiter,
  REDEEM_REVIEWER_LIMIT,
} from "../src/lib/rate-limit";

// ─── redeemCodeLimiter ────────────────────────────────────────────────────────

// Build a minimal app that applies ONLY the redeemCodeLimiter so nothing else
// (requireAuth, DB lookups, DEV_ACCESS_CODE) interferes with the rate-limit
// assertion. The stub handler returns 503, simulating "code redemption not
// configured" — the limiter still runs first, so the 11th request never
// reaches the handler.
function buildRedeemApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { log: unknown }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use(redeemCodeLimiter);
  app.post("/api/billing/redeem-code", (_req: Request, res: Response) => {
    res.status(503).json({ error: "Code redemption not configured" });
  });
  return app;
}

const redeemApp = buildRedeemApp();

// Helper: POST /api/billing/redeem-code with an explicit client IP via X-Forwarded-For.
// The redeemCodeLimiter keys on the leftmost XFF entry.
function redeemCode(ip: string) {
  return request(redeemApp)
    .post("/api/billing/redeem-code")
    .set("x-forwarded-for", ip)
    .send({ code: "GUESS" });
}

describe("POST /api/billing/redeem-code rate-limit protection", () => {
  it("returns 503 when code redemption is not configured (limiter not yet exhausted)", async () => {
    const res = await redeemCode("10.0.0.200");
    expect(res.status).toBe(503);
  });

  it(`blocks the ${REDEEM_REVIEWER_LIMIT + 1}th request from the same IP with 429`, async () => {
    const ip = "10.0.0.10";

    // redeemCodeLimiter allows up to REDEEM_REVIEWER_LIMIT requests per 10-minute window.
    // All of them should reach the stub handler and get 503.
    for (let i = 0; i < REDEEM_REVIEWER_LIMIT; i++) {
      const res = await redeemCode(ip);
      expect(res.status).toBe(503);
    }

    // The next request from the same IP must be blocked before it reaches the
    // handler — the rate limiter fires and returns 429.
    const blocked = await redeemCode(ip);
    expect(blocked.status).toBe(429);
  }, 15000);

  it("includes Retry-After in the 429 response", async () => {
    const ip = "10.0.0.11";

    for (let i = 0; i < REDEEM_REVIEWER_LIMIT; i++) {
      await redeemCode(ip);
    }

    const blocked = await redeemCode(ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();
  }, 15000);

  it("does not rate-limit a different IP even when another IP is exhausted", async () => {
    const exhaustedIp = "10.0.0.20";
    const freshIp = "10.0.0.21";

    // Exhaust the limit for exhaustedIp.
    for (let i = 0; i < REDEEM_REVIEWER_LIMIT; i++) {
      await redeemCode(exhaustedIp);
    }
    expect((await redeemCode(exhaustedIp)).status).toBe(429);

    // A completely different IP must still be served normally (gets 503, not 429).
    const res = await redeemCode(freshIp);
    expect(res.status).toBe(503);
  }, 15000);
});
