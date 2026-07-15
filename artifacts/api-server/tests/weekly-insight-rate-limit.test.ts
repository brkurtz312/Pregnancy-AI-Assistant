import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";

// Shared registry hoisted above vi.mock so the factory closure and the test
// body reference exactly the same Map at runtime.
const { storeRegistry } = vi.hoisted(() => ({
  storeRegistry: new Map<
    string,
    { _seed: (key: string, hits: number) => void }
  >(),
}));

// Replace the PostgreSQL-backed store with a hermetic in-memory implementation
// so the real express-rate-limit middleware runs but does not need a database.
// This is the same approach used in ai-burst-rate-limit.test.ts — each limiter
// instance gets its own Map, which is the in-process equivalent of the per-prefix
// scoping the Postgres store provides.
vi.mock("../src/lib/rate-limit-store", () => {
  class InMemoryRateLimitStore {
    localKeys = true;
    private counts = new Map<string, { hits: number; resetTime: Date }>();
    private windowMs = 60_000;

    constructor(prefix: string) {
      storeRegistry.set(prefix, this);
    }

    init(options: { windowMs: number }): void {
      this.windowMs = options.windowMs;
    }

    /** Test-only: pre-load a hit counter without HTTP round-trips. */
    _seed(key: string, hits: number): void {
      this.counts.set(key, {
        hits,
        resetTime: new Date(Date.now() + this.windowMs),
      });
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
      reviewerSignIn: "reviewer-sign-in",
    },
  };
});

// isAnthropicConfigured is a vi.fn() so each describe block can set the return
// value it needs. The burst-limit tests set it to false (so requests that
// reach the handler return 503, proving the limiter let them through). The
// cache-hit tests set it to true so the full handler path executes.
const isAnthropicConfiguredFn = vi.fn(() => false);
const anthropicCreate = vi.fn();
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => isAnthropicConfiguredFn(),
  getAnthropic: () => ({ messages: { create: anthropicCreate } }),
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

// Stub AI usage helpers — the burst limiter fires before the handler on the
// 16th request so these are never invoked in the rate-limit path.
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
import {
  aiDailyLimiter,
  AI_BURST_LIMIT,
  AI_DAILY_LIMIT,
} from "../src/lib/rate-limit";

function buildApp(): Express {
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
  app.use("/api", aiRouter);
  return app;
}

const app = buildApp();

// The burst limiter covers router.use("/ai", aiBurstLimiter, aiDailyLimiter),
// which is shared across all /api/ai/* routes. A bot rotating through all 42
// valid gestational weeks would trigger 42 distinct cache misses, but the burst
// limiter blocks it after the 15th request within 60 seconds, capping the
// maximum paid calls per IP per window to 15 regardless of week variety.

function weeklyInsight(ip: string, week: number) {
  return request(app)
    .post("/api/ai/weekly-insight")
    .set("x-forwarded-for", ip)
    .send({ week });
}

