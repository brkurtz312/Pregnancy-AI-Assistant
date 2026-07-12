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

  return { PostgresRateLimitStore: InMemoryRateLimitStore };
});

// Stub the Anthropic integration so the import doesn't attempt a real
// SDK init and isAnthropicConfigured() returns false. With this in place
// every request that reaches the handler responds with 503 — the rate
// limiters still run first, so the 16th request never reaches the handler.
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => false,
  getAnthropic: () => {
    throw new Error("Anthropic not configured");
  },
}));

// Stub the DB client to avoid a real database connection.
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

// Stub AI usage helpers — the rate limiter fires before the handler, so
// these are never called for the first 15 requests (503 path) or for the
// 16th (429 path). Stubbing prevents import-time errors from any lazy
// db setup inside the module.
vi.mock("../src/lib/ai-usage", () => ({
  currentPeriodKey: () => "2026-W28",
  getUsage: async () => 0,
  reserveUsage: async () => ({ reserved: true }),
  refundUsage: async () => {},
}));

vi.mock("../src/lib/entitlement", () => ({
  userHasPass: async () => false,
}));

import aiRouter from "../src/routes/ai/index";

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
  app.use("/api", aiRouter);
  return app;
}

const app = buildApp();

// Valid minimal body that passes AskAssistantBody validation.
const VALID_BODY = { question: "Is it safe to exercise?" };

// Helper: POST /api/ai/ask with an explicit client IP set via X-Forwarded-For.
// The aiBurstLimiter keys on the leftmost XFF entry, mirroring how the real
// Replit proxy forwards the client IP.
function askAI(ip: string) {
  return request(app)
    .post("/api/ai/ask")
    .set("x-forwarded-for", ip)
    .send(VALID_BODY);
}

describe("POST /api/ai/ask burst rate-limit protection", () => {
  it("returns 503 when Anthropic is not configured (limiter not yet exhausted)", async () => {
    const res = await askAI("203.0.113.200");
    expect(res.status).toBe(503);
  });

  it("blocks the 16th request from the same IP with 429", async () => {
    const ip = "203.0.113.10";

    // The aiBurstLimiter allows up to 15 requests per 60-second window.
    // All 15 should reach the handler and get 503 (Anthropic not configured).
    for (let i = 0; i < 15; i++) {
      const res = await askAI(ip);
      expect(res.status).toBe(503);
    }

    // The 16th request from the same IP must be blocked before it reaches the
    // handler — the burst rate limiter fires and returns 429.
    const blocked = await askAI(ip);
    expect(blocked.status).toBe(429);
  });

  it("includes Retry-After in the 429 response", async () => {
    const ip = "203.0.113.11";

    for (let i = 0; i < 15; i++) {
      await askAI(ip);
    }

    const blocked = await askAI(ip);
    expect(blocked.status).toBe(429);
    // The handler sets Retry-After so clients know when to retry.
    expect(blocked.headers["retry-after"]).toBeTruthy();
  });

  it("does not rate-limit a different IP even when another IP is exhausted", async () => {
    const exhaustedIp = "203.0.113.20";
    const freshIp = "203.0.113.21";

    // Exhaust the burst limit for exhaustedIp.
    for (let i = 0; i < 15; i++) {
      await askAI(exhaustedIp);
    }
    expect((await askAI(exhaustedIp)).status).toBe(429);

    // A completely different IP must still be served normally (gets 503, not 429).
    const res = await askAI(freshIp);
    expect(res.status).toBe(503);
  });
});
