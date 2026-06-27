import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
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

  return { PostgresRateLimitStore: InMemoryRateLimitStore };
});

// Stub the DB client. The billing route uses db.execute for findPassPriceId
// and getOrCreateUser; a no-op implementation avoids a real database.
vi.mock("@workspace/db", () => ({
  db: {
    execute: async () => ({ rows: [] }),
    select: () => ({
      from: () => ({
        where: async () => [],
      }),
    }),
  },
  appConfigTable: { key: "key" },
}));

// Stub auth so requests are treated as coming from a signed-in user. The
// redeemCodeLimiter fires before requireAuth, so even 401 responses count
// toward the limit — but providing a valid auth stub means the first 10
// requests reach the handler and return 403 (wrong code), which gives a
// clearer signal that the limiter fires on attempt 11.
vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId?: string }).userId = "user_test";
    next();
  },
  getUserId: () => "user_test",
}));

vi.mock("../src/lib/users", () => ({
  getOrCreateUser: async () => ({
    id: "user_test",
    email: "test@example.com",
    stripeCustomerId: null,
    hasPass: false,
  }),
  setStripeCustomerId: async () => {},
  grantPass: async () => {},
}));

vi.mock("../src/lib/entitlement", () => ({
  userHasPass: async () => false,
}));

vi.mock("../src/lib/stripeClient", () => ({
  getUncachableStripeClient: async () => ({}),
}));

vi.mock("../src/lib/revenueCatClient", () => ({
  getUncachableRevenueCatClient: async () => ({}),
}));

vi.mock("@replit/revenuecat-sdk", () => ({
  listEntitlements: async () => ({ data: { items: [] }, error: null }),
  listCustomerActiveEntitlements: async () => ({
    data: { items: [] },
    error: null,
  }),
}));

vi.mock("../src/lib/ai-usage", () => ({
  currentPeriodKey: () => "2026-W26",
  getUsage: async () => 0,
}));

import billingRouter from "../src/routes/billing/index";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // The real app wires req.log via pino-http; stub it here.
  app.use((req, _res, next) => {
    (req as Request & { log: unknown }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use("/api", billingRouter);
  return app;
}

const app = buildApp();

const ORIGINAL_DEV_CODE = process.env.DEV_ACCESS_CODE;

beforeEach(() => {
  // Provide a known developer code so wrong-code requests get 403 (not 503).
  process.env.DEV_ACCESS_CODE = "secret-dev-code";
});

afterAll(() => {
  if (ORIGINAL_DEV_CODE === undefined) {
    delete process.env.DEV_ACCESS_CODE;
  } else {
    process.env.DEV_ACCESS_CODE = ORIGINAL_DEV_CODE;
  }
});

// Helper: POST /api/billing/redeem-code with an explicit client IP set via
// X-Forwarded-For. The redeemCodeLimiter keys on the leftmost XFF entry,
// mirroring how the real Replit proxy forwards the client IP.
function redeemCode(code: string, ip: string) {
  return request(app)
    .post("/api/billing/redeem-code")
    .set("x-forwarded-for", ip)
    .send({ code });
}

describe("POST /api/billing/redeem-code brute-force protection", () => {
  it("returns 403 for a wrong code (limiter not yet exhausted)", async () => {
    const res = await redeemCode("wrong-code", "203.0.113.200");
    expect(res.status).toBe(403);
  });

  it("blocks the 11th wrong-code attempt from the same IP with 429", async () => {
    const ip = "203.0.113.10";

    // The limiter allows up to 10 attempts per 10-minute window.
    // All 10 should reach the handler and get 403 (wrong code).
    for (let i = 0; i < 10; i++) {
      const res = await redeemCode("bad-code", ip);
      expect(res.status).toBe(403);
    }

    // The 11th request from the same IP must be blocked before it reaches the
    // handler — the rate limiter fires and returns 429.
    const blocked = await redeemCode("bad-code", ip);
    expect(blocked.status).toBe(429);
  });

  it("includes Retry-After in the 429 response", async () => {
    const ip = "203.0.113.11";

    for (let i = 0; i < 10; i++) {
      await redeemCode("bad-code", ip);
    }

    const blocked = await redeemCode("bad-code", ip);
    expect(blocked.status).toBe(429);
    // The handler sets Retry-After so clients know when to retry.
    expect(blocked.headers["retry-after"]).toBeTruthy();
  });

  it("does not rate-limit a different IP even when another IP is exhausted", async () => {
    const exhaustedIp = "203.0.113.20";
    const freshIp = "203.0.113.21";

    // Exhaust the limit for exhaustedIp.
    for (let i = 0; i < 10; i++) {
      await redeemCode("bad-code", exhaustedIp);
    }
    expect((await redeemCode("bad-code", exhaustedIp)).status).toBe(429);

    // A completely different IP must still be served normally (gets 403, not 429).
    const res = await redeemCode("bad-code", freshIp);
    expect(res.status).toBe(403);
  });
});
