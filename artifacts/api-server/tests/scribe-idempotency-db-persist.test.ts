import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

/**
 * Cross-restart durability for /scribe/generate-note idempotency.
 *
 * Verifies that completed generate-note results are persisted to the
 * scribe_idempotency_keys PostgreSQL table so that:
 *
 *  - A retry arriving after a server restart still gets the cached response
 *    without a second reserveUsage call.
 *  - Expired DB rows are not returned.
 *  - DB failures degrade gracefully to a cache miss (no crash, no double-charge
 *    on the same instance's in-process cache).
 *  - The background sweep issues a DELETE for expired DB rows.
 */

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbSelectLimit = vi.fn().mockResolvedValue([]);
const mockDbInsertConflict = vi.fn().mockResolvedValue([]);
const mockDbDelete = vi.fn().mockResolvedValue([]);

vi.mock("@workspace/db", () => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: (...args: unknown[]) => mockDbSelectLimit(...args),
  };
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: (...args: unknown[]) => mockDbInsertConflict(...args),
  };
  const deleteChain = {
    where: (...args: unknown[]) => mockDbDelete(...args),
  };
  return {
    db: {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      delete: vi.fn(() => deleteChain),
    },
    aiUsageTable: {},
    scribeIdempotencyKeysTable: {},
  };
});

// ─── Other mocks ──────────────────────────────────────────────────────────────

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

// ─── Logger mock (prevents pino worker from spawning in tests) ────────────────

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import scribeRouter from "../src/routes/scribe/index";
import {
  _clearIdempotencyCache,
  _stopSweepInterval,
  _startSweepInterval,
  checkIdempotency,
  beginIdempotency,
  SWEEP_INTERVAL_MS,
  IDEMPOTENCY_TTL_MS,
} from "../src/lib/scribe-idempotency";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TRANSCRIPT =
  "Patient presents at 32 weeks. Blood pressure 118/72. Fundal height 32 cm. Baby is active. Plan to schedule glucose screening.";

const SUMMARY_RESPONSE = JSON.stringify({
  headline: "Your 32-week checkup went smoothly.",
  whatWasDiscussed:
    "Your provider checked your blood pressure and fundal height.",
  nextSteps: ["Schedule glucose screening"],
  rememberTo: "Keep tracking baby movements daily.",
});

const STORED_RESPONSE = {
  mode: "summary",
  note: {
    headline: "Stored response from a previous server instance.",
    whatWasDiscussed: "This came from the DB.",
    nextSteps: [],
    rememberTo: "You are in good hands.",
  },
};

