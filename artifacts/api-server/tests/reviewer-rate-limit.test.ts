import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
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

  return { PostgresRateLimitStore: InMemoryRateLimitStore };
});

// Stub the DB client used by the reviewer route's getConfig() helper. Returning
// an empty array makes getConfig() return null, which causes the route to fall
// back to env-var lookups — no real database needed.
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [],
      }),
    }),
  },
  appConfigTable: { key: "key" },
}));

import reviewerRouter from "../src/routes/reviewer";

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
  app.use("/api", reviewerRouter);
  return app;
}

const app = buildApp();

const ORIGINAL_REVIEWER_CODE = process.env.REVIEWER_ACCESS_CODE;
const ORIGINAL_CLERK_KEY = process.env.CLERK_SECRET_KEY;

beforeEach(() => {
  process.env.REVIEWER_ACCESS_CODE = "secret-review-code";
  // Leave CLERK_SECRET_KEY unset so a correct-code request stops at 503
  // ("Not configured") rather than making a real Clerk API call. This keeps
  // tests hermetic — we only care about rate-limiting behaviour, not token
  // generation.
  delete process.env.CLERK_SECRET_KEY;
});

afterAll(() => {
  if (ORIGINAL_REVIEWER_CODE === undefined) {
    delete process.env.REVIEWER_ACCESS_CODE;
  } else {
    process.env.REVIEWER_ACCESS_CODE = ORIGINAL_REVIEWER_CODE;
  }
  if (ORIGINAL_CLERK_KEY === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = ORIGINAL_CLERK_KEY;
  }
});

// Helper: POST /api/reviewer/sign-in-token with an explicit client IP set via
// X-Forwarded-For. The rate limiter keys on the leftmost XFF entry, mirroring
// how the real Replit proxy forwards the client IP.
function signIn(code: string, ip: string) {
  return request(app)
    .post("/api/reviewer/sign-in-token")
    .set("x-forwarded-for", ip)
    .send({ code });
}

describe("POST /api/reviewer/sign-in-token brute-force protection", () => {
  it("returns 400 when no code is provided", async () => {
    const res = await request(app)
      .post("/api/reviewer/sign-in-token")
      .set("x-forwarded-for", "203.0.113.100")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 for a wrong code", async () => {
    const res = await signIn("wrong-code", "203.0.113.50");
    expect(res.status).toBe(401);
  });

  it("blocks the 11th wrong-code attempt from the same IP with 429", async () => {
    const ip = "203.0.113.10";

    // The limiter allows up to 10 attempts per 10-minute window.
    // All 10 should reach the handler and get 401 (wrong code).
    for (let i = 0; i < 10; i++) {
      const res = await signIn("bad-code", ip);
      expect(res.status).toBe(401);
    }

    // The 11th request from the same IP must be blocked before it reaches the
    // handler — the rate limiter fires and returns 429.
    const blocked = await signIn("bad-code", ip);
    expect(blocked.status).toBe(429);
  });

  it("includes Retry-After in the 429 response", async () => {
    const ip = "203.0.113.11";

    for (let i = 0; i < 10; i++) {
      await signIn("bad-code", ip);
    }

    const blocked = await signIn("bad-code", ip);
    expect(blocked.status).toBe(429);
    // The handler sets Retry-After so clients know when to retry.
    expect(blocked.headers["retry-after"]).toBeTruthy();
  });

  it("does not rate-limit a different IP even when another IP is exhausted", async () => {
    const exhaustedIp = "203.0.113.20";
    const freshIp = "203.0.113.21";

    // Exhaust the limit for exhaustedIp.
    for (let i = 0; i < 10; i++) {
      await signIn("bad-code", exhaustedIp);
    }
    expect((await signIn("bad-code", exhaustedIp)).status).toBe(429);

    // A completely different IP must still be served normally (gets 401, not 429).
    const res = await signIn("bad-code", freshIp);
    expect(res.status).toBe(401);
  });
});
