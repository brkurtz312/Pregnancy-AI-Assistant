import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
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

const getUsage = vi.fn(async (_id: string, _period: string) => 0);
const incrementUsage = vi.fn(async (_id: string, _period: string) => 1);
vi.mock("../src/lib/ai-usage", () => ({
  currentPeriodKey: () => "2026-W23",
  getUsage: (id: string, period: string) => getUsage(id, period),
  incrementUsage: (id: string, period: string) => incrementUsage(id, period),
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
  getUsage.mockResolvedValue(0);
  incrementUsage.mockResolvedValue(1);
  anthropicCreate.mockResolvedValue(fakeAnswer("Stay hydrated and rest."));
});

describe("POST /api/ai/ask free-question gating", () => {
  it("rejects a malformed body with 400 before any model call", async () => {
    const res = await ask({ question: "" });
    expect(res.status).toBe(400);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when the assistant is not configured", async () => {
    isAnthropicConfigured.mockReturnValue(false);
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(503);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("answers an anonymous user under the free limit and meters by IP", async () => {
    getUsage.mockResolvedValue(0);
    const res = await ask({ question: "Is sushi safe?", week: 12 });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("hydrated");
    expect(res.body.disclaimer).toBeTruthy();
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    // Anonymous users are metered by their IP, and only successful answers
    // count against the allowance.
    expect(incrementUsage).toHaveBeenCalledTimes(1);
    expect(incrementUsage.mock.calls[0][0]).toMatch(/^ip:/);
  });

  it("blocks an anonymous user at the free limit with 403 FREE_LIMIT_REACHED", async () => {
    getUsage.mockResolvedValue(5); // FREE_WEEKLY_LIMIT
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FREE_LIMIT_REACHED");
    // No paid model call and no usage increment once the limit is hit.
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it("meters a signed-in user without a pass by their account id", async () => {
    getUserId.mockReturnValue("user_123");
    userHasPass.mockResolvedValue(false);
    getUsage.mockResolvedValue(1);
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(200);
    expect(getUsage.mock.calls[0][0]).toBe("user:user_123");
    expect(incrementUsage.mock.calls[0][0]).toBe("user:user_123");
  });

  it("lets a pass holder through even when over the free limit, without metering", async () => {
    getUserId.mockReturnValue("user_paid");
    userHasPass.mockResolvedValue(true);
    getUsage.mockResolvedValue(999);
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    // Pass holders bypass metering entirely.
    expect(getUsage).not.toHaveBeenCalled();
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it("does not count a failed model call against the free allowance", async () => {
    anthropicCreate.mockRejectedValue(new Error("upstream down"));
    const res = await ask({ question: "Is sushi safe?" });
    expect(res.status).toBe(502);
    expect(incrementUsage).not.toHaveBeenCalled();
  });
});
