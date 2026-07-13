import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

/**
 * Transcribe step — free-limit pre-check.
 *
 * The atomic reservation (reserveUsage) lives on generate-note and is the
 * definitive race-safe guard. The transcribe endpoint adds a cheaper
 * read-only peek (getUsage) so a limit-exhausted free user is blocked
 * before their audio is sent to OpenAI Whisper, avoiding unnecessary cost.
 *
 * These tests confirm:
 * - A user who has already used their free session gets 403 SCRIBE_LIMIT_REACHED
 *   at the transcribe step before any Whisper call is made.
 * - A pass-holder is never blocked at transcribe regardless of usage count.
 * - A user under the limit passes through and audio reaches Whisper.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSpeechToText = vi.fn(async () => "This is the transcribed text.");
const mockEnsureCompatibleFormat = vi.fn(async (buf: Buffer) => ({
  buffer: buf,
  format: "mp3" as const,
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: (...args: unknown[]) => mockSpeechToText(...args),
  ensureCompatibleFormat: (...args: unknown[]) =>
    mockEnsureCompatibleFormat(...args),
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => false,
  getAnthropic: () => ({ messages: { create: vi.fn() } }),
}));

const mockUserHasPass = vi.fn(async (_userId: string) => false);
vi.mock("../src/lib/entitlement", () => ({
  userHasPass: (userId: string) => mockUserHasPass(userId),
}));

const mockGetUsage = vi.fn(async () => 0);
const mockReserveUsage = vi.fn(async () => ({ reserved: true, count: 1 }));
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

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUserHasPass.mockResolvedValue(false);
  mockGetUsage.mockResolvedValue(0);
  mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });
  mockRefundUsage.mockResolvedValue(undefined);
  mockSpeechToText.mockResolvedValue("This is the transcribed text.");
  mockEnsureCompatibleFormat.mockImplementation(async (buf: Buffer) => ({
    buffer: buf,
    format: "mp3" as const,
  }));
});

describe("POST /scribe/transcribe — free-limit pre-check", () => {
  it("returns 403 / SCRIBE_LIMIT_REACHED when the free session is already exhausted", async () => {
    mockGetUsage.mockResolvedValue(1);
    const app = buildApp();

    const res = await postTranscribe(app);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SCRIBE_LIMIT_REACHED");
  });

  it("does not call OpenAI Whisper when the limit is already exhausted", async () => {
    mockGetUsage.mockResolvedValue(1);
    const app = buildApp();

    await postTranscribe(app);

    expect(mockSpeechToText).not.toHaveBeenCalled();
    expect(mockEnsureCompatibleFormat).not.toHaveBeenCalled();
  });

  it("allows transcription when the user has not yet used their free session", async () => {
    mockGetUsage.mockResolvedValue(0);
    const app = buildApp();

    const res = await postTranscribe(app);

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("This is the transcribed text.");
    expect(mockSpeechToText).toHaveBeenCalledTimes(1);
  });

  it("does not block a pass-holder even when usage count is at the limit", async () => {
    mockUserHasPass.mockResolvedValue(true);
    mockGetUsage.mockResolvedValue(1);
    const app = buildApp();

    const res = await postTranscribe(app);

    expect(res.status).toBe(200);
    expect(mockSpeechToText).toHaveBeenCalledTimes(1);
    expect(mockGetUsage).not.toHaveBeenCalled();
  });

  it("uses the same scribe:userId key for the usage check as generate-note uses", async () => {
    mockGetUsage.mockResolvedValue(0);
    const app = buildApp("user_free_abc");

    await postTranscribe(app);

    expect(mockGetUsage).toHaveBeenCalledWith(
      "scribe:user_free_abc",
      "all-time",
    );
  });

  it("does not consume quota at the transcribe step (getUsage, not reserveUsage)", async () => {
    mockGetUsage.mockResolvedValue(0);
    const app = buildApp();

    await postTranscribe(app);

    expect(mockReserveUsage).not.toHaveBeenCalled();
  });
});
