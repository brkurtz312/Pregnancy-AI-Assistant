import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// The /ai/ask handler resolves its metered identifier from two sources:
//   - getUserId  → "user:<id>"  when signed in
//   - getClientIp → "ip:<addr>" when anonymous
// These tests confirm the identifier boundary is correct when a user switches
// from anonymous to signed-in mid-session, and that a fresh IP doesn't reset
// an exhausted user-keyed quota.

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

vi.mock("../src/lib/rate-limit", () => ({
  aiBurstLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  aiDailyLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  getClientIp: (req: Request): string => {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    return first ?? "unknown";
  },
}));

import aiRouter from "../src/routes/ai/index";

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

describe("free-question quota: anonymous-to-signed-in transition", () => {
  it(
    "grants a signed-in user their own fresh quota even after the same IP " +
      "exhausts the anonymous allowance",
    async () => {
      const clientIp = "198.51.100.5";
      const userId = "user_abc123";

      // Seed the ai_usage state via the stub: the anonymous IP bucket is at the
      // limit, but the user-scoped bucket is empty. reserveUsage returns
      // denied for the IP key and approved for the user key.
      reserveUsage.mockImplementation(async (id: string) => {
        if (id === `ip:${clientIp}`) return { reserved: false, count: 5 };
        return { reserved: true, count: 1 };
      });

      // Anonymous request from the exhausted IP → must be blocked.
      getUserId.mockReturnValue(null);
      const anonRes = await request(app)
        .post("/api/ai/ask")
        .set("x-forwarded-for", clientIp)
        .send({ question: "Is sushi safe?" });

      expect(anonRes.status).toBe(403);
      expect(anonRes.body.code).toBe("FREE_LIMIT_REACHED");
      expect(anthropicCreate).not.toHaveBeenCalled();

      // Same IP, now signed in → identifier switches to user:abc123 → fresh quota.
      getUserId.mockReturnValue(userId);
      const authedRes = await request(app)
        .post("/api/ai/ask")
        .set("x-forwarded-for", clientIp)
        .send({ question: "Is sushi safe?" });

      expect(authedRes.status).toBe(200);
      expect(authedRes.body.answer).toBeTruthy();
      expect(anthropicCreate).toHaveBeenCalledTimes(1);

      // The signed-in request must have reserved against the user key, not the IP.
      const userKeyCall = reserveUsage.mock.calls.find(([id]) =>
        id.startsWith("user:"),
      );
      expect(userKeyCall).toBeDefined();
      expect(userKeyCall![0]).toBe(`user:${userId}`);
    },
  );

  it(
    "blocks an authenticated user whose user-keyed quota is exhausted, " +
      "even when the request arrives from a fresh IP",
    async () => {
      const userId = "user_xyz789";
      const freshIp = "198.51.100.99";

      // The user-scoped bucket is at the limit. The IP is brand new and has no
      // entries in the usage table, but once signed in the identifier is always
      // user:<id> — so the fresh IP provides no bypass.
      reserveUsage.mockResolvedValue({ reserved: false, count: 5 });
      getUserId.mockReturnValue(userId);

      const res = await request(app)
        .post("/api/ai/ask")
        .set("x-forwarded-for", freshIp)
        .send({ question: "Is vitamin D safe in pregnancy?" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FREE_LIMIT_REACHED");

      // Confirm the handler keyed on the user identifier, not the fresh IP.
      expect(reserveUsage).toHaveBeenCalledTimes(1);
      expect(reserveUsage.mock.calls[0][0]).toBe(`user:${userId}`);

      // No paid model call must have been made.
      expect(anthropicCreate).not.toHaveBeenCalled();
    },
  );
});
