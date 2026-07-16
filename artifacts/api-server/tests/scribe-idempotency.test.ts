import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

/**
 * Idempotency key support for /scribe/generate-note.
 *
 * When a client sends X-Idempotency-Key the server must:
 *
 *  a) Cache-hit path (retry after success): return the cached response
 *     immediately without calling reserveUsage again.
 *  b) In-flight path (concurrent/near-concurrent retry): attach to the
 *     first request's promise and return its result once resolved — again
 *     without a second reserveUsage call.
 *
 * Both paths prevent a second free-quota slot being consumed when the user
 * retries after a network drop.
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
}));

// ─── Test app ─────────────────────────────────────────────────────────────────

import scribeRouter from "../src/routes/scribe/index";
import { _clearIdempotencyCache } from "../src/lib/scribe-idempotency";

let currentUserId = "user_idem_123";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { userId?: string }).userId = currentUserId;
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
  "Patient presents at 32 weeks. Blood pressure 118/72. Fundal height 32 cm. Baby is active. Plan to schedule glucose screening.";

const SUMMARY_RESPONSE = JSON.stringify({
  headline: "Your 32-week checkup went smoothly.",
  whatWasDiscussed:
    "Your provider checked your blood pressure and fundal height.",
  nextSteps: ["Schedule glucose screening"],
  rememberTo: "Keep tracking baby movements daily.",
});

function postNote(app: Express, body: object, idempotencyKey?: string) {
  const r = request(app).post("/scribe/generate-note").send(body);
  if (idempotencyKey) r.set("x-idempotency-key", idempotencyKey);
  return r;
}

/** Deferred AI response — resolves after one event-loop turn via setImmediate.
 *  Used in concurrency tests so the second request can be queued before the
 *  first request's AI call completes. */
