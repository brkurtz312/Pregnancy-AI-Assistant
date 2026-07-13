import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// --- Mocks for the route's collaborators -----------------------------------
// The /ai/ask handler talks to Anthropic, the auth layer, the entitlement
// check and the usage meter. We mock those so the test exercises the gating
// logic itself (free weekly limit vs. unlimited pass) without a DB or paid
// model calls.

const anthropicCreate = vi.fn();
const isAnthropicConfigured = vi.fn(() => true);
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => isAnthropicConfigured(),
  getAnthropic: () => ({ messages: { create: anthropicCreate } }),
}));

const getUserId = vi.fn<(req: Request) => string | null>(() => null);
vi.mock("../src/middlewares/auth", () => ({
  getUserId: (req: Request) => getUserId(req),
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const userHasPass = vi.fn(async (_userId: string) => false);
vi.mock("../src/lib/entitlement", () => ({
  userHasPass: (userId: string) => userHasPass(userId),
}));

// The free allowance is reserved atomically up front and refunded if the paid
// call fails. Mock both so we can drive "under limit", "at limit" and "provider
// failure" cases without a database.
const reserveUsage = vi.fn(
  async (_id: string, _period: string, _limit: number) => ({
    reserved: true,
    count: 1,
  }),
);
const refundUsage = vi.fn(async (_id: string, _period: string) => {});
vi.mock("../src/lib/ai-usage", () => ({
  currentPeriodKey: () => "2026-W23",
  reserveUsage: (id: string, period: string, limit: number) =>
    reserveUsage(id, period, limit),
  refundUsage: (id: string, period: string) => refundUsage(id, period),
}));

// The real burst/daily limiters are backed by a shared Postgres store; stub
// them to no-op middlewares so this unit test stays hermetic. getClientIp keeps
// its real behavior (leftmost X-Forwarded-For) so IP-keyed metering is tested.
vi.mock("../src/lib/rate-limit", () => ({
  aiBurstLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  aiDailyLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  getClientIp: (req: Request): string => {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    return first || "unknown";
  },
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

// Each request uses a unique client IP so the per-IP rate limiter never
// couples one test's request count to another's.
let ipCounter = 0;
function ask(body: unknown) {
  ipCounter += 1;
  return request(app)
    .post("/api/ai/ask")
    .set("x-forwarded-for", `203.0.113.${ipCounter}`)
    .send(body as object);
}

// weekly-insight helper — also rotates IPs to keep tests hermetic.
function insight(body: unknown) {
  ipCounter += 1;
  return request(app)
    .post("/api/ai/weekly-insight")
    .set("x-forwarded-for", `203.0.113.${ipCounter}`)
    .send(body as object);
}

// The module-level TtlCache in the route file persists across test cases.
// Use a counter to give each test a unique week number so no two tests
// accidentally share a cached entry. Start at 30; the 9 distinct weeks
// needed by this suite land between 30 and 42, within the schema's max.
let weekCounter = 30;

function fakeAnswer(text: string) {
  return { content: [{ type: "text", text }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  isAnthropicConfigured.mockReturnValue(true);
  getUserId.mockReturnValue(null);
  userHasPass.mockResolvedValue(false);
  reserveUsage.mockResolvedValue({ reserved: true, count: 1 });
  refundUsage.mockResolvedValue(undefined);
  anthropicCreate.mockResolvedValue(fakeAnswer("Stay hydrated and rest."));
});

describe("POST /api/ai/ask free-question gating", () => {
  it("rejects a malformed body with 400 before any model call", async () => {
    const res = await ask({ question: "" });
    expect(res.status).toBe(400);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(reserveUsage).not.toHaveBeenCalled();
  });

  it("returns 503 when the assistant is not configured", async () => {
    isAnthropicConfigured.mockReturnValue(false);
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(503);
    expect(anthropicCreate).not.toHaveBeenCalled();
    // No quota is reserved when the service is unavailable.
    expect(reserveUsage).not.toHaveBeenCalled();
  });

  it("answers an anonymous user under the free limit and meters by IP", async () => {
    const res = await ask({ question: "Is sushi safe?", week: 12 });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("hydrated");
    expect(res.body.disclaimer).toBeTruthy();
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    // Anonymous users are metered by their IP; quota is reserved up front and
    // not refunded on success.
    expect(reserveUsage).toHaveBeenCalledTimes(1);
    expect(reserveUsage.mock.calls[0][0]).toMatch(/^ip:/);
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("blocks an anonymous user at the free limit with 403 FREE_LIMIT_REACHED", async () => {
    reserveUsage.mockResolvedValue({ reserved: false, count: 5 });
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FREE_LIMIT_REACHED");
    // No paid model call once the reservation is denied, and nothing to refund.
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("meters a signed-in user without a pass by their account id", async () => {
    getUserId.mockReturnValue("user_123");
    userHasPass.mockResolvedValue(false);
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(200);
    expect(reserveUsage.mock.calls[0][0]).toBe("user:user_123");
  });

  it("lets a pass holder through even when over the free limit, without metering", async () => {
    getUserId.mockReturnValue("user_paid");
    userHasPass.mockResolvedValue(true);
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    // Pass holders bypass metering entirely.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("refunds the reserved question when the model call fails", async () => {
    anthropicCreate.mockRejectedValue(new Error("upstream down"));
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(502);
    // The up-front reservation is returned so a provider failure doesn't burn a
    // free question.
    expect(reserveUsage).toHaveBeenCalledTimes(1);
    expect(refundUsage).toHaveBeenCalledTimes(1);
    expect(refundUsage.mock.calls[0][0]).toMatch(/^ip:/);
  });
});

// ---------------------------------------------------------------------------
// weekly-insight — no-metering guarantee
// ---------------------------------------------------------------------------
// The /api/ai/weekly-insight endpoint is unmetered today: it serves a per-week
// insight that is identical for every caller, cached in process memory to
// avoid paid model calls on every request. Auth state plays no role: there is
// no per-user quota, no per-IP allowance, and no reserveUsage call on this
// path. These tests document that guarantee so a future regression (e.g.
// accidentally adding reserveUsage to this handler) is caught immediately.
describe("POST /api/ai/weekly-insight no-metering guarantee", () => {
  it("rejects a malformed body with 400 before any model call", async () => {
    // "week" is required; omitting it should fail validation immediately.
    const res = await insight({});
    expect(res.status).toBe(400);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(reserveUsage).not.toHaveBeenCalled();
  });

  it("returns 503 when the assistant is not configured, without metering", async () => {
    isAnthropicConfigured.mockReturnValue(false);
    const res = await insight({ week: ++weekCounter });
    expect(res.status).toBe(503);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(reserveUsage).not.toHaveBeenCalled();
  });

  it("calls Anthropic exactly once on a cache miss (anonymous user) and never calls reserveUsage", async () => {
    const week = ++weekCounter;
    anthropicCreate.mockResolvedValue(
      fakeAnswer("Week insight: stay hydrated."),
    );
    const res = await insight({ week });
    expect(res.status).toBe(200);
    expect(res.body.week).toBe(week);
    expect(res.body.insight).toContain("hydrated");
    expect(res.body.disclaimer).toBeTruthy();
    // Anthropic was called to fill the cache — exactly once.
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    // No quota at all on this endpoint.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("serves the cached insight without calling Anthropic again (cache hit, same week)", async () => {
    const week = ++weekCounter;
    anthropicCreate.mockResolvedValue(fakeAnswer("Week insight: rest well."));

    // First request — cache miss.
    const first = await insight({ week });
    expect(first.status).toBe(200);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);

    // Second request — same week should be a cache hit; Anthropic not called again.
    const second = await insight({ week });
    expect(second.status).toBe(200);
    expect(second.body.insight).toBe(first.body.insight);
    expect(anthropicCreate).toHaveBeenCalledTimes(1); // still exactly 1

    // reserveUsage was never invoked on either request.
    expect(reserveUsage).not.toHaveBeenCalled();
  });

  it("serves cached insight to a signed-in user without calling Anthropic again (signed-in cache hit)", async () => {
    // Prime the cache as anonymous, then confirm a signed-in request hits the
    // same cached entry — the handler does not key on auth identity.
    const week = ++weekCounter;
    anthropicCreate.mockResolvedValue(fakeAnswer("Insight for signed-in hit."));

    // Miss: anonymous primes the cache.
    const miss = await insight({ week });
    expect(miss.status).toBe(200);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);

    // Hit: signed-in user retrieves the cached value without a new model call.
    getUserId.mockReturnValue("user_hit");
    userHasPass.mockResolvedValue(false);
    const hit = await insight({ week });
    expect(hit.status).toBe(200);
    expect(hit.body.insight).toBe(miss.body.insight);
    expect(anthropicCreate).toHaveBeenCalledTimes(1); // no additional call

    // No metering on either leg.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("serves cached insight to an anonymous user after a signed-in user primed it (cache is auth-agnostic)", async () => {
    // Inverse of the previous test: signed-in primes, anonymous hits.
    const week = ++weekCounter;
    getUserId.mockReturnValue("user_primer");
    userHasPass.mockResolvedValue(false);
    anthropicCreate.mockResolvedValue(fakeAnswer("Insight auth-agnostic."));

    // Miss: signed-in user primes the cache.
    const miss = await insight({ week });
    expect(miss.status).toBe(200);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);

    // Hit: anonymous user receives the same cached value.
    getUserId.mockReturnValue(null);
    const hit = await insight({ week });
    expect(hit.status).toBe(200);
    expect(hit.body.insight).toBe(miss.body.insight);
    expect(anthropicCreate).toHaveBeenCalledTimes(1); // no additional call

    // No metering on either leg.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("succeeds for a signed-in user without a pass and never calls reserveUsage", async () => {
    getUserId.mockReturnValue("user_456");
    userHasPass.mockResolvedValue(false);
    anthropicCreate.mockResolvedValue(fakeAnswer("Signed-in cache miss."));

    const res = await insight({ week: ++weekCounter });
    expect(res.status).toBe(200);
    // The handler does not inspect userId or pass status — no metering occurs.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("succeeds for a pass holder and never calls reserveUsage", async () => {
    getUserId.mockReturnValue("user_paid");
    userHasPass.mockResolvedValue(true);
    anthropicCreate.mockResolvedValue(fakeAnswer("Pass holder insight."));

    const res = await insight({ week: ++weekCounter });
    expect(res.status).toBe(200);
    // Pass holders get no special treatment here — the endpoint is already
    // unmetered for everyone, so reserveUsage is never called.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("returns 502 when the Anthropic call fails on a cache miss, without touching the usage meter", async () => {
    anthropicCreate.mockRejectedValue(new Error("provider down"));
    const res = await insight({ week: ++weekCounter });
    expect(res.status).toBe(502);
    // The endpoint has no usage reservation to refund — a provider failure
    // doesn't affect any quota counter.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });

  it("does not call reserveUsage when auth state switches between requests", async () => {
    // This is the key auth-switch regression test: an anonymous request
    // followed by a signed-in request (and vice versa) must both succeed
    // without any metering. Neither should trigger reserveUsage.
    anthropicCreate.mockResolvedValue(fakeAnswer("Auth-switch insight."));

    // Anonymous first.
    getUserId.mockReturnValue(null);
    const anonRes = await insight({ week: ++weekCounter });
    expect(anonRes.status).toBe(200);
    expect(reserveUsage).not.toHaveBeenCalled();

    // Now sign in and ask again (different week to force a cache miss).
    getUserId.mockReturnValue("user_789");
    userHasPass.mockResolvedValue(false);
    const signedInRes = await insight({ week: ++weekCounter });
    expect(signedInRes.status).toBe(200);
    expect(reserveUsage).not.toHaveBeenCalled();

    // Switch to a pass holder.
    getUserId.mockReturnValue("user_paid_2");
    userHasPass.mockResolvedValue(true);
    const passRes = await insight({ week: ++weekCounter });
    expect(passRes.status).toBe(200);
    expect(reserveUsage).not.toHaveBeenCalled();

    // No quota was consumed across any auth state.
    expect(refundUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// weekly-insight — cache is flushed on server restart
// ---------------------------------------------------------------------------
// The weeklyInsightCache is a module-level in-process TtlCache. Every deploy
// or process restart creates a fresh module instance with an empty cache,
// which means the first request after a restart always triggers a paid
// Anthropic call — exactly as intended.
//
// This describe block guards against the cache accidentally becoming
// persistent (e.g. if someone moves it to a shared store or exports the
// instance): by resetting the module registry with vi.resetModules() and
// dynamically re-importing the router, we simulate a fresh process start and
// confirm the cache starts empty.
describe("POST /api/ai/weekly-insight cache is flushed on server restart", () => {
  it("calls Anthropic on the first request after a module reset (restart simulation)", async () => {
    // --- Step 1: Prime the in-process cache in the "old" process. ---
    const week = ++weekCounter;
    anthropicCreate.mockResolvedValue(fakeAnswer("Old cached insight."));
    const primeRes = await insight({ week });
    expect(primeRes.status).toBe(200);
    // Cache is now warm for this week in the top-level module instance.
    expect(anthropicCreate).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    isAnthropicConfigured.mockReturnValue(true);
    anthropicCreate.mockResolvedValue(fakeAnswer("Fresh insight after restart."));

    // --- Step 2: Simulate a server restart. ---
    // vi.resetModules() clears the module registry so the next dynamic import
    // produces a brand-new module instance. The module-level weeklyInsightCache
    // inside the fresh router is therefore empty, matching what happens when a
    // real process restarts. The vi.mock() registrations remain active so the
    // fresh module still receives the same mock collaborators.
    vi.resetModules();

    const { default: freshRouter } = await import("../src/routes/ai/index");

    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { log: unknown }).log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      next();
    });
    freshApp.use("/api", freshRouter);

    // --- Step 3: First request against the fresh module (cache miss). ---
    // Even though this week was cached in the old process, the new module
    // instance has an empty cache, so Anthropic must be called exactly once.
    ipCounter += 1;
    const res = await request(freshApp)
      .post("/api/ai/weekly-insight")
      .set("x-forwarded-for", `203.0.113.${ipCounter}`)
      .send({ week });

    expect(res.status).toBe(200);
    expect(res.body.insight).toContain("Fresh insight after restart.");
    // The empty post-restart cache required a new Anthropic call.
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    // No quota metering on this endpoint regardless of restart state.
    expect(reserveUsage).not.toHaveBeenCalled();
    expect(refundUsage).not.toHaveBeenCalled();
  });
});
