import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

/**
 * Scribe pre-check DB-error path.
 *
 * Both the transcribe and generate-note handlers fail closed: if the DB is
 * unavailable during the pre-check (userHasPass or getUsage/reserveUsage
 * throws), the handler returns 503 rather than bypass the free-tier cap.
 *
 * These tests confirm:
 * - When userHasPass throws, both handlers return 503 (not a silent bypass).
 * - When the DB is healthy, the 403 SCRIBE_LIMIT_REACHED path still fires
 *   correctly for both handlers.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSpeechToText = vi.fn(async () => "Transcribed audio.");
const mockEnsureCompatibleFormat = vi.fn(async (buf: Buffer) => ({
  buffer: buf,
  format: "mp3" as const,
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: (...args: unknown[]) => mockSpeechToText(...args),
  ensureCompatibleFormat: (...args: unknown[]) =>
    mockEnsureCompatibleFormat(...args),
}));

const mockIsAnthropicConfigured = vi.fn(() => true);
const mockAnthropicCreate = vi.fn();

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => mockIsAnthropicConfigured(),
  getAnthropic: () => ({ messages: { create: mockAnthropicCreate } }),
}));

const mockUserHasPass = vi.fn<() => Promise<boolean>>();

vi.mock("../src/lib/entitlement", () => ({
  userHasPass: () => mockUserHasPass(),
}));

const mockGetUsage = vi.fn<() => Promise<number>>();
const mockReserveUsage =
  vi.fn<() => Promise<{ reserved: boolean; count: number }>>();
const mockRefundUsage = vi.fn(async () => {});

vi.mock("../src/lib/ai-usage", () => ({
  getUsage: (...args: unknown[]) => mockGetUsage(...args),
  reserveUsage: (...args: unknown[]) => mockReserveUsage(...args),
  refundUsage: (...args: unknown[]) => mockRefundUsage(...args),
  incrementUsage: vi.fn(),
  currentPeriodKey: vi.fn(),
}));

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  aiUsageTable: {},
}));

// ─── Test app ────────────────────────────────────────────────────────────────

import scribeRouter from "../src/routes/scribe/index";

function buildApp(userId = "user_free_123"): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { userId?: string }).userId = userId;
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

function postTranscribe(app: Express) {
  return request(app)
    .post("/scribe/transcribe")
    .attach("audio", Buffer.from("fake-audio-bytes"), {
      filename: "recording.mp3",
      contentType: "audio/mpeg",
    });
}

const VALID_TRANSCRIPT =
  "Patient presents at 28 weeks. Blood pressure normal. Fundal height appropriate.";

const SUMMARY_RESPONSE = JSON.stringify({
  headline: "Your 28-week checkup went well.",
  whatWasDiscussed: "Blood pressure was normal.",
  nextSteps: ["Schedule glucose screening."],
  rememberTo: "Keep up the great work!",
});

function postGenerateNote(app: Express, body: object) {
  return request(app).post("/scribe/generate-note").send(body);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAnthropicConfigured.mockReturnValue(true);
  mockUserHasPass.mockResolvedValue(false);
  mockGetUsage.mockResolvedValue(0);
  mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });
  mockRefundUsage.mockResolvedValue(undefined);
  mockSpeechToText.mockResolvedValue("Transcribed audio.");
  mockEnsureCompatibleFormat.mockImplementation(async (buf: Buffer) => ({
    buffer: buf,
    format: "mp3" as const,
  }));
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: SUMMARY_RESPONSE }],
  });
});

// ─── transcribe: DB error ─────────────────────────────────────────────────────

describe("POST /scribe/transcribe — DB error during pre-check", () => {
  it("returns 503 when userHasPass throws", async () => {
    mockUserHasPass.mockRejectedValue(new Error("DB connection lost"));
    const app = buildApp();

    const res = await postTranscribe(app);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });

  it("does not call OpenAI Whisper when userHasPass throws", async () => {
    mockUserHasPass.mockRejectedValue(new Error("DB connection lost"));
    const app = buildApp();

    await postTranscribe(app);

    expect(mockSpeechToText).not.toHaveBeenCalled();
    expect(mockEnsureCompatibleFormat).not.toHaveBeenCalled();
  });

  it("returns 503 when getUsage throws for a free user", async () => {
    mockUserHasPass.mockResolvedValue(false);
    mockGetUsage.mockRejectedValue(new Error("DB timeout"));
    const app = buildApp();

    const res = await postTranscribe(app);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });

  it("does not call Whisper when getUsage throws", async () => {
    mockUserHasPass.mockResolvedValue(false);
    mockGetUsage.mockRejectedValue(new Error("DB timeout"));
    const app = buildApp();

    await postTranscribe(app);

    expect(mockSpeechToText).not.toHaveBeenCalled();
  });
});

// ─── transcribe: normal 403 path ─────────────────────────────────────────────

describe("POST /scribe/transcribe — 403 path under healthy DB", () => {
  it("returns 403 / SCRIBE_LIMIT_REACHED when the free session is exhausted", async () => {
    mockGetUsage.mockResolvedValue(1);
    const app = buildApp();

    const res = await postTranscribe(app);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SCRIBE_LIMIT_REACHED");
  });

  it("does not call Whisper when the limit is reached", async () => {
    mockGetUsage.mockResolvedValue(1);
    const app = buildApp();

    await postTranscribe(app);

    expect(mockSpeechToText).not.toHaveBeenCalled();
  });
});

// ─── generate-note: DB error ──────────────────────────────────────────────────

describe("POST /scribe/generate-note — DB error during pre-check", () => {
  it("returns 503 when userHasPass throws", async () => {
    mockUserHasPass.mockRejectedValue(new Error("DB connection lost"));
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });

  it("does not call the AI model when userHasPass throws", async () => {
    mockUserHasPass.mockRejectedValue(new Error("DB connection lost"));
    const app = buildApp();

    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when reserveUsage throws for a free user", async () => {
    mockUserHasPass.mockResolvedValue(false);
    mockReserveUsage.mockRejectedValue(new Error("DB timeout"));
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });

  it("does not call the AI model when reserveUsage throws", async () => {
    mockUserHasPass.mockResolvedValue(false);
    mockReserveUsage.mockRejectedValue(new Error("DB timeout"));
    const app = buildApp();

    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("returns 503 for soap mode when userHasPass throws", async () => {
    mockUserHasPass.mockRejectedValue(new Error("DB connection lost"));
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });
});

// ─── generate-note: normal 403 path ──────────────────────────────────────────

describe("POST /scribe/generate-note — 403 path under healthy DB", () => {
  it("returns 403 / SCRIBE_LIMIT_REACHED (summary) when the free session is exhausted", async () => {
    mockReserveUsage.mockResolvedValue({ reserved: false, count: 1 });
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SCRIBE_LIMIT_REACHED");
  });

  it("returns 403 / SCRIBE_LIMIT_REACHED (soap) when the free session is exhausted", async () => {
    mockReserveUsage.mockResolvedValue({ reserved: false, count: 1 });
    const app = buildApp();

    const res = await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "soap",
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SCRIBE_LIMIT_REACHED");
  });

  it("does not call the AI model when the limit is reached", async () => {
    mockReserveUsage.mockResolvedValue({ reserved: false, count: 1 });
    const app = buildApp();

    await postGenerateNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });
});
