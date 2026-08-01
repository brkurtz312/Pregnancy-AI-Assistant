import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

/**
 * Timeout / AbortSignal guard for /scribe/generate-note.
 *
 * If the Anthropic API hangs, the AbortSignal.timeout(30 s) passed to
 * messages.create causes the SDK to reject with a TimeoutError (or an
 * AbortError, depending on the runtime).  The route must:
 *
 *  1. Catch the error in the existing catch block.
 *  2. Call refundUsage so the free-session slot is returned to the user.
 *  3. Return 502 to the client.
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
  scribeIdempotencyKeysTable: {},
}));

// ─── Test app ─────────────────────────────────────────────────────────────────

import scribeRouter from "../src/routes/scribe/index";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { userId?: string }).userId = "user_timeout_123";
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
  "Patient presents at 36 weeks. Blood pressure 120/75. Fundal height 36 cm. Baby is in vertex position.";

function postGenerateNote(app: Express, body: object) {
  return request(app).post("/scribe/generate-note").send(body);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAnthropicConfigured.mockReturnValue(true);
  mockUserHasPass.mockResolvedValue(false);
  mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });
  mockRefundUsage.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /scribe/generate-note — timeout / abort path", () => {
  it("returns 502 when the Anthropic call is aborted due to a timeout", async () => {
    const abortError = new DOMException(
      "The operation was aborted.",
      "TimeoutError",
    );
    mockAnthropicCreate.mockRejectedValueOnce(abortError);

    const app = buildApp();
    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(res.status).toBe(502);
  });

  it("refunds the usage slot when the Anthropic call times out (free user)", async () => {
    const abortError = new DOMException(
      "The operation was aborted.",
      "TimeoutError",
    );
    mockAnthropicCreate.mockRejectedValueOnce(abortError);

    const app = buildApp();
    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
    expect(mockRefundUsage).toHaveBeenCalledWith(
      "scribe:user_timeout_123",
      "all-time",
    );
  });

  it("does not refund when a pass holder's call times out (no slot was reserved)", async () => {
    mockUserHasPass.mockResolvedValue(true);
    const abortError = new DOMException(
      "The operation was aborted.",
      "TimeoutError",
    );
    mockAnthropicCreate.mockRejectedValueOnce(abortError);

    const app = buildApp();
    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(res.status).toBe(502);
    expect(mockRefundUsage).not.toHaveBeenCalled();
  });

  it("passes an AbortSignal option to messages.create", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            headline: "Your visit went well.",
            whatWasDiscussed: "Your provider reviewed your progress.",
            nextSteps: ["Return in two weeks"],
            rememberTo: "Keep monitoring baby movements.",
          }),
        },
      ],
    });

    const app = buildApp();
    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    const [, requestOptions] = mockAnthropicCreate.mock.calls[0];
    expect(requestOptions).toBeDefined();
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
  });
});