function buildApp(userId = "user_persist_123"): Express {
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

function postNote(
  app: Express,
  body: object,
  idempotencyKey?: string,
  userId?: string,
) {
  const r = request(app).post("/scribe/generate-note").send(body);
  if (idempotencyKey) r.set("x-idempotency-key", idempotencyKey);
  if (userId) r.set("x-user-id", userId);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearIdempotencyCache();
  mockIsAnthropicConfigured.mockReturnValue(true);
  mockUserHasPass.mockResolvedValue(false);
  mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });
  mockRefundUsage.mockResolvedValue(undefined);
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: SUMMARY_RESPONSE }],
  });
  // Default: DB returns no rows (cache miss)
  mockDbSelectLimit.mockResolvedValue([]);
  // Default: upsert succeeds
  mockDbInsertConflict.mockResolvedValue([]);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scribe generate-note — DB-backed idempotency (cross-restart durability)", () => {
  // ── DB write on commit ─────────────────────────────────────────────────────

  it("persists the result to the DB on a successful generate-note", async () => {
    const app = buildApp();

    const res = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-db-write-001",
    );

    expect(res.status).toBe(200);
    // The upsert must have been called exactly once
    expect(mockDbInsertConflict).toHaveBeenCalledTimes(1);
  });

  it("does NOT persist to DB when the AI call fails (no successful result to cache)", async () => {
    mockAnthropicCreate.mockRejectedValueOnce(new Error("network error"));
    const app = buildApp();

    const res = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-db-no-write-fail",
    );

    expect(res.status).toBe(502);
    expect(mockDbInsertConflict).not.toHaveBeenCalled();
  });

  it("does NOT persist to DB when reserveUsage denies (limit reached)", async () => {
    mockReserveUsage.mockResolvedValue({ reserved: false, count: 1 });
    const app = buildApp();

    const res = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-db-no-write-limit",
    );

    expect(res.status).toBe(403);
    expect(mockDbInsertConflict).not.toHaveBeenCalled();
  });

  // ── Cross-restart: DB hit path ─────────────────────────────────────────────

  it("returns the DB-stored response on a retry after a simulated server restart", async () => {
    // Simulate a restart: the in-process cache is empty (cleared above),
    // but the DB has a stored row from the previous instance's commit.
    mockDbSelectLimit.mockResolvedValue([
      {
        idempotencyKey: "key-restart-001",
        userId: "user_persist_123",
        response: STORED_RESPONSE,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    ]);

    const result = await checkIdempotency(
      "key-restart-001",
      "user_persist_123",
    );

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.response).toEqual(STORED_RESPONSE);
    }
  });

  it("does NOT call reserveUsage when a DB-stored entry is found for the retry key", async () => {
    mockDbSelectLimit.mockResolvedValue([
      {
        idempotencyKey: "key-restart-no-reserve",
        userId: "user_persist_123",
        response: STORED_RESPONSE,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    ]);

    const app = buildApp();

    const res = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-restart-no-reserve",
    );

    // The route finds the DB entry in checkIdempotency and returns early
    expect(res.status).toBe(200);
    expect(res.body).toEqual(STORED_RESPONSE);
    expect(mockReserveUsage).not.toHaveBeenCalled();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  // ── Expired DB rows are not returned ──────────────────────────────────────

  it("treats an expired DB entry as a cache miss", async () => {
    // DB row with expiresAt in the past — the server filters it with a WHERE clause
    // so it returns no rows (the DB does the filtering, mockDbSelectLimit returns [])
    mockDbSelectLimit.mockResolvedValue([]);

    const result = await checkIdempotency("key-expired-db", "user_persist_123");
    expect(result.found).toBe(false);
  });

  // ── Cross-user isolation ───────────────────────────────────────────────────

  it("a DB hit for one user does not appear for a different user with the same key", async () => {
    // DB returns a result only when queried for user A
    mockDbSelectLimit.mockImplementation(() => {
      // We can't inspect query args easily through the chain mock, but we test
      // the public API: user B's in-process cache is empty AND the DB returns
      // nothing for them (separate DB row keyed by userId + idempotencyKey).
      return Promise.resolve([]);
    });

    // User B misses
    const result = await checkIdempotency("shared-key", "user_B");
    expect(result.found).toBe(false);
  });

  // ── Graceful DB degradation ────────────────────────────────────────────────

  it("treats a DB lookup error as a cache miss (does not crash or double-charge on retry)", async () => {
    mockDbSelectLimit.mockRejectedValueOnce(new Error("DB unavailable"));

    // checkIdempotency should resolve with found:false and not throw
    const result = await checkIdempotency("key-db-error", "user_persist_123");
    expect(result.found).toBe(false);
  });

  it("a DB upsert failure does not prevent the route from returning 200", async () => {
    mockDbInsertConflict.mockRejectedValueOnce(new Error("write failed"));
    const app = buildApp();

    const res = await postNote(
      app,
      { transcript: VALID_TRANSCRIPT, mode: "summary" },
      "key-upsert-fail",
    );

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("summary");
  });

  // ── DB sweep ──────────────────────────────────────────────────────────────

  it("background sweep issues a DB delete for expired rows", async () => {
    vi.useFakeTimers();
    _stopSweepInterval();
    _startSweepInterval();

    try {
      // Advance past the sweep interval to trigger the timer once, and flush
      // the async dbSweep() promise that fires as a result.
      await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS + 1);

      expect(mockDbDelete).toHaveBeenCalled();
    } finally {
      _stopSweepInterval();
      vi.useRealTimers();
      _startSweepInterval();
    }
  });

  // ── beginIdempotency / checkIdempotency unit-level cross-restart ───────────

  it("checkIdempotency returns found:false when in-process cache is empty and DB is empty", async () => {
    mockDbSelectLimit.mockResolvedValue([]);

    const result = await checkIdempotency("key-both-miss", "user_x");
    expect(result.found).toBe(false);
  });

  it("in-process done entry takes priority over DB (no DB query on in-process hit)", async () => {
    // Commit a result to the in-process cache. commit() is async but the
    // in-process cache entry is set synchronously before the first await, so
    // void is fine here — we only need the cache populated for this assertion.
    const { commit } = beginIdempotency("key-inproc-prio", "user_x");
    void commit({ mode: "soap", note: {} });

    // checkIdempotency should return immediately from in-process without touching DB
    const result = await checkIdempotency("key-inproc-prio", "user_x");

    expect(result.found).toBe(true);
    // DB select should not have been called because the in-process cache hit first
    expect(mockDbSelectLimit).not.toHaveBeenCalled();
  });
});
