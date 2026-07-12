import { describe, it, expect, vi } from "vitest";
import express, { type Express, type Request, type Response } from "express";
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

import { aiDailyLimiter } from "../src/lib/rate-limit";

// Build a minimal app that applies ONLY the daily limiter so the burst limiter
// (15 req/min) doesn't intercept requests before the daily budget is exhausted.
// The stub handler returns 503, matching the "Anthropic not configured" path
// used in the burst test — the daily limiter still runs before the handler.
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
  app.use(aiDailyLimiter);
  app.post("/api/ai/ask", (_req: Request, res: Response) => {
    res.status(503).json({ error: "Anthropic not configured" });
  });
  return app;
}

const app = buildApp();

// Valid minimal body that passes AskAssistantBody validation.
const VALID_BODY = { question: "Is it safe to exercise?" };

// Helper: POST /api/ai/ask with an explicit client IP set via X-Forwarded-For.
// The aiDailyLimiter keys on the leftmost XFF entry, mirroring how the real
// Replit proxy forwards the client IP.
function askAI(ip: string) {
  return request(app)
    .post("/api/ai/ask")
    .set("x-forwarded-for", ip)
    .send(VALID_BODY);
}

describe("POST /api/ai/ask daily rate-limit protection", () => {
  it("returns 503 when Anthropic is not configured (daily limit not yet exhausted)", async () => {
    const res = await askAI("198.51.100.200");
    expect(res.status).toBe(503);
  });

  it("blocks the 121st request from the same IP with 429", { timeout: 30_000 }, async () => {
    const ip = "198.51.100.10";

    // The aiDailyLimiter allows up to 120 requests per 24-hour window.
    // All 120 should reach the stub handler and get 503.
    for (let i = 0; i < 120; i++) {
      const res = await askAI(ip);
      expect(res.status).toBe(503);
    }

    // The 121st request from the same IP must be blocked before it reaches the
    // handler — the daily rate limiter fires and returns 429.
    const blocked = await askAI(ip);
    expect(blocked.status).toBe(429);
  });

  it("includes Retry-After in the 429 response", { timeout: 30_000 }, async () => {
    const ip = "198.51.100.11";

    for (let i = 0; i < 120; i++) {
      await askAI(ip);
    }

    const blocked = await askAI(ip);
    expect(blocked.status).toBe(429);
    // The handler sets Retry-After so clients know when to retry.
    expect(blocked.headers["retry-after"]).toBeTruthy();
  });

  it("does not rate-limit a different IP even when another IP is exhausted", { timeout: 30_000 }, async () => {
    const exhaustedIp = "198.51.100.20";
    const freshIp = "198.51.100.21";

    // Exhaust the daily limit for exhaustedIp.
    for (let i = 0; i < 120; i++) {
      await askAI(exhaustedIp);
    }
    expect((await askAI(exhaustedIp)).status).toBe(429);

    // A completely different IP must still be served normally (gets 503, not 429).
    const res = await askAI(freshIp);
    expect(res.status).toBe(503);
  });
});
