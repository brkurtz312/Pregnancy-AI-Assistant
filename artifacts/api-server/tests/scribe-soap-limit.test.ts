import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

/**
 * SOAP note path — free-limit enforcement.
 *
 * The generate-note endpoint supports two modes: "summary" and "soap".
 * Both modes share the same `scribe:${userId}` counter so that a user who
 * has exhausted the free session via one mode cannot bypass the gate by
 * switching to the other.
 *
 * These tests confirm that `mode: "soap"` is subject to the same
 * SCRIBE_LIMIT_REACHED gate as `mode: "summary"`.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAnthropicCreate = vi.fn();
const mockIsAnthropicConfigured = vi.fn(() => true);

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => mockIsAnthropicConfigured(),
  getAnthropic: () => ({ messages: { create: mockAnthropicCreate } }),
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: vi.fn(),
  ensureCompatibleFormat: vi.fn(),
}));

const mockUserHasPass = vi.fn(async (_userId: string) => false);
vi.mock("../src/lib/entitlement", () => ({
  userHasPass: (userId: string) => mockUserHasPass(userId),
}));

const mockReserveUsage = vi.fn(async () => ({ reserved: true, count: 1 }));
const mockRefundUsage = vi.fn(async () => {});

vi.mock("../src/lib/ai-usage", () => ({
  reserveUsage: (...args: unknown[]) => mockReserveUsage(...args),
  refundUsage: (...args: unknown[]) => mockRefundUsage(...args),
  getUsage: vi.fn(),
  incrementUsage: vi.fn(),
  currentPeriodKey: vi.fn(),
}));

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  aiUsageTable: {},
  // scribe-idempotency.ts imports scribeIdempotencyKeysTable for its
  // background dbSweep timer; without this export the timer logs a warning
  // and can leave handles open, blocking test teardown.
  scribeIdempotencyKeysTable: {},
}));

// ─── Test app ────────────────────────────────────────────────────────────────

import scribeRouter from "../src/routes/scribe/index";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { userId?: string }).userId = "user_free_123";
    (req as Request & { log: unknown }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use("/", scribeRouter);
  return app;
}

const VALID_TRANSCRIPT =
  "Patient presents at 28 weeks. Blood pressure normal. Fundal height appropriate. Plan to return in 2 weeks.";

const SOAP_RESPONSE = JSON.stringify({
  subjective: "Patient at 28 weeks with no complaints.",
  objective: "BP normal, fundal height appropriate.",
  assessment: "Uncomplicated pregnancy at 28 weeks.",
  plan: "Return visit in 2 weeks.",
});

function postGenerateNote(app: Express, body: object) {
  return request(app).post("/scribe/generate-note").send(body);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAnthropicConfigured.mockReturnValue(true);
  mockUserHasPass.mockResolvedValue(false);
  mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });
  mockRefundUsage.mockResolvedValue(undefined);
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: SOAP_RESPONSE }],
  });
});

describe("POST /scribe/generate-note (mode: soap) — free-limit enforcement", () => {
  it("returns 403 / SCRIBE_LIMIT_REACHED when the free session is exhausted via soap mode", async () => {
    mockReserveUsage.mockResolvedValue({ reserved: false, count: 1 });
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SCRIBE_LIMIT_REACHED");
  });

  it("does not call the AI model when the soap-mode request is blocked", async () => {
    mockReserveUsage.mockResolvedValue({ reserved: false, count: 1 });
    const app = buildApp();

    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("uses the same scribe:userId counter key for soap mode as for summary mode", async () => {
    const app = buildApp();

    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
    const [identifier, periodKey] = mockReserveUsage.mock.calls[0];
    expect(identifier).toBe("scribe:user_free_123");
    expect(periodKey).toBe("all-time");
  });

  it("allows a soap-mode request when the user has a pass (no metering)", async () => {
    mockUserHasPass.mockResolvedValue(true);
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("soap");
    expect(mockReserveUsage).not.toHaveBeenCalled();
  });

  it("succeeds and returns a structured SOAP note within the free session", async () => {
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("soap");
    expect(res.body.note).toMatchObject({
      subjective: expect.any(String),
      objective: expect.any(String),
      assessment: expect.any(String),
      plan: expect.any(String),
    });
    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
  });

  it("confirms the counter is shared: exhausting via summary also blocks soap", async () => {
    const app = buildApp();

    // First request succeeds (summary mode uses the free session)
    mockReserveUsage.mockResolvedValueOnce({ reserved: true, count: 1 });
    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    // Second request — same user, soap mode — limit is now exhausted
    mockReserveUsage.mockResolvedValueOnce({ reserved: false, count: 1 });
    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SCRIBE_LIMIT_REACHED");

    // Both calls must use the identical counter key
    const keys = mockReserveUsage.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("scribe:user_free_123");
  });
});