// ---------------------------------------------------------------------------
// Burst rate-limit protection on /api/ai/weekly-insight
// ---------------------------------------------------------------------------
describe("POST /api/ai/weekly-insight — burst rate-limit protection", () => {
  beforeEach(() => {
    // Anthropic is "not configured" so requests that reach the handler return
    // 503, confirming they passed through the limiter unblocked.
    isAnthropicConfiguredFn.mockReturnValue(false);
  });

  it("allows the first request through to the handler (returns 503, not 429)", async () => {
    const res = await weeklyInsight("203.0.113.100", 20);
    expect(res.status).toBe(503);
  });

  it(`blocks the ${AI_BURST_LIMIT + 1}th request from the same IP with 429`, async () => {
    const ip = "203.0.113.101";

    // Requests 1–AI_BURST_LIMIT must reach the handler. Each gets a different
    // week so there is no cross-test cache interference. Each returns 503 because
    // Anthropic is not configured — confirming the limiter let them through.
    for (let i = 0; i < AI_BURST_LIMIT; i++) {
      const res = await weeklyInsight(ip, i + 1);
      expect(res.status).toBe(503);
    }

    // The next request exceeds the burst window — the middleware intercepts it
    // before the handler runs and returns 429.
    const blocked = await weeklyInsight(ip, AI_BURST_LIMIT + 1);
    expect(blocked.status).toBe(429);
    // Confirm the body comes from the rate-limit handler, not the AI handler.
    expect(blocked.body.error).toMatch(/too quickly/i);
  });

  it("includes Retry-After in the 429 response", async () => {
    const ip = "203.0.113.102";

    for (let i = 0; i < AI_BURST_LIMIT; i++) {
      await weeklyInsight(ip, i + 1);
    }

    const blocked = await weeklyInsight(ip, AI_BURST_LIMIT + 1);
    expect(blocked.status).toBe(429);
    // The limiter handler sets Retry-After so clients know when to retry.
    expect(blocked.headers["retry-after"]).toBeTruthy();
  });

  it("does not rate-limit a different IP even when another IP is exhausted", async () => {
    const exhaustedIp = "203.0.113.110";
    const freshIp = "203.0.113.111";

    for (let i = 0; i < AI_BURST_LIMIT; i++) {
      await weeklyInsight(exhaustedIp, i + 1);
    }
    expect((await weeklyInsight(exhaustedIp, AI_BURST_LIMIT + 1)).status).toBe(
      429,
    );

    // A separate IP must still be served (503 from the handler, not 429 from
    // the limiter), confirming the limit is per-IP, not global.
    const res = await weeklyInsight(freshIp, 1);
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Cache-hit path: effective cost-free repeated requests for the same week
// ---------------------------------------------------------------------------
// The weekly-insight handler caches the generated text in process memory keyed
// by gestational week. Once a week is cached, every subsequent request for that
// week — from any IP, in any auth state — is served from the cache with zero
// Anthropic calls. This is the primary bot-cost defence for this endpoint: even
// if many IPs request the same week concurrently, only the first cache-miss
// triggers a paid LLM call.
//
// These tests use week numbers in the 30–42 range (well above the burst-test
// weeks 1–16) so no two describe blocks accidentally share a cached entry from
// an earlier test run within the same module lifetime.
describe("POST /api/ai/weekly-insight — cache-hit cost protection", () => {
  beforeEach(() => {
    // Enable Anthropic so the handler can actually execute and fill the cache.
    isAnthropicConfiguredFn.mockReturnValue(true);
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Stay hydrated this week." }],
    });
  });

  it("calls Anthropic exactly once for the first request on a cache miss", async () => {
    const res = await weeklyInsight("203.0.115.1", 30);
    expect(res.status).toBe(200);
    expect(res.body.insight).toContain("hydrated");
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("serves a second request for the same week from cache — zero additional Anthropic calls", async () => {
    // Week 30 was primed in the previous test; the cache survives within the
    // same module lifetime, so this request must be a cache hit.
    anthropicCreate.mockClear();
    const res = await weeklyInsight("203.0.115.2", 30);
    expect(res.status).toBe(200);
    expect(res.body.insight).toContain("hydrated"); // cached text, not new mock
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("serves many different IPs for the same cached week with zero Anthropic calls", async () => {
    // Week 30 is already warm; simulate a burst of distinct IPs all requesting
    // the same week — the cache absorbs all of them.
    anthropicCreate.mockClear();
    for (let i = 0; i < 10; i++) {
      const res = await weeklyInsight(`203.0.116.${i}`, 30);
      expect(res.status).toBe(200);
    }
    // No additional paid calls were made despite 10 different IPs.
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("primes the cache on a new week and serves subsequent requests without paid calls", async () => {
    // Week 31 is uncached — first request triggers a miss.
    const first = await weeklyInsight("203.0.115.10", 31);
    expect(first.status).toBe(200);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);

    anthropicCreate.mockClear();

    // All subsequent requests for week 31 must be cache hits.
    for (let i = 0; i < 5; i++) {
      const res = await weeklyInsight(`203.0.115.${11 + i}`, 31);
      expect(res.status).toBe(200);
      expect(res.body.insight).toBe(first.body.insight);
    }
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Daily rate-limit protection on /api/ai/weekly-insight
// ---------------------------------------------------------------------------
// A bot that respects the burst window (≤ AI_BURST_LIMIT req/min) and spreads
// requests across the day could still drive up to AI_DAILY_LIMIT Anthropic
// calls from one IP before the aiDailyLimiter fires. These tests confirm that
// the (AI_DAILY_LIMIT + 1)th request is blocked with 429 regardless of which
// endpoint is targeted.
//
// The daily limiter is tested in isolation — without the burst limiter — so
// we can fire all AI_DAILY_LIMIT allowed requests synchronously without
// triggering a burst block. This mirrors the approach in ai-daily-rate-limit.test.ts.
// Each request uses a distinct week number so the in-process weekly-insight
// cache (which is warm from earlier describe blocks) doesn't short-circuit the
// handler before the limiter counts it.
//
// IPs in this block use the 198.51.101.x range to avoid any interference with
// the burst-test IPs (203.0.113.x / 203.0.115-116.x used above).
function buildDailyOnlyApp(): Express {
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
  // Only the daily limiter sits in front of the stub handler. This lets us
  // accumulate 120 hits without the burst limiter (15 req/min) intercepting.
  app.use(aiDailyLimiter);
  app.post("/api/ai/weekly-insight", (_req: Request, res: Response) => {
    res.status(503).json({ error: "Anthropic not configured" });
  });
  return app;
}

const dailyOnlyApp = buildDailyOnlyApp();

function weeklyInsightDaily(ip: string, week: number) {
  return request(dailyOnlyApp)
    .post("/api/ai/weekly-insight")
    .set("x-forwarded-for", ip)
    .send({ week });
}

// ---------------------------------------------------------------------------
// Helpers for the daily-limit tests
// ---------------------------------------------------------------------------
// Instead of making AI_DAILY_LIMIT sequential HTTP requests (slow, flaky under
// load), the daily tests pre-seed the in-memory store to AI_DAILY_LIMIT hits
// via the shared storeRegistry (populated in the InMemoryRateLimitStore
// constructor). Each test then makes just 1-2 requests to assert the limiter's
// boundary behaviour.

describe("POST /api/ai/weekly-insight — daily rate-limit protection", () => {
  it("returns 503 when Anthropic is not configured (daily limit not yet exhausted)", async () => {
    const res = await weeklyInsightDaily("198.51.101.200", 1);
    expect(res.status).toBe(503);
  });

  it(`blocks the ${AI_DAILY_LIMIT + 1}st request from the same IP with 429`, async () => {
    const ip = "198.51.101.10";
    // Pre-seed AI_DAILY_LIMIT hits so the very next request is over the ceiling.
    storeRegistry.get("ai-daily")?._seed(ip, AI_DAILY_LIMIT);

    const blocked = await weeklyInsightDaily(ip, 1);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/today's limit/i);
  });

  it("includes Retry-After in the 429 response", async () => {
    const ip = "198.51.101.11";
    storeRegistry.get("ai-daily")?._seed(ip, AI_DAILY_LIMIT);

    const blocked = await weeklyInsightDaily(ip, 1);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();
  });

  it("does not rate-limit a different IP even when another IP is exhausted", async () => {
    const exhaustedIp = "198.51.101.20";
    const freshIp = "198.51.101.21";

    // Seed exhaustedIp to its ceiling; freshIp has no entry (starts at 0).
    storeRegistry.get("ai-daily")?._seed(exhaustedIp, AI_DAILY_LIMIT);
    expect((await weeklyInsightDaily(exhaustedIp, 1)).status).toBe(429);

    // freshIp is unaffected — the limit is per-IP, not global.
    const res = await weeklyInsightDaily(freshIp, 1);
    expect(res.status).toBe(503);
  });
});
