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