function deferredAiResponse() {
  return new Promise<{ content: { type: string; text: string }[] }>(
    (resolve) => {
      setImmediate(() =>
        resolve({ content: [{ type: "text", text: SUMMARY_RESPONSE }] }),
      );
    },
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _clearIdempotencyCache();
  currentUserId = "user_idem_123";
  mockIsAnthropicConfigured.mockReturnValue(true);
  mockUserHasPass.mockResolvedValue(false);
  mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });
  mockRefundUsage.mockResolvedValue(undefined);
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: SUMMARY_RESPONSE }],
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /scribe/generate-note — idempotency key", () => {
  it("succeeds normally when no idempotency key is supplied", async () => {
    const app = buildApp();
    const res = await postNote(app, {
      transcript: VALID_TRANSCRIPT,
      mode: "summary",
    });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("summary");
    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("succeeds normally on the first request with an idempotency key (cache miss)", async () => {
    const app = buildApp();
    const res = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-abc-001",
    );

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("summary");
    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("returns the cached response on a retry with the same idempotency key", async () => {
    const app = buildApp();

    const first = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-retry-001",
    );
    expect(first.status).toBe(200);

    const second = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-retry-001",
    );
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it("does NOT call reserveUsage on an idempotent retry (cache hit)", async () => {
    const app = buildApp();

    await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-no-reserve",
    );

    mockReserveUsage.mockClear();
    mockAnthropicCreate.mockClear();

    await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-no-reserve",
    );

    expect(mockReserveUsage).not.toHaveBeenCalled();
  });

  it("does NOT call the AI model on an idempotent retry (cache hit)", async () => {
    const app = buildApp();

    await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-no-model",
    );

    mockAnthropicCreate.mockClear();

    await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-no-model",
    );

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("total reserveUsage calls across a first-request + retry equals exactly 1 (not 2)", async () => {
    const app = buildApp();
    const KEY = "key-total-reserve-count";

    await postNote(app, { transcript: VALID_TRANSCRIPT, mode: "summary" }, KEY);
    await postNote(app, { transcript: VALID_TRANSCRIPT, mode: "summary" }, KEY);

    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
  });

  // ── Concurrency: in-flight deduplication ───────────────────────────────────
  //
  // This is the core scenario the task targets: two requests with the same key
  // arrive while the first is still executing (after beginIdempotency but
  // before commit).  The second request must attach to the in-flight promise
  // and return the same result without making its own reserveUsage call.

  it("concurrent requests with the same key only call reserveUsage once (in-flight deduplication)", async () => {
    const app = buildApp();
    const KEY = "key-concurrent-inflight";

    // The first AI call is deliberately deferred so the second HTTP request
    // can be processed (by the event loop) while the first is in-flight.
    mockAnthropicCreate.mockReturnValueOnce(deferredAiResponse());

    const [res1, res2] = await Promise.all([
      postNote(app, { transcript: VALID_TRANSCRIPT, mode: "summary" }, KEY),
      postNote(app, { transcript: VALID_TRANSCRIPT, mode: "summary" }, KEY),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body).toEqual(res2.body);
    // Only one reservation despite two concurrent requests
    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
    // Only one AI call despite two concurrent requests
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("concurrent requests with different keys each reserve independently", async () => {
    const app = buildApp();

    mockAnthropicCreate.mockReturnValue(deferredAiResponse());

    const [res1, res2] = await Promise.all([
      postNote(
        app,
        { transcript: VALID_TRANSCRIPT, mode: "summary" },
        "key-concurrent-A",
      ),
      postNote(
        app,
        { transcript: VALID_TRANSCRIPT, mode: "summary" },
        "key-concurrent-B",
      ),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Different keys → two independent reservations
    expect(mockReserveUsage).toHaveBeenCalledTimes(2);
  });

  // ── Cross-user isolation ───────────────────────────────────────────────────

  it("treats requests from different users as separate cache entries even with the same key string", async () => {
    const app = buildApp();
    const KEY = "shared-key-cross-user";

    currentUserId = "user_A";
    const resA = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(resA.status).toBe(200);
    expect(mockReserveUsage).toHaveBeenCalledTimes(1);

    mockReserveUsage.mockClear();
    mockAnthropicCreate.mockClear();

    // User B with the same key must NOT get user A's cached result
    currentUserId = "user_B";
    const resB = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(resB.status).toBe(200);
    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  // ── No-key baseline ────────────────────────────────────────────────────────

  it("requests without an idempotency key each reserve independently", async () => {
    const app = buildApp();

    await postNote(app, { transcript: VALID_TRANSCRIPT, mode: "summary" });
    await postNote(app, { transcript: VALID_TRANSCRIPT, mode: "summary" });

    expect(mockReserveUsage).toHaveBeenCalledTimes(2);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
  });

  // ── Failures are not cached ────────────────────────────────────────────────

  it("does not cache 403 responses — a blocked retry still checks reserveUsage", async () => {
    const app = buildApp();
    const KEY = "key-limit-reached";

    mockReserveUsage.mockResolvedValue({ reserved: false, count: 1 });

    const first = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(first.status).toBe(403);
    expect(first.body.code).toBe("SCRIBE_LIMIT_REACHED");

    const second = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(second.status).toBe(403);
    expect(second.body.code).toBe("SCRIBE_LIMIT_REACHED");

    // Both requests hit reserveUsage — no false cache hit from the 403
    expect(mockReserveUsage).toHaveBeenCalledTimes(2);
  });

  it("does not cache AI-failure responses — a retried request after a model error runs fresh", async () => {
    const app = buildApp();
    const KEY = "key-model-error";

    // First call: model throws
    mockAnthropicCreate.mockRejectedValueOnce(new Error("network error"));

    const first = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(first.status).toBe(502);

    // Second call: model succeeds
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: SUMMARY_RESPONSE }],
    });
    mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });

    const second = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(second.status).toBe(200);
    expect(second.body.mode).toBe("summary");

    // Two reservations: one for the failed attempt, one for the successful retry
    expect(mockReserveUsage).toHaveBeenCalledTimes(2);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
  });

  // ── Pass holders ──────────────────────────────────────────────────────────

  it("a pass holder's retry is served from cache without an additional AI call", async () => {
    mockUserHasPass.mockResolvedValue(true);
    const app = buildApp();
    const KEY = "key-pass-holder-retry";

    const first = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(first.status).toBe(200);

    mockAnthropicCreate.mockClear();

    const second = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      KEY,
    );
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    // Pass holders never hit reserveUsage in the first place
    expect(mockReserveUsage).not.toHaveBeenCalled();
  });
});
